/* ──────────────────────────────────────────────────────────────────────────
   Wallet P&L engine.

   Pure computation: it takes transactions, a historical price map and the set
   of tracked addresses, and returns realized and unrealized P&L. It touches no
   network and no DOM, so the Portfolio page and the test suite run the exact
   same code.

   The methodology is deliberate, and it is why P&L is never "value minus what
   came in". Blockchain history cannot tell a purchase from a gift, an internal
   transfer, or coins moved from another custodian — so:

     • Receipts from outside the tracked set create a cost lot at that day's BTC
       reference price.
     • Transfers between two addresses the same user tracks are internal: basis
       moves with the coins, no gain is realized and no fresh basis is created.
     • Outgoing external sends consume lots FIFO and realize P&L.
     • Realized and unrealized are kept separate.
     • Only confirmed transactions count.
     • A receipt whose day predates the price history is carried as bitcoin held
       with unknown basis, and the result is flagged partial rather than guessed.
     • Overrides can reclassify a transaction or set its acquisition price, and
       the whole thing recomputes.

   Every figure this returns is an estimate. The UI says so next to each one.
   ────────────────────────────────────────────────────────────────────────── */

const SATS = 1e8

/** Address totals within one transaction, restricted to the tracked set. */
function trackedFlows(tx, tracked) {
  const inFrom = {}   // tracked address -> sats spent as inputs
  const outTo = {}    // tracked address -> sats received as outputs
  for (const vin of tx.vin || []) {
    const a = vin.prevout && vin.prevout.scriptpubkey_address
    if (a && tracked.has(a)) inFrom[a] = (inFrom[a] || 0) + (vin.prevout.value || 0)
  }
  for (const vout of tx.vout || []) {
    const a = vout.scriptpubkey_address
    if (a && tracked.has(a)) outTo[a] = (outTo[a] || 0) + (vout.value || 0)
  }
  const totalIn = Object.values(inFrom).reduce((s, v) => s + v, 0)
  const totalOut = Object.values(outTo).reduce((s, v) => s + v, 0)
  return { inFrom, outTo, totalIn, totalOut }
}

const isoDay = (secs) => new Date(secs * 1000).toISOString().slice(0, 10)

/** Nearest available price at or before a day, so a weekend receipt still
    prices against the last close rather than reading as missing. */
function priceOn(day, priceByDate) {
  if (priceByDate[day] != null) return priceByDate[day]
  let d = new Date(day + 'T00:00:00Z')
  for (let i = 0; i < 5; i++) {
    d = new Date(d.getTime() - 864e5)
    const k = d.toISOString().slice(0, 10)
    if (priceByDate[k] != null) return priceByDate[k]
  }
  return null
}

/**
 * Consume `btcAmount` (in BTC) from the given owners' lots, oldest first (FIFO).
 * Returns the total cost basis of what was consumed and whether any consumed
 * lot had unknown basis. Mutates the lot list in place.
 */
function consumeFIFO(lots, owners, btcAmount) {
  let remaining = btcAmount
  let cost = 0
  let missing = false
  for (const lot of lots) {
    if (remaining <= 0) break
    if (lot.btc <= 0 || !owners.has(lot.owner)) continue
    const take = Math.min(lot.btc, remaining)
    const frac = take / lot.btc
    if (lot.cost == null) missing = true
    else cost += lot.cost * frac
    lot.btc -= take
    if (lot.cost != null) lot.cost -= lot.cost * frac
    remaining -= take
  }
  return { cost, missing, shortfall: remaining }
}

/**
 * @param {object} args
 * @param {{address:string,label?:string}[]} args.wallets
 * @param {Record<string, any[]>} args.txsByAddress  confirmed+unconfirmed txs per address
 * @param {Record<string, number>} args.priceByDate  YYYY-MM-DD -> USD close
 * @param {number} args.currentPrice                 current BTC/USD
 * @param {Record<string, {classification?:string, priceUsd?:number, ignore?:boolean}>} [args.overrides]
 */
export function computePnl({ wallets, txsByAddress, priceByDate, currentPrice, overrides = {} }) {
  const tracked = new Set(wallets.map((w) => w.address))

  // One chronological pass over the union of transactions. A tx touching two
  // tracked wallets appears in both lists; dedupe by txid.
  const seen = new Set()
  const txs = []
  for (const w of wallets) {
    for (const tx of txsByAddress[w.address] || []) {
      if (seen.has(tx.txid)) continue
      seen.add(tx.txid)
      if (!(tx.status && tx.status.confirmed)) continue // exclude unconfirmed
      txs.push(tx)
    }
  }
  txs.sort((a, b) => (a.status.block_time || 0) - (b.status.block_time || 0))

  const lots = []          // {btc, cost|null, owner, day}
  const realizedBy = {}    // owner -> realized USD
  let realizedMissing = false
  let sawMissingPrice = false
  const timeline = []      // {day, btc, cost} snapshots after each event, combined

  const addRealized = (owner, amt) => { realizedBy[owner] = (realizedBy[owner] || 0) + amt }

  for (const tx of txs) {
    const ov = overrides[tx.txid] || {}
    if (ov.ignore) continue
    const day = tx.status.block_time ? isoDay(tx.status.block_time) : null
    const { inFrom, outTo, totalIn, totalOut } = trackedFlows(tx, tracked)
    const spends = totalIn > 0

    if (!spends) {
      // Receipt(s) from outside the tracked set → new cost lot(s).
      for (const [addr, sats] of Object.entries(outTo)) {
        const btc = sats / SATS
        const classification = ov.classification || 'external'
        if (classification === 'internal') continue // user says this isn't new basis
        let px = ov.priceUsd != null ? ov.priceUsd : (day ? priceOn(day, priceByDate) : null)
        if (px == null) { sawMissingPrice = true }
        lots.push({ btc, cost: px == null ? null : btc * px, owner: addr, day })
      }
    } else {
      // Portfolio spent coins. Split into internal destinations and external out.
      const senders = new Set(Object.keys(inFrom))
      const consumed = consumeFIFO(lots, senders, totalIn / SATS)
      if (consumed.missing) realizedMissing = true
      const spentBtc = totalIn / SATS

      // Re-add tracked outputs (change and internal transfers) carrying basis.
      for (const [addr, sats] of Object.entries(outTo)) {
        const btc = sats / SATS
        const frac = totalIn > 0 ? sats / totalIn : 0
        const cost = consumed.cost == null ? null : consumed.cost * frac
        lots.push({ btc, cost, owner: addr, day })
      }

      // Anything that left the tracked set (a real external send, plus fee) is
      // a disposal realized at that day's price.
      const extSats = totalIn - totalOut
      if (extSats > 0) {
        const extBtc = extSats / SATS
        const frac = totalIn > 0 ? extSats / totalIn : 0
        const costOfExt = consumed.cost == null ? null : consumed.cost * frac
        const px = day ? priceOn(day, priceByDate) : null
        if (px == null || costOfExt == null) { realizedMissing = true }
        else {
          const proceeds = extBtc * px
          // Attribute realized P&L to senders in proportion to their inputs.
          for (const [addr, sats] of Object.entries(inFrom)) {
            addRealized(addr, (proceeds - costOfExt) * (sats / totalIn))
          }
        }
      }
    }

    // Snapshot combined holdings after this event, for the chart.
    const btc = lots.reduce((s, l) => s + l.btc, 0)
    const cost = lots.some((l) => l.btc > 0 && l.cost == null)
      ? null
      : lots.reduce((s, l) => s + (l.cost || 0), 0)
    timeline.push({ day, btc, cost })
  }

  // Remaining lots → unrealized, per owner and combined.
  const held = {}
  for (const l of lots) {
    if (l.btc <= 1e-12) continue
    const h = held[l.owner] || (held[l.owner] = { btc: 0, cost: 0, missing: false })
    h.btc += l.btc
    if (l.cost == null) h.missing = true
    else h.cost += l.cost
  }

  function summarise(owner) {
    const h = held[owner] || { btc: 0, cost: 0, missing: false }
    const value = h.btc * currentPrice
    const costBasis = h.missing ? null : h.cost
    const unrealized = costBasis == null ? null : value - costBasis
    const realized = realizedBy[owner] || 0
    const total = unrealized == null ? null : unrealized + realized
    const pct = costBasis && costBasis > 0 && total != null ? (total / costBasis) * 100 : null
    return {
      btc: h.btc, value, costBasis, unrealized, realized, total, pct,
      partial: h.missing, avgCost: h.btc > 0 && costBasis != null ? costBasis / h.btc : null,
    }
  }

  const perWallet = wallets.map((w) => ({ address: w.address, label: w.label || '', ...summarise(w.address) }))

  // Combined
  const cBtc = Object.values(held).reduce((s, h) => s + h.btc, 0)
  const cMissing = Object.values(held).some((h) => h.missing)
  const cCost = cMissing ? null : Object.values(held).reduce((s, h) => s + h.cost, 0)
  const cValue = cBtc * currentPrice
  const cRealized = Object.values(realizedBy).reduce((s, v) => s + v, 0)
  const cUnreal = cCost == null ? null : cValue - cCost
  const cTotal = cUnreal == null ? null : cUnreal + cRealized
  const combined = {
    btc: cBtc, value: cValue, costBasis: cCost, unrealized: cUnreal,
    realized: cRealized, total: cTotal,
    pct: cCost && cCost > 0 && cTotal != null ? (cTotal / cCost) * 100 : null,
    partial: cMissing || realizedMissing,
    avgCost: cBtc > 0 && cCost != null ? cCost / cBtc : null,
  }

  return {
    combined, perWallet, timeline,
    flags: { missingPrices: sawMissingPrice, realizedMissing, txCount: txs.length },
  }
}

/**
 * Daily P&L curve for the chart. Walks from the first event to today, carries
 * the last known holdings and cost forward, and prices each day. Returns
 * points a chart can shade green above zero and red below.
 */
export function pnlSeries(timeline, priceByDate, currentPrice, fromDay) {
  const events = timeline.filter((e) => e.day)
  if (!events.length) return []
  const start = fromDay && fromDay > events[0].day ? fromDay : events[0].day
  const out = []
  let idx = 0
  let cur = { btc: 0, cost: 0 }
  // advance to the first event on/after start's carry-in
  for (const e of events) { if (e.day <= start) { cur = e } else break }
  let d = new Date(start + 'T00:00:00Z')
  const today = new Date()
  while (d <= today) {
    const day = d.toISOString().slice(0, 10)
    while (idx < events.length && events[idx].day <= day) { cur = events[idx]; idx++ }
    const px = day === today.toISOString().slice(0, 10)
      ? currentPrice
      : (priceOn(day, priceByDate) ?? currentPrice)
    const value = cur.btc * px
    const cost = cur.cost
    out.push({ t: d.getTime(), price: px, btc: cur.btc, value, cost, pnl: cost == null ? null : value - cost })
    d = new Date(d.getTime() + 864e5)
  }
  return out
}

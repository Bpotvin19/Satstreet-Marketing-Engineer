import test from 'node:test'
import assert from 'node:assert/strict'
import { computePnl, pnlSeries } from '../public/assets/pnl.js'

const SATS = 1e8
const A = 'bc1qAAA', B = 'bc1qBBB', EXT = 'bc1qEXTERNAL'
const day = (d) => Math.floor(new Date(d + 'T12:00:00Z').getTime() / 1000)

// Minimal mempool-shaped tx builders.
const receive = (txid, addr, btc, d) => ({
  txid, status: { confirmed: true, block_time: day(d) },
  vin: [{ prevout: { scriptpubkey_address: EXT, value: btc * SATS } }],
  vout: [{ scriptpubkey_address: addr, value: btc * SATS }],
})
const sendExternal = (txid, from, btc, d, changeBtc = 0) => ({
  txid, status: { confirmed: true, block_time: day(d) },
  vin: [{ prevout: { scriptpubkey_address: from, value: (btc + changeBtc) * SATS } }],
  vout: [
    { scriptpubkey_address: EXT, value: btc * SATS },
    ...(changeBtc ? [{ scriptpubkey_address: from, value: changeBtc * SATS }] : []),
  ],
})
const internal = (txid, from, to, btc, d) => ({
  txid, status: { confirmed: true, block_time: day(d) },
  vin: [{ prevout: { scriptpubkey_address: from, value: btc * SATS } }],
  vout: [{ scriptpubkey_address: to, value: btc * SATS }], // zero fee → purely internal
})
const wallets = (...a) => a.map((address) => ({ address }))
const prices = { '2024-01-01': 20000, '2024-02-01': 30000, '2024-03-01': 40000, '2024-06-01': 60000 }

test('positive unrealized P&L on a single receipt', () => {
  const r = computePnl({
    wallets: wallets(A), txsByAddress: { [A]: [receive('t1', A, 1, '2024-01-01')] },
    priceByDate: prices, currentPrice: 50000,
  })
  assert.equal(r.combined.btc, 1)
  assert.equal(r.combined.costBasis, 20000)
  assert.equal(r.combined.unrealized, 30000)
  assert.equal(r.combined.realized, 0)
  assert.equal(r.combined.total, 30000)
  assert.equal(Math.round(r.combined.pct), 150)
  assert.equal(r.combined.partial, false)
})

test('negative P&L shows a loss', () => {
  const r = computePnl({
    wallets: wallets(A), txsByAddress: { [A]: [receive('t1', A, 1, '2024-06-01')] }, // $60k
    priceByDate: prices, currentPrice: 50000,
  })
  assert.equal(r.combined.total, -10000)
  assert.ok(r.combined.pct < 0)
})

test('FIFO consumes the oldest lot on an external send', () => {
  const r = computePnl({
    wallets: wallets(A),
    txsByAddress: { [A]: [
      receive('t1', A, 1, '2024-01-01'),   // 1 BTC @ 20k
      receive('t2', A, 1, '2024-02-01'),   // 1 BTC @ 30k
      sendExternal('t3', A, 1, '2024-03-01'), // send 1 BTC @ 40k → FIFO eats the 20k lot
    ] },
    priceByDate: prices, currentPrice: 50000,
  })
  assert.equal(Math.round(r.combined.realized), 20000)      // 40k − 20k
  assert.equal(r.combined.btc, 1)                            // 1 BTC left
  assert.equal(r.combined.costBasis, 30000)                 // the 30k lot remains
  assert.equal(r.combined.unrealized, 20000)                // 50k − 30k
  assert.equal(r.combined.total, 40000)                     // 20k realized + 20k unrealized
})

test('internal transfer moves basis and realizes nothing', () => {
  const r = computePnl({
    wallets: wallets(A, B),
    txsByAddress: {
      [A]: [receive('t1', A, 1, '2024-01-01'), internal('t2', A, B, 1, '2024-02-01')],
      [B]: [internal('t2', A, B, 1, '2024-02-01')],
    },
    priceByDate: prices, currentPrice: 50000,
  })
  assert.equal(r.combined.realized, 0, 'no gain realized on an internal move')
  assert.equal(r.combined.btc, 1)
  assert.equal(r.combined.costBasis, 20000, 'basis preserved, not repriced at transfer day')
  const wa = r.perWallet.find((w) => w.address === A)
  const wb = r.perWallet.find((w) => w.address === B)
  assert.equal(wa.btc, 0, 'sender emptied')
  assert.equal(wb.btc, 1, 'receiver holds the coin')
  assert.equal(wb.costBasis, 20000, 'receiver inherits original basis')
})

test('missing historical price flags the result partial without crashing', () => {
  const r = computePnl({
    wallets: wallets(A),
    txsByAddress: { [A]: [receive('t1', A, 1, '2019-05-05')] }, // before price history
    priceByDate: prices, currentPrice: 50000,
  })
  assert.equal(r.combined.btc, 1)
  assert.equal(r.combined.costBasis, null)
  assert.equal(r.combined.unrealized, null)
  assert.equal(r.combined.partial, true)
  assert.equal(r.flags.missingPrices, true)
})

test('unconfirmed transactions are excluded', () => {
  const pending = receive('t1', A, 5, '2024-01-01')
  pending.status.confirmed = false
  const r = computePnl({ wallets: wallets(A), txsByAddress: { [A]: [pending] }, priceByDate: prices, currentPrice: 50000 })
  assert.equal(r.combined.btc, 0)
  assert.equal(r.flags.txCount, 0)
})

test('an override reclassifies a receipt as internal (no new basis)', () => {
  const r = computePnl({
    wallets: wallets(A), txsByAddress: { [A]: [receive('t1', A, 1, '2024-01-01')] },
    priceByDate: prices, currentPrice: 50000, overrides: { t1: { classification: 'internal' } },
  })
  assert.equal(r.combined.btc, 0, 'internal receipt creates no lot')
})

test('pnlSeries produces a dated curve that ends near current P&L', () => {
  const r = computePnl({
    wallets: wallets(A), txsByAddress: { [A]: [receive('t1', A, 1, '2024-01-01')] },
    priceByDate: prices, currentPrice: 50000,
  })
  const s = pnlSeries(r.timeline, prices, 50000)
  assert.ok(s.length > 100, 'daily points from 2024 to today')
  assert.equal(s[s.length - 1].btc, 1)
  assert.equal(s[s.length - 1].pnl, 30000, 'last point uses current price')
})

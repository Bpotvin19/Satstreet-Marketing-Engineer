/* ──────────────────────────────────────────────────────────────────────────
   Spot prices for the /price command.

   Two shapes:

     /price              -> BTC and ETH. The desk default, unchanged.
     /price hyperliquid  -> any of the ~400 USD markets Coinbase lists, plus
                            anything else CoinGecko knows about.

   Resolution order, and why:

     1. Coinbase catalogue.  Authoritative for "can this actually be traded",
        no key, no rate limit, and no impostors — everything in it is a real
        listing. This is the common path.
     2. CoinGecko search.    Only for assets Coinbase does not list. Fuzzy and
        full of namesquatters, so matches are ranked by exactness then market
        cap, with unranked coins last.

   Enrichment is deliberately best-effort. Market cap and 7d change only exist
   on CoinGecko, whose free tier throttles hard on a shared IP — so a throttled
   CoinGecko degrades those two fields to "—" rather than failing the command.
   The price itself never depends on it.
   ────────────────────────────────────────────────────────────────────────── */

import { findProduct, stats as cbStats, count as cbCount, type Product } from './coinbase'

export type Venue = 'Coinbase' | 'CoinGecko'

export interface Spot {
  symbol: string
  name: string
  price: number
  change24h: number
  /** CoinGecko only. Null when unavailable. */
  change7d: number | null
  /** CoinGecko only. Null when unavailable. */
  marketCap: number | null
  volume: number | null
  /** Global (CoinGecko) or single-venue (Coinbase) — the render must say which. */
  volumeSource: Venue
  /** Where the headline price came from. */
  source: Venue
  rank: number | null
  listedOnCoinbase: boolean
  /** CoinGecko id. Doubles as CoinMarketCap's URL slug — verified to match. */
  coingeckoId: string | null
}

export interface SpotResult {
  assets: Spot[]
  at: Date
  query?: string
  alternatives?: Coin[]
}

export interface Coin {
  id: string
  symbol: string
  name: string
  rank: number | null
}

const CG = 'https://api.coingecko.com/api/v3'
const DEFAULT_IDS = ['bitcoin', 'ethereum']
const DEFAULT_ORDER = ['BTC', 'ETH']

export class UnknownAssetError extends Error {
  query: string
  listed: number | null
  constructor(query: string, listed: number | null = null) {
    super(`No asset matches "${query}".`)
    this.name = 'UnknownAssetError'
    this.query = query
    this.listed = listed
  }
}

export class RateLimitError extends Error {
  constructor() {
    super('CoinGecko rate limit reached.')
    this.name = 'RateLimitError'
  }
}

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const r = await fetch(url, { headers: { accept: 'application/json' }, signal })
  if (r.status === 429) throw new RateLimitError()
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status} ${r.statusText}`)
  return r.json()
}

/* ---------- caching ----------

   The whole team shares one IP through the bot, and CoinGecko's free tier is
   tight. Two caches with very different lifetimes:

     resolution -> a day. "hype" has meant Hyperliquid since it listed and
                   will tomorrow too; this mapping is effectively static.
     market     -> 30 seconds. CoinGecko caches its own numbers for about a
                   minute, so a 30-second-old value costs no accuracy.
   ------------------------------------------------------------------------ */

const RESOLVE_TTL = 24 * 60 * 60 * 1000
const MARKET_TTL = 30 * 1000
const MAX_ENTRIES = 500

interface Cached<T> { at: number; value: T }

const resolveCache = new Map<string, Cached<{ match: Coin; others: Coin[] } | null>>()
const marketCache = new Map<string, Cached<Spot[]>>()

function readCache<T>(m: Map<string, Cached<T>>, k: string, ttl: number): T | undefined {
  const hit = m.get(k)
  if (!hit) return undefined
  if (Date.now() - hit.at > ttl) { m.delete(k); return undefined }
  return hit.value
}

function writeCache<T>(m: Map<string, Cached<T>>, k: string, value: T): void {
  if (m.size >= MAX_ENTRIES) {
    const oldest = m.keys().next().value
    if (oldest !== undefined) m.delete(oldest)
  }
  m.set(k, { at: Date.now(), value })
}

/* ---------- CoinGecko resolution (fallback only) ---------- */

export async function resolveCoin(
  query: string,
  signal: AbortSignal,
): Promise<{ match: Coin; others: Coin[] } | null> {
  const q = query.trim().toLowerCase()
  if (!q) return null

  const cached = readCache(resolveCache, q, RESOLVE_TTL)
  if (cached !== undefined) return cached

  const res = (await getJson(`${CG}/search?query=${encodeURIComponent(q)}`, signal)) as {
    coins?: { id: string; symbol: string; name: string; market_cap_rank: number | null }[]
  }

  const coins: Coin[] = (res.coins ?? []).map((c) => ({
    id: c.id,
    symbol: String(c.symbol).toUpperCase(),
    name: c.name,
    rank: c.market_cap_rank ?? null,
  }))
  if (!coins.length) {
    writeCache(resolveCache, q, null)
    return null
  }

  const score = (c: Coin) => {
    const id = c.id.toLowerCase()
    const sym = c.symbol.toLowerCase()
    const name = c.name.toLowerCase()
    if (id === q) return 0
    if (sym === q || name === q) return 1
    if (name.startsWith(q) || id.startsWith(q)) return 2
    return 3
  }

  const ranked = [...coins].sort((a, b) => {
    const d = score(a) - score(b)
    if (d !== 0) return d
    // Unranked coins sort last: no market cap rank means no liquidity worth
    // quoting, and that is exactly where the impostors live.
    return (a.rank ?? Infinity) - (b.rank ?? Infinity)
  })

  const out = { match: ranked[0], others: ranked.slice(1, 4) }
  writeCache(resolveCache, q, out)
  return out
}

/* ---------- CoinGecko market data ---------- */

async function marketsFor(ids: string[], signal: AbortSignal): Promise<Spot[]> {
  const key = ids.join(',')
  const cached = readCache(marketCache, key, MARKET_TTL)
  // Clone: callers mutate these when overlaying the live Coinbase print.
  if (cached) return cached.map((a) => ({ ...a }))

  const url =
    `${CG}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(key)}` +
    `&price_change_percentage=24h,7d`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (await getJson(url, signal)) as any[]
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('empty response')

  const spots: Spot[] = rows.map((m) => ({
    symbol: String(m.symbol).toUpperCase(),
    name: String(m.name),
    price: Number(m.current_price),
    change24h: Number(m.price_change_percentage_24h_in_currency ?? 0),
    change7d: m.price_change_percentage_7d_in_currency == null
      ? null
      : Number(m.price_change_percentage_7d_in_currency),
    marketCap: m.market_cap == null ? null : Number(m.market_cap),
    volume: m.total_volume == null ? null : Number(m.total_volume),
    volumeSource: 'CoinGecko' as Venue,
    source: 'CoinGecko' as Venue,
    rank: m.market_cap_rank ?? null,
    listedOnCoinbase: false,
    coingeckoId: typeof m.id === 'string' ? m.id : null,
  }))

  writeCache(marketCache, key, spots)
  return spots.map((a) => ({ ...a }))
}

/** Apply the live Coinbase print over CoinGecko's cached one, where listed. */
async function overlayLive(assets: Spot[], signal: AbortSignal): Promise<void> {
  const live = await Promise.all(
    assets.map(async (a) => {
      const p = await findProduct(a.symbol, signal).catch(() => null)
      return p ? cbStats(p.product, signal) : null
    }),
  )
  assets.forEach((a, i) => {
    const s = live[i]
    if (!s) return
    a.price = s.price
    if (isFinite(s.change24h)) a.change24h = s.change24h
    a.source = 'Coinbase'
    a.listedOnCoinbase = true
  })
}

/**
 * Best-effort CoinGecko context for a Coinbase-resolved asset: market cap and
 * 7d change, neither of which a single venue can supply. Silently gives up —
 * a throttled CoinGecko must not take the price down with it.
 */
async function enrich(spot: Spot, signal: AbortSignal): Promise<void> {
  try {
    const found = await resolveCoin(spot.symbol, signal)
    if (!found) return

    // Guard against the search returning a same-ticker impostor: only accept
    // it if the ticker matches what Coinbase told us.
    if (found.match.symbol.toUpperCase() !== spot.symbol) return

    const rows = await marketsFor([found.match.id], signal)
    const m = rows[0]
    if (!m) return

    spot.change7d = m.change7d
    spot.marketCap = m.marketCap
    spot.rank = m.rank
    spot.coingeckoId = found.match.id
    if (m.volume != null) {
      spot.volume = m.volume        // global volume beats single-venue
      spot.volumeSource = 'CoinGecko'
    }
  } catch {
    /* rate-limited or down; the Coinbase figures already stand */
  }
}

/* ---------- entry points ---------- */

/** The desk default: BTC and ETH. */
export async function fetchSpot(timeoutMs = 12_000): Promise<SpotResult> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const assets = await marketsFor(DEFAULT_IDS, ctl.signal)
    // Preserve the order we asked for; CoinGecko sorts by market cap.
    assets.sort((a, b) => DEFAULT_ORDER.indexOf(a.symbol) - DEFAULT_ORDER.indexOf(b.symbol))
    await overlayLive(assets, ctl.signal)
    return { assets, at: new Date() }
  } finally {
    clearTimeout(t)
  }
}

/** One named asset: /price hyperliquid, /price sol, /price hype. */
export async function lookupSpot(query: string, timeoutMs = 12_000): Promise<SpotResult> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), timeoutMs)

  try {
    // 1. Coinbase first — the common path, and the one that cannot be throttled.
    const product: Product | null = await findProduct(query, ctl.signal).catch(() => null)

    if (product) {
      const s = await cbStats(product.product, ctl.signal)
      if (s) {
        const spot: Spot = {
          symbol: product.symbol,
          name: product.name,
          price: s.price,
          change24h: s.change24h,
          change7d: null,
          marketCap: null,
          volume: isFinite(s.volumeUsd) ? s.volumeUsd : null,
          volumeSource: 'Coinbase',
          source: 'Coinbase',
          rank: null,
          listedOnCoinbase: true,
          coingeckoId: null,
        }
        await enrich(spot, ctl.signal)
        return { assets: [spot], at: new Date(), query: query.trim(), alternatives: [] }
      }
    }

    // 2. Not on Coinbase — fall back to the wider CoinGecko universe.
    const found = await resolveCoin(query, ctl.signal)
    if (!found) {
      throw new UnknownAssetError(query, await cbCount(ctl.signal).catch(() => null))
    }

    const assets = await marketsFor([found.match.id], ctl.signal)
    if (!assets.length) throw new UnknownAssetError(query)

    const q = query.trim().toLowerCase()
    const collides = found.others.filter((o) => o.symbol === found.match.symbol)
    const fuzzy =
      found.match.name.toLowerCase() !== q &&
      found.match.symbol.toLowerCase() !== q &&
      found.match.id.toLowerCase() !== q

    return {
      assets,
      at: new Date(),
      query: query.trim(),
      alternatives: collides.length ? collides : fuzzy ? found.others.slice(0, 2) : [],
    }
  } finally {
    clearTimeout(t)
  }
}

/* ──────────────────────────────────────────────────────────────────────────
   Coinbase Exchange catalogue and stats.

   Split out from price.ts because it answers a different question. CoinGecko
   answers "what is this asset worth across the market"; Coinbase answers "is
   this something you can actually trade here, and what did it last print".
   For a desk the second question is the more useful one, and it is the one
   with no rate limit and no API key.

   The public endpoints used here:

     /products     401 online USD pairs at time of writing
     /currencies   ticker -> full name (HYPE -> Hyperliquid)
     /products/X-USD/stats   last, open, 24h high/low, 24h base volume

   Nothing here needs credentials. All three are open.
   ────────────────────────────────────────────────────────────────────────── */

const CB = 'https://api.exchange.coinbase.com'

/** The catalogue changes when Coinbase lists something — hours, not seconds. */
const CATALOGUE_TTL = 6 * 60 * 60 * 1000

export interface Product {
  /** Coinbase product id, e.g. "HYPE-USD". */
  product: string
  /** Base ticker, e.g. "HYPE". */
  symbol: string
  /** Full name from /currencies, e.g. "Hyperliquid". Falls back to the ticker. */
  name: string
}

export interface Stats {
  price: number
  /** Percent change against the 24h open. NaN when Coinbase omits the open. */
  change24h: number
  /** 24h volume on Coinbase, converted from base units to USD notional. */
  volumeUsd: number
}

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const r = await fetch(url, { headers: { accept: 'application/json' }, signal })
  if (!r.ok) throw new Error(`coinbase ${r.status} ${r.statusText}`)
  return r.json()
}

let cache: { at: number; bySymbol: Map<string, Product> } | null = null
let inflight: Promise<Map<string, Product>> | null = null

async function build(signal?: AbortSignal): Promise<Map<string, Product>> {
  const [products, currencies] = await Promise.all([
    getJson(`${CB}/products`, signal) as Promise<
      { base_currency: string; quote_currency: string; status: string; trading_disabled: boolean; id: string }[]
    >,
    // Names are a nicety; if this call fails we still have tickers.
    (getJson(`${CB}/currencies`, signal) as Promise<{ id: string; name: string }[]>).catch(
      () => [] as { id: string; name: string }[],
    ),
  ])

  const names = new Map(currencies.map((c) => [c.id, c.name]))
  const bySymbol = new Map<string, Product>()

  for (const p of products) {
    // USD pairs only, and only ones actually trading. A delisted or
    // cancel-only market would still return stats, which is worse than
    // saying we do not have it.
    if (p.quote_currency !== 'USD') continue
    if (p.status !== 'online' || p.trading_disabled) continue

    const symbol = p.base_currency.toUpperCase()
    bySymbol.set(symbol, {
      product: p.id,
      symbol,
      name: names.get(symbol) || symbol,
    })
  }

  return bySymbol
}

/** The online USD catalogue, cached. Concurrent callers share one fetch. */
export async function catalogue(signal?: AbortSignal): Promise<Map<string, Product>> {
  if (cache && Date.now() - cache.at < CATALOGUE_TTL) return cache.bySymbol
  if (inflight) return inflight

  inflight = build(signal)
    .then((bySymbol) => {
      cache = { at: Date.now(), bySymbol }
      return bySymbol
    })
    .finally(() => {
      inflight = null
    })

  try {
    return await inflight
  } catch (e) {
    // A stale catalogue beats no catalogue: listings change slowly.
    if (cache) return cache.bySymbol
    throw e
  }
}

/**
 * Resolve what someone typed against the Coinbase catalogue.
 *
 * Exact ticker first, then exact name, then a name prefix. No fuzzy matching
 * beyond that: everything in this catalogue is a real Coinbase listing, so
 * there are no impostors to rank around, and a wrong loose match would be
 * worse than admitting we did not find it.
 */
export async function findProduct(
  query: string,
  signal?: AbortSignal,
): Promise<Product | null> {
  const q = query.trim().toLowerCase()
  if (!q) return null

  const bySymbol = await catalogue(signal)

  const exactTicker = bySymbol.get(q.toUpperCase())
  if (exactTicker) return exactTicker

  const all = [...bySymbol.values()]
  const exactName = all.find((p) => p.name.toLowerCase() === q)
  if (exactName) return exactName

  const prefixed = all
    .filter((p) => p.name.toLowerCase().startsWith(q))
    .sort((a, b) => a.name.length - b.name.length)

  return prefixed[0] ?? null
}

/** How many USD markets are listed, for the "not found" message. */
export async function count(signal?: AbortSignal): Promise<number> {
  return (await catalogue(signal)).size
}

/* ---------- ranges ---------- */

export interface Range {
  key: string
  label: string
  /** TradingView's interval code, so a deep link opens at a matching zoom. */
  tvInterval: string
  /** chart-img.com's interval code for the rendered image. */
  imgInterval: string
}

/** Selectable ranges, mapped to the interval TradingView should open at. */
export const RANGES: Range[] = [
  { key: '24h', label: '24h', tvInterval: '30', imgInterval: '15m' },
  { key: '7d', label: '7d', tvInterval: '60', imgInterval: '1h' },
  { key: '30d', label: '30d', tvInterval: '240', imgInterval: '4h' },
  { key: '90d', label: '90d', tvInterval: 'D', imgInterval: '1D' },
]

export const DEFAULT_RANGE = RANGES[1]

export function findRange(token: string | undefined): Range | null {
  if (!token) return null
  const t = token.trim().toLowerCase()
  return RANGES.find((r) => r.key === t) ?? null
}

export async function stats(product: string, signal?: AbortSignal): Promise<Stats | null> {
  try {
    const s = (await getJson(`${CB}/products/${product}/stats`, signal)) as {
      last?: string
      open?: string
      volume?: string
    }

    const price = Number(s.last)
    const open = Number(s.open)
    const volume = Number(s.volume)
    if (!isFinite(price) || price <= 0) return null

    return {
      price,
      change24h: isFinite(open) && open > 0 ? ((price - open) / open) * 100 : NaN,
      // /stats reports volume in base units; multiply out for USD notional.
      volumeUsd: isFinite(volume) ? volume * price : NaN,
    }
  } catch {
    return null
  }
}

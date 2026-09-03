/* ──────────────────────────────────────────────────────────────────────────
   The macro strip's data, assembled server-side.

   The client cannot fetch this itself. Crypto venues send
   access-control-allow-origin: *, but the equity, rates, metals and dollar
   quotes come from a source that sends no CORS header at all, so a browser on
   satstreet.netlify.app is refused before it sees a byte. A function runs on
   Netlify's side of that wall, and the page then makes one same-origin call
   instead of seven cross-origin ones.

   Being the only hop also means one place to decide what the client sees:
   every quote is labelled with where it came from and when, and a source that
   fails degrades to null rather than to a stale or invented number. A dash on
   the dashboard is honest. A wrong price on a trading desk's own page is not.
   ────────────────────────────────────────────────────────────────────────── */

interface Quote {
  symbol: string
  label: string
  price: number | null
  changePct: number | null
  /**
   * Absolute move since the previous close.
   *
   * Yields are the reason this exists. A 10-year going 4.67 to 4.78 is eleven
   * basis points to anyone on a desk, and "+2.40%" is the retail-app way of
   * saying it. Percent change is meaningless on a rate, so the UI reads this
   * field for anything quoted as a yield and changePct for everything else.
   */
  changeAbs: number | null
  /**
   * A short close series for the sparkline, oldest first.
   *
   * Deliberately small. This is a shape, not a chart — enough points to show
   * a direction at 60 pixels wide, few enough that eight instruments do not
   * turn one request into a payload nobody needs.
   */
  spark: number[]
  /** Crypto only: the venue's rolling 24-hour figures. */
  high24h?: number | null
  low24h?: number | null
  volume24h?: number | null
  /** Session fields used by the cross-asset focus chart. */
  open?: number | null
  sessionHigh?: number | null
  sessionLow?: number | null
  marketState?: string | null
  asOf?: string | null
  /** How to render it: a currency, a percentage yield, or an index level. */
  kind: 'usd' | 'cad' | 'pct' | 'level' | 'fx'
  source: string
  error?: string
}

/* Yahoo's chart endpoint is undocumented and unversioned. It is the only free
   source found that carries the requested macro instruments, so it is used with
   that understood: every failure is caught per-symbol, and the strip renders
   without whatever is missing rather than failing whole. If it ever goes away
   the replacement is a paid feed, not a workaround. */
const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart/'

const MACRO: { symbol: string; label: string; kind: Quote['kind'] }[] = [
  { symbol: 'GC=F', label: 'Gold', kind: 'usd' },
  { symbol: 'CL=F', label: 'WTI Oil', kind: 'usd' },
  { symbol: 'CAD=X', label: 'USD/CAD', kind: 'fx' },
  { symbol: '^TNX', label: 'US 10Y', kind: 'pct' },
  { symbol: '^IXIC', label: 'Nasdaq', kind: 'level' },
  { symbol: '^GSPC', label: 'S&P 500', kind: 'level' },
]

async function yahoo(symbol: string, label: string, kind: Quote['kind']): Promise<Quote> {
  const base: Quote = { symbol, label, price: null, changePct: null, changeAbs: null, spark: [], kind, source: 'Yahoo Finance' }
  try {
    const r = await fetch(`${YAHOO}${encodeURIComponent(symbol)}?interval=1d&range=1mo`, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; SatstreetDashboard/1.0)' },
      signal: AbortSignal.timeout(6000),
    })
    if (!r.ok) return { ...base, error: `http ${r.status}` }

    const result = (await r.json())?.chart?.result?.[0]
    const meta = result?.meta
    const quote = result?.indicators?.quote?.[0] ?? {}
    const closes: number[] = (quote.close ?? [])
      .filter((n: unknown): n is number => typeof n === 'number' && isFinite(n))
    const price = Number(meta?.regularMarketPrice)
    const previousFromMeta = Number(meta?.regularMarketPreviousClose ?? meta?.previousClose)
    const prev = isFinite(previousFromMeta)
      ? previousFromMeta
      : closes.length > 1 ? closes[closes.length - 2] : Number(meta?.chartPreviousClose)
    const lastFinite = (values: unknown[]): number | null => {
      for (let i = values.length - 1; i >= 0; i--) {
        const value = Number(values[i])
        if (isFinite(value)) return value
      }
      return null
    }
    if (!isFinite(price)) return { ...base, error: 'no price in response' }

    return {
      ...base,
      price,
      changePct: isFinite(prev) && prev !== 0 ? ((price - prev) / prev) * 100 : null,
      changeAbs: isFinite(prev) ? price - prev : null,
      spark: closes.slice(-22),
      open: isFinite(Number(meta?.regularMarketOpen)) ? Number(meta.regularMarketOpen) : lastFinite(quote.open ?? []),
      sessionHigh: isFinite(Number(meta?.regularMarketDayHigh)) ? Number(meta.regularMarketDayHigh) : lastFinite(quote.high ?? []),
      sessionLow: isFinite(Number(meta?.regularMarketDayLow)) ? Number(meta.regularMarketDayLow) : lastFinite(quote.low ?? []),
      marketState: typeof meta?.marketState === 'string' ? meta.marketState : null,
      asOf: isFinite(Number(meta?.regularMarketTime)) ? new Date(Number(meta.regularMarketTime) * 1000).toISOString() : null,
    }
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : 'failed' }
  }
}

/* Crypto comes from Coinbase, which the rest of the site already quotes.
   Using the same venue keeps the strip and the focus chart aligned. */
async function coinbase(): Promise<Quote[]> {
  const out: Quote[] = []
  const spot = async (pair: string, label: string, kind: Quote['kind']): Promise<Quote> => {
    const base: Quote = { symbol: pair, label, price: null, changePct: null, changeAbs: null, spark: [], kind, source: 'Coinbase' }
    try {
      const [t, s, c] = await Promise.all([
        fetch(`https://api.exchange.coinbase.com/products/${pair}/ticker`, { signal: AbortSignal.timeout(6000) }),
        fetch(`https://api.exchange.coinbase.com/products/${pair}/stats`, { signal: AbortSignal.timeout(6000) }),
        fetch(`https://api.exchange.coinbase.com/products/${pair}/candles?granularity=3600`, {
          signal: AbortSignal.timeout(6000),
        }),
      ])
      if (!t.ok) return { ...base, error: `http ${t.status}` }
      const ticker = await t.json()
      const price = parseFloat(ticker.price)
      const stats = s.ok ? await s.json() : {}
      const open = parseFloat(stats.open)

      // Candles arrive newest-first as [time, low, high, open, close, volume].
      let spark: number[] = []
      if (c.ok) {
        const rows = (await c.json()) as number[][]
        spark = rows.slice(0, 24).map((r) => r[4]).reverse().filter((n) => isFinite(n))
      }
      if (!isFinite(price)) return { ...base, error: 'no price' }
      return {
        ...base,
        price,
        changePct: isFinite(open) && open !== 0 ? ((price - open) / open) * 100 : null,
        changeAbs: isFinite(open) ? price - open : null,
        spark,
        high24h: isFinite(parseFloat(stats.high)) ? parseFloat(stats.high) : null,
        low24h: isFinite(parseFloat(stats.low)) ? parseFloat(stats.low) : null,
        volume24h: isFinite(parseFloat(stats.volume)) ? parseFloat(stats.volume) : null,
        open: isFinite(open) ? open : null,
        sessionHigh: isFinite(parseFloat(stats.high)) ? parseFloat(stats.high) : null,
        sessionLow: isFinite(parseFloat(stats.low)) ? parseFloat(stats.low) : null,
        marketState: 'REGULAR',
        asOf: typeof ticker.time === 'string' ? ticker.time : new Date().toISOString(),
      }
    } catch (e) {
      return { ...base, error: e instanceof Error ? e.message : 'failed' }
    }
  }

  out.push(await spot('BTC-USD', 'Bitcoin', 'usd'))
  out.push(await spot('ETH-USD', 'Ethereum', 'usd'))
  return out
}

export default async function handler(): Promise<Response> {
  const [crypto, ...macro] = await Promise.all([
    coinbase(),
    ...MACRO.map((m) => yahoo(m.symbol, m.label, m.kind)),
  ])

  const quotes = [...crypto, ...macro]
  const failed = quotes.filter((q) => q.error).map((q) => q.label)

  return new Response(
    JSON.stringify({
      asOf: new Date().toISOString(),
      quotes,
      degraded: failed,
      disclaimer:
        'Indicative reference prices. Not a quote, not an offer, and not the price at which Satstreet will execute.',
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        // Same-origin in production, but the header keeps the endpoint usable
        // from a local page while the dashboard is being built.
        'access-control-allow-origin': '*',
        // Quotes this heavy do not need to be fresh to the second, and a cache
        // keeps a busy morning from hammering an undocumented upstream.
        'cache-control': 'public, max-age=45, stale-while-revalidate=120',
      },
    },
  )
}

export const config = { path: '/api/market' }

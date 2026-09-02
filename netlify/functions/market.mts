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
  /** How to render it: a currency, a percentage yield, or an index level. */
  kind: 'usd' | 'cad' | 'pct' | 'level' | 'fx'
  source: string
  error?: string
}

/* Yahoo's chart endpoint is undocumented and unversioned. It is the only free
   source found that carries all four macro instruments, so it is used with
   that understood: every failure is caught per-symbol, and the strip renders
   without whatever is missing rather than failing whole. If it ever goes away
   the replacement is a paid feed, not a workaround. */
const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart/'

const MACRO: { symbol: string; label: string; kind: Quote['kind'] }[] = [
  { symbol: '^GSPC', label: 'S&P 500', kind: 'level' },
  { symbol: '^IXIC', label: 'Nasdaq', kind: 'level' },
  { symbol: 'GC=F', label: 'Gold', kind: 'usd' },
  { symbol: 'DX-Y.NYB', label: 'DXY', kind: 'level' },
  { symbol: '^TNX', label: 'US 10Y', kind: 'pct' },
]

async function yahoo(symbol: string, label: string, kind: Quote['kind']): Promise<Quote> {
  const base: Quote = { symbol, label, price: null, changePct: null, changeAbs: null, kind, source: 'Yahoo Finance' }
  try {
    const r = await fetch(`${YAHOO}${encodeURIComponent(symbol)}?interval=1d&range=5d`, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; SatstreetDashboard/1.0)' },
      signal: AbortSignal.timeout(6000),
    })
    if (!r.ok) return { ...base, error: `http ${r.status}` }

    const meta = (await r.json())?.chart?.result?.[0]?.meta
    const price = Number(meta?.regularMarketPrice)
    const prev = Number(meta?.chartPreviousClose ?? meta?.previousClose)
    if (!isFinite(price)) return { ...base, error: 'no price in response' }

    return {
      ...base,
      price,
      changePct: isFinite(prev) && prev !== 0 ? ((price - prev) / prev) * 100 : null,
      changeAbs: isFinite(prev) ? price - prev : null,
    }
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : 'failed' }
  }
}

/* Crypto and the CAD rate come from Coinbase, which the rest of the site
   already quotes. Using the same venue here keeps the strip and the market
   board from disagreeing with each other in front of a client. */
async function coinbase(): Promise<Quote[]> {
  const out: Quote[] = []
  const spot = async (pair: string, label: string, kind: Quote['kind']): Promise<Quote> => {
    const base: Quote = { symbol: pair, label, price: null, changePct: null, changeAbs: null, kind, source: 'Coinbase' }
    try {
      const [t, s] = await Promise.all([
        fetch(`https://api.exchange.coinbase.com/products/${pair}/ticker`, { signal: AbortSignal.timeout(6000) }),
        fetch(`https://api.exchange.coinbase.com/products/${pair}/stats`, { signal: AbortSignal.timeout(6000) }),
      ])
      if (!t.ok) return { ...base, error: `http ${t.status}` }
      const price = parseFloat((await t.json()).price)
      const open = s.ok ? parseFloat((await s.json()).open) : NaN
      if (!isFinite(price)) return { ...base, error: 'no price' }
      return {
        ...base,
        price,
        changePct: isFinite(open) && open !== 0 ? ((price - open) / open) * 100 : null,
        changeAbs: isFinite(open) ? price - open : null,
      }
    } catch (e) {
      return { ...base, error: e instanceof Error ? e.message : 'failed' }
    }
  }

  out.push(await spot('BTC-USD', 'Bitcoin', 'usd'))
  out.push(await spot('ETH-USD', 'Ethereum', 'usd'))
  return out
}

/** CAD per USD, from the same keyless endpoint the portfolio page uses. */
async function cadUsd(): Promise<Quote> {
  const base: Quote = {
    symbol: 'USD-CAD', label: 'CAD/USD', price: null, changePct: null, changeAbs: null,
    kind: 'fx', source: 'Coinbase',
  }
  try {
    const r = await fetch('https://api.coinbase.com/v2/exchange-rates?currency=USD', {
      signal: AbortSignal.timeout(6000),
    })
    if (!r.ok) return { ...base, error: `http ${r.status}` }
    const cad = parseFloat((await r.json())?.data?.rates?.CAD)
    return isFinite(cad) ? { ...base, price: cad } : { ...base, error: 'no CAD rate' }
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : 'failed' }
  }
}

export default async function handler(): Promise<Response> {
  const [crypto, fx, ...macro] = await Promise.all([
    coinbase(),
    cadUsd(),
    ...MACRO.map((m) => yahoo(m.symbol, m.label, m.kind)),
  ])

  const quotes = [...crypto, fx, ...macro]
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

/* ──────────────────────────────────────────────────────────────────────────
   Cross-asset series — the market monitor's data, assembled server-side.

   One endpoint, one normalized instrument model, two providers behind it:
   Coinbase for crypto (which sends CORS and could be called from the browser,
   but is routed here anyway so every instrument shares one shape), and Yahoo
   for equities, futures, FX and the 10-year, which send no CORS header at all
   and so *must* be fetched server-side.

   Two shapes of request:
     /api/series                    every instrument at 1D — the grid
     /api/series?symbol=BTC&range=1M one instrument at a range — the focus chart

   Market status is derived from a schedule, not from a provider flag: Yahoo's
   marketState is frequently null on the ranges we query, and a desk needs
   "closed" to actually mean closed. Crypto is always open; everything else is
   open only inside its real session, so nothing is labelled live at 3am.

   Credentials: none. Both providers are keyless. If either goes away the
   replacement is a licensed feed and an API key in the environment, read here
   and never sent to the browser.
   ────────────────────────────────────────────────────────────────────────── */

type Kind = 'usd' | 'fx' | 'pct' | 'level'
type Cls = 'crypto' | 'equity' | 'futures' | 'fx' | 'bond'

interface Point { t: number; c: number }

interface Instrument {
  symbol: string
  label: string
  ticker: string
  kind: Kind
  cls: Cls
  price: number | null
  changeAbs: number | null
  changePct: number | null
  open: number | null
  high: number | null
  low: number | null
  points: Point[]
  status: 'open' | 'closed'
  source: string
  sourceNote?: string
  asOf: string
  /** True when the market is open but the last point is older than expected. */
  stale: boolean
  error?: string
}

/* Registry. Each instrument names its provider symbol, how to render it, and
   which session schedule governs "open". */
const REG: Record<string, {
  label: string; ticker: string; kind: Kind; cls: Cls
  provider: 'coinbase' | 'yahoo'; psym: string; source: string; sourceNote?: string
}> = {
  BTC:    { label: 'Bitcoin',   ticker: 'BTC/USD', kind: 'usd',   cls: 'crypto',  provider: 'coinbase', psym: 'BTC-USD', source: 'Coinbase' },
  ETH:    { label: 'Ethereum',  ticker: 'ETH/USD', kind: 'usd',   cls: 'crypto',  provider: 'coinbase', psym: 'ETH-USD', source: 'Coinbase' },
  XAU:    { label: 'Gold',      ticker: 'XAU/USD', kind: 'usd',   cls: 'futures', provider: 'yahoo',    psym: 'GC=F',    source: 'Yahoo Finance', sourceNote: 'COMEX front-month, USD/oz' },
  WTI:    { label: 'Oil',       ticker: 'WTI',     kind: 'usd',   cls: 'futures', provider: 'yahoo',    psym: 'CL=F',    source: 'Yahoo Finance', sourceNote: 'NYMEX front-month, USD/bbl' },
  USDCAD: { label: 'USD/CAD',   ticker: 'USD/CAD', kind: 'fx',    cls: 'fx',      provider: 'yahoo',    psym: 'CAD=X',   source: 'Yahoo Finance' },
  US10Y:  { label: 'US 10Y',    ticker: 'US10Y',   kind: 'pct',   cls: 'bond',    provider: 'yahoo',    psym: '^TNX',    source: 'Yahoo Finance' },
  NDX:    { label: 'Nasdaq 100', ticker: 'NDX',    kind: 'level', cls: 'equity',  provider: 'yahoo',    psym: '^NDX',    source: 'Yahoo Finance' },
  SPX:    { label: 'S&P 500',   ticker: 'SPX',     kind: 'level', cls: 'equity',  provider: 'yahoo',    psym: '^GSPC',   source: 'Yahoo Finance' },
}
const ORDER = ['BTC', 'ETH', 'XAU', 'WTI', 'USDCAD', 'US10Y', 'NDX', 'SPX']

const RANGES = ['1D', '1W', '1M', '3M', '1Y'] as const
type Range = typeof RANGES[number]

/* ── session schedule, in America/New_York ─────────────────────────────────
   Deterministic and provider-independent, so "closed" is trustworthy. */
function nowET(): { day: number; minutes: number } {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const parts = Object.fromEntries(f.formatToParts(new Date()).map((p) => [p.type, p.value]))
  const days = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>
  const h = parseInt(parts.hour, 10) % 24
  return { day: days[parts.weekday] ?? 0, minutes: h * 60 + parseInt(parts.minute, 10) }
}

function isOpen(cls: Cls): boolean {
  if (cls === 'crypto') return true
  const { day, minutes } = nowET()
  const weekday = day >= 1 && day <= 5
  if (cls === 'equity') return weekday && minutes >= 570 && minutes < 960          // 09:30–16:00
  if (cls === 'bond') return weekday && minutes >= 480 && minutes < 1020           // 08:00–17:00 cash proxy
  if (cls === 'fx' || cls === 'futures') {
    // Sun 17:00/18:00 → Fri 17:00, with a daily 17:00–18:00 maintenance gap.
    const openHour = cls === 'futures' ? 1080 : 1020 // 18:00 futures, 17:00 fx
    if (day === 6) return false                                    // Saturday
    if (day === 0) return minutes >= openHour                      // Sunday after open
    if (day === 5) return minutes < 1020                           // Friday before 17:00
    return !(minutes >= 1020 && minutes < 1080)                    // Mon–Thu, minus the 17–18 gap
  }
  return false
}

/* ── Coinbase (crypto) ─────────────────────────────────────────────────────
   Granularity per range; 1Y needs more than one 300-candle page, so it pages. */
const CB_GRAN: Record<Range, number> = { '1D': 300, '1W': 3600, '1M': 21600, '3M': 86400, '1Y': 86400 }
const RANGE_MS: Record<Range, number> = {
  '1D': 864e5, '1W': 7 * 864e5, '1M': 30 * 864e5, '3M': 91 * 864e5, '1Y': 365 * 864e5,
}

async function coinbase(id: string, range: Range): Promise<Instrument> {
  const r = REG[id]
  const base = blank(id)
  try {
    const gran = CB_GRAN[range]
    const now = Date.now()
    const since = now - RANGE_MS[range]
    const rows: number[][] = []
    // Page backward from now; each request is capped at 300 candles.
    let end = now
    for (let i = 0; i < 4 && end > since; i++) {
      const start = Math.max(since, end - 300 * gran * 1000)
      const u = `https://api.exchange.coinbase.com/products/${r.psym}/candles?granularity=${gran}` +
        `&start=${new Date(start).toISOString()}&end=${new Date(end).toISOString()}`
      const resp = await fetch(u, { signal: AbortSignal.timeout(6000) })
      if (!resp.ok) { if (i === 0) return { ...base, error: `http ${resp.status}` }; break }
      const page = (await resp.json()) as number[][]
      if (!page.length) break
      rows.push(...page)
      end = start
    }
    if (!rows.length) return { ...base, error: 'no candles' }
    // Candles: [time, low, high, open, close, volume], newest-first across pages.
    rows.sort((a, b) => a[0] - b[0])
    const points: Point[] = rows.map((c) => ({ t: c[0] * 1000, c: c[4] })).filter((p) => isFinite(p.c))
    return finish(base, points, range)
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : 'failed' }
  }
}

/* ── Yahoo (everything else) ───────────────────────────────────────────────── */
const YH: Record<Range, { interval: string; range: string }> = {
  '1D': { interval: '5m', range: '1d' },
  '1W': { interval: '60m', range: '5d' },
  '1M': { interval: '1d', range: '1mo' },
  '3M': { interval: '1d', range: '3mo' },
  '1Y': { interval: '1wk', range: '1y' },
}

async function yahoo(id: string, range: Range): Promise<Instrument> {
  const r = REG[id]
  const base = blank(id)
  try {
    const { interval, range: yr } = YH[range]
    const u = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(r.psym)}?interval=${interval}&range=${yr}`
    const resp = await fetch(u, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; SatstreetTerminal/1.0)' },
      signal: AbortSignal.timeout(6000),
    })
    if (!resp.ok) return { ...base, error: `http ${resp.status}` }
    const res = (await resp.json())?.chart?.result?.[0]
    const ts: number[] = res?.timestamp ?? []
    const closes: (number | null)[] = res?.indicators?.quote?.[0]?.close ?? []
    const points: Point[] = ts
      .map((t, i) => ({ t: t * 1000, c: closes[i] as number }))
      .filter((p) => typeof p.c === 'number' && isFinite(p.c))
    if (!points.length) return { ...base, error: 'no series' }
    return finish(base, points, range)
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : 'failed' }
  }
}

/* ── shared shaping ───────────────────────────────────────────────────────── */
function blank(id: string): Instrument {
  const r = REG[id]
  return {
    symbol: id, label: r.label, ticker: r.ticker, kind: r.kind, cls: r.cls,
    price: null, changeAbs: null, changePct: null, open: null, high: null, low: null,
    points: [], status: isOpen(r.cls) ? 'open' : 'closed', source: r.source,
    sourceNote: r.sourceNote, asOf: new Date().toISOString(), stale: false,
  }
}

function finish(base: Instrument, points: Point[], range: Range): Instrument {
  const price = points[points.length - 1].c
  // Session open/high/low come from the intraday window; for longer ranges
  // they describe the shown window rather than the trading session.
  const dayPoints = range === '1D' ? points : points
  const open = dayPoints[0].c
  const high = Math.max(...dayPoints.map((p) => p.c))
  const low = Math.min(...dayPoints.map((p) => p.c))
  const lastT = points[points.length - 1].t
  // Stale only matters while the market is open: a closed market is expected
  // to be still. Intraday feeds should update within ~20 minutes.
  const stale = base.status === 'open' && Date.now() - lastT > 20 * 60 * 1000
  return {
    ...base, price, open,
    changeAbs: price - open,
    changePct: open !== 0 ? ((price - open) / open) * 100 : null,
    high, low, points, stale, asOf: new Date().toISOString(),
  }
}

async function fetchOne(id: string, range: Range): Promise<Instrument> {
  return REG[id].provider === 'coinbase' ? coinbase(id, range) : yahoo(id, range)
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const symbol = (url.searchParams.get('symbol') || '').toUpperCase()
  const range = (url.searchParams.get('range') || '1D').toUpperCase() as Range
  const r: Range = (RANGES as readonly string[]).includes(range) ? range : '1D'

  const ids = symbol && REG[symbol] ? [symbol] : ORDER
  const instruments = await Promise.all(ids.map((id) => fetchOne(id, r)))

  return new Response(
    JSON.stringify({
      asOf: new Date().toISOString(),
      range: r,
      instruments,
      degraded: instruments.filter((i) => i.error).map((i) => i.symbol),
      disclaimer:
        'Indicative reference prices from third-party venues, and may be delayed. ' +
        'Not a quote, not an offer, and not the price at which Satstreet will execute.',
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=30, stale-while-revalidate=120',
      },
    },
  )
}

export const config = { path: '/api/series' }

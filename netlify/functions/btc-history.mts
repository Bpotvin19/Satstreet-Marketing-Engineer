/* ──────────────────────────────────────────────────────────────────────────
   Daily BTC/USD reference price history — the cost-basis backbone for P&L.

   Wallet P&L needs the BTC price on the day each external receipt landed.
   That is a lookup against a daily close series, built here once and cached
   hard: the data changes at most once a day, and paging it live on every
   Portfolio load would hammer the upstream for no benefit.

   Coinbase caps a candle request at 300, so this pages backward to cover the
   requested window (default ~5 years, which reaches Coinbase's BTC-USD
   history). It returns a compact { "YYYY-MM-DD": close } map plus the range it
   actually covered, so the client can tell honestly when a receipt predates
   available data rather than guessing a price.
   ────────────────────────────────────────────────────────────────────────── */

const PRODUCT = 'https://api.exchange.coinbase.com/products/BTC-USD/candles'
const DAY = 86_400
const MAX_PAGES = 8 // 8 × 300 days ≈ 6.5 years, comfortably before Coinbase BTC-USD

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const fromParam = url.searchParams.get('from') // optional YYYY-MM-DD floor
  const floor = fromParam ? Date.parse(fromParam + 'T00:00:00Z') : 0

  const prices: Record<string, number> = {}
  let end = Date.now()
  let oldest = end
  let pages = 0
  let error: string | undefined

  try {
    for (let i = 0; i < MAX_PAGES; i++) {
      const start = end - 300 * DAY * 1000
      const u = `${PRODUCT}?granularity=${DAY}&start=${new Date(start).toISOString()}&end=${new Date(end).toISOString()}`
      const r = await fetch(u, {
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; SatstreetTerminal/1.0)' },
        signal: AbortSignal.timeout(7000),
      })
      if (!r.ok) { if (i === 0) error = `http ${r.status}`; break }
      const rows = (await r.json()) as number[][]
      if (!rows.length) break
      for (const c of rows) {
        // [time, low, high, open, close, volume]
        const day = new Date(c[0] * 1000).toISOString().slice(0, 10)
        if (isFinite(c[4])) { prices[day] = c[4]; oldest = Math.min(oldest, c[0] * 1000) }
      }
      pages++
      end = start
      if (floor && start <= floor) break
    }
  } catch (e) {
    error = e instanceof Error ? e.message : 'failed'
  }

  const days = Object.keys(prices).sort()
  return new Response(
    JSON.stringify({
      asOf: new Date().toISOString(),
      source: 'Coinbase BTC-USD daily close',
      covers: days.length ? { from: days[0], to: days[days.length - 1] } : null,
      count: days.length,
      prices,
      error,
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        // Daily data: cache for hours, refresh in the background.
        'cache-control': 'public, max-age=3600, stale-while-revalidate=21600',
      },
    },
  )
}

export const config = { path: '/api/btc-history' }

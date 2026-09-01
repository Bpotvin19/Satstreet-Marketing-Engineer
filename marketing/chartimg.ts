/* ──────────────────────────────────────────────────────────────────────────
   Real TradingView chart images, via chart-img.com.

   Neither TradingView nor CoinMarketCap publishes a chart image you can
   hot-link — both render in the browser, and their og:image tags are a logo
   and a coin icon respectively. So a genuine chart has to be rendered by
   something, and this is that something.

   The free (BASIC) plan is the binding constraint:

     50 requests per day · 1/sec, burst 3 · max 800x600 · watermarked

   Fifty a day across a team is not much, so results are cached per
   symbol+interval and a local budget stops us spending the allowance on
   repeats. Every failure path returns null: the bot then falls back to the
   text-and-buttons reply, which is exactly what it sent before this existed.
   A missing chart must never cost anyone their price.
   ────────────────────────────────────────────────────────────────────────── */

const ENDPOINT = 'https://api.chart-img.com/v2/tradingview/advanced-chart'

/** BASIC caps at 800x600. Asking for more is rejected outright. */
const WIDTH = 800
const HEIGHT = 450

/** Prices move, but not so fast that a team needs a fresh render each time. */
const CACHE_TTL = 10 * 60 * 1000

/** Leave headroom under the daily 50 so a burst cannot lock everyone out. */
const DAILY_BUDGET = 45

export const isConfigured = (): boolean => Boolean(process.env.CHART_IMG_API_KEY?.trim())

interface Entry { at: number; png: Buffer }
const cache = new Map<string, Entry>()

let spentOn = ''      // YYYY-MM-DD
let spent = 0

function budgetLeft(): boolean {
  const today = new Date().toISOString().slice(0, 10)
  if (today !== spentOn) {
    spentOn = today
    spent = 0
  }
  return spent < DAILY_BUDGET
}

/**
 * Render one chart. Returns null whenever an image cannot be produced —
 * no key, budget exhausted, upstream error — so callers can degrade quietly.
 */
export async function tradingViewChart(
  symbol: string,
  interval: string,
  timeoutMs = 20_000,
): Promise<Buffer | null> {
  const key = process.env.CHART_IMG_API_KEY?.trim()
  if (!key) return null

  const cacheKey = `${symbol}|${interval}`
  const hit = cache.get(cacheKey)
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.png

  if (!budgetLeft()) {
    console.warn(`[chart-img] daily budget of ${DAILY_BUDGET} used; serving buttons only`)
    return null
  }

  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)

  try {
    spent++
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'x-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({
        symbol,
        interval,
        theme: 'dark',
        width: WIDTH,
        height: HEIGHT,
        style: 'candle',
        timezone: 'America/Toronto',
      }),
    })

    if (!r.ok) {
      // The body carries a useful message; a bare status hides the cause.
      const detail = await r.text().catch(() => '')
      console.warn(`[chart-img] ${r.status} ${r.statusText} ${detail.slice(0, 200)}`)
      return null
    }

    const type = r.headers.get('content-type') ?? ''
    if (!type.startsWith('image/')) {
      console.warn(`[chart-img] expected an image, got ${type}`)
      return null
    }

    const png = Buffer.from(await r.arrayBuffer())
    if (png.length === 0) return null

    cache.set(cacheKey, { at: Date.now(), png })
    return png
  } catch (e) {
    console.warn(`[chart-img] ${e instanceof Error ? e.message : String(e)}`)
    return null
  } finally {
    clearTimeout(timer)
  }
}

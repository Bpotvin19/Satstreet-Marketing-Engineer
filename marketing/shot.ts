/* ──────────────────────────────────────────────────────────────────────────
   Screenshots of the Satstreet site.

   chart-img renders somebody else's chart with somebody else's watermark, on
   a 50-a-day allowance. satstreet.netlify.app renders ours, already built and
   already parameterised — /chart.html takes symbol, name and range, which is
   exactly what /chart already knows. So the chart the team posts can be the
   desk's own page rather than a third party's.

   Driving the installed Chrome rather than a bundled Chromium: playwright-core
   is 13MB against roughly 300MB, and the browser is already on the machine.
   The cost is a hard dependency on Chrome being present, which is why every
   failure path returns null and the caller falls back exactly as before.

   One browser, launched on first use and reused. Launching per screenshot
   adds about a second to every /chart, and the team runs this all day.
   ────────────────────────────────────────────────────────────────────────── */

import type { Browser } from 'playwright-core'

/** Where the site is served. Overridable so a re-host needs no code change. */
export const SITE_URL = (process.env.SATSTREET_SITE_URL || 'https://satstreet.netlify.app').replace(/\/$/, '')

/** Wide enough to read on a phone, small enough to send quickly. */
const WIDTH = 1000
const HEIGHT = 620

/** Retina, because a chart at 1x looks soft in Telegram's image viewer. */
const SCALE = 2

/** The chart is an embedded TradingView widget: it loads, then it draws. */
const SETTLE_MS = 4_000
const NAV_TIMEOUT = 25_000

/** Prices move, but not so fast that a team needs a fresh render each time. */
const CACHE_TTL = 10 * 60 * 1000

const cache = new Map<string, { at: number; png: Buffer }>()

let browser: Browser | null = null
let launching: Promise<Browser | null> | null = null

/**
 * The shared browser.
 *
 * `channel: 'chrome'` uses the Chrome already installed on the machine.
 * Without it playwright-core looks for a bundled browser that was never
 * downloaded, and every screenshot fails.
 */
async function getBrowser(): Promise<Browser | null> {
  if (browser?.isConnected()) return browser
  if (launching) return launching

  launching = (async () => {
    try {
      const { chromium } = await import('playwright-core')
      browser = await chromium.launch({ channel: 'chrome', headless: true })
      browser.on('disconnected', () => { browser = null })
      return browser
    } catch (e) {
      console.warn(`[shot] could not launch Chrome: ${e instanceof Error ? e.message : e}`)
      return null
    } finally {
      launching = null
    }
  })()

  return launching
}

export interface ChartShotOptions {
  symbol: string
  name?: string
  /** 24h · 7d · 30d · 90d · 1y — the keys chart.html understands. */
  range: string
}

/** The URL a human should open for the live, interactive version. */
export function chartUrl({ symbol, name, range }: ChartShotOptions): string {
  const q = new URLSearchParams({ symbol: symbol.toUpperCase(), range })
  if (name) q.set('name', name)
  return `${SITE_URL}/chart.html?${q.toString()}`
}

/**
 * A PNG of the desk's own chart page, or null.
 *
 * Null is a normal outcome, not an exception: Chrome missing, the site down,
 * the widget slow. The caller falls back to chart-img and then to text, so a
 * failed screenshot costs the look of the answer and never the answer.
 */
export async function chartShot(opts: ChartShotOptions): Promise<Buffer | null> {
  const key = `${opts.symbol.toUpperCase()}:${opts.range}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.png

  const b = await getBrowser()
  if (!b) return null

  let context
  try {
    context = await b.newContext({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: SCALE,
      // The page renders light or dark from the system preference; pin it so
      // two people running /chart do not get differently-themed images.
      colorScheme: 'dark',
    })
    const page = await context.newPage()
    await page.goto(chartUrl(opts), { waitUntil: 'networkidle', timeout: NAV_TIMEOUT })

    // The host's "Powered by Netlify" badge sits over the bottom-right corner
    // of the chart. Fine on the web, wrong on an image the desk sends a
    // client, so it is hidden for the screenshot only — the deployed page is
    // untouched.
    //
    // The badge lives inside an injected iframe, so no style can reach its
    // contents from here. Hiding the iframe element itself works, and the one
    // frame that must survive is the TradingView widget — hence the exception
    // rather than a blanket rule.
    await page
      .addStyleTag({
        content:
          'iframe:not([src*="tradingview"]){display:none !important}' +
          '[class*="netlify"],[id*="netlify"],a[href*="netlify.com"]{display:none !important}',
      })
      .catch(() => {})

    // networkidle fires when the widget's requests settle, which is before it
    // has finished drawing. The extra wait is what separates a chart from an
    // empty frame.
    await page.waitForTimeout(SETTLE_MS)

    const png = await page.screenshot({ type: 'png' })
    cache.set(key, { at: Date.now(), png })
    return png
  } catch (e) {
    console.warn(`[shot] ${key} failed: ${e instanceof Error ? e.message : e}`)
    return null
  } finally {
    await context?.close().catch(() => {})
  }
}

/** Let the bot shut down cleanly rather than leaving Chrome running. */
export async function closeBrowser(): Promise<void> {
  await browser?.close().catch(() => {})
  browser = null
}

/* ──────────────────────────────────────────────────────────────────────────
   Market structure — the derivatives tab's data.

   Funding, basis, open interest and implied volatility: the four numbers that
   tell a client what positioning looks like, rather than what price is. A
   sophisticated client opens this. Nobody else has to.

   Server-side for the same reason as the macro strip. The venue answers
   public, keyless requests but sends no CORS header, so a browser on
   satstreet.netlify.app is refused before it sees a byte.

   Everything here is derived rather than reported, so the arithmetic is the
   part worth reviewing:

     funding    quoted per 8-hour period; annualised as rate x 3 x 365
     basis      perpetual mark against the spot index, in percent
     open int.  USD notional, as the venue reports it
     implied    the venue's own 30-day volatility index

   One venue is one venue. This is a read on positioning at a single large
   options and futures exchange, not the whole market, and the page says so.
   ────────────────────────────────────────────────────────────────────────── */

const API = 'https://www.deribit.com/api/v2/public/'

/** Funding is quoted per 8h. Three periods a day, 365 days. */
const PERIODS_PER_YEAR = 3 * 365

interface Structure {
  asset: 'BTC' | 'ETH'
  /** Annualised, in percent. Positive means longs are paying shorts. */
  fundingAnnualPct: number | null
  /** Perpetual mark against the spot index, in percent. */
  basisPct: number | null
  /** USD notional. */
  openInterestUsd: number | null
  /** The venue's 30-day implied volatility index. */
  impliedVol: number | null
  volume24hUsd: number | null
  error?: string
}

async function json(path: string): Promise<unknown> {
  const r = await fetch(API + path, { signal: AbortSignal.timeout(6000) })
  if (!r.ok) throw new Error(`http ${r.status}`)
  const body = (await r.json()) as { result?: unknown; error?: { message?: string } }
  if (body.error) throw new Error(body.error.message ?? 'venue error')
  return body.result
}

async function impliedVol(currency: string): Promise<number | null> {
  try {
    const now = Date.now()
    const r = (await json(
      `get_volatility_index_data?currency=${currency}&start_timestamp=${now - 86_400_000}` +
        `&end_timestamp=${now}&resolution=3600`,
    )) as { data?: number[][] }
    const rows = r?.data ?? []
    if (!rows.length) return null
    // Each row is [timestamp, open, high, low, close]; the last close is now.
    const close = rows[rows.length - 1]?.[4]
    return typeof close === 'number' && isFinite(close) ? close : null
  } catch {
    return null
  }
}

async function forAsset(asset: 'BTC' | 'ETH'): Promise<Structure> {
  const base: Structure = {
    asset, fundingAnnualPct: null, basisPct: null,
    openInterestUsd: null, impliedVol: null, volume24hUsd: null,
  }

  try {
    const [summary, vol] = await Promise.all([
      json(`get_book_summary_by_instrument?instrument_name=${asset}-PERPETUAL`) as Promise<
        Record<string, number>[]
      >,
      impliedVol(asset),
    ])

    const s = summary?.[0]
    if (!s) return { ...base, error: 'no perpetual summary' }

    const funding8h = Number(s.funding_8h)
    const mark = Number(s.mark_price)
    const index = Number(s.estimated_delivery_price)

    return {
      ...base,
      fundingAnnualPct: isFinite(funding8h) ? funding8h * PERIODS_PER_YEAR * 100 : null,
      basisPct: isFinite(mark) && isFinite(index) && index !== 0 ? ((mark - index) / index) * 100 : null,
      openInterestUsd: isFinite(Number(s.open_interest)) ? Number(s.open_interest) : null,
      volume24hUsd: isFinite(Number(s.volume_usd)) ? Number(s.volume_usd) : null,
      impliedVol: vol,
    }
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : 'failed' }
  }
}

export default async function handler(): Promise<Response> {
  const assets = await Promise.all([forAsset('BTC'), forAsset('ETH')])

  return new Response(
    JSON.stringify({
      asOf: new Date().toISOString(),
      venue: 'Deribit',
      assets,
      degraded: assets.filter((a) => a.error).map((a) => a.asset),
      note:
        'Positioning at a single venue, not the whole market. Funding is annualised from the ' +
        '8-hour rate; basis is the perpetual mark against the spot index.',
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=60, stale-while-revalidate=180',
      },
    },
  )
}

export const config = { path: '/api/structure' }

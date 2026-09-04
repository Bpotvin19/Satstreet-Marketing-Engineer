/* US spot Bitcoin ETF flows.

   Preferred source is CoinGlass official API when COINGLASS_API_KEY is set.
   Without a key the function tries CoinGlass's public capi used by
   coinglass.com/etf/bitcoin. Nothing is invented: if both paths fail the
   page keeps the empty state.
*/

const OFFICIAL = 'https://open-api-v4.coinglass.com'
const PUBLIC = 'https://capi.coinglass.com'

function jsonResponse(body: unknown, status = 200, maxAge = 300): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${maxAge}, stale-while-revalidate=600`,
      'access-control-allow-origin': '*',
    },
  })
}

function num(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN
  return Number.isFinite(n) ? n : null
}

function sessionDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

interface FlowDay {
  date: string
  ts: number
  flowUsd: number
  priceUsd: number | null
  leadIn: string
  leadOut: string
}

interface Issuer {
  ticker: string
  name: string
  aumUsd: number | null
  btcHolding: number | null
}

async function officialGet(path: string, key: string): Promise<unknown> {
  const response = await fetch(OFFICIAL + path, {
    headers: { 'CG-API-KEY': key, accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error(`CoinGlass official HTTP ${response.status}`)
  const body = (await response.json()) as { code?: string | number; msg?: string; data?: unknown }
  if (String(body.code) !== '0' || body.data == null) throw new Error(body.msg || 'CoinGlass official returned no data')
  return body.data
}

function fromOfficialFlows(rows: unknown[]): FlowDay[] {
  return rows
    .map((row) => {
      const r = row as { timestamp?: number; flow_usd?: number; price_usd?: number; etf_flows?: { etf_ticker?: string; flow_usd?: number }[] }
      const ts = Number(r.timestamp)
      const flow = num(r.flow_usd)
      if (!Number.isFinite(ts) || flow == null) return null
      const parts = Array.isArray(r.etf_flows) ? r.etf_flows : []
      const inflows = parts.filter((p) => (p.flow_usd || 0) > 0).sort((a, b) => (b.flow_usd || 0) - (a.flow_usd || 0))
      const outflows = parts.filter((p) => (p.flow_usd || 0) < 0).sort((a, b) => (a.flow_usd || 0) - (b.flow_usd || 0))
      const fmtLead = (p?: { etf_ticker?: string; flow_usd?: number }) =>
        p?.etf_ticker ? `${p.etf_ticker} ${p.flow_usd && p.flow_usd < 0 ? '-' : '+'}$${Math.abs(p.flow_usd || 0) >= 1e6 ? (Math.abs(p.flow_usd || 0) / 1e6).toFixed(1) + 'M' : Math.round(Math.abs(p.flow_usd || 0) / 1e3) + 'K'}` : ''
      return {
        date: sessionDate(ts),
        ts,
        flowUsd: flow,
        priceUsd: num(r.price_usd),
        leadIn: fmtLead(inflows[0]),
        leadOut: fmtLead(outflows[0]),
      } as FlowDay
    })
    .filter((row): row is FlowDay => row !== null)
    .sort((a, b) => a.ts - b.ts)
}

function fromOfficialList(rows: unknown[]): Issuer[] {
  return rows
    .map((row) => {
      const r = row as { ticker?: string; fund_name?: string; aum_usd?: string | number; asset_details?: { btc_holding?: number } }
      if (!r.ticker) return null
      return {
        ticker: r.ticker,
        name: r.fund_name || r.ticker,
        aumUsd: num(r.aum_usd),
        btcHolding: num(r.asset_details?.btc_holding),
      } as Issuer
    })
    .filter((row): row is Issuer => row !== null)
    .sort((a, b) => (b.aumUsd || 0) - (a.aumUsd || 0))
}

async function publicGet(path: string): Promise<unknown> {
  const response = await fetch(PUBLIC + path, {
    headers: {
      accept: 'application/json',
      origin: 'https://www.coinglass.com',
      referer: 'https://www.coinglass.com/etf/bitcoin',
      'user-agent': 'Mozilla/5.0',
    },
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error(`CoinGlass public HTTP ${response.status}`)
  const body = (await response.json()) as { code?: string | number; message?: string; data?: unknown; success?: boolean }
  if (body.data == null) throw new Error(body.message || 'CoinGlass public returned no data')
  return body.data
}

function coerceDays(data: unknown): FlowDay[] {
  const rows = Array.isArray(data) ? data : Array.isArray((data as { list?: unknown[] })?.list) ? (data as { list: unknown[] }).list : []
  return rows
    .map((row) => {
      const r = row as Record<string, unknown>
      const ts = num(r.timestamp) ?? num(r.date) ?? num(r.time) ?? num(r.ts)
      const flow = num(r.flow_usd) ?? num(r.flowUsd) ?? num(r.netInflow) ?? num(r.change) ?? num(r.change_usd) ?? num(r.netFlow)
      if (ts == null || flow == null) return null
      const stamp = ts < 10_000_000_000 ? ts * 1000 : ts
      return { date: sessionDate(stamp), ts: stamp, flowUsd: flow, priceUsd: num(r.price_usd) ?? num(r.price), leadIn: '', leadOut: '' }
    })
    .filter((row): row is FlowDay => row !== null)
    .sort((a, b) => a.ts - b.ts)
}

function coerceIssuers(data: unknown): Issuer[] {
  const rows = Array.isArray(data) ? data : Array.isArray((data as { list?: unknown[] })?.list) ? (data as { list: unknown[] }).list : []
  return rows
    .map((row) => {
      const r = row as Record<string, unknown>
      const ticker = String(r.ticker || r.symbol || r.etf_ticker || '')
      if (!ticker) return null
      const details = (r.asset_details || r.assetDetails || {}) as Record<string, unknown>
      return {
        ticker,
        name: String(r.fund_name || r.name || r.fundName || ticker),
        aumUsd: num(r.aum_usd) ?? num(r.aum) ?? num(r.netAssets) ?? num(r.net_assets),
        btcHolding: num(details.btc_holding) ?? num(r.btc_holding) ?? num(r.btcHolding),
      } as Issuer
    })
    .filter((row): row is Issuer => row !== null)
    .sort((a, b) => (b.aumUsd || 0) - (a.aumUsd || 0))
}

export default async function handler(): Promise<Response> {
  const key = process.env.COINGLASS_API_KEY?.trim() || ''
  let days: FlowDay[] = []
  let issuers: Issuer[] = []
  let source = 'CoinGlass'

  try {
    if (key) {
      const [flow, list] = await Promise.all([
        officialGet('/api/etf/bitcoin/flow-history', key),
        officialGet('/api/etf/bitcoin/list', key).catch(() => []),
      ])
      days = fromOfficialFlows(Array.isArray(flow) ? flow : [])
      issuers = fromOfficialList(Array.isArray(list) ? list : [])
      source = 'CoinGlass official API'
    } else {
      const [flow, list] = await Promise.all([
        publicGet('/api/etf/flow'),
        publicGet('/api/stock/list').catch(() => []),
      ])
      days = coerceDays(flow)
      issuers = coerceIssuers(list)
      source = 'CoinGlass public tape'
    }
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : 'CoinGlass unavailable',
        hint: key ? 'CoinGlass rejected the configured API key.' : 'Add COINGLASS_API_KEY in Netlify env for a stable official feed.',
        sourceUrl: 'https://www.coinglass.com/etf/bitcoin',
        days: [],
        issuers: [],
      },
      503,
      30,
    )
  }

  if (!days.length) {
    return jsonResponse(
      {
        error: 'CoinGlass returned no ETF sessions.',
        hint: key ? '' : 'Add COINGLASS_API_KEY in Netlify env.',
        sourceUrl: 'https://www.coinglass.com/etf/bitcoin',
        days: [],
        issuers,
      },
      503,
      30,
    )
  }

  const recent = days.slice(-400)
  const aumUsd = issuers.reduce((sum, row) => sum + (row.aumUsd || 0), 0) || null
  const cumulativeUsd = recent.reduce((sum, row) => sum + row.flowUsd, 0)

  return jsonResponse({
    asOf: new Date().toISOString(),
    source,
    sourceUrl: 'https://www.coinglass.com/etf/bitcoin',
    days: recent,
    issuers,
    listCount: issuers.length,
    aumUsd,
    cumulativeUsd,
    note: 'US spot Bitcoin ETF creations and redemptions compiled by CoinGlass. Not a Satstreet series.',
  })
}

export const config = { path: '/api/etf' }

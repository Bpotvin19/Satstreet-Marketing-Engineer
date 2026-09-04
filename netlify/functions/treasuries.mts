/* Live institutional treasury monitor.
   ETH data comes from Strategic ETH Reserve's public JSON endpoint. Bitcoin
   Treasuries currently advertises its API as forthcoming, so its public,
   server-rendered leaderboard is parsed conservatively and cached for five
   minutes. If either upstream changes, the client receives a clear error
   instead of stale or invented figures. */

type Row = {
  rank: string
  name: string
  ticker: string
  country?: string
  holdings: number
  value?: number | null
  change?: number | null
  nav?: string | null
  asOf?: string | null
}

const headers = {
  'content-type': 'application/json',
  'access-control-allow-origin': '*',
  'cache-control': 'public, max-age=300, stale-while-revalidate=600',
}

const text = (html: string) => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&#x2F;/g, '/')
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const number = (value: string) => {
  const n = Number(value.replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

async function bitcoin() {
  const response = await fetch('https://bitcointreasuries.net/', {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; SatstreetTreasuryMonitor/1.0)' },
    signal: AbortSignal.timeout(12000),
  })
  if (!response.ok) throw new Error(`Bitcoin treasury source returned ${response.status}`)
  const html = await response.text()
  const plain = text(html)
  const summary = plain.match(/BTC Held by Public Companies\s+([0-9.]+[KMB]?)\s+(\$[0-9.]+[KMB]?)\s+Number of Public Companies\s+(\d+)\s+BTC Price\s+(\$[0-9,]+)\s+Asset Dominance\s+([0-9.]+%)/i)
  if (!summary) throw new Error('Bitcoin treasury summary was not recognized')

  const rows: Row[] = []
  const seen = new Set<string>()
  for (const match of html.matchAll(/<tr[^>]*data-slot="table-row"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const row = match[1]
    const company = row.match(/href="\/public-companies\/[^\"]+">([^<]+)<\/a>/)
    if (!company) continue
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => text(cell[1]))
    if (cells.length < 5) continue
    const name = text(company[1])
    if (/coinbase/i.test(name) || seen.has(name)) continue
    const holdings = number(cells[4])
    if (holdings === null) continue
    seen.add(name)
    rows.push({ rank: cells[0], name, country: cells[2], ticker: cells[3] || '—', holdings, nav: cells[5]?.replace(/[\[\]]/g, '') || null })
    if (rows.length === 30) break
  }
  if (rows.length < 5) throw new Error('Bitcoin treasury leaderboard was not recognized')

  return {
    asset: 'btc',
    source: 'BitcoinTreasuries.net',
    sourceUrl: 'https://bitcointreasuries.net/',
    asOf: new Date().toISOString(),
    summary: { holdings: summary[1], value: summary[2], entities: Number(summary[3]), price: summary[4], supply: summary[5] },
    rows,
  }
}

async function ethPrice() {
  const response = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/ETH-USD?interval=5m&range=1d', {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; SatstreetTreasuryMonitor/1.0)' },
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) return null
  const result = (await response.json())?.chart?.result?.[0]
  const price = Number(result?.meta?.regularMarketPrice)
  return Number.isFinite(price) ? price : null
}

async function ethereum() {
  const [response, price] = await Promise.all([
    fetch('https://www.strategicethreserve.xyz/api/v0/companies', {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; SatstreetTreasuryMonitor/1.0)' },
      signal: AbortSignal.timeout(12000),
    }),
    ethPrice(),
  ])
  if (!response.ok) throw new Error(`Ethereum reserve source returned ${response.status}`)
  const payload = await response.json()
  const active = (Array.isArray(payload?.companies) ? payload.companies : [])
    .filter((company: any) => company?.status === 'ACTIVE' && Number.isFinite(Number(company.reserve)))
  if (!active.length) throw new Error('Ethereum reserve feed returned no active entities')

  const total = active.reduce((sum: number, company: any) => sum + Number(company.reserve), 0)
  const visible = active
    .filter((company: any) => !/coinbase/i.test(String(company.name || '')))
    .sort((a: any, b: any) => Number(b.reserve) - Number(a.reserve))
    .slice(0, 30)
  const rows: Row[] = visible.map((company: any, index: number) => ({
    rank: String(index + 1),
    name: String(company.name || 'Unknown'),
    ticker: String(company.ticker || '—'),
    holdings: Number(company.reserve),
    value: price === null ? null : Number(company.reserve) * price,
    change: Number.isFinite(Number(company.pctDiff)) ? Number(company.pctDiff) : null,
    asOf: company.snapshotDate || company.updatedAt || null,
  }))

  return {
    asset: 'eth',
    source: 'Strategic ETH Reserve',
    sourceUrl: 'https://www.strategicethreserve.xyz/',
    asOf: new Date().toISOString(),
    summary: {
      holdings: total,
      value: price === null ? null : total * price,
      entities: active.length,
      price,
      supply: total / 120700000 * 100,
    },
    rows,
  }
}

export default async function handler(request: Request): Promise<Response> {
  try {
    const asset = new URL(request.url).searchParams.get('asset') === 'eth' ? 'eth' : 'btc'
    return new Response(JSON.stringify(asset === 'eth' ? await ethereum() : await bitcoin()), { status: 200, headers })
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Treasury data unavailable' }), { status: 502, headers: { ...headers, 'cache-control': 'no-store' } })
  }
}

export const config = { path: '/api/treasuries' }

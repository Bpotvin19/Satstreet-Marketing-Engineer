/* US spot Bitcoin ETF flows — no vendor key.

   Primary: TFTC open JSON (CC BY 4.0), compiled from SoSoValue daily
   prints and Farside's issuer table.
   Fallback: public CSV mirror of the Farside tape on GitHub.
*/

const TFTC = 'https://www.tftc.io/bitcoin-etf-flows/data.json'
const FARSIDE_CSV = 'https://raw.githubusercontent.com/haturatu/crypto-etf-flow/main/etf_btc.csv'

const NAMES: Record<string, string> = {
  IBIT: 'iShares Bitcoin Trust (BlackRock)',
  FBTC: 'Wise Origin Bitcoin Fund (Fidelity)',
  BITB: 'Bitwise Bitcoin ETF',
  ARKB: 'ARK 21Shares Bitcoin ETF',
  BTCO: 'Invesco Galaxy Bitcoin ETF',
  EZBC: 'Franklin Bitcoin ETF',
  BRRR: 'CoinShares Valkyrie Bitcoin Fund',
  HODL: 'VanEck Bitcoin Trust',
  BTCW: 'WisdomTree Bitcoin Fund',
  MSBT: 'Morgan Stanley Bitcoin Trust',
  GBTC: 'Grayscale Bitcoin Trust',
  BTC: 'Grayscale Bitcoin Mini Trust',
}

function jsonResponse(body: unknown, status = 200, maxAge = 300): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${maxAge}, stale-while-revalidate=900`,
      'access-control-allow-origin': '*',
    },
  })
}

function num(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[$,]/g, ''))
  return Number.isFinite(n) ? n : null
}

function sessionDate(iso: string): string {
  const ts = Date.parse(iso.includes('T') ? iso : iso + 'T00:00:00Z')
  if (!Number.isFinite(ts)) return iso
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function compactUsd(n: number): string {
  const sign = n < 0 ? '-' : '+'
  const abs = Math.abs(n)
  const body = abs >= 1e9 ? (abs / 1e9).toFixed(2) + 'B' : abs >= 1e6 ? (abs / 1e6).toFixed(1) + 'M' : abs >= 1e3 ? Math.round(abs / 1e3) + 'K' : abs.toFixed(0)
  return sign + '$' + body
}

function leads(per: Record<string, number>): { leadIn: string; leadOut: string } {
  const entries = Object.entries(per).filter(([, v]) => Number.isFinite(v) && v !== 0)
  const inflow = entries.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])[0]
  const outflow = entries.filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1])[0]
  return {
    leadIn: inflow ? `${inflow[0]} ${compactUsd(inflow[1])}` : '',
    leadOut: outflow ? `${outflow[0]} ${compactUsd(outflow[1])}` : '',
  }
}

interface FlowDay {
  date: string
  ts: number
  flowUsd: number
  priceUsd: number | null
  leadIn: string
  leadOut: string
  perEtfUsd?: Record<string, number>
}

interface Issuer {
  ticker: string
  name: string
  aumUsd: number | null
  lastFlowUsd: number | null
  btcHolding: number | null
}

async function readTftc(): Promise<{ days: FlowDay[]; aumUsd: number | null }> {
  const response = await fetch(TFTC, {
    headers: { accept: 'application/json', 'user-agent': 'SatstreetTerminal/1.0' },
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error(`TFTC HTTP ${response.status}`)
  const body = (await response.json()) as {
    days?: { date?: string; netFlowUsd?: number; totalNetAssetsUsd?: number | null; btcCloseUsd?: number | null; perEtfUsd?: Record<string, number> }[]
  }
  const days: FlowDay[] = []
  let aumUsd: number | null = null
  for (const row of body.days || []) {
    const flow = num(row.netFlowUsd)
    const ts = Date.parse((row.date || '') + 'T00:00:00Z')
    if (flow == null || !Number.isFinite(ts)) continue
    const per = row.perEtfUsd || {}
    const lead = leads(per)
    days.push({
      date: sessionDate(row.date || ''),
      ts,
      flowUsd: flow,
      priceUsd: num(row.btcCloseUsd),
      leadIn: lead.leadIn,
      leadOut: lead.leadOut,
      perEtfUsd: per,
    })
    if (row.totalNetAssetsUsd != null) aumUsd = num(row.totalNetAssetsUsd)
  }
  if (!days.length) throw new Error('TFTC returned no sessions')
  return { days: days.sort((a, b) => a.ts - b.ts), aumUsd }
}

function parseCsvMoney(cell: string): number | null {
  const raw = cell.trim()
  if (!raw || raw === '-') return null
  const n = Number(raw.replace(/[(),]/g, (ch) => (ch === '(' ? '-' : '')))
  return Number.isFinite(n) ? n * 1_000_000 : null
}

function parseCsvDate(cell: string): number | null {
  const ts = Date.parse(cell + ' UTC')
  return Number.isFinite(ts) ? ts : null
}

async function readFarsideCsv(): Promise<{ days: FlowDay[]; aumUsd: number | null }> {
  const response = await fetch(FARSIDE_CSV, {
    headers: { accept: 'text/csv,text/plain', 'user-agent': 'SatstreetTerminal/1.0' },
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error(`Farside CSV HTTP ${response.status}`)
  const text = await response.text()
  const lines = text.split(/\r?\n/).filter(Boolean)
  const header = lines.shift()?.split(',') || []
  const tickers = header.slice(1, -1)
  const days: FlowDay[] = []
  for (const line of lines) {
    const cols = line.split(',')
    const ts = parseCsvDate(cols[0] || '')
    const total = parseCsvMoney(cols[cols.length - 1] || '')
    if (ts == null || total == null) continue
    const per: Record<string, number> = {}
    tickers.forEach((ticker, i) => {
      const value = parseCsvMoney(cols[i + 1] || '')
      if (value != null) per[ticker] = value
    })
    const lead = leads(per)
    days.push({
      date: sessionDate(new Date(ts).toISOString().slice(0, 10)),
      ts,
      flowUsd: total,
      priceUsd: null,
      leadIn: lead.leadIn,
      leadOut: lead.leadOut,
      perEtfUsd: per,
    })
  }
  if (!days.length) throw new Error('Farside CSV returned no sessions')
  return { days: days.sort((a, b) => a.ts - b.ts), aumUsd: null }
}

function issuersFrom(days: FlowDay[]): Issuer[] {
  const last = [...days].reverse().find((d) => d.perEtfUsd && Object.keys(d.perEtfUsd).length) || days[days.length - 1]
  const per = last?.perEtfUsd || {}
  return Object.keys(NAMES)
    .map((ticker) => ({
      ticker,
      name: NAMES[ticker],
      aumUsd: null,
      lastFlowUsd: per[ticker] ?? null,
      btcHolding: null,
    }))
    .filter((row) => row.lastFlowUsd != null)
    .sort((a, b) => Math.abs(b.lastFlowUsd || 0) - Math.abs(a.lastFlowUsd || 0))
}

export default async function handler(): Promise<Response> {
  let days: FlowDay[] = []
  let aumUsd: number | null = null
  let source = 'TFTC'
  let sourceUrl = 'https://www.tftc.io/bitcoin-etf-flows'

  try {
    const primary = await readTftc()
    days = primary.days
    aumUsd = primary.aumUsd
  } catch {
    try {
      const fallback = await readFarsideCsv()
      days = fallback.days
      aumUsd = fallback.aumUsd
      source = 'Farside Investors (public tape)'
      sourceUrl = 'https://farside.co.uk/btc/'
    } catch (error) {
      return jsonResponse(
        {
          error: error instanceof Error ? error.message : 'ETF tape unavailable',
          sourceUrl: 'https://www.tftc.io/bitcoin-etf-flows',
          days: [],
          issuers: [],
        },
        503,
        30,
      )
    }
  }

  const recent = days.filter((d) => d.flowUsd !== 0 || d.leadIn || d.leadOut).slice(-400)
  const usable = recent.length ? recent : days.slice(-400)
  const issuers = issuersFrom(usable)
  const cumulativeUsd = usable.reduce((sum, row) => sum + row.flowUsd, 0)

  return jsonResponse({
    asOf: new Date().toISOString(),
    source,
    sourceUrl,
    days: usable,
    issuers,
    listCount: issuers.length,
    aumUsd,
    cumulativeUsd,
    note: 'US spot Bitcoin ETF net creations and redemptions. Compiled by TFTC from SoSoValue and Farside. Not a Satstreet series.',
  })
}

export const config = { path: '/api/etf' }

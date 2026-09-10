/* Shared Notion client for the team workspace endpoints.

   news.mts keeps its own copy on purpose: it serves the brief the desk reads
   every morning, and it is not worth destabilising to share a helper. If a
   third caller appears, fold all three together then.
*/

export const NOTION = 'https://api.notion.com/v1'
export const NOTION_VERSION = '2022-06-28'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const RETRYABLE = new Set([429, 502, 503, 504])

export type Rich = {
  plain_text?: string
  href?: string | null
  annotations?: { bold?: boolean; code?: boolean }
}

export const plain = (rich: Rich[] | undefined): string =>
  (rich ?? []).map((part) => part.plain_text ?? '').join('').trim()

export function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  let difference = 0
  for (let i = 0; i < a.length; i += 1) difference |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return difference === 0
}

/* Notion allows roughly three requests a second. The workspace payload is
   several calls, so back off rather than failing the whole tab. */
export async function notion(path: string, body?: unknown, attempt = 0): Promise<any> {
  const token = process.env.NOTION_TOKEN?.trim()
  if (!token) throw new Error('NOTION_TOKEN is not configured')
  const response = await fetch(NOTION + path, {
    method: body ? (path.includes('/query') ? 'POST' : 'PATCH') : 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(9000),
  })

  if (RETRYABLE.has(response.status) && attempt < 3) {
    const header = Number(response.headers.get('retry-after'))
    const wait = Number.isFinite(header) && header > 0 ? Math.min(header * 1000, 5000) : 500 * 2 ** attempt
    await sleep(wait)
    return notion(path, body, attempt + 1)
  }

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (response.status === 429) throw new Error('Notion is rate limiting the workspace. Try again shortly.')
    throw new Error(`Notion ${response.status}: ${result?.message ?? 'request failed'}`)
  }
  return result
}

/* Top-level blocks only. Nothing the workspace renders lives deeper, and a
   recursive walk is what trips the rate limit. */
export async function topBlocks(id: string, cap = 200): Promise<any[]> {
  const rows: any[] = []
  let cursor = ''
  do {
    const suffix = cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ''
    const page = await notion(`/blocks/${id}/children?page_size=100${suffix}`)
    rows.push(...(page.results ?? []))
    cursor = page.has_more && rows.length < cap ? page.next_cursor ?? '' : ''
  } while (cursor)
  return rows.slice(0, cap)
}

export type Line = { type: string; text: string; href?: string }

/* A reference document flattened to the handful of shapes the workspace
   renders. Anything else is dropped rather than half-drawn. */
export function toLines(rows: any[]): Line[] {
  const keep = new Set([
    'heading_1', 'heading_2', 'heading_3',
    'paragraph', 'bulleted_list_item', 'numbered_list_item',
    'quote', 'callout', 'to_do', 'code', 'divider',
  ])
  const out: Line[] = []
  for (const row of rows) {
    if (!keep.has(row.type)) continue
    if (row.type === 'divider') { out.push({ type: 'divider', text: '' }); continue }
    const value = row[row.type] ?? {}
    const rich: Rich[] = value.rich_text ?? []
    const text = plain(rich)
    if (!text) continue
    const href = rich.find((part) => part.href)?.href ?? undefined
    out.push(href ? { type: row.type, text, href } : { type: row.type, text })
  }
  return out
}

export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

/* Every workspace endpoint is gated the same way as the brief. Returns a
   Response to send back, or null when the caller may proceed. */
export function refuse(request: Request, method = 'GET'): Response | null {
  if (request.method !== method) return json({ error: 'Method not allowed' }, 405)
  const expected = process.env.TERMINAL_NEWS_KEY?.trim() ?? ''
  if (!expected) return json({ error: 'The team workspace is not configured.' }, 503)
  const supplied = request.headers.get('x-terminal-key')?.trim() ?? ''
  if (!sameSecret(supplied, expected)) return json({ error: 'Access key required.' }, 401)
  return null
}

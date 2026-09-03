/* Protected Macro Desk feed.

   Macro Desk is explicitly internal Notion content. The browser must provide
   TERMINAL_NEWS_KEY before this function will read or return it. NOTION_TOKEN
   stays server-side and the response is never stored in a shared cache.
*/

const NOTION = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'
const DB = process.env.NOTION_DAILY_INTEL_DB?.trim() || '91d74bd8-2086-4536-a739-0ce7cf4964c5'

type Rich = { plain_text?: string; href?: string | null }
type OutBlock = {
  type: string
  text?: string
  links?: { text: string; href: string }[]
  cells?: string[][]
  children?: OutBlock[]
}

const plain = (rich: Rich[] | undefined): string =>
  (rich ?? []).map((part) => part.plain_text ?? '').join('').trim()

const links = (rich: Rich[] | undefined): { text: string; href: string }[] =>
  (rich ?? [])
    .filter((part) => part.href && /^https?:\/\//i.test(part.href))
    .map((part) => ({ text: part.plain_text || part.href || 'Source', href: part.href as string }))

function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  let difference = 0
  for (let i = 0; i < a.length; i += 1) difference |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return difference === 0
}

async function notion(path: string, body?: unknown): Promise<any> {
  const token = process.env.NOTION_TOKEN?.trim()
  if (!token) throw new Error('NOTION_TOKEN is not configured')
  const response = await fetch(NOTION + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(9000),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`Notion ${response.status}: ${result?.message ?? 'request failed'}`)
  return result
}

async function childrenOf(id: string, depth = 0): Promise<any[]> {
  const rows: any[] = []
  let cursor = ''
  do {
    const suffix = cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ''
    const page = await notion(`/blocks/${id}/children?page_size=100${suffix}`)
    rows.push(...(page.results ?? []))
    cursor = page.has_more ? page.next_cursor ?? '' : ''
  } while (cursor)

  if (depth >= 2) return rows
  for (const row of rows) {
    if (row.has_children) row.__children = await childrenOf(row.id, depth + 1)
  }
  return rows
}

function normalize(rows: any[]): OutBlock[] {
  return rows.map((row) => {
    const value = row[row.type] ?? {}
    if (row.type === 'table_row') {
      return { type: row.type, cells: (value.cells ?? []).map((cell: Rich[]) => [plain(cell)]) }
    }
    const rich = value.rich_text ?? value.caption ?? []
    const out: OutBlock = { type: row.type }
    const text = plain(rich)
    if (text) out.text = text
    const found = links(rich)
    if (found.length) out.links = found
    if (row.__children?.length) out.children = normalize(row.__children)
    return out
  })
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)

  const expected = process.env.TERMINAL_NEWS_KEY?.trim() ?? ''
  if (!expected) return json({ error: 'The protected news feed is not configured.' }, 503)
  const supplied = request.headers.get('x-terminal-key')?.trim() ?? ''
  if (!sameSecret(supplied, expected)) return json({ error: 'Access key required.' }, 401)

  try {
    const query = await notion(`/databases/${DB}/query`, {
      filter: { property: 'Name', title: { starts_with: 'Macro Desk —' } },
      sorts: [{ property: 'Date', direction: 'descending' }],
      page_size: 10,
    })
    const page = (query.results ?? [])[0]
    if (!page) return json({ error: 'No Macro Desk page was found.' }, 404)

    const props = page.properties ?? {}
    const raw = await childrenOf(page.id)
    return json({
      title: plain(props.Name?.title) || 'Macro Desk',
      date: props.Date?.date?.start ?? '',
      status: props.Status?.select?.name ?? '',
      window: plain(props.Window?.rich_text),
      sourceUrl: page.url,
      lastEdited: page.last_edited_time,
      blocks: normalize(raw),
    })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'The Macro Desk could not be loaded.' }, 502)
  }
}

export const config = { path: '/api/news' }

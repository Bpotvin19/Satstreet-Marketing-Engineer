/* Protected Macro Desk feed.

   Macro Desk is explicitly internal Notion content. The browser must provide
   TERMINAL_NEWS_KEY before this function will read or return it. NOTION_TOKEN
   stays server-side and the response is never stored in a shared cache.

   After the page is read, Must-read article URLs are fetched just far enough
   to pick up the publisher's public share image (og:image / twitter:image).
   The image itself is not stored. Official prints often have no hero photo;
   those cards stay as an outlet mark. Graphic / casualty stills are skipped.
*/

const NOTION = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'
const DB = process.env.NOTION_DAILY_INTEL_DB?.trim() || '91d74bd8-2086-4536-a739-0ce7cf4964c5'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36'

type Rich = { plain_text?: string; href?: string | null }
type OutBlock = {
  type: string
  text?: string
  links?: { text: string; href: string }[]
  image?: string
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

const FIRST_URL = /https?:\/\/[^\s)>\]]+/i
const GRAPHIC =
  /\b(casualty|casualties|bodies|body bag|behead|massacre|funeral|morgue|execution|wedding strike|dead children)\b/i

function articleUrl(block: OutBlock): string {
  const href = block.links?.[0]?.href
  if (href && /^https?:\/\//i.test(href)) return href.split('#')[0]
  const fromText = block.text?.match(FIRST_URL)?.[0]
  return fromText ? fromText.split('#')[0] : ''
}

function isPublicHttp(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    const host = u.hostname.toLowerCase()
    if (host === 'localhost' || host.endsWith('.local')) return false
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)) return false
    return true
  } catch {
    return false
  }
}

function absUrl(value: string, base: string): string {
  try {
    return new URL(value.replace(/&/g, '&').trim(), base).toString()
  } catch {
    return ''
  }
}

function pickShareImage(html: string, base: string): string {
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)/i,
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (!match?.[1]) continue
    const url = absUrl(match[1], base)
    if (isPublicHttp(url) && !url.startsWith('data:')) return url
  }
  return ''
}

async function shareImageFor(url: string): Promise<string> {
  if (!isPublicHttp(url)) return ''
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: AbortSignal.timeout(2200),
    })
    if (!response.ok) return ''
    const type = response.headers.get('content-type') || ''
    if (!/html/i.test(type) && type) return ''
    const html = await response.text()
    return pickShareImage(html.slice(0, 180_000), url)
  } catch {
    return ''
  }
}

async function attachShareImages(blocks: OutBlock[]): Promise<void> {
  let section = ''
  const jobs: { block: OutBlock; url: string }[] = []
  for (const block of blocks) {
    if (block.type === 'heading_2') {
      const title = block.text || ''
      section = /^B\./.test(title) ? 'reads' : ''
      continue
    }
    if (section !== 'reads') continue
    if (block.type !== 'numbered_list_item' && block.type !== 'bulleted_list_item') continue
    if (GRAPHIC.test(block.text || '')) continue
    const url = articleUrl(block)
    if (!url) continue
    jobs.push({ block, url })
    if (jobs.length >= 7) break
  }

  await Promise.all(
    jobs.map(async ({ block, url }) => {
      const image = await shareImageFor(url)
      if (image) block.image = image
    }),
  )
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
    const blocks = normalize(raw)
    await attachShareImages(blocks)
    return json({
      title: plain(props.Name?.title) || 'Macro Desk',
      date: props.Date?.date?.start ?? '',
      status: props.Status?.select?.name ?? '',
      window: plain(props.Window?.rich_text),
      sourceUrl: page.url,
      lastEdited: page.last_edited_time,
      blocks,
    })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'The Macro Desk could not be loaded.' }, 502)
  }
}

export const config = { path: '/api/news' }

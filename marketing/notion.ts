/* ──────────────────────────────────────────────────────────────────────────
   Shared Notion REST helpers.

   The marketing bot talks to Notion through an integration token, not through
   any editor session, so everything here is plain REST against the documented
   API. Used by the calendar adapter, the reference loader, and the published
   log.
   ────────────────────────────────────────────────────────────────────────── */

const API = 'https://api.notion.com/v1'

export function notionToken(): string | undefined {
  return process.env.NOTION_TOKEN?.trim() || undefined
}

export function notionVersion(): string {
  return process.env.NOTION_VERSION?.trim() || '2022-06-28'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Block = Record<string, any>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function notionGet(path: string): Promise<any> {
  const token = notionToken()
  if (!token) throw new Error('NOTION_TOKEN is not set')
  const r = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${token}`, 'Notion-Version': notionVersion() },
  })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) {
    throw new Error(`Notion ${r.status}: ${(body as { message?: string }).message ?? 'unknown error'}`)
  }
  return body
}

/**
 * POST and PATCH.
 *
 * Reads are the bulk of what this bot does, but the Founder News Desk flow
 * writes back: querying the Content Queue is a POST, and /kill and /ready move
 * a card's Approval and Status. Kept beside notionGet so the auth, version
 * header and error shape stay in one place.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function notionWrite(method: 'POST' | 'PATCH', path: string, body: unknown): Promise<any> {
  const token = notionToken()
  if (!token) throw new Error('NOTION_TOKEN is not set')
  const r = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'Notion-Version': notionVersion(),
      'content-type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  })
  const out = await r.json().catch(() => ({}))
  if (!r.ok) {
    throw new Error(`Notion ${r.status}: ${(out as { message?: string }).message ?? 'unknown error'}`)
  }
  return out
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const notionPost = (path: string, body: unknown): Promise<any> => notionWrite('POST', path, body)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const notionPatch = (path: string, body: unknown): Promise<any> => notionWrite('PATCH', path, body)

/** Plain text out of a rich_text array. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const rt = (arr: any[] | undefined): string =>
  (arr ?? []).map((t) => t.plain_text ?? '').join('').trim()

/** All children of a block, following pagination — Notion caps a page at 100. */
export async function children(blockId: string): Promise<Block[]> {
  const out: Block[] = []
  let cursor: string | undefined
  do {
    const q = `?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`
    const page = await notionGet(`/blocks/${blockId}/children${q}`)
    out.push(...(page.results as Block[]))
    cursor = page.has_more ? page.next_cursor : undefined
  } while (cursor)
  return out
}

/** Rows of a table block, as arrays of cell text. */
export async function tableRows(tableBlockId: string): Promise<string[][]> {
  const rows = await children(tableBlockId)
  return rows
    .filter((r) => r.type === 'table_row')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((r) => (r.table_row.cells as any[][]).map((cell) => rt(cell)))
}

const LIST_TYPES = new Set(['bulleted_list_item', 'numbered_list_item', 'to_do'])

export interface NotionFile {
  name: string
  url: string
  /** Notion-hosted URLs are signed and expire in about an hour. */
  expiring: boolean
  kind: 'image' | 'pdf' | 'file'
}

/**
 * Attachments on a page: file, image and pdf blocks.
 *
 * Notion-hosted files come back as signed S3 URLs valid for roughly an hour,
 * so these must be fetched at the moment they're used and never stored.
 * Externally-hosted files (a Drive link, say) are stable.
 */
export async function pageFiles(pageId: string): Promise<NotionFile[]> {
  const out: NotionFile[] = []
  for (const b of await children(pageId)) {
    if (b.type !== 'file' && b.type !== 'image' && b.type !== 'pdf') continue
    const body = b[b.type]
    const url: string | undefined = body?.file?.url ?? body?.external?.url
    if (!url) continue
    out.push({
      name: body?.name || rt(body?.caption) || `${b.type}`,
      url,
      expiring: Boolean(body?.file?.url),
      kind: b.type === 'image' ? 'image' : b.type === 'pdf' ? 'pdf' : 'file',
    })
  }
  return out
}

/**
 * Blocks rendered as readable plain text, for feeding a page into a prompt.
 * Recurses one level into children, which covers toggles and nested lists
 * without turning a deep page into an unbounded crawl.
 */
export async function blocksToText(blocks: Block[], depth = 0): Promise<string> {
  const lines: string[] = []

  for (const b of blocks) {
    const body = b[b.type] ?? {}
    const text = rt(body.rich_text)
    const pad = '  '.repeat(depth)

    switch (b.type) {
      case 'heading_1':
        if (text) lines.push('', `# ${text}`)
        break
      case 'heading_2':
        if (text) lines.push('', `## ${text}`)
        break
      case 'heading_3':
      case 'heading_4':
        if (text) lines.push('', `### ${text}`)
        break
      case 'paragraph':
        if (text) lines.push(`${pad}${text}`)
        break
      case 'quote':
        if (text) lines.push(`${pad}> ${text}`)
        break
      case 'callout':
        if (text) lines.push(`${pad}> ${text}`)
        break
      case 'code':
        if (text) lines.push('```', text, '```')
        break
      case 'divider':
        lines.push('')
        break
      case 'table': {
        const rows = await tableRows(b.id)
        for (const r of rows) lines.push(`${pad}| ${r.join(' | ')}`)
        break
      }
      case 'child_page':
      case 'child_database':
        // A sub-page is a pointer, not inline content. Inlining one turns a
        // three-block hub into forty thousand characters and makes message
        // size unpredictable — name it and let the caller ask for it.
        lines.push(`${pad}→ ${body?.title ?? '(untitled)'}`)
        break
      default:
        if (LIST_TYPES.has(b.type) && text) lines.push(`${pad}- ${text}`)
        else if (text) lines.push(`${pad}${text}`)
    }

    // Tables and sub-pages consumed or deliberately skipped their children above.
    const SELF_CONTAINED = b.type === 'table' || b.type === 'child_page' || b.type === 'child_database'
    if (b.has_children && !SELF_CONTAINED && depth < 1) {
      lines.push(await blocksToText(await children(b.id), depth + 1))
    }
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

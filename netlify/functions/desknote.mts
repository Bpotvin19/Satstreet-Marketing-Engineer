/* ──────────────────────────────────────────────────────────────────────────
   The desk note, pulled live from Notion.

   The Overview page asks this endpoint for today's client commentary and
   renders whatever comes back. Nothing is committed, nothing is staged, and
   no model runs: the desk writes in Notion, marks it Reviewed, and the page
   shows it. That is the whole pipeline.

   Two things are enforced here rather than trusted to the page.

   Only client-facing documents. The Daily Intel database holds several kinds
   of daily output, and most are internal. Macro Desk states it in its own
   header — "Internal only. Not investment advice. Not client copy" — and it
   carries casualty counts, sourcing notes, bias meters and rate-hike odds.
   This endpoint reads Client Email, the one written to be sent to clients,
   and will not read the others.

   Only Reviewed. The database's own Status is Draft, Reviewed or Legal
   ticket. A draft is a bot's overnight first pass that nobody has read yet,
   and a legal ticket is the opposite of a green light. Anything not Reviewed
   returns empty, and an empty response hides the module rather than showing
   a client unreviewed copy.

   The token lives in Netlify's environment, not in the repo. Without it the
   endpoint returns empty and says so — it never fails the page.
   ────────────────────────────────────────────────────────────────────────── */

const NOTION = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

/** Daily Intel. Overridable so a restructure needs no code change. */
const DB = process.env.NOTION_DAILY_INTEL_DB?.trim() || '91d74bd8-2086-4536-a739-0ce7cf4964c5'

/** The document type written for clients. Deliberately not Macro Desk. */
const DOC = process.env.NOTION_DESK_NOTE_DOC?.trim() || 'Client Email'

interface Block { type: string; [k: string]: unknown }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const plain = (arr: any[] | undefined): string =>
  (arr ?? []).map((t) => t?.plain_text ?? '').join('').trim()

async function notion(path: string, body?: unknown): Promise<any> {
  const token = process.env.NOTION_TOKEN?.trim()
  if (!token) throw new Error('NOTION_TOKEN is not set in the Netlify environment')

  const r = await fetch(NOTION + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  })
  const out = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`Notion ${r.status}: ${out?.message ?? 'request failed'}`)
  return out
}

/**
 * The note's body.
 *
 * The document is written as an email — subject lines, a preheader, then the
 * note itself. Only the note is wanted: the subject options are drafting
 * scaffolding and would read as unfinished on a dashboard.
 */
function bodyOf(blocks: Block[]): { preheader: string; paragraphs: string[] } {
  const lines: string[] = []
  for (const b of blocks) {
    const t = b.type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rich = (b as any)[t]?.rich_text
    const text = plain(rich)
    if (text) lines.push(text)
  }

  let preheader = ''
  const paragraphs: string[] = []
  let inBody = false

  for (const line of lines) {
    const low = line.toLowerCase()
    if (low.startsWith('preheader')) continue
    if (low.startsWith('subject line')) continue
    if (low.startsWith('body')) { inBody = true; continue }
    if (!inBody) {
      // The line after the preheader label, before the body starts.
      if (!preheader && line.length > 30 && !line.startsWith('-')) preheader = line
      continue
    }
    // Stop at whatever follows the note — CTA blocks, internal checklists.
    if (/^(cta|compliance|internal|do not|checklist)\b/i.test(line)) break
    const cleaned = line.replace(/^\s*[-*]\s*/, '').trim()
    if (cleaned) paragraphs.push(cleaned)
  }

  return { preheader, paragraphs }
}

export default async function handler(): Promise<Response> {
  const seen = Object.keys(process.env)
    .filter((k) => /NOTION|TELEGRAM|ANTHROPIC|SATSTREET/i.test(k))
    .sort()

  const empty = (reason: string, status = 200) =>
    new Response(JSON.stringify({
      note: null,
      reason,
      // Names only. No values are read or returned.
      diagnostic: {
        matchingEnvNames: seen,
        totalEnvNames: Object.keys(process.env).length,
        notionTokenPresent: typeof process.env.NOTION_TOKEN === 'string',
        notionTokenLength: (process.env.NOTION_TOKEN || '').trim().length,
      },
    }), {
      status,
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=120, stale-while-revalidate=600',
      },
    })


  try {
    const res = await notion(`/databases/${DB}/query`, {
      filter: { property: 'Name', title: { starts_with: DOC } },
      sorts: [{ property: 'Date', direction: 'descending' }],
      page_size: 5,
    })

    const rows = res.results ?? []
    if (!rows.length) return empty(`no ${DOC} pages found`)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reviewed = rows.find((r: any) => r.properties?.Status?.select?.name === 'Reviewed')
    if (!reviewed) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const latest = rows[0] as any
      return empty(
        `the latest ${DOC} is ${latest.properties?.Status?.select?.name ?? 'unset'}, not Reviewed`,
      )
    }

    const kids = await notion(`/blocks/${reviewed.id}/children?page_size=100`)
    const { preheader, paragraphs } = bodyOf(kids.results ?? [])
    if (!paragraphs.length) return empty('the Reviewed note has no body')

    return new Response(
      JSON.stringify({
        note: {
          title: plain(reviewed.properties?.Name?.title),
          date: reviewed.properties?.Date?.date?.start ?? '',
          preheader,
          paragraphs,
        },
        reason: null,
      }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'access-control-allow-origin': '*',
          // Reviewed copy changes once a day; a couple of minutes of cache
          // keeps a busy morning off Notion's rate limit.
          'cache-control': 'public, max-age=120, stale-while-revalidate=600',
        },
      },
    )
  } catch (e) {
    return empty(e instanceof Error ? e.message : 'failed')
  }
}

export const config = { path: '/api/desknote' }

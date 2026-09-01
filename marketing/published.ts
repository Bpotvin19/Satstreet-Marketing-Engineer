/* ──────────────────────────────────────────────────────────────────────────
   The published log.

   This is the piece that stops the bot proposing custody three times in a
   fortnight. Approvals are recorded, and every morning's plan is told what
   ground has already been taken.

   Two backends, chosen by configuration rather than by a flag:

     NOTION_TOKEN + NOTION_MARKETING_DB_ID set → Notion (survives the box,
                                                  visible to the whole team)
     otherwise                                 → marketing/.state (local,
                                                  works today, no setup)

   The local backend is not a stub. It is the same data, and the bot behaves
   identically — Notion just makes it durable and shared.
   ────────────────────────────────────────────────────────────────────────── */

import { getChat } from './store'

export interface PublishedPost {
  date: string
  channel: string
  title: string
  /** Enough of the copy for the model to recognise the territory, not the whole post. */
  summary: string
}

export interface LogEntry {
  date: string
  channel: string
  title: string
  body: string
  approvedBy: string
}

export type Backend = 'notion' | 'local'

const NOTION_API = 'https://api.notion.com/v1'
const NOTION_VERSION = process.env.NOTION_VERSION?.trim() || '2022-06-28'

/** Property names in the marketing log database. Rename here if yours differ. */
export const PROPS = {
  title: 'Name',
  date: 'Date',
  channel: 'Channel',
  approvedBy: 'Approved By',
} as const

function notionConfig(): { token: string; dbId: string } | null {
  const token = process.env.NOTION_TOKEN?.trim()
  const dbId = process.env.NOTION_MARKETING_DB_ID?.trim()
  return token && dbId ? { token, dbId } : null
}

export function backend(): Backend {
  return notionConfig() ? 'notion' : 'local'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function notion(token: string, path: string, init: RequestInit = {}): Promise<any> {
  const r = await fetch(`${NOTION_API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const body = (await r.json().catch(() => ({}))) as { message?: string }
  if (!r.ok) throw new Error(`Notion ${r.status}: ${body?.message ?? 'unknown error'}`)
  return body
}

const summarise = (body: string) =>
  body.replace(/\s+/g, ' ').trim().slice(0, 240)

/* ── writing ──────────────────────────────────────────────────────────────── */

/**
 * Record an approval. Never throws: a Notion outage must not lose the approval
 * or break the button, so a failed write falls back to local and says so.
 */
export async function logPublished(
  entry: LogEntry,
): Promise<{ backend: Backend; error?: string }> {
  const cfg = notionConfig()
  if (!cfg) return { backend: 'local' }

  try {
    await notion(cfg.token, '/pages', {
      method: 'POST',
      body: JSON.stringify({
        parent: { database_id: cfg.dbId },
        properties: {
          [PROPS.title]: { title: [{ text: { content: entry.title.slice(0, 2000) } }] },
          [PROPS.date]: { date: { start: entry.date } },
          [PROPS.channel]: { select: { name: entry.channel } },
          [PROPS.approvedBy]: { rich_text: [{ text: { content: entry.approvedBy } }] },
        },
        children: [
          {
            object: 'block',
            type: 'paragraph',
            paragraph: { rich_text: [{ type: 'text', text: { content: entry.body.slice(0, 2000) } }] },
          },
        ],
      }),
    })
    return { backend: 'notion' }
  } catch (e) {
    return { backend: 'local', error: e instanceof Error ? e.message : String(e) }
  }
}

/* ── reading ──────────────────────────────────────────────────────────────── */

function localPosts(chatId: number | string, days: number): PublishedPost[] {
  const cutoff = Date.now() - days * 86_400_000
  return getChat(chatId)
    .approvals.filter((a) => Date.parse(a.at) >= cutoff)
    .map((a) => ({
      date: a.at.slice(0, 10),
      channel: a.channel,
      title: a.title ?? `Priority ${a.rank}`,
      summary: summarise(a.body),
    }))
    .reverse()
}

async function notionPosts(days: number): Promise<PublishedPost[]> {
  const cfg = notionConfig()
  if (!cfg) return []
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)

  const res = await notion(cfg.token, `/databases/${cfg.dbId}/query`, {
    method: 'POST',
    body: JSON.stringify({
      filter: { property: PROPS.date, date: { on_or_after: since } },
      sorts: [{ property: PROPS.date, direction: 'descending' }],
      page_size: 50,
    }),
  })

  return (res.results as Record<string, never>[]).map((page) => {
    const p = page.properties as Record<string, never>
    const title = (p[PROPS.title] as { title?: { plain_text: string }[] })?.title
    const date = (p[PROPS.date] as { date?: { start: string } })?.date
    const channel = (p[PROPS.channel] as { select?: { name: string } })?.select
    return {
      date: date?.start ?? '',
      channel: channel?.name ?? '',
      title: title?.map((t) => t.plain_text).join('') ?? '(untitled)',
      summary: '',
    }
  })
}

export interface RecentResult {
  /** False only when nothing has ever been logged — the model is told to assume nothing. */
  tracked: boolean
  posts: PublishedPost[]
  backend: Backend
  /** Set when Notion was configured but unreadable; the caller degrades to local. */
  error?: string
}

export async function recentPosts(chatId: number | string, days = 21): Promise<RecentResult> {
  const cfg = notionConfig()
  if (cfg) {
    try {
      const posts = await notionPosts(days)
      return { tracked: true, posts, backend: 'notion' }
    } catch (e) {
      // Fall through to local rather than fail the morning run over a log read.
      const local = localPosts(chatId, days)
      return {
        tracked: local.length > 0,
        posts: local,
        backend: 'local',
        error: e instanceof Error ? e.message : String(e),
      }
    }
  }

  const local = localPosts(chatId, days)
  return { tracked: local.length > 0, posts: local, backend: 'local' }
}

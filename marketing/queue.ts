/* ──────────────────────────────────────────────────────────────────────────
   The Content Queue.

   Grok's Founder News Desk harvests the news overnight and writes draft cards
   into a Notion database. This bot reads those cards, rewrites them in a
   founder's voice, and waits for a human. The division of labour matters:

     Grok harvests  ·  this bot rewrites  ·  a person publishes

   So nothing here creates a card, and nothing here approves one. The only
   writes are the two the desk asked for — /kill moves Approval to Changes
   Requested, /ready moves Status to In progress. Approval = Approved is a
   human decision and this file cannot make it.
   ────────────────────────────────────────────────────────────────────────── */

import { notionGet, notionPost, notionPatch, rt } from './notion'

/** Content Queue, inside the Social Media Hub. */
export const QUEUE_DB_ID =
  process.env.NOTION_QUEUE_DB_ID?.trim() || 'c0143570a13f4077aba9796fc41ddd34'

export interface QueueCard {
  id: string
  /** Last four of the page id — what the team types into /open. */
  ref: string
  title: string
  draft: string
  notes: string
  source: string
  voice: string
  pillar: string
  risk: string
  approval: string
  status: string
  platform: string[]
  campaign: string
  publishDate: string
  url: string
}

/* ── reading ──────────────────────────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Props = Record<string, any>

const text = (p: Props, name: string) => rt(p[name]?.title ?? p[name]?.rich_text)
const pick = (p: Props, name: string) => p[name]?.select?.name ?? p[name]?.status?.name ?? ''

function toCard(row: Props): QueueCard {
  const p = row.properties as Props
  return {
    id: row.id,
    ref: String(row.id).replace(/-/g, '').slice(-4),
    title: text(p, 'Name'),
    draft: text(p, 'Draft'),
    notes: text(p, 'Notes'),
    source: p.Source?.url ?? '',
    voice: pick(p, 'Primary Voice'),
    pillar: pick(p, 'Pillar'),
    risk: pick(p, 'Compliance Risk'),
    approval: pick(p, 'Approval'),
    status: pick(p, 'Status'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    platform: (p.Platform?.multi_select ?? []).map((o: any) => o.name),
    campaign: text(p, 'Campaign'),
    publishDate: p['Publish Date']?.date?.start ?? '',
    url: row.url ?? '',
  }
}

/**
 * The cards waiting on a human.
 *
 * Sorted by the desk's own priority order rather than by when Grok wrote them:
 * a card dated today outranks one dated next week, because the news it is
 * built on goes stale.
 */
export async function needsReview(limit = 8): Promise<QueueCard[]> {
  const res = await notionPost(`/databases/${QUEUE_DB_ID}/query`, {
    filter: { property: 'Approval', select: { equals: 'Needs Review' } },
    sorts: [
      { property: 'Publish Date', direction: 'ascending' },
      { timestamp: 'created_time', direction: 'descending' },
    ],
    page_size: Math.min(limit, 100),
  })
  return (res.results ?? []).map(toCard).slice(0, limit)
}

export async function getCard(pageId: string): Promise<QueueCard> {
  return toCard(await notionGet(`/pages/${pageId}`))
}

/**
 * Resolve what someone typed after /open.
 *
 * Two ways in, because both are natural at a phone keyboard: the last four of
 * the page id (which /queue prints beside every row) or any distinctive word
 * from the title. Exact ref wins; then a title that starts with the query;
 * then a title that contains it.
 */
export async function findCard(query: string): Promise<QueueCard | undefined> {
  const q = query.trim().toLowerCase()
  if (!q) return undefined

  const rows = await notionPost(`/databases/${QUEUE_DB_ID}/query`, { page_size: 100 })
  const cards: QueueCard[] = (rows.results ?? []).map(toCard)

  return (
    cards.find((c) => c.ref === q) ??
    cards.find((c) => c.title.toLowerCase() === q) ??
    cards.find((c) => c.title.toLowerCase().startsWith(q)) ??
    cards.find((c) => c.title.toLowerCase().includes(q))
  )
}

/* ── the two permitted writes ─────────────────────────────────────────────── */

const richText = (s: string) => [{ type: 'text', text: { content: s.slice(0, 1990) } }]

/**
 * /kill — the idea is dead. Approval goes to Changes Requested and the reason
 * is stamped into Notes with who did it, so the queue explains itself later.
 */
export async function killCard(card: QueueCard, by: string): Promise<void> {
  const stamp = `Killed in Telegram by ${by} on ${new Date().toISOString().slice(0, 10)}.`
  await notionPatch(`/pages/${card.id}`, {
    properties: {
      Approval: { select: { name: 'Changes Requested' } },
      Notes: { rich_text: richText(card.notes ? `${stamp}\n\n${card.notes}` : stamp) },
    },
  })
}

/**
 * /ready — the rewrite is done and a person should look at it.
 *
 * Status moves, Approval deliberately does not: the bot marking its own work
 * approved is the one thing the desk's instructions rule out.
 */
export async function readyCard(card: QueueCard): Promise<void> {
  await notionPatch(`/pages/${card.id}`, {
    properties: { Status: { status: { name: 'In progress' } } },
  })
}

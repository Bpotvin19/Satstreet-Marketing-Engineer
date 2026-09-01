/* ──────────────────────────────────────────────────────────────────────────
   Publishing to the Satstreet Telegram channel.

   The bot has always ended an approval with "Nothing goes out from here."
   This module is the exception to that, and it is written to be the only one.

   Three properties it must keep:

     Off by default   No TELEGRAM_CHANNEL_ID means no channel, no button, no
                      possibility of a send. The feature cannot switch itself
                      on by accident.
     Checked at send  Compliance runs against the text actually being posted.
                      A draft can be rewritten after it was approved, and
                      checking the earlier version checks the wrong words.
     Recorded         Every send stores who sent it and the message id, so it
                      can be found in the log and pulled from the channel.

   The channel is invite-only, so the audience is existing clients rather than
   the open internet. Anyone in the allowlisted group may publish — that is a
   deliberate decision, and it holds because the group is already restricted
   and the channel is not public.

   Recall deletes a post; it does not unsend it. Anyone who already read or
   forwarded it still has it. Treat a broadcast as permanent.
   ────────────────────────────────────────────────────────────────────────── */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { MARKETING_DIR } from './calendar'
import type { Draft } from './types'

const STATE_DIR = resolve(MARKETING_DIR, '.state')
const FILE = resolve(STATE_DIR, 'broadcast.json')

const API = 'https://api.telegram.org'

/** Telegram caps a message at 4096 characters. */
const LIMIT = 4096

/** How long after sending /recall can still pull a post. */
export const RECALL_WINDOW_MS = 60 * 60 * 1000

export interface Pending {
  id: string
  chatId: number
  /** The exact text that will be sent, already rendered. */
  text: string
  /** The draft, kept so compliance can be re-run against it at send time. */
  draft: Draft
  title: string
  approvedBy: string
  createdAt: string
}

export interface Sent {
  id: string
  chatId: number
  messageId: number
  title: string
  sentBy: string
  sentAt: string
}

interface State {
  pending: Record<string, Pending>
  sent: Sent[]
}

/* ---------- configuration ---------- */

export function channelId(): string | null {
  return process.env.TELEGRAM_CHANNEL_ID?.trim() || null
}

/** Without a channel the Publish button is never rendered. */
export function isConfigured(): boolean {
  return Boolean(channelId() && process.env.TELEGRAM_BOT_TOKEN?.trim())
}

/* ---------- state ---------- */

function load(): State {
  if (!existsSync(FILE)) return { pending: {}, sent: [] }
  try {
    const s = JSON.parse(readFileSync(FILE, 'utf8')) as Partial<State>
    return { pending: s.pending ?? {}, sent: s.sent ?? [] }
  } catch {
    return { pending: {}, sent: [] }
  }
}

function save(s: State) {
  // A day is longer than any real approve-then-publish gap.
  const cutoff = Date.now() - 86_400_000
  for (const [k, v] of Object.entries(s.pending)) {
    if (Date.parse(v.createdAt) < cutoff) delete s.pending[k]
  }
  // Keep a month of sends so /recall and the audit trail have something to read.
  const keep = Date.now() - 30 * 86_400_000
  s.sent = s.sent.filter((x) => Date.parse(x.sentAt) >= keep).slice(-200)

  mkdirSync(STATE_DIR, { recursive: true })
  writeFileSync(FILE, JSON.stringify(s, null, 2))
}

/** Stage an approved post. Returns a short id small enough for callback data. */
export function stage(p: Omit<Pending, 'id' | 'createdAt'>): string {
  const s = load()
  const id = randomBytes(4).toString('hex')
  s.pending[id] = { ...p, id, createdAt: new Date().toISOString() }
  save(s)
  return id
}

export function pending(id: string): Pending | undefined {
  return load().pending[id]
}

export function drop(id: string): void {
  const s = load()
  delete s.pending[id]
  save(s)
}

export function recordSent(x: Omit<Sent, 'sentAt'>): void {
  const s = load()
  delete s.pending[x.id]
  s.sent.push({ ...x, sentAt: new Date().toISOString() })
  save(s)
}

/** Most recent broadcast from a chat, for /recall. */
export function lastSent(chatId: number): Sent | undefined {
  const s = load()
  for (let i = s.sent.length - 1; i >= 0; i--) if (s.sent[i].chatId === chatId) return s.sent[i]
  return undefined
}

export function sentToday(): Sent[] {
  const start = new Date().toISOString().slice(0, 10)
  return load().sent.filter((x) => x.sentAt.slice(0, 10) === start)
}

/* ---------- Telegram ---------- */

async function tg(method: string, body: unknown): Promise<any> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set')

  const r = await fetch(`${API}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = (await r.json()) as any
  if (!j.ok) throw new Error(j.description || `telegram ${method} failed`)
  return j.result
}

export interface Audience {
  count: number | null
  title: string | null
}

/**
 * Who is on the other end. Shown on the confirmation button, because
 * "Publish" and "Publish to 240 people" are different decisions.
 *
 * Returns nulls rather than throwing — not knowing the count is a reason to
 * say so, not a reason to block a send.
 */
export async function audience(): Promise<Audience> {
  const id = channelId()
  if (!id) return { count: null, title: null }
  try {
    const [chat, count] = await Promise.all([
      tg('getChat', { chat_id: id }).catch(() => null),
      tg('getChatMemberCount', { chat_id: id }).catch(() => null),
    ])
    return {
      count: typeof count === 'number' ? count : null,
      title: chat?.title ?? null,
    }
  } catch {
    return { count: null, title: null }
  }
}

export interface SendResult {
  ok: boolean
  messageId?: number
  error?: string
}

/**
 * Post to the channel. `dryRun` renders and validates without sending, so the
 * first real broadcast is never also the first test.
 */
export async function post(text: string, dryRun = false): Promise<SendResult> {
  const id = channelId()
  if (!id) return { ok: false, error: 'TELEGRAM_CHANNEL_ID is not set' }
  if (!text.trim()) return { ok: false, error: 'nothing to send' }
  if (text.length > LIMIT) {
    return { ok: false, error: `message is ${text.length} characters; Telegram allows ${LIMIT}` }
  }

  if (dryRun) {
    console.log(`[broadcast] DRY RUN → ${id}\n${'─'.repeat(60)}\n${text}\n${'─'.repeat(60)}`)
    return { ok: true }
  }

  try {
    const res = await tg('sendMessage', {
      chat_id: id,
      text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    })
    return { ok: true, messageId: res.message_id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Delete a post from the channel. Deletes; does not unsend. */
export async function recall(messageId: number): Promise<SendResult> {
  const id = channelId()
  if (!id) return { ok: false, error: 'TELEGRAM_CHANNEL_ID is not set' }
  try {
    await tg('deleteMessage', { chat_id: id, message_id: messageId })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

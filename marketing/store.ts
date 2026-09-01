/* ──────────────────────────────────────────────────────────────────────────
   Session state.

   "Draft 1" only means something if opportunity 1 is addressable, so the
   morning plan has to survive between messages — and between restarts, since
   a $5 box reboots and the team shouldn't lose the day's plan with it.

   A JSON file is the right size for this. Phase 2 replaces the approvals list
   with the Notion published log.
   ────────────────────────────────────────────────────────────────────────── */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { MARKETING_DIR } from './calendar'
import type { DailyPlan, Draft } from './types'

const STATE_DIR = resolve(MARKETING_DIR, '.state')
const STATE_FILE = resolve(STATE_DIR, 'sessions.json')

export interface Approval {
  at: string
  by: string
  channel: string
  rank: number
  body: string
  /** Optional for entries written before titles were recorded. */
  title?: string
}

export interface ChatState {
  plan?: DailyPlan
  planDate?: string
  /** Keyed by `${channel}:${rank}` so a redraft replaces cleanly. */
  drafts: Record<string, Draft>
  /** The most recent draft key, so /rewrite knows what it's rewriting. */
  lastDraftKey?: string
  approvals: Approval[]
}

type AllState = Record<string, ChatState>

function load(): AllState {
  if (!existsSync(STATE_FILE)) return {}
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as AllState
  } catch {
    // A corrupt state file must not take the bot down with it.
    return {}
  }
}

function save(state: AllState) {
  mkdirSync(STATE_DIR, { recursive: true })
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

export function getChat(chatId: number | string): ChatState {
  const all = load()
  return all[String(chatId)] ?? { drafts: {}, approvals: [] }
}

export function updateChat(chatId: number | string, patch: Partial<ChatState>) {
  const all = load()
  const key = String(chatId)
  all[key] = { ...(all[key] ?? { drafts: {}, approvals: [] }), ...patch }
  save(all)
}

export function setPlan(chatId: number | string, plan: DailyPlan) {
  // A new plan invalidates yesterday's drafts — "draft 1" must never resolve
  // to an opportunity from a previous morning.
  updateChat(chatId, { plan, planDate: plan.date, drafts: {}, lastDraftKey: undefined })
}

export const draftKey = (channel: string, rank: number) => `${channel}:${rank}`

export function putDraft(chatId: number | string, channel: string, rank: number, draft: Draft) {
  const chat = getChat(chatId)
  const key = draftKey(channel, rank)
  updateChat(chatId, { drafts: { ...chat.drafts, [key]: draft }, lastDraftKey: key })
}

export function getDraft(chatId: number | string, channel: string, rank: number): Draft | undefined {
  return getChat(chatId).drafts[draftKey(channel, rank)]
}

export function getLastDraft(chatId: number | string): Draft | undefined {
  const chat = getChat(chatId)
  return chat.lastDraftKey ? chat.drafts[chat.lastDraftKey] : undefined
}

export function recordApproval(chatId: number | string, approval: Approval) {
  const chat = getChat(chatId)
  updateChat(chatId, { approvals: [...chat.approvals, approval].slice(-200) })
}

/** Today's plan, or undefined when it's stale — the bot regenerates rather than lying. */
export function getFreshPlan(chatId: number | string, today: string): DailyPlan | undefined {
  const chat = getChat(chatId)
  return chat.planDate === today ? chat.plan : undefined
}

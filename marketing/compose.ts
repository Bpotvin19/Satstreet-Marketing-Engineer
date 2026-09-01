/* ──────────────────────────────────────────────────────────────────────────
   The /post flow.

   A guided, button-driven path from "I want to post about X" to a checked
   draft, with no syntax to remember:

     /post  →  what about?  →  whose voice?  →  which channel?  →  draft

   Every step other than the topic is a button, because arguments are where a
   colleague who does not use the bot daily gives up. The typed commands stay
   for people who know them; this is the door for everyone else.

   Sessions live on disk so a bot restart mid-flow does not strand anyone, and
   are keyed per chat AND per user so two people composing at once do not
   overwrite each other.
   ────────────────────────────────────────────────────────────────────────── */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { MARKETING_DIR } from './calendar'
import type { Draft } from './types'

const STATE_DIR = resolve(MARKETING_DIR, '.state')
const FILE = resolve(STATE_DIR, 'compose.json')

/** 'house' is the Satstreet account rather than a named person. */
export type VoiceChoice = string

export interface Compose {
  id: string
  chatId: number
  userId: number
  topic: string
  voice?: VoiceChoice
  voiceLabel?: string
  channel?: 'X' | 'LinkedIn'
  draft?: Draft
  createdAt: string
}

type All = Record<string, Compose>

function load(): All {
  if (!existsSync(FILE)) return {}
  try {
    return JSON.parse(readFileSync(FILE, 'utf8')) as All
  } catch {
    return {}
  }
}

function save(all: All) {
  // A day is longer than any real compose session; anything older is abandoned.
  const cutoff = Date.now() - 86_400_000
  for (const [k, v] of Object.entries(all)) {
    if (Date.parse(v.createdAt) < cutoff) delete all[k]
  }
  mkdirSync(STATE_DIR, { recursive: true })
  writeFileSync(FILE, JSON.stringify(all, null, 2))
}

const newId = () => Math.random().toString(36).slice(2, 9)

export function start(chatId: number, userId: number, topic: string): Compose {
  const all = load()
  const c: Compose = { id: newId(), chatId, userId, topic, createdAt: new Date().toISOString() }
  all[c.id] = c
  save(all)
  return c
}

export function get(id: string): Compose | undefined {
  return load()[id]
}

export function update(id: string, patch: Partial<Compose>): Compose | undefined {
  const all = load()
  const c = all[id]
  if (!c) return undefined
  all[id] = { ...c, ...patch }
  save(all)
  return all[id]
}

/* ── awaiting a topic ─────────────────────────────────────────────────────
   /post with no argument sends a force-reply prompt. The reply arrives as an
   ordinary message, so the pending request is parked under chat+user until it
   comes back.
   ────────────────────────────────────────────────────────────────────────── */

const PENDING = resolve(STATE_DIR, 'compose-pending.json')

function loadPending(): Record<string, { promptMessageId: number; at: string }> {
  if (!existsSync(PENDING)) return {}
  try {
    return JSON.parse(readFileSync(PENDING, 'utf8'))
  } catch {
    return {}
  }
}

const pendingKey = (chatId: number, userId: number) => `${chatId}:${userId}`

export function awaitTopic(chatId: number, userId: number, promptMessageId: number) {
  const all = loadPending()
  all[pendingKey(chatId, userId)] = { promptMessageId, at: new Date().toISOString() }
  mkdirSync(STATE_DIR, { recursive: true })
  writeFileSync(PENDING, JSON.stringify(all, null, 2))
}

/** Consume a pending topic request, if this user has one open. */
export function takePending(chatId: number, userId: number): boolean {
  const all = loadPending()
  const k = pendingKey(chatId, userId)
  const hit = all[k]
  if (!hit) return false
  // An hour is generous for "reply with a topic"; stale prompts are ignored.
  const fresh = Date.now() - Date.parse(hit.at) < 3_600_000
  delete all[k]
  writeFileSync(PENDING, JSON.stringify(all, null, 2))
  return fresh
}

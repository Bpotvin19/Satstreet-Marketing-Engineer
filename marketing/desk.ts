/* ──────────────────────────────────────────────────────────────────────────
   What the News Desk flow is currently holding.

   /open puts a card here. /voice, /why, /kill and /ready all act on "the last
   one", because that is how the desk actually talks at a phone keyboard —
   nobody retypes a page id four times.

   Kept per chat rather than per user: this runs in one group where the team
   works on a card together, and two people alternating /voice on the same card
   is the normal case, not a collision.
   ────────────────────────────────────────────────────────────────────────── */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { MARKETING_DIR } from './calendar'
import type { CardDraft } from './types'
import type { QueueCard } from './queue'

const FILE = resolve(MARKETING_DIR, '.state/desk.json')

export interface Held {
  card?: QueueCard
  /** An idea typed straight into /draft, with no Notion row behind it. */
  idea?: string
  draft?: CardDraft
  voiceSlug?: string
  voiceLabel?: string
  at: string
}

type All = Record<string, Held>

function load(): All {
  if (!existsSync(FILE)) return {}
  try {
    return JSON.parse(readFileSync(FILE, 'utf8')) as All
  } catch {
    return {}
  }
}

function save(all: All) {
  // Cards go stale with the news they are built on; a day is the outer bound.
  const cutoff = Date.now() - 86_400_000
  for (const [k, v] of Object.entries(all)) if (Date.parse(v.at) < cutoff) delete all[k]
  mkdirSync(resolve(MARKETING_DIR, '.state'), { recursive: true })
  writeFileSync(FILE, JSON.stringify(all, null, 2))
}

export function hold(chatId: number, patch: Partial<Held>): Held {
  const all = load()
  const next: Held = { ...(all[String(chatId)] ?? {}), ...patch, at: new Date().toISOString() }
  all[String(chatId)] = next
  save(all)
  return next
}

export function held(chatId: number): Held | undefined {
  return load()[String(chatId)]
}

/** A fresh card replaces whatever was open, including any draft of it. */
export function open(chatId: number, card: QueueCard): Held {
  const all = load()
  const next: Held = { card, at: new Date().toISOString() }
  all[String(chatId)] = next
  save(all)
  return next
}

export function openIdea(chatId: number, idea: string): Held {
  const all = load()
  const next: Held = { idea, at: new Date().toISOString() }
  all[String(chatId)] = next
  save(all)
  return next
}

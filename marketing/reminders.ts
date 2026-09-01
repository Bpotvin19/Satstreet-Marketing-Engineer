/* ──────────────────────────────────────────────────────────────────────────
   Calendar reminders.

   Four rules, evaluated against the calendar each morning:

     window    the drafting window opens today (days_away === lead_time_days)
     week      seven days out
     tomorrow  the day before
     today     the day itself

   The window rule is the one that earns its keep. "El Salvador Bitcoin Day is
   today" arrives far too late to write anything — the calendar's own operating
   rhythm says anniversaries are drafted 7–10 days ahead and conferences 2–3
   weeks ahead, so the useful alert is the one that fires when there is still
   time to act.

   Every reminder that fires is recorded, so a job that runs twice, or a box
   that reboots mid-morning, does not repeat itself.
   ────────────────────────────────────────────────────────────────────────── */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { MARKETING_DIR, type DatedEntry } from './calendar'

const STATE_DIR = resolve(MARKETING_DIR, '.state')
const SENT_FILE = resolve(STATE_DIR, 'reminders.json')

export type RuleName = 'window' | 'week' | 'tomorrow' | 'today'

export interface Reminder {
  rule: RuleName
  entry: DatedEntry
  /** Stable across runs, so a reminder is only ever sent once. */
  key: string
}

/** Extra day-counts to alert on, e.g. REMINDER_OFFSETS=14,7,3,1,0 */
function offsets(): number[] {
  const raw = process.env.REMINDER_OFFSETS?.trim()
  if (!raw) return [7, 1, 0]
  return raw.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n >= 0)
}

const LABEL: Record<RuleName, string> = {
  window: 'Drafting window opens today',
  week: 'One week out',
  tomorrow: 'Tomorrow',
  today: 'Today',
}

function ruleFor(days: number): RuleName | null {
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === 7) return 'week'
  return null
}

/** Which reminders fire for this calendar, today. */
export function due(entries: DatedEntry[]): Reminder[] {
  const out: Reminder[] = []
  const extra = new Set(offsets())

  for (const e of entries) {
    const seen = new Set<RuleName>()

    // The window rule can coincide with a plain offset; window wins, because
    // "start drafting" is more actionable than "seven days out".
    if (e.lead_time_days !== undefined && e.days_away === e.lead_time_days) {
      out.push({ rule: 'window', entry: e, key: `${e.title}|${e.date}|window` })
      seen.add('window')
    }

    if (extra.has(e.days_away)) {
      const r = ruleFor(e.days_away)
      if (r && !seen.has(r) && !(r === 'week' && seen.has('window'))) {
        out.push({ rule: r, entry: e, key: `${e.title}|${e.date}|${r}` })
      }
    }
  }

  // Nearest first, and within a day the window alert leads.
  const order: RuleName[] = ['today', 'tomorrow', 'window', 'week']
  return out.sort(
    (a, b) => a.entry.days_away - b.entry.days_away || order.indexOf(a.rule) - order.indexOf(b.rule),
  )
}

/* ── sent log ─────────────────────────────────────────────────────────────── */

function loadSent(): Record<string, string> {
  if (!existsSync(SENT_FILE)) return {}
  try {
    return JSON.parse(readFileSync(SENT_FILE, 'utf8')) as Record<string, string>
  } catch {
    return {}
  }
}

export function unsent(reminders: Reminder[]): Reminder[] {
  const sent = loadSent()
  return reminders.filter((r) => !sent[r.key])
}

export function markSent(reminders: Reminder[]) {
  const sent = loadSent()
  const now = new Date().toISOString()
  for (const r of reminders) sent[r.key] = now

  // Keep the log from growing without bound; a year of history is plenty.
  const cutoff = Date.now() - 365 * 86_400_000
  for (const [k, v] of Object.entries(sent)) {
    if (Date.parse(v) < cutoff) delete sent[k]
  }

  mkdirSync(STATE_DIR, { recursive: true })
  writeFileSync(SENT_FILE, JSON.stringify(sent, null, 2))
}

/** Everything that will fire between now and `days` ahead — for /remind. */
export function upcoming(entries: DatedEntry[], days = 30): Reminder[] {
  const extra = new Set(offsets())
  const out: Reminder[] = []

  for (const e of entries) {
    if (e.days_away > days) continue

    if (e.lead_time_days !== undefined && e.days_away >= e.lead_time_days) {
      out.push({ rule: 'window', entry: e, key: `${e.title}|${e.date}|window` })
    }
    for (const off of extra) {
      if (off > e.days_away) continue
      const r = ruleFor(off)
      if (r) out.push({ rule: r, entry: e, key: `${e.title}|${e.date}|${r}` })
    }
  }

  // Sort by when the alert itself fires, not by when the event is.
  const fireIn = (r: Reminder) =>
    r.rule === 'window' ? r.entry.days_away - (r.entry.lead_time_days ?? 0)
      : r.entry.days_away - (r.rule === 'week' ? 7 : r.rule === 'tomorrow' ? 1 : 0)

  return out.sort((a, b) => fireIn(a) - fireIn(b) || a.entry.days_away - b.entry.days_away)
}

export function fireInDays(r: Reminder): number {
  return r.rule === 'window'
    ? r.entry.days_away - (r.entry.lead_time_days ?? 0)
    : r.entry.days_away - (r.rule === 'week' ? 7 : r.rule === 'tomorrow' ? 1 : 0)
}

export { LABEL }

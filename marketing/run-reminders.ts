#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   Calendar reminders — the scheduled job.

     npm run marketing:remind                 send anything due
     npm run marketing:remind -- --dry-run    print what would send
     npm run marketing:remind -- --force      ignore the sent log (testing)

   Posts nothing when nothing is due, which is the point: a reminder bot that
   speaks every morning gets muted. Run it right after the morning plan.
   ────────────────────────────────────────────────────────────────────────── */

import { Bot } from 'grammy'
import { loadCalendar, withinWindow } from './calendar'
import { due, unsent, markSent, type Reminder, type RuleName } from './reminders'
import { renderReminder, chunk } from './telegram-render'

const DRY = process.argv.includes('--dry-run')
const FORCE = process.argv.includes('--force')

/**
 * --preview "el salvador" [rule]
 *
 * Sends one named event's reminder now, whatever the date, so the team can see
 * what a reminder looks like before one is genuinely due. Never writes to the
 * sent log, so the real reminder still fires on its own day.
 */
const RULES: RuleName[] = ['window', 'week', 'tomorrow', 'today']
const isRule = (s: string | undefined): s is RuleName => !!s && (RULES as string[]).includes(s)

const previewIdx = process.argv.indexOf('--preview')
// The event name can be several words; anything after it that is not a known
// rule belongs to the name, and other flags must not be swallowed as one.
const previewArgs =
  previewIdx === -1 ? [] : process.argv.slice(previewIdx + 1).filter((a) => !a.startsWith('--'))
const PREVIEW_RULE: RuleName = isRule(previewArgs.at(-1)) ? (previewArgs.pop() as RuleName) : 'today'
const PREVIEW = previewArgs.join(' ').trim()

async function main() {
  const cal = await loadCalendar()
  if (!cal.available) throw new Error(`Calendar unavailable: ${cal.reason}`)

  // A wide window so a long conference lead time still matches its window rule.
  const entries = withinWindow(cal.entries, new Date(), 400)

  if (PREVIEW) {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
    const q = norm(PREVIEW)
    const entry = entries.find((e) => norm(e.title).includes(q))
    if (!entry) {
      throw new Error(
        `no calendar entry matches "${PREVIEW}". Available: ${entries.map((e) => e.title).join(', ')}`,
      )
    }
    const one = [{ rule: PREVIEW_RULE, entry, key: `preview|${entry.title}|${PREVIEW_RULE}` }]
    console.error(`[remind] preview: "${entry.title}" as the ${PREVIEW_RULE} reminder — sent log untouched`)
    await deliver(one)
    return
  }

  const windowed = entries.filter((e) => e.days_away <= 60)
  const all = due(windowed)
  const send = FORCE ? all : unsent(all)

  console.error(
    `[remind] ${cal.source} · ${entries.length} entries · ${all.length} due · ${send.length} to send` +
      `${FORCE ? ' (forced)' : ''}`,
  )

  if (send.length === 0) {
    console.error('[remind] nothing to send')
    return
  }

  await deliver(send)
  // Only after a successful send, so a failed run retries tomorrow.
  if (!FORCE && send.length) markSent(send)
}

async function deliver(send: Reminder[]) {
  if (send.length === 0) return

  if (DRY) {
    for (const r of send) console.log(`\n${'─'.repeat(50)}\n${renderReminder(r)}`)
    console.error('\n[remind] dry run — nothing sent, sent log untouched')
    return
  }

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  const chats = (process.env.TELEGRAM_CHAT_ID ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (!token || chats.length === 0) {
    throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must both be set.')
  }

  const api = new Bot(token).api
  for (const chatId of chats) {
    for (const r of send) {
      for (const part of chunk(renderReminder(r))) {
        await api.sendMessage(chatId, part, { parse_mode: 'HTML' })
      }
    }
    console.error(`[remind] sent ${send.length} to ${chatId}`)
  }
}

main().catch((e) => {
  console.error(`[remind] failed: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})

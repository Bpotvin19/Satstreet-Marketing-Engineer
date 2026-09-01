#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   /today — Phase 0.

   Prints the two or three strongest content opportunities for Satstreet today.
   No Telegram, no publishing, no automation: the point of this phase is to run
   it every morning for a week and answer one question — would I have posted
   any of these? If the answer is no, the fix is context/satstreet.md, and no
   amount of plumbing will help.

     npm run marketing:today
     npm run marketing:today -- --print-prompt   # no API call; paste into a chat
     npm run marketing:today -- --json           # machine-readable, for Phase 1
   ────────────────────────────────────────────────────────────────────────── */

import { loadCalendar, withinWindow } from './calendar'
import { buildSystemPrompt, buildUserMessage, buildChatBundle } from './prompt'
import { structured, RefusalError, MODEL, EFFORT } from './claude'
import { PLAN_SCHEMA, type DailyPlan, type Opportunity } from './types'

const argv = process.argv.slice(2)
const PRINT_PROMPT = argv.includes('--print-prompt')
const CHAT = argv.includes('--chat')
const AS_JSON = argv.includes('--json')

/* ── terminal formatting ──────────────────────────────────────────────────── */

const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  blue: '\x1b[38;5;69m',
  amber: '\x1b[38;5;179m',
  green: '\x1b[38;5;71m',
  grey: '\x1b[38;5;245m',
}

const supportsColor = process.stdout.isTTY && process.env.NO_COLOR === undefined
const c = (code: string, s: string) => (supportsColor ? `${code}${s}${C.reset}` : s)

/** Wrap to the terminal width so long angles stay readable. */
function wrap(text: string, indent = 5): string {
  const width = Math.min((process.stdout.columns || 100) - indent, 92)
  const pad = ' '.repeat(indent)
  const out: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    if (line.length + word.length + 1 > width) { out.push(line); line = word }
    else line = line ? `${line} ${word}` : word
  }
  if (line) out.push(line)
  return out.map((l) => pad + l).join('\n')
}

function renderOpportunity(o: Opportunity) {
  const badge = c(C.blue, `Priority ${o.rank}`)
  console.log(`${badge} ${c(C.dim, '·')} ${c(C.bold, o.channel)} ${c(C.dim, '—')} ${c(C.bold, o.title)}`)
  console.log(wrap(o.angle))
  console.log()
  console.log(`${' '.repeat(5)}${c(C.grey, 'Why now')}`)
  console.log(wrap(o.why_now))
  console.log()
  console.log(`${' '.repeat(5)}${c(C.grey, 'Hook')}`)
  console.log(wrap(c(C.green, `"${o.suggested_hook}"`)))

  const risky = o.risk_notes && o.risk_notes.trim().toLowerCase() !== 'none'
  if (risky) {
    console.log()
    console.log(`${' '.repeat(5)}${c(C.amber, 'Watch')}`)
    console.log(wrap(o.risk_notes))
  }
  if (o.calendar_ref || o.assets_url) {
    console.log()
    const bits = [
      o.calendar_ref ? `from calendar: ${o.calendar_ref}` : '',
      o.assets_url ? `assets: ${o.assets_url}` : '',
    ].filter(Boolean)
    console.log(`${' '.repeat(5)}${c(C.dim, bits.join('  ·  '))}`)
  }
  console.log()
}

function render(plan: DailyPlan, calendarSource: string) {
  const heading = new Date(`${plan.date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
  })

  console.log()
  console.log(c(C.bold, 'SATSTREET MARKETING') + c(C.dim, ` — ${heading}`))
  console.log(c(C.dim, '─'.repeat(Math.min(process.stdout.columns || 72, 72))))
  console.log()

  for (const o of [...plan.opportunities].sort((a, b) => a.rank - b.rank)) {
    renderOpportunity(o)
  }

  if (plan.upcoming.length) {
    console.log(c(C.grey, 'UPCOMING'))
    for (const u of plan.upcoming) {
      const when = u.days_away === 0 ? 'today' : `in ${u.days_away} day${u.days_away === 1 ? '' : 's'}`
      console.log(`  ${c(C.bold, u.event)} ${c(C.dim, `· ${when} · ${u.date}`)}`)
      console.log(wrap(u.prep_note, 4))
      if (u.assets_url) console.log(`    ${c(C.dim, u.assets_url)}`)
    }
    console.log()
  }

  if (plan.gaps?.trim()) {
    console.log(c(C.grey, 'GAPS'))
    console.log(wrap(plan.gaps, 2))
    console.log()
  }

  console.log(c(C.dim, `calendar: ${calendarSource}  ·  ${MODEL} @ effort ${EFFORT}`))
  console.log(c(C.dim, 'Nothing here is published. Drafting and Telegram arrive in Phase 1.'))
  console.log()
}

/* ── run ──────────────────────────────────────────────────────────────────── */

async function main() {
  const cal = await loadCalendar()
  if (!cal.available) {
    console.error(`\ncalendar unavailable: ${cal.reason}\n`)
    console.error('Set MARKETING_SHEET_ID to read a link-shared Google Sheet,')
    console.error('or edit marketing/calendar.json.\n')
    process.exit(1)
  }

  const now = new Date()
  const entries = withinWindow(cal.entries, now)

  if (cal.skipped > 0) {
    console.error(
      c(C.dim, `[today] ${cal.skipped} placeholder row${cal.skipped === 1 ? '' : 's'} skipped — fill in the TODOs in ${cal.source}`),
    )
  }
  if (entries.length === 0) {
    console.error(c(C.dim, '[today] nothing on the calendar in the next 30 days — working from evergreen angles only'))
  }

  const input = {
    date: now.toISOString().slice(0, 10),
    weekday: now.toLocaleDateString('en-US', { weekday: 'long' }),
    calendar: entries,
    // today.ts is the no-credentials path, so it doesn't read the published log.
    recent: { tracked: false, posts: [] },
    calendarSource: cal.source,
  }

  // No API key needed for either of these — that's the point of them.
  if (CHAT) {
    console.log(buildChatBundle(input))
    return
  }

  const system = buildSystemPrompt()
  const user = buildUserMessage(input)

  if (PRINT_PROMPT) {
    console.log('════════ SYSTEM ════════\n')
    console.log(system)
    console.log('\n════════ USER ════════\n')
    console.log(user)
    console.log()
    return
  }

  const plan = await structured<DailyPlan>(system, user, PLAN_SCHEMA)

  if (AS_JSON) {
    console.log(JSON.stringify(plan, null, 2))
    return
  }
  render(plan, cal.source)
}

main().catch((e) => {
  if (e instanceof RefusalError) {
    console.error(`\n[today] model declined: ${e.message}\n`)
  } else {
    console.error(`\n[today] failed: ${e instanceof Error ? e.message : String(e)}\n`)
    if (String(e).includes('authentication') || String(e).includes('401')) {
      console.error('Set ANTHROPIC_API_KEY, or run `ant auth login`.')
      console.error('No key yet? `npm run marketing:today -- --print-prompt` needs no credentials.\n')
    }
  }
  process.exit(1)
})

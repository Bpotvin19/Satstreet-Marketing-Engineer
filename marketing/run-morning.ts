#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   The 8:00 AM post.

     npm run marketing:morning
     npm run marketing:morning -- --dry-run    # generate, print, send nothing

   Separate from bot.ts so the same cron that runs the client brief can drive
   it. The bot process must also be running for the buttons on this message to
   do anything — cron posts, the bot answers.
   ────────────────────────────────────────────────────────────────────────── */

import { Bot } from 'grammy'
import { generatePlan } from './planner'
import { setPlan } from './store'
import { renderPlan, planKeyboard, chunk } from './telegram-render'

const DRY = process.argv.includes('--dry-run')

async function main() {
  const chats = (process.env.TELEGRAM_CHAT_ID ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  // The published log is per chat, so the plan is generated against the first
  // allowlisted group. A dry run with no chat configured still works.
  const { plan, logBackend, logError } = await generatePlan(chats[0] ?? 'dry-run')
  console.error(`[morning] published log: ${logBackend}${logError ? ` (degraded: ${logError})` : ''}`)

  if (DRY) {
    console.log(renderPlan(plan))
    console.log('\n[morning] dry run — nothing sent')
    return
  }

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if (!token || chats.length === 0) {
    throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must both be set.')
  }

  const api = new Bot(token).api
  const parts = chunk(renderPlan(plan))

  for (const chatId of chats) {
    setPlan(chatId, plan)
    for (const [i, part] of parts.entries()) {
      await api.sendMessage(chatId, part, {
        parse_mode: 'HTML',
        ...(i === parts.length - 1 ? { reply_markup: planKeyboard(plan) } : {}),
      })
    }
    console.log(`[morning] posted to ${chatId}`)
  }
}

main().catch((e) => {
  console.error(`[morning] failed: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})

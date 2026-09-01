#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   Register the command menu with Telegram.

     npm run marketing:commands

   This is what puts the list behind the "/" button in the group, and what
   makes Telegram autocomplete as you type. It is a one-off API call that
   Telegram stores against the bot, so re-run it whenever commands change —
   editing bot.ts alone does not update the menu.
   ────────────────────────────────────────────────────────────────────────── */

import { Bot } from 'grammy'

const COMMANDS: { command: string; description: string }[] = [
  { command: 'research', description: 'Public Sales/BD research — /research VBX' },
  { command: 'todays_prospects', description: 'Latest prospect list — add florida for that list' },
  { command: 'company_facts', description: 'Satstreet facts from the versioned context pack' },
  { command: 'queue', description: 'Content Queue — cards waiting on review' },
  { command: 'open', description: 'Open a queue card — /open 668f' },
  { command: 'why', description: 'Why this draft, this voice, this limit' },
  { command: 'ready', description: 'Mark the open card ready for the Approval Queue' },
  { command: 'kill', description: 'Kill the open card — Approval to Changes Requested' },
  { command: 'post', description: 'Write a post — guided, no syntax to remember' },
  { command: 'voice', description: 'One voice — /voice robustus etf inflows' },
  { command: 'today', description: "The day's two or three best content opportunities" },
  { command: 'tweets', description: 'Three short X posts — /tweets jon custody' },
  { command: 'voices', description: 'Same topic in every voice — founders and the external style' },
  { command: 'ideas', description: 'Angles on a topic — /ideas custody' },
  { command: 'brief', description: 'Client market brief from the crypto press' },
  { command: 'weekly', description: "Next week's content mix, and what's missing" },
  { command: 'price', description: 'BTC and ETH — or any asset: /price hype' },
  { command: 'chart', description: 'Open the TradingView chart — /chart btc 30d' },
  { command: 'calendar', description: "What's coming in the next 30 days" },
  { command: 'ref', description: 'Read a Satstreet reference page — /ref funding' },
  { command: 'recall', description: 'Delete the last published channel post' },
  { command: 'whoami', description: 'Your Telegram id, for the team allowlist' },
  { command: 'help', description: 'Show every command' },
]

const DESCRIPTION =
  'Satstreet marketing desk. Proposes the day\'s strongest content opportunities, drafts posts in the ' +
  'founders\' voices, and checks every draft against the compliance rules. Nothing publishes on its own: ' +
  'approve logs the copy, and publishing to the client channel takes a second, deliberate confirmation.'

const SHORT = "Satstreet's marketing desk. Proposes, drafts, checks. A human always posts."

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if (!token) {
    console.error('\nTELEGRAM_BOT_TOKEN is not set in marketing/.env\n')
    process.exit(1)
  }

  const api = new Bot(token).api
  const me = await api.getMe()

  await api.setMyCommands(COMMANDS)
  console.log(`\n@${me.username} — registered ${COMMANDS.length} commands:\n`)
  for (const c of COMMANDS) console.log(`  /${c.command.padEnd(11)} ${c.description}`)

  // Shown in the bot's profile and above an empty chat.
  await api.setMyDescription(DESCRIPTION)
  await api.setMyShortDescription(SHORT)
  console.log('\nDescription and short description set.')

  const back = await api.getMyCommands()
  console.log(`\nTelegram confirms ${back.length} commands registered.`)
  console.log('Type "/" in the group to see the menu — it may take a moment to appear.\n')
}

main().catch((e) => {
  console.error(`\nfailed: ${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
})

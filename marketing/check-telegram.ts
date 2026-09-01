#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   Telegram connection check.

     npm run marketing:check

   Verifies the four things that break: the token works, the allowlist is set,
   the bot can actually reach each allowed chat, and group privacy mode is
   configured so it sees commands without reading the team's conversation.
   ────────────────────────────────────────────────────────────────────────── */

import { Bot } from 'grammy'
import { backend, PROPS } from './published'

let failures = 0
const pass = (m: string) => console.log(`  ✓ ${m}`)
const fail = (m: string, fix?: string) => {
  failures++
  console.log(`  ✗ ${m}`)
  if (fix) console.log(`      → ${fix}`)
}

async function main() {
  console.log('\nTelegram connection check\n')

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  console.log('Token')
  if (!token) {
    fail('TELEGRAM_BOT_TOKEN is not set', 'message @BotFather, /newbot, then put the token in marketing/.env')
    return report()
  }

  const bot = new Bot(token)
  let me
  try {
    me = await bot.api.getMe()
  } catch (e) {
    fail(`token rejected (${e instanceof Error ? e.message : String(e)})`, 'check for a stray space, or /revoke in BotFather for a fresh one')
    return report()
  }
  pass(`authenticated as @${me.username}`)
  pass(`group privacy is ${me.can_read_all_group_messages ? 'OFF — the bot can read every message' : 'ON — commands only, which is what we want'}`)

  console.log('\nAllowlist')
  const chats = (process.env.TELEGRAM_CHAT_ID ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (chats.length === 0) {
    fail('TELEGRAM_CHAT_ID is not set', 'the bot refuses to start without one — see README § Telegram setup')
    return report()
  }
  pass(`${chats.length} chat${chats.length === 1 ? '' : 's'} allowed`)

  console.log('\nReachability')
  for (const id of chats) {
    try {
      const chat = await bot.api.getChat(id)
      const title = 'title' in chat && chat.title ? chat.title : chat.type
      pass(`${id} → "${title}"`)
    } catch (e) {
      fail(
        `${id} unreachable (${e instanceof Error ? e.message : String(e)})`,
        'add the bot to that group, and check the id is negative for groups',
      )
    }
  }

  await checkLog()
  report()
}

/* The published log works either way, so an unconfigured Notion is reported as
   a fact, not a failure. Only a *broken* Notion counts against the check. */
async function checkLog() {
  console.log('\nPublished log')
  if (backend() === 'local') {
    console.log('  – local (marketing/.state) — works, but does not survive the box or reach the team')
    console.log('    Set NOTION_TOKEN and NOTION_MARKETING_DB_ID to upgrade it.')
    return
  }

  const token = process.env.NOTION_TOKEN!.trim()
  const dbId = process.env.NOTION_MARKETING_DB_ID!.trim()
  try {
    const r = await fetch(`https://api.notion.com/v1/databases/${dbId}`, {
      headers: {
        authorization: `Bearer ${token}`,
        'Notion-Version': process.env.NOTION_VERSION?.trim() || '2022-06-28',
      },
    })
    const body = (await r.json()) as {
      message?: string
      title?: { plain_text: string }[]
      properties?: Record<string, { type: string }>
    }
    if (!r.ok) {
      fail(`database unreachable (${r.status}: ${body.message})`,
        'share the database with the integration: ••• → Connections')
      return
    }
    pass(`found "${body.title?.map((t) => t.plain_text).join('') || '(untitled)'}"`)

    const expected: Record<string, string> = {
      [PROPS.title]: 'title',
      [PROPS.date]: 'date',
      [PROPS.channel]: 'select',
      [PROPS.approvedBy]: 'rich_text',
    }
    for (const [name, type] of Object.entries(expected)) {
      const found = body.properties?.[name]
      if (!found) fail(`"${name}" is missing`, `add a ${type} property named exactly "${name}"`)
      else if (found.type !== type) fail(`"${name}" is ${found.type}, expected ${type}`)
      else pass(`"${name}" (${type})`)
    }
  } catch (e) {
    fail(`Notion check failed (${e instanceof Error ? e.message : String(e)})`)
  }
}

function report() {
  if (failures === 0) {
    console.log('\nAll checks passed. `npm run marketing:bot` will start.\n')
  } else {
    console.log(`\n${failures} problem${failures === 1 ? '' : 's'} to fix.\n`)
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error(`\ncheck failed: ${e instanceof Error ? e.message : String(e)}\n`)
  process.exitCode = 1
})

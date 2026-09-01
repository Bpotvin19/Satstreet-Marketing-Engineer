#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   Collect the team's Telegram user ids.

     npm run marketing:users

   Telegram lets a bot read a group's administrators but not its full member
   list, so this gets you the admins in one shot. Anyone else on the team sends
   /whoami in the group and reads their own id back.

   The output is the line to paste into marketing/.env. Until TELEGRAM_USER_IDS
   has something in it the bot stays locked, answering only /whoami and /help.
   ────────────────────────────────────────────────────────────────────────── */

import * as access from './access'

interface Member {
  user: { id: number; is_bot: boolean; username?: string; first_name?: string; last_name?: string }
  status: string
}

async function tg<T>(token: string, method: string, params: Record<string, string>): Promise<T> {
  const q = new URLSearchParams(params)
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}?${q}`)
  const j = (await r.json()) as { ok: boolean; description?: string; result: T }
  if (!j.ok) throw new Error(j.description ?? `${method} failed`)
  return j.result
}

function name(m: Member): string {
  const n = [m.user.first_name, m.user.last_name].filter(Boolean).join(' ')
  return m.user.username ? `@${m.user.username}` : n || String(m.user.id)
}

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if (!token) {
    console.error('\nTELEGRAM_BOT_TOKEN is not set in marketing/.env.\n')
    process.exit(1)
  }

  const a = access.load()
  console.log(`\n${access.banner(a)}\n`)

  if (!a.chats.size) {
    console.error('TELEGRAM_CHAT_ID is not set — run: npm run marketing:chatid\n')
    process.exit(1)
  }

  const found = new Map<number, { label: string; where: string }>()

  for (const chatId of a.chats) {
    let admins: Member[]
    try {
      admins = await tg<Member[]>(token, 'getChatAdministrators', { chat_id: chatId })
    } catch (e) {
      console.error(`  ${chatId}: ${e instanceof Error ? e.message : e}`)
      continue
    }
    for (const m of admins) {
      // The bot is an admin of its own group; it is not a team member.
      if (m.user.is_bot) continue
      found.set(m.user.id, { label: name(m), where: `${chatId} (${m.status})` })
    }
  }

  if (!found.size) {
    console.log('No human administrators found.\n')
    console.log('Everyone on the team should send /whoami in the group and')
    console.log('report the id it gives them.\n')
    return
  }

  console.log('Administrators the bot can see:\n')
  for (const [id, m] of found) {
    const already = a.users.has(String(id)) ? ' ✓ already enrolled' : ''
    console.log(`  ${String(id).padEnd(14)} ${m.label.padEnd(24)} ${m.where}${already}`)
  }

  const merged = [...new Set([...a.users, ...[...found.keys()].map(String)])]
  console.log('\nPut this in marketing/.env:\n')
  console.log(`  TELEGRAM_USER_IDS=${merged.join(',')}\n`)
  console.log('Anyone not listed above — non-admin team members — should send')
  console.log('/whoami in the group and be added to the same line.\n')
}

main().catch((e) => {
  console.error(`\nfailed: ${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
})

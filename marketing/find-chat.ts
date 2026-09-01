#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   Find the group's chat id.

     npm run marketing:chatid

   Reads TELEGRAM_BOT_TOKEN from marketing/.env and reports every chat the bot
   has seen recently, so you don't have to dig through raw getUpdates JSON.

   It reports two ids, because the bot now lives in two places:

     TELEGRAM_CHAT_ID     the staff group, where it takes commands
     TELEGRAM_CHANNEL_ID  the invite-only client channel, where it publishes

   A private channel's id is not shown anywhere in the Telegram apps, which is
   why this exists. Add the bot as a channel admin, post once in the channel,
   and it appears here.

   Telegram only keeps undelivered updates for about 24 hours, and adding the
   bot to a group counts as one — so if this comes back empty, send any message
   in the group and run it again.
   ────────────────────────────────────────────────────────────────────────── */

import { pathToFileURL } from 'node:url'

interface TgChat {
  id: number
  type: string
  title?: string
  username?: string
  first_name?: string
}

/** Every update kind that carries a chat, including the add-to-group event. */
function chatsIn(update: Record<string, unknown>): TgChat[] {
  const out: TgChat[] = []
  for (const key of [
    'message', 'edited_message', 'channel_post', 'edited_channel_post',
    'my_chat_member', 'chat_member',
  ]) {
    const chat = (update[key] as { chat?: TgChat } | undefined)?.chat
    if (chat) out.push(chat)
  }
  const cb = (update.callback_query as { message?: { chat?: TgChat } } | undefined)?.message?.chat
  if (cb) out.push(cb)
  return out
}

interface TgResponse<T> {
  ok: boolean
  description?: string
  result: T
}

async function tg<T>(token: string, method: string): Promise<TgResponse<T>> {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`)
  return (await r.json()) as TgResponse<T>
}

/** Printed separately from the fetching so the output can be exercised. */
export function report(seen: Map<number, TgChat>, username: string): void {
  // Two different settings now, and swapping them is the kind of mistake that
  // only shows itself when a client brief lands in the staff group — or worse,
  // when staff chatter lands in the client channel.
  const groups = [...seen.values()].filter((c) => c.type.includes('group'))
  const channels = [...seen.values()].filter((c) => c.type === 'channel')

  console.log('\nPut these in marketing/.env:\n')

  if (groups.length) {
    console.log(`  TELEGRAM_CHAT_ID=${groups.map((g) => g.id).join(',')}`)
    console.log('      the staff group — where the bot takes commands\n')
  } else {
    console.log('  TELEGRAM_CHAT_ID=?')
    console.log(`      no group seen yet — type /start@${username} in it, then re-run\n`)
  }

  if (channels.length === 1) {
    const ch = channels[0]
    console.log(`  TELEGRAM_CHANNEL_ID=${ch.id}`)
    console.log(`      ${ch.title ?? 'the client channel'} — where clients read\n`)
  } else if (channels.length > 1) {
    console.log('  TELEGRAM_CHANNEL_ID=?   more than one channel seen; pick deliberately:')
    for (const c of channels) console.log(`      ${String(c.id).padEnd(16)} ${c.title ?? '(no title)'}`)
    console.log()
  } else {
    console.log('  TELEGRAM_CHANNEL_ID=?')
    console.log('      no channel seen yet. Add the bot as a channel admin with')
    console.log('      "Post messages", post anything in the channel, then re-run.\n')
  }

  if (groups.length > 1) {
    console.log('Several groups found — all of their ids are listed above, comma-separated.\n')
  }
}

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if (!token) {
    console.error('\nTELEGRAM_BOT_TOKEN is not set in marketing/.env.\n')
    process.exit(1)
  }

  const me = await tg<{ username: string }>(token, 'getMe')
  if (!me.ok) {
    console.error(`\nToken rejected: ${me.description}\n`)
    process.exit(1)
  }
  console.log(`\nBot: @${me.result.username}\n`)

  const res = await tg<Record<string, unknown>[]>(token, 'getUpdates')
  if (!res.ok) {
    console.error(`getUpdates failed: ${res.description}`)
    if (String(res.description).includes('webhook')) {
      console.error('A webhook is set, so polling returns nothing. Clear it with:')
      console.error(`  curl "https://api.telegram.org/bot<TOKEN>/deleteWebhook"`)
    }
    process.exit(1)
  }

  const seen = new Map<number, TgChat>()
  for (const update of res.result) {
    for (const chat of chatsIn(update)) seen.set(chat.id, chat)
  }

  const username = me.result.username
  if (seen.size === 0) {
    console.log('No chats seen yet.\n')
    // With group privacy ON (the default, and what we want) the bot only ever
    // receives commands — a plain message in the group is invisible to it.
    console.log('Most likely the bot is running and has already consumed them —')
    console.log('long polling drains getUpdates, so this sees nothing. Stop it first:')
    console.log('\n  pkill -f marketing/bot.ts\n')
    console.log(`Then type /start@${username} in the group, or post in the channel,`)
    console.log('and run this again. A plain group message will not work: group privacy')
    console.log('means the bot only sees commands. Telegram holds updates ~24 hours.\n')
    return
  }

  console.log('Chats this bot has seen:\n')
  for (const chat of seen.values()) {
    const name = chat.title ?? chat.username ?? chat.first_name ?? '(no title)'
    console.log(`  ${String(chat.id).padEnd(16)} ${chat.type.padEnd(10)} ${name}`)
  }

  report(seen, me.result.username)
}

// Only run when invoked directly, so report() can be imported and exercised.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`\nfailed: ${e instanceof Error ? e.message : String(e)}\n`)
    process.exit(1)
  })
}

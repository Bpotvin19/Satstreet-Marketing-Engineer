#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   Check the channel wiring before anything real goes out.

     npm run marketing:broadcast              report only
     npm run marketing:broadcast -- --send    post a short test message

   Without --send this touches nothing: it reads the channel, confirms the bot
   can post there, and prints the audience size. Run it after adding the bot as
   a channel admin, so the first real broadcast is not also the first test.
   ────────────────────────────────────────────────────────────────────────── */

import * as broadcast from './broadcast'

const send = process.argv.includes('--send')

function line(label: string, value: string) {
  console.log(`  ${label.padEnd(22)} ${value}`)
}

async function main() {
  console.log('\nSatstreet broadcast check\n')

  const id = broadcast.channelId()
  line('TELEGRAM_BOT_TOKEN', process.env.TELEGRAM_BOT_TOKEN?.trim() ? 'set' : 'MISSING')
  line('TELEGRAM_CHANNEL_ID', id ?? 'MISSING')

  if (!broadcast.isConfigured()) {
    console.log(
      '\nThe Publish button will not appear until both are set.\n' +
        'Add TELEGRAM_CHANNEL_ID to marketing/.env, then run this again.\n',
    )
    process.exit(1)
  }

  const a = await broadcast.audience()
  line('channel', a.title ?? 'unreadable — is the bot an admin?')
  line('subscribers', a.count === null ? 'unknown' : String(a.count))

  if (a.title === null) {
    console.log(
      '\nThe bot cannot read the channel. Add it as an administrator with\n' +
        '"Post messages" enabled, then run this again.\n',
    )
    process.exit(1)
  }

  const today = broadcast.sentToday()
  line('published today', String(today.length))
  for (const s of today) console.log(`      · ${s.title} — by ${s.sentBy}`)

  if (!send) {
    const probe = await broadcast.post(
      '<b>Satstreet</b>\nChannel test — no action needed.',
      true, // dry run
    )
    console.log(`\nDry run: ${probe.ok ? 'message would send cleanly' : `would fail — ${probe.error}`}`)
    console.log('\nRe-run with --send to post a real test message.\n')
    return
  }

  const res = await broadcast.post(
    '<b>Satstreet</b>\nChannel test — no action needed. This message can be deleted.',
  )
  if (!res.ok) {
    console.log(`\nSend failed: ${res.error}\n`)
    process.exit(1)
  }
  console.log(`\nSent. Delete it in the channel, or note message id ${res.messageId}.\n`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})

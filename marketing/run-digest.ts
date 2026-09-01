#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   The client market brief.

     npm run marketing:digest
     npm run marketing:digest -- --dry-run    # build, print, send nothing
     npm run marketing:digest -- --hours 48   # widen the window

   Posts to the team group with a Publish button. It does not publish to the
   client channel on its own, and that is the point: a brief that goes out
   unread is a brief nobody is accountable for. Cron proposes, a person sends.

   Runs as its own process so cron can drive it. The bot must also be running
   for the Publish button to do anything — this posts, the bot answers. Staging
   is on disk, so the two processes see the same pending post.
   ────────────────────────────────────────────────────────────────────────── */

import { Bot } from 'grammy'
import { buildDigest, stageDigest } from './digest'
import { isBlocked } from './compliance'
import * as broadcast from './broadcast'
import {
  renderDigestForChannel, renderDigestForReview, digestKeyboard, chunk,
} from './telegram-render'

const DRY = process.argv.includes('--dry-run')

function hoursArg(): number {
  const i = process.argv.indexOf('--hours')
  const n = i >= 0 ? Number(process.argv[i + 1]) : NaN
  return Number.isFinite(n) ? Math.min(72, Math.max(6, n)) : 24
}

async function main() {
  const hours = hoursArg()
  const r = await buildDigest(hours)

  console.error(
    `[digest] ${r.digest.items.length} of ${r.candidateCount} candidates · ` +
      `sources: ${r.sourcesOk.join(', ')}` +
      (r.sourcesFailed.length ? ` · unavailable: ${r.sourcesFailed.join(', ')}` : ''),
  )

  const blocked = isBlocked(r.violations)
  if (blocked) console.error('[digest] BLOCKED by compliance — will not offer publishing')

  if (DRY) {
    console.log(renderDigestForChannel(r.digest))
    console.log('\n[digest] dry run — nothing sent')
    return
  }

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  const chats = (process.env.TELEGRAM_CHAT_ID ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (!token || chats.length === 0) {
    throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must both be set.')
  }

  const api = new Bot(token).api
  const review = renderDigestForReview(r)

  for (const chatId of chats) {
    // Only offer buttons when there is somewhere to send and nothing blocking.
    let markup
    if (!blocked && broadcast.isConfigured()) {
      const staged = stageDigest(r.digest, Number(chatId), 'scheduled')
      markup = digestKeyboard(staged.itemIds, staged.allId)
    }

    const parts = chunk(review)
    for (const [i, part] of parts.entries()) {
      await api.sendMessage(chatId, part, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        ...(i === parts.length - 1 && markup ? { reply_markup: markup } : {}),
      })
    }
    console.log(`[digest] posted to ${chatId}`)
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})

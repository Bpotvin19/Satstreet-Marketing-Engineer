#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   The Telegram bot.

     npm run marketing:bot

   Long polling, so no public URL is needed. For a webhook deployment, swap
   bot.start() for grammY's webhookCallback — everything above it is unchanged.

   The morning post is a separate entry point (run-morning.ts) so it can be
   driven by the same cron that runs the client brief. This process handles
   commands and button presses.
   ────────────────────────────────────────────────────────────────────────── */

import { Bot, InlineKeyboard, InputFile, type Context } from 'grammy'
import { loadCalendar, withinWindow } from './calendar'
import { RefusalError } from './claude'
import { type Opportunity, type Draft } from './types'
import { generatePlan } from './planner'
import { weeklyMix } from './weekly'
import { recentPosts, logPublished } from './published'
import { refreshReference, listPages, findPage } from './reference'
import { children, blocksToText, pageFiles } from './notion'
import {
  draftPost, rewrite, ideas, draftInVoice, draftTopic, tweets, rewriteCard, TWEET_LIMIT,
  type RewriteMode,
} from './draft'
import { needsReview, findCard, killCard, readyCard, type QueueCard } from './queue'
import * as desk from './desk'
import { refreshVoices, listVoices, findVoice, readVoice, voiceLabel, voicesCached } from './voices'
import { checkDraft, isBlocked } from './compliance'
import * as compose from './compose'
import {
  getFreshPlan, setPlan, putDraft, getDraft, getLastDraft, recordApproval,
} from './store'
import {
  renderPlan, planKeyboard, renderDraft, draftKeyboard, renderVariants, renderIdeas,
  renderCalendar, renderWeekly, renderPublished, renderVoiceDraft, renderReminderSchedule, renderSpot,
  renderQueue, renderCard, renderCardDraft,
  chartKeyboard, chunk, esc, HELP,
  renderChannelPost, publishKeyboard, confirmPublishKeyboard,
  renderPublishPreview, renderSent, renderDigestForReview, digestKeyboard, renderTweets,
} from './telegram-render'
import { upcoming } from './reminders'
import { fetchSpot, lookupSpot, UnknownAssetError, RateLimitError } from './price'
import { findRange, DEFAULT_RANGE } from './coinbase'
import { tradingViewChart, isConfigured } from './chartimg'
import * as broadcast from './broadcast'
import * as access from './access'
import { buildDigest, stageDigest } from './digest'

/* ── access ───────────────────────────────────────────────────────────────────
   Two gates, in marketing/access.ts: the chat must be allowlisted AND the
   person must be on the team list. Group membership is not employment — a
   chat-only gate handed the whole bot to anyone who got added to the group.
   ────────────────────────────────────────────────────────────────────────── */

export const ACCESS = access.load()

/** Kept for other entry points that check the chat allowlist. */
export const ALLOWED = ACCESS.chats

export const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN?.trim() || 'unset')

bot.use(async (ctx, next) => {
  const chatId = ctx.chat?.id ?? ctx.callbackQuery?.message?.chat.id
  const userId = ctx.from?.id
  const text = ctx.message?.text
  const what = text ?? (ctx.callbackQuery ? 'button' : Object.keys(ctx.update)[1])

  // Group administrators are resolved live (and cached ~60s), so promoting or
  // demoting someone in Telegram is what grants or removes access.
  const users = await access.effectiveUsers(ACCESS, (id) =>
    bot.api.getChatAdministrators(id).then((as) =>
      as.filter((m) => !m.user.is_bot).map((m) => String(m.user.id)),
    ),
  )

  const verdict = access.check(
    ACCESS,
    { chatId, userId, command: access.commandOf(text) },
    users,
  )

  if (!verdict.allow) {
    // A refusal that vanishes is impossible to diagnose from the outside, so
    // it is logged with enough detail to act on — and answered, so the person
    // knows they were refused rather than that the bot is broken.
    console.warn(
      `[access] refused (${verdict.reason}) chat=${chatId ?? '?'} user=${userId ?? '?'} ` +
        `@${ctx.from?.username ?? '?'} · ${what}`,
    )
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: verdict.message })
    // Only answer in a chat we recognise. An unknown chat gets silence, so the
    // bot cannot be probed for which groups it belongs to.
    else if (verdict.reason !== 'chat') await ctx.reply(verdict.message)
    return
  }

  console.log(`[bot] ${chatId} · @${ctx.from?.username ?? userId} · ${what}`)
  await next()
})

/* Added to a group: say who can drive it, so the rest of the room is not left
   wondering why it ignores them. */
bot.on('my_chat_member', async (ctx) => {
  const status = ctx.myChatMember.new_chat_member.status
  if (status !== 'member' && status !== 'administrator') return

  const chatId = ctx.chat.id
  console.log(`[access] added to ${chatId} (${ctx.chat.type}) by @${ctx.from?.username ?? ctx.from?.id}`)

  if (ACCESS.mode === 'enrolment') {
    await ctx.reply(
      'Satstreet marketing bot. No authorised users are configured yet, so it is ' +
        'locked — send /whoami and add the id to TELEGRAM_USER_IDS.',
    )
    return
  }
  if (ACCESS.restrictChats && !ACCESS.chats.has(String(chatId))) {
    await ctx.reply(
      'Satstreet marketing bot. This chat is not on its allowlist, so it will not ' +
        `respond here. Chat id: ${chatId}`,
    )
    return
  }
  await ctx.reply(
    'Satstreet marketing bot is here. Only authorised Satstreet users can run its ' +
      'commands — everyone else it will politely refuse. Send /help to see what it does.',
  )
})

/* A basic group upgraded to a supergroup gets a brand-new id, and the old one
   stops matching. Telegram announces it once — catch it and say what to change. */
bot.on('message:migrate_to_chat_id', (ctx) => {
  console.warn(
    `[bot] this group migrated to a supergroup. Update marketing/.env:\n` +
      `      TELEGRAM_CHAT_ID=${ctx.message.migrate_to_chat_id}`,
  )
})

/* ── helpers ──────────────────────────────────────────────────────────────── */

const today = () => new Date().toISOString().slice(0, 10)

async function send(ctx: Context, html: string, extra: Record<string, unknown> = {}) {
  const parts = chunk(html)
  for (const [i, part] of parts.entries()) {
    // Buttons ride on the final part so they sit at the bottom of the thread.
    await ctx.reply(part, {
      parse_mode: 'HTML',
      ...(i === parts.length - 1 ? extra : {}),
    })
  }
}

async function fail(ctx: Context, e: unknown) {
  const msg =
    e instanceof RefusalError
      ? `The model declined that request: ${e.message}`
      : e instanceof Error
        ? e.message
        : String(e)
  console.error('[bot]', msg)
  await ctx.reply(`Something went wrong.\n\n<code>${esc(msg)}</code>`, { parse_mode: 'HTML' })
}

/** Resolve an opportunity by rank against the chat's current plan. */
function opportunityFor(chatId: number, rank: number): Opportunity | undefined {
  return getFreshPlan(chatId, today())?.opportunities.find((o) => o.rank === rank)
}

function parseRank(text: string | undefined): number | null {
  const n = Number((text ?? '').trim().split(/\s+/)[0])
  return Number.isInteger(n) && n >= 1 && n <= 3 ? n : null
}

async function deliverDraft(
  ctx: Context,
  chatId: number,
  rank: number,
  channel: 'X' | 'LinkedIn',
) {
  const opp = opportunityFor(chatId, rank)
  if (!opp) {
    await ctx.reply("I don't have today's plan yet — run /today first.")
    return
  }

  await ctx.replyWithChatAction('typing')
  const draft = await draftPost(opp, channel)
  const violations = checkDraft(draft)
  putDraft(chatId, channel, rank, draft)

  await send(ctx, renderDraft(draft, opp, violations), {
    reply_markup: draftKeyboard(channel, rank, isBlocked(violations)),
  })
}


/**
 * Everything that happens after an approval, shared by both approval paths so
 * they cannot drift.
 *
 * When a channel is configured this stages the copy and offers a Publish
 * button. Note the closing line changes: the bot used to promise "Nothing goes
 * out from here", and once a Publish button exists that promise is false. It
 * is not worth keeping a reassuring sentence that has stopped being true.
 */
async function afterApproval(
  ctx: Context,
  opts: { draft: Draft; title: string; channel: string; by: string; logged: { backend: string; error?: string } },
): Promise<void> {
  const { draft, title, channel, by, logged } = opts

  const refresh = draft.needs_refresh.length
    ? `\n\nBefore posting, refresh: ${esc(draft.needs_refresh.join(', '))}`
    : ''
  const where = logged.error
    ? `\n\n⚠️ Notion write failed, kept locally: <code>${esc(logged.error)}</code>`
    : logged.backend === 'notion'
      ? '\n\nRecorded in Notion.'
      : ''

  if (!broadcast.isConfigured()) {
    await ctx.reply(
      `✅ Approved by ${esc(by)} — logged.\n\nCopy the draft above and post it to ${esc(channel)}. ` +
        `Nothing goes out from here.${refresh}${where}`,
      { parse_mode: 'HTML' },
    )
    return
  }

  const id = broadcast.stage({
    chatId: ctx.chat!.id,
    text: renderChannelPost(draft),
    draft,
    title,
    approvedBy: by,
  })

  await ctx.reply(
    `✅ Approved by ${esc(by)} — logged.\n\nCopy it to ${esc(channel)} by hand, or publish it to the ` +
      `Satstreet channel below.${refresh}${where}`,
    { parse_mode: 'HTML', reply_markup: publishKeyboard(id) },
  )
}

/* ── commands ─────────────────────────────────────────────────────────────── */


/**
 * /whoami — the one command that works before anyone is enrolled.
 *
 * Telegram never shows a person their own numeric id, so without this there
 * is no way to populate the team list except by reading raw update JSON.
 */
bot.command('whoami', async (ctx) => {
  const id = ctx.from?.id
  const live = await access.effectiveUsers(ACCESS, (g) =>
    bot.api.getChatAdministrators(g).then((as) =>
      as.filter((m) => !m.user.is_bot).map((m) => String(m.user.id)),
    ),
  )
  const enrolled = id !== undefined && live.has(String(id))
  const status =
    ACCESS.mode === 'enrolment'
      ? '\n\n<i>The bot is locked until TELEGRAM_USER_IDS is set.</i>'
      : enrolled
        ? '\n\n✅ You can use this bot.'
        : ACCESS.adminGroup
          ? '\n\n⛔ You cannot use this bot. Access follows the administrators of the ' +
            'Satstreet group — ask to be made an admin there.'
          : '\n\n⛔ You are <b>not</b> on the team list — ask an admin to add this id.'

  await ctx.reply(
    `<b>Your Telegram user id</b>\n<code>${id ?? 'unknown'}</code>\n` +
      `@${esc(ctx.from?.username ?? 'no username')}${status}`,
    { parse_mode: 'HTML' },
  )
})

bot.command(['start', 'help'], (ctx) => ctx.reply(HELP, { parse_mode: 'HTML' }))

bot.command('today', async (ctx) => {
  try {
    const chatId = ctx.chat.id
    const cached = getFreshPlan(chatId, today())
    if (cached) {
      await send(ctx, renderPlan(cached), { reply_markup: planKeyboard(cached) })
      return
    }
    await ctx.replyWithChatAction('typing')
    const { plan, logError } = await generatePlan(chatId)
    setPlan(chatId, plan)
    await send(ctx, renderPlan(plan), { reply_markup: planKeyboard(plan) })
    if (logError) {
      await ctx.reply(
        `⚠️ Published log unreadable, so repetition checks used local state only.\n<code>${esc(logError)}</code>`,
        { parse_mode: 'HTML' },
      )
    }
  } catch (e) {
    await fail(ctx, e)
  }
})

/**
 * /price and /chart are the same response: the numbers, a rendered
 * TradingView chart when CHART_IMG_API_KEY is set, and buttons through to the
 * live interactive charts either way.
 *
 * A range token can appear anywhere in the arguments, so "/chart 30d ondo"
 * and "/chart ondo finance 30d" both work — the rest is the asset name. The
 * range sets both the rendered interval and TradingView's opening zoom.
 */
async function respondPrice(ctx: Context, raw: string): Promise<void> {
  let range = DEFAULT_RANGE
  const words: string[] = []
  for (const tok of raw.split(/\s+/).filter(Boolean)) {
    const r = findRange(tok)
    if (r) range = r
    else words.push(tok)
  }
  const q = words.join(' ').trim()

  if (!q) {
    await send(ctx, renderSpot(await fetchSpot()))
    return
  }

  const result = await lookupSpot(q)
  const asset = result.assets[0]
  const keyboard = asset ? chartKeyboard(asset, range) : undefined
  const caption = renderSpot(result)

  // A rendered TradingView chart when one is available, the text reply when
  // not. The buttons ride along either way, so losing the image costs the
  // look of the answer and never the answer itself.
  if (asset?.listedOnCoinbase && isConfigured()) {
    const png = await tradingViewChart(`COINBASE:${asset.symbol}USD`, range.imgInterval)
    if (png) {
      await ctx.replyWithPhoto(new InputFile(png, `${asset.symbol}-${range.key}.png`), {
        caption,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      })
      return
    }
  }

  await send(ctx, caption, keyboard ? { reply_markup: keyboard } : {})
}

const priceHandler = async (ctx: Context) => {
  try {
    await respondPrice(ctx, (ctx.match ?? '').toString().trim())
  } catch (e) {
    if (e instanceof UnknownAssetError) {
      const scope = e.listed ? ` All ${e.listed} Coinbase USD markets are covered.` : ''
      await ctx.reply(
        `No asset matches "${e.query}". Try the ticker — /price hype — ` +
          `or the full name, /price hyperliquid.${scope}`,
      )
      return
    }
    if (e instanceof RateLimitError) {
      await ctx.reply('Price feed is rate-limited right now. Try again in a minute.')
      return
    }
    await fail(ctx, e)
  }
}

bot.command('price', priceHandler)
bot.command('chart', priceHandler)

bot.command('calendar', async (ctx) => {
  try {
    const cal = await loadCalendar()
    if (!cal.available) {
      await ctx.reply(`Calendar unavailable: ${cal.reason}`)
      return
    }
    await send(ctx, renderCalendar(withinWindow(cal.entries, new Date())))
  } catch (e) {
    await fail(ctx, e)
  }
})

for (const [cmd, forced] of [
  ['draft', null],
  ['x', 'X'],
  ['linkedin', 'LinkedIn'],
] as const) {
  bot.command(cmd, async (ctx) => {
    try {
      const rank = parseRank(ctx.match)
      if (rank === null) {
        // /draft is the News Desk's "here's an idea" door as well as the daily
        // plan's "draft number two". A number means the plan; words mean an
        // idea, held in chat only — the desk's instructions are explicit that
        // the bot does not invent Content Queue rows.
        const words = (ctx.match ?? '').toString().trim()
        if (cmd === 'draft' && words) {
          desk.openIdea(ctx.chat.id, words)
          await ctx.reply(
            `<b>${esc(words)}</b>\n\n<i>Idea held in chat — nothing written to Notion.</i>\n\nWhose voice?`,
            { parse_mode: 'HTML', reply_markup: cardKeyboard() },
          )
          return
        }
        await ctx.reply(`Which one? Try <code>/${cmd} 1</code>`, { parse_mode: 'HTML' })
        return
      }
      const opp = opportunityFor(ctx.chat.id, rank)
      if (!opp) {
        await ctx.reply("I don't have today's plan yet — run /today first.")
        return
      }
      // /draft follows the plan's recommendation; "Both" defaults to X, which
      // is the cheaper post to adapt into a LinkedIn version afterwards.
      const channel: 'X' | 'LinkedIn' =
        forced ?? (opp.channel === 'LinkedIn' ? 'LinkedIn' : 'X')
      await deliverDraft(ctx, ctx.chat.id, rank, channel)
    } catch (e) {
      await fail(ctx, e)
    }
  })
}

bot.command('rewrite', async (ctx) => {
  try {
    const last = getLastDraft(ctx.chat.id)
    if (!last) {
      await ctx.reply('Nothing to rewrite yet — draft something first.')
      return
    }
    await ctx.replyWithChatAction('typing')
    const note = (ctx.match ?? '').trim() || undefined
    await send(ctx, renderVariants(await rewrite(last, note)))
  } catch (e) {
    await fail(ctx, e)
  }
})

bot.command('weekly', async (ctx) => {
  try {
    const cal = await loadCalendar()
    if (!cal.available) {
      await ctx.reply(`Calendar unavailable: ${cal.reason}`)
      return
    }
    await ctx.replyWithChatAction('typing')
    const recent = await recentPosts(ctx.chat.id)
    const mix = await weeklyMix(cal.entries, { tracked: recent.tracked, posts: recent.posts })
    await send(ctx, renderWeekly(mix))
  } catch (e) {
    await fail(ctx, e)
  }
})

/* ── /post — the guided flow ───────────────────────────────────────────────
   Topic → voice → channel → draft, every step after the topic a button.
   ────────────────────────────────────────────────────────────────────────── */

const TOPIC_PROMPT = 'What should the post be about? Reply to this message.'

/** The document headings are inconsistently cased — "JON LISTER", "Michael
    Nasser" — so button labels are normalised rather than shown as written. */
const firstName = (full: string) => {
  const w = full.trim().split(/\s+/)[0]
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
}

function voiceKeyboard(id: string): InlineKeyboard {
  const kb = new InlineKeyboard()
  for (const v of listVoices()) {
    kb.text(firstName(v.name), `pv:${id}:${v.slug}`)
  }
  return kb.row().text('Satstreet house voice', `pv:${id}:house`)
}

const channelKeyboard = (id: string) =>
  new InlineKeyboard().text('X', `pc:${id}:X`).text('LinkedIn', `pc:${id}:LinkedIn`)

const afterDraftKeyboard = (id: string, channel: string, blocked: boolean) => {
  const kb = new InlineKeyboard()
  if (!blocked) kb.text('✅ Approve', `pa:${id}`)
  kb.text('🔁 Rewrite', `pr:${id}`)
  kb.text(`↪ ${channel === 'X' ? 'LinkedIn' : 'X'}`, `po:${id}`)
  return kb
}

async function askVoice(ctx: Context, c: { id: string; topic: string }) {
  await ctx.reply(`<b>${esc(c.topic)}</b>\n\nWhose voice?`, {
    parse_mode: 'HTML',
    reply_markup: voiceKeyboard(c.id),
  })
}

async function produce(ctx: Context, id: string) {
  const c = compose.get(id)
  if (!c || !c.channel) {
    await ctx.reply('That draft request expired — start again with /post.')
    return
  }

  await ctx.replyWithChatAction('typing')
  // Resolved rather than taken from the stored label: draftInVoice needs the
  // kind, and writing as a founder is not the same instruction as borrowing an
  // external style.
  const v = c.voice && c.voice !== 'house' ? listVoices().find((x) => x.slug === c.voice) : undefined
  const draft = v
    ? await draftInVoice(c.topic, { name: v.name, profile: readVoice(v.slug), kind: v.kind }, c.channel)
    : await draftTopic(c.topic, c.channel)

  compose.update(id, { draft })
  const blocked = isBlocked(checkDraft(draft))
  await send(ctx, renderVoiceDraft(draft, c.voiceLabel ?? 'Satstreet', c.topic), {
    reply_markup: afterDraftKeyboard(id, c.channel, blocked),
  })
}

bot.command('post', async (ctx) => {
  try {
    if (!(await ensureVoices(ctx))) return
    const topic = (ctx.match ?? '').trim()
    const userId = ctx.from?.id
    if (!userId) return

    if (topic) {
      await askVoice(ctx, compose.start(ctx.chat.id, userId, topic))
      return
    }

    // No topic given: prompt for one and wait for the reply.
    const sent = await ctx.reply(TOPIC_PROMPT, {
      reply_markup: { force_reply: true, selective: true, input_field_placeholder: 'e.g. self-custody vs institutional custody' },
    })
    compose.awaitTopic(ctx.chat.id, userId, sent.message_id)
  } catch (e) {
    await fail(ctx, e)
  }
})

// The reply to that prompt. Group privacy keeps this to replies addressed to
// the bot, so ordinary chatter never reaches here.
bot.on('message:text', async (ctx, next) => {
  const userId = ctx.from?.id
  const repliedToBot = ctx.message.reply_to_message?.from?.id === ctx.me.id
  if (!userId || !repliedToBot || ctx.message.text.startsWith('/')) return next()
  if (!compose.takePending(ctx.chat.id, userId)) return next()

  try {
    await askVoice(ctx, compose.start(ctx.chat.id, userId, ctx.message.text.trim()))
  } catch (e) {
    await fail(ctx, e)
  }
})

bot.callbackQuery(/^pv:([a-z0-9]+):([a-z]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery()
  try {
    const [, id, slug] = ctx.match as unknown as [string, string, string]
    const picked = slug === 'house' ? undefined : listVoices().find((v) => v.slug === slug)
    const label = picked ? voiceLabel(picked) : undefined
    const c = compose.update(id, { voice: slug, voiceLabel: label })
    if (!c) {
      await ctx.reply('That request expired — start again with /post.')
      return
    }
    await ctx.reply(`<b>${esc(c.topic)}</b>\n${esc(label ?? 'Satstreet house voice')}\n\nWhich channel?`, {
      parse_mode: 'HTML',
      reply_markup: channelKeyboard(id),
    })
  } catch (e) {
    await fail(ctx, e)
  }
})

bot.callbackQuery(/^pc:([a-z0-9]+):(X|LinkedIn)$/, async (ctx) => {
  await ctx.answerCallbackQuery()
  try {
    const [, id, channel] = ctx.match as unknown as [string, string, 'X' | 'LinkedIn']
    compose.update(id, { channel })
    await produce(ctx, id)
  } catch (e) {
    await fail(ctx, e)
  }
})

bot.callbackQuery(/^po:([a-z0-9]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery()
  try {
    const [, id] = ctx.match as unknown as [string, string]
    const c = compose.get(id)
    if (!c) {
      await ctx.reply('That request expired — start again with /post.')
      return
    }
    compose.update(id, { channel: c.channel === 'X' ? 'LinkedIn' : 'X' })
    await produce(ctx, id)
  } catch (e) {
    await fail(ctx, e)
  }
})

bot.callbackQuery(/^pr:([a-z0-9]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery()
  try {
    const [, id] = ctx.match as unknown as [string, string]
    const c = compose.get(id)
    if (!c?.draft) {
      await ctx.reply('That draft expired — start again with /post.')
      return
    }
    await ctx.replyWithChatAction('typing')
    await send(ctx, renderVariants(await rewrite(c.draft)))
  } catch (e) {
    await fail(ctx, e)
  }
})

bot.callbackQuery(/^pa:([a-z0-9]+)$/, async (ctx) => {
  try {
    const [, id] = ctx.match as unknown as [string, string]
    const c = compose.get(id)
    if (!c?.draft) {
      await ctx.answerCallbackQuery({ text: 'That draft expired.' })
      return
    }
    if (isBlocked(checkDraft(c.draft))) {
      await ctx.answerCallbackQuery({ text: 'Still blocked — rewrite it first.' })
      return
    }

    const by = ctx.from?.username ?? ctx.from?.first_name ?? String(ctx.from?.id ?? 'unknown')
    const title = `${c.topic}${c.voiceLabel ? ` (${c.voiceLabel})` : ''}`
    recordApproval(ctx.chat!.id, {
      at: new Date().toISOString(), by, channel: c.draft.channel, rank: 0, body: c.draft.body, title,
    })
    const logged = await logPublished({
      date: new Date().toISOString().slice(0, 10),
      channel: c.draft.channel, title, body: c.draft.body, approvedBy: by,
    })

    await ctx.answerCallbackQuery({ text: 'Logged.' })
    await afterApproval(ctx, {
      draft: c.draft, title, channel: c.draft.channel, by, logged,
    })
  } catch (e) {
    await fail(ctx, e)
  }
})

/** Channel is a trailing "on x" / "on linkedin"; default X. */
export function splitChannel(text: string): { topic: string; channel: 'X' | 'LinkedIn' } {
  const m = text.match(/\s+(?:on\s+)?(x|twitter|linkedin|li)\s*$/i)
  if (!m) return { topic: text.trim(), channel: 'X' }
  const c = m[1].toLowerCase()
  return {
    topic: text.slice(0, m.index).trim(),
    channel: c === 'linkedin' || c === 'li' ? 'LinkedIn' : 'X',
  }
}

async function ensureVoices(ctx: Context): Promise<boolean> {
  if (voicesCached()) return true
  await ctx.reply('Loading the voice profiles from Notion…')
  const r = await refreshVoices()
  if (r.error || r.profiles.length === 0) {
    // The external style guides live in the repo, not in Notion. If they are
    // there, the command still works — with fewer voices, which is better than
    // refusing outright because Notion is down.
    if (listVoices().length > 0) {
      await ctx.reply(
        `Notion is unavailable (${esc(r.error ?? 'no profiles found')}) — the founder voices are missing, ` +
          'but the external styles still work.',
        { parse_mode: 'HTML' },
      )
      return true
    }
    await ctx.reply(`Could not load voice profiles: ${esc(r.error ?? 'none found')}`, { parse_mode: 'HTML' })
    return false
  }
  return true
}

bot.command('voice', async (ctx) => {
  try {
    if (!(await ensureVoices(ctx))) return
    const raw = (ctx.match ?? '').trim()
    const [who, ...rest] = raw.split(/\s+/)
    const voice = who ? findVoice(who) : undefined

    // "/voice jon" on its own means the open card, which is how the desk works
    // in the morning: /queue, /open, then a voice. A topic after the name is
    // the older behaviour and still stands.
    if (who && rest.length === 0 && (desk.held(ctx.chat.id)?.card || desk.held(ctx.chat.id)?.idea)) {
      await rewriteHeld(ctx, who)
      return
    }

    if (!voice || rest.length === 0) {
      const names = [...listVoices().map((v) => v.slug), 'satstreet'].join(', ')
      await ctx.reply(
        `Usage: <code>/voice mike custody options</code>\n\nAvailable: ${esc(names || 'none loaded')}` +
          `\nAdd <code>linkedin</code> at the end for LinkedIn.`,
        { parse_mode: 'HTML' },
      )
      return
    }

    const { topic, channel } = splitChannel(rest.join(' '))
    await ctx.replyWithChatAction('typing')
    const draft = await draftInVoice(
      topic,
      { name: voice.name, profile: readVoice(voice.slug), kind: voice.kind },
      channel,
    )
    await send(ctx, renderVoiceDraft(draft, voiceLabel(voice), topic))
  } catch (e) {
    await fail(ctx, e)
  }
})

bot.command('voices', async (ctx) => {
  try {
    if (!(await ensureVoices(ctx))) return
    const raw = (ctx.match ?? '').trim()
    if (!raw) {
      await ctx.reply('What topic? Try <code>/voices self-custody</code>', { parse_mode: 'HTML' })
      return
    }

    const { topic, channel } = splitChannel(raw)
    const all = listVoices()
    await ctx.reply(
      `Drafting "${esc(topic)}" for ${esc(channel)} in ${all.length} voices — about a minute.`,
      { parse_mode: 'HTML' },
    )
    await ctx.replyWithChatAction('typing')

    // In parallel: they share the cached system prompt, so three drafts cost
    // roughly one prompt plus three profiles.
    const results = await Promise.allSettled(
      all.map((v) =>
        draftInVoice(topic, { name: v.name, profile: readVoice(v.slug), kind: v.kind }, channel),
      ),
    )

    for (const [i, r] of results.entries()) {
      if (r.status === 'fulfilled') await send(ctx, renderVoiceDraft(r.value, voiceLabel(all[i]), topic))
      else await ctx.reply(`${voiceLabel(all[i])}: failed — ${esc(String(r.reason?.message ?? r.reason))}`, { parse_mode: 'HTML' })
    }
  } catch (e) {
    await fail(ctx, e)
  }
})

/* ── the Founder News Desk ────────────────────────────────────────────────
   Grok harvests overnight into the Notion Content Queue. This bot rewrites a
   card in a founder's voice. A human publishes. Nothing here posts anything
   anywhere, and nothing here sets Approval = Approved.

     /queue   what is waiting
     /open    one card, then a keyboard of voices
     /voice   rewrite the open card in one voice
     /why     one line: mechanism, voice, what is forbidden
     /kill    Approval → Changes Requested, with who did it
     /ready   Status → In progress. Approval stays where it is.
   ────────────────────────────────────────────────────────────────────────── */

/** The desk names voices its own way: "mike", "satstreet", and Ben who has no
    profile written yet. Everything else falls through to the usual resolver. */
const DESK_VOICES: Record<string, string> = {
  satstreet: 'house',
  house: 'house',
  mike: 'michael',
}

interface ResolvedVoice {
  slug: string
  name: string
  profile: string
  kind: 'person' | 'style' | 'house'
}

function deskVoice(query: string): ResolvedVoice | { error: string } {
  const q = query.trim().toLowerCase()
  const mapped = DESK_VOICES[q] ?? q

  if (mapped === 'house') {
    return { slug: 'house', name: 'Satstreet', profile: '', kind: 'house' }
  }

  const v = findVoice(mapped)
  if (!v) {
    const known = [...listVoices().map((x) => x.slug), 'satstreet'].join(', ')
    return {
      error:
        `No voice profile for "${query.trim()}". Available: ${known}.` +
        (q === 'ben'
          ? '\n\nBen is an option on the Content Queue but has no voice page in Notion yet — write one and /refresh, or use another voice.'
          : ''),
    }
  }
  return { slug: v.slug, name: v.name, profile: readVoice(v.slug), kind: v.kind }
}

const cardKeyboard = () =>
  new InlineKeyboard()
    .text('Mike', 'nd:v:mike')
    .text('Jon', 'nd:v:jon')
    .text('George', 'nd:v:george')
    .row()
    .text('Satstreet', 'nd:v:satstreet')
    .text('Robustus', 'nd:v:robustus')
    .row()
    .text('✖ Kill', 'nd:k')

const deskDraftKeyboard = () =>
  new InlineKeyboard()
    .text('✂ Shorten', 'nd:s')
    .text('in LinkedIn', 'nd:l')
    .row()
    .text('✅ Ready', 'nd:r')
    .text('✖ Kill', 'nd:k')

bot.command('queue', async (ctx) => {
  try {
    await ctx.replyWithChatAction('typing')
    await send(ctx, renderQueue(await needsReview(8)))
  } catch (e) {
    await fail(ctx, e)
  }
})

bot.command('open', async (ctx) => {
  try {
    const q = (ctx.match ?? '').toString().trim()
    if (!q) {
      await ctx.reply('Which card? <code>/open 668f</code> or <code>/open boc</code> — /queue lists them.', {
        parse_mode: 'HTML',
      })
      return
    }

    await ctx.replyWithChatAction('typing')
    const card = await findCard(q)
    if (!card) {
      await ctx.reply(`Nothing in the queue matches "${esc(q)}". Try /queue.`, { parse_mode: 'HTML' })
      return
    }

    desk.open(ctx.chat!.id, card)
    await send(ctx, renderCard(card), { reply_markup: cardKeyboard() })
  } catch (e) {
    await fail(ctx, e)
  }
})

/** The rewrite itself, shared by the buttons and by /voice with no topic. */
async function rewriteHeld(ctx: Context, voiceQuery: string, mode: RewriteMode = 'rewrite') {
  const chatId = ctx.chat!.id
  const h = desk.held(chatId)
  if (!h?.card && !h?.idea) {
    await ctx.reply('Nothing open. /queue then /open <card>, or /draft <headline>.')
    return
  }

  const resolved = deskVoice(voiceQuery || h.voiceSlug || 'satstreet')
  if ('error' in resolved) {
    await ctx.reply(esc(resolved.error), { parse_mode: 'HTML' })
    return
  }

  // An idea typed into /draft has no Notion row, so it is presented to the
  // model in the same shape as a card with only a title.
  const card: Pick<QueueCard, 'title' | 'draft' | 'notes' | 'source' | 'voice' | 'pillar' | 'risk'> =
    h.card ?? {
      title: h.idea!,
      draft: '',
      notes: '',
      source: '',
      voice: resolved.name,
      pillar: '',
      risk: 'Standard',
    }

  await ctx.replyWithChatAction('typing')
  const draft = await rewriteCard(card, resolved, mode)
  desk.hold(chatId, { draft, voiceSlug: resolved.slug, voiceLabel: resolved.name })
  await send(ctx, renderCardDraft(draft, card, resolved.name), { reply_markup: deskDraftKeyboard() })
}

bot.callbackQuery(/^nd:v:([a-z]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery()
  try {
    const [, slug] = ctx.match as unknown as [string, string]
    await rewriteHeld(ctx, slug)
  } catch (e) {
    await fail(ctx, e)
  }
})

bot.callbackQuery('nd:s', async (ctx) => {
  await ctx.answerCallbackQuery()
  try {
    await rewriteHeld(ctx, desk.held(ctx.chat!.id)?.voiceSlug ?? 'satstreet', 'shorten')
  } catch (e) {
    await fail(ctx, e)
  }
})

bot.callbackQuery('nd:l', async (ctx) => {
  await ctx.answerCallbackQuery()
  try {
    await rewriteHeld(ctx, desk.held(ctx.chat!.id)?.voiceSlug ?? 'satstreet', 'linkedin')
  } catch (e) {
    await fail(ctx, e)
  }
})

bot.command('why', async (ctx) => {
  const h = desk.held(ctx.chat!.id)
  if (!h?.draft) {
    await ctx.reply('No draft open. /open a card and pick a voice first.')
    return
  }
  await ctx.reply(`<i>${esc(h.draft.why)}</i>`, { parse_mode: 'HTML' })
})

/**
 * /ready — Status moves, Approval does not.
 *
 * The desk's instruction is explicit that the bot never marks its own work
 * approved, so this says "ready for the Approval Queue" and leaves the
 * decision with a person.
 */
bot.command('ready', async (ctx) => {
  try {
    const h = desk.held(ctx.chat!.id)
    if (!h?.card) {
      await ctx.reply('Nothing open from the queue. /open a card first.')
      return
    }
    if (!h.draft) {
      await ctx.reply('No rewrite yet — pick a voice before marking it ready.')
      return
    }
    if (isBlocked(checkDraft(h.draft))) {
      await ctx.reply('That draft is blocked on compliance. Rewrite it before marking it ready.')
      return
    }

    await readyCard(h.card)
    await ctx.reply(
      `<b>${esc(h.card.title)}</b> — Status set to In progress. Ready for the Approval Queue.\n\n` +
        '<i>Approval stays at Needs Review. A person sets that, not the bot.</i>',
      { parse_mode: 'HTML' },
    )
  } catch (e) {
    await fail(ctx, e)
  }
})

async function killHeld(ctx: Context) {
  const h = desk.held(ctx.chat!.id)
  if (!h?.card) {
    if (h?.idea) {
      desk.hold(ctx.chat!.id, { idea: undefined, draft: undefined })
      await ctx.reply('Dropped. It was never in Notion, so there is nothing to update.')
      return
    }
    await ctx.reply('Nothing open to kill.')
    return
  }

  const by = ctx.from?.username ?? ctx.from?.first_name ?? String(ctx.from?.id ?? 'unknown')
  await killCard(h.card, by)
  desk.hold(ctx.chat!.id, { draft: undefined })
  await ctx.reply(
    `<b>${esc(h.card.title)}</b> — Approval set to Changes Requested, killed by ${esc(by)}.`,
    { parse_mode: 'HTML' },
  )
}

bot.command('kill', async (ctx) => {
  try {
    await killHeld(ctx)
  } catch (e) {
    await fail(ctx, e)
  }
})

bot.callbackQuery('nd:k', async (ctx) => {
  await ctx.answerCallbackQuery()
  try {
    await killHeld(ctx)
  } catch (e) {
    await fail(ctx, e)
  }
})

bot.callbackQuery('nd:r', async (ctx) => {
  await ctx.answerCallbackQuery()
  try {
    const h = desk.held(ctx.chat!.id)
    if (!h?.card || !h.draft) {
      await ctx.reply('Nothing to mark ready.')
      return
    }
    if (isBlocked(checkDraft(h.draft))) {
      await ctx.reply('That draft is blocked on compliance. Rewrite it before marking it ready.')
      return
    }
    await readyCard(h.card)
    await ctx.reply(
      `<b>${esc(h.card.title)}</b> — Status set to In progress. Ready for the Approval Queue.\n\n` +
        '<i>Approval stays at Needs Review. A person sets that, not the bot.</i>',
      { parse_mode: 'HTML' },
    )
  } catch (e) {
    await fail(ctx, e)
  }
})

bot.command('ref', async (ctx) => {
  try {
    const query = (ctx.match ?? '').trim()
    const pages = listPages()

    if (!query) {
      const inPrompt = pages.filter((p) => p.prompt !== false)
      const readOnly = pages.filter((p) => p.prompt === false)
      const lines = ['<b>Reference pages</b>', '']
      lines.push(...inPrompt.map((p) => `• ${esc(p.label)}`))
      if (readOnly.length) {
        lines.push('', '<i>On tap, not in the bot\'s context:</i>')
        lines.push(...readOnly.map((p) => `• ${esc(p.label)}`))
      }
      lines.push('', 'Read one with <code>/ref funding</code> — partial names work.')
      await send(ctx, lines.join('\n'))
      return
    }

    const page = findPage(query)
    if (!page) {
      await send(ctx, `No reference page matches "${esc(query)}".\n\nAvailable: ${esc(pages.map((p) => p.label).join(', '))}`)
      return
    }

    await ctx.replyWithChatAction('typing')

    // Fetched live rather than from the prompt cache — this is the page as it
    // stands right now, which matters for anything operational.
    const [text, files] = await Promise.all([
      blocksToText(await children(page.id)),
      pageFiles(page.id),
    ])

    if (!text && files.length === 0) {
      await send(ctx, `<b>${esc(page.label)}</b>\n\n<i>This page is empty in Notion.</i>`)
      return
    }

    if (text) await send(ctx, `<b>${esc(page.label)}</b>\n\n${esc(text)}`)

    // Notion's signed URLs expire in about an hour, so hand Telegram the file
    // now and let it keep its own copy — a link posted here would go dead.
    for (const f of files) {
      try {
        if (f.kind === 'image') await ctx.replyWithPhoto(f.url, { caption: f.name })
        else await ctx.replyWithDocument(f.url, { caption: f.name })
      } catch {
        await send(ctx, `📎 ${esc(f.name)} — couldn't attach it here, open it in Notion.`)
      }
    }
  } catch (e) {
    await fail(ctx, e)
  }
})

bot.command('refresh', async (ctx) => {
  try {
    await ctx.replyWithChatAction('typing')
    const r = await refreshReference()
    const lines = ['<b>Reference refreshed from Notion</b>', '']
    if (r.included.length) {
      for (const p of r.included) lines.push(`✓ ${esc(p.label)} — ${p.chars.toLocaleString()} chars`)
    } else {
      lines.push('Nothing pulled. Check NOTION_TOKEN and that the pages are shared with the integration.')
    }
    if (r.empty.length) lines.push('', `<i>Empty, skipped:</i> ${esc(r.empty.join(', '))}`)
    for (const f of r.failed) lines.push(`✗ ${esc(f.label)} — ${esc(f.error)}`)
    lines.push('', `<i>${r.totalChars.toLocaleString()} chars now in the prompt.</i>`)
    await send(ctx, lines.join('\n'))
  } catch (e) {
    await fail(ctx, e)
  }
})

bot.command('remind', async (ctx) => {
  try {
    const cal = await loadCalendar()
    if (!cal.available) {
      await ctx.reply(`Calendar unavailable: ${cal.reason}`)
      return
    }
    const arg = Number((ctx.match ?? '').trim())
    const days = Number.isInteger(arg) && arg > 0 && arg <= 365 ? arg : 30
    const entries = withinWindow(cal.entries, new Date(), Math.max(days, 60))
    await send(ctx, renderReminderSchedule(upcoming(entries, days), days))
  } catch (e) {
    await fail(ctx, e)
  }
})

bot.command('published', async (ctx) => {
  try {
    const recent = await recentPosts(ctx.chat.id)
    await send(ctx, renderPublished(recent.posts, recent.error ? `${recent.backend} (Notion failed)` : recent.backend))
  } catch (e) {
    await fail(ctx, e)
  }
})

bot.command('ideas', async (ctx) => {
  try {
    const topic = (ctx.match ?? '').trim()
    if (!topic) {
      await ctx.reply('What topic? Try <code>/ideas custody</code>', { parse_mode: 'HTML' })
      return
    }
    await ctx.replyWithChatAction('typing')
    await send(ctx, renderIdeas(await ideas(topic)))
  } catch (e) {
    await fail(ctx, e)
  }
})

/* ── buttons ──────────────────────────────────────────────────────────────── */

bot.callbackQuery(/^d:(X|LinkedIn):([123])$/, async (ctx) => {
  await ctx.answerCallbackQuery()
  try {
    const [, channel, rank] = ctx.match as unknown as [string, 'X' | 'LinkedIn', string]
    await deliverDraft(ctx, ctx.chat!.id, Number(rank), channel)
  } catch (e) {
    await fail(ctx, e)
  }
})

bot.callbackQuery(/^r:(X|LinkedIn):([123])$/, async (ctx) => {
  await ctx.answerCallbackQuery()
  try {
    const [, channel, rank] = ctx.match as unknown as [string, 'X' | 'LinkedIn', string]
    const draft = getDraft(ctx.chat!.id, channel, Number(rank))
    if (!draft) {
      await ctx.reply('That draft has expired — draft it again.')
      return
    }
    await ctx.replyWithChatAction('typing')
    await send(ctx, renderVariants(await rewrite(draft)))
  } catch (e) {
    await fail(ctx, e)
  }
})

bot.callbackQuery(/^a:(X|LinkedIn):([123])$/, async (ctx) => {
  try {
    const [, channel, rank] = ctx.match as unknown as [string, 'X' | 'LinkedIn', string]
    const chatId = ctx.chat!.id
    const draft = getDraft(chatId, channel, Number(rank))
    if (!draft) {
      await ctx.answerCallbackQuery({ text: 'That draft has expired.' })
      return
    }

    // Re-check at approval time: the rules may have changed since drafting,
    // and an approval is the one action worth verifying twice.
    if (isBlocked(checkDraft(draft))) {
      await ctx.answerCallbackQuery({ text: 'Still blocked — rewrite it first.' })
      return
    }

    const by = ctx.from?.username ?? ctx.from?.first_name ?? String(ctx.from?.id ?? 'unknown')
    const opp = opportunityFor(chatId, Number(rank))

    // Local state first — it is synchronous and cannot fail, so an approval is
    // never lost to a network problem. Notion is the durable copy on top.
    const title = opp?.title ?? `Priority ${rank}`
    recordApproval(chatId, {
      at: new Date().toISOString(),
      by,
      channel,
      rank: Number(rank),
      body: draft.body,
      title,
    })

    const logged = await logPublished({
      date: new Date().toISOString().slice(0, 10),
      channel,
      title,
      body: draft.body,
      approvedBy: by,
    })

    await ctx.answerCallbackQuery({ text: 'Logged.' })
    await afterApproval(ctx, { draft, title, channel, by, logged })
  } catch (e) {
    await fail(ctx, e)
  }
})



/**
 * /brief — the client market digest.
 *
 * Reads the crypto press, picks what matters to a Canadian desk's clients,
 * and writes one sentence per story on why. The team sees it first; publishing
 * is the same two-tap gate as any other broadcast.
 */

/**
 * /tweets — three short X posts, three different shapes.
 *
 *   /tweets custody            house account
 *   /tweets jon etf inflows    in a founder's voice
 *
 * Built to the desk's brief: punchy, human, no threads, no hashtags, under
 * 220 characters. Three shapes rather than three drafts of one, because asking
 * for the same post three times returns the same thought reworded.
 */
bot.command('tweets', async (ctx) => {
  try {
    const raw = (ctx.match ?? '').toString().trim()
    if (!raw) {
      await ctx.reply('What about? Try /tweets custody — or name a voice first: /tweets jon custody')
      return
    }

    // An opening word that names a voice is treated as one; otherwise it is
    // part of the topic. "jon custody" vs "custody at scale".
    const [first, ...rest] = raw.split(/\s+/)
    const voice = rest.length ? findVoice(first) : null
    const topic = voice ? rest.join(' ') : raw

    await ctx.replyWithChatAction('typing')
    const set = await tweets(
      topic,
      voice ? { name: voice.name, profile: readVoice(voice.slug), kind: voice.kind } : undefined,
    )
    await send(ctx, renderTweets(set, TWEET_LIMIT, voice ? voiceLabel(voice) : undefined))
  } catch (e) {
    await fail(ctx, e)
  }
})

bot.command('brief', async (ctx) => {
  try {
    const hours = Math.min(72, Math.max(6, Number((ctx.match ?? '').toString().trim()) || 24))
    await ctx.reply(`Reading the last ${hours}h of coverage…`)
    await ctx.replyWithChatAction('typing')

    const r = await buildDigest(hours)

    // A blocked digest is shown but cannot be staged for publishing.
    if (isBlocked(r.violations) || !broadcast.isConfigured()) {
      await send(ctx, renderDigestForReview(r))
      if (!broadcast.isConfigured() && !isBlocked(r.violations)) {
        await ctx.reply('No channel configured, so there is nothing to publish to yet.')
      }
      return
    }

    const by = ctx.from?.username ?? ctx.from?.first_name ?? String(ctx.from?.id ?? 'unknown')
    const staged = stageDigest(r.digest, ctx.chat.id, by)

    await send(ctx, renderDigestForReview(r), {
      link_preview_options: { is_disabled: true },
      reply_markup: digestKeyboard(staged.itemIds, staged.allId),
    })
  } catch (e) {
    await fail(ctx, e)
  }
})

/* ── broadcasting ─────────────────────────────────────────────────────────────
   Two taps, on purpose. The first shows exactly what will be posted and how
   many people receive it; the second sends. Anyone in the allowlisted group
   may publish — the group is already restricted and the channel is
   invite-only, so the audience is existing clients rather than the public.
   ────────────────────────────────────────────────────────────────────────── */

bot.callbackQuery(/^bp:([a-f0-9]+)$/, async (ctx) => {
  try {
    const id = ctx.match![1]
    const p = broadcast.pending(id)
    if (!p) {
      await ctx.answerCallbackQuery({ text: 'That post expired — approve it again.' })
      return
    }
    await ctx.answerCallbackQuery()
    const a = await broadcast.audience()
    await send(ctx, renderPublishPreview(p.text, a), {
      reply_markup: confirmPublishKeyboard(id, a.count),
    })
  } catch (e) {
    await fail(ctx, e)
  }
})

bot.callbackQuery(/^bn:([a-f0-9]+)$/, async (ctx) => {
  broadcast.drop(ctx.match![1])
  await ctx.answerCallbackQuery({ text: 'Cancelled.' })
  await ctx.reply('Cancelled — nothing was published.')
})

bot.callbackQuery(/^bx:([a-f0-9]+)$/, async (ctx) => {
  try {
    const id = ctx.match![1]
    const p = broadcast.pending(id)
    if (!p) {
      await ctx.answerCallbackQuery({ text: 'That post expired — approve it again.' })
      return
    }

    // Re-check at send time. The copy may have been rewritten since it was
    // approved, and checking the approved version checks the wrong words.
    if (isBlocked(checkDraft(p.draft))) {
      broadcast.drop(id)
      await ctx.answerCallbackQuery({ text: 'Blocked on re-check.' })
      await ctx.reply('⛔ Compliance re-check failed at send time. Nothing was published.')
      return
    }

    await ctx.answerCallbackQuery({ text: 'Publishing…' })
    const by = ctx.from?.username ?? ctx.from?.first_name ?? String(ctx.from?.id ?? 'unknown')
    const res = await broadcast.post(p.text)

    if (!res.ok || res.messageId === undefined) {
      await ctx.reply(
        `⚠️ Could not publish.\n\n<code>${esc(res.error ?? 'unknown error')}</code>\n\n` +
          'The post is still approved and logged; nothing was sent.',
        { parse_mode: 'HTML' },
      )
      return
    }

    broadcast.recordSent({ id, chatId: ctx.chat!.id, messageId: res.messageId, title: p.title, sentBy: by })
    const a = await broadcast.audience()
    await ctx.reply(renderSent(a, by, res.messageId), { parse_mode: 'HTML' })
  } catch (e) {
    await fail(ctx, e)
  }
})

bot.command('recall', async (ctx) => {
  try {
    if (!broadcast.isConfigured()) {
      await ctx.reply('No channel is configured, so nothing has been published.')
      return
    }
    const last = broadcast.lastSent(ctx.chat.id)
    if (!last) {
      await ctx.reply('Nothing has been published from this chat.')
      return
    }
    const age = Date.now() - Date.parse(last.sentAt)
    if (age > broadcast.RECALL_WINDOW_MS) {
      await ctx.reply(
        `The last post (“${esc(last.title)}”) is older than an hour, so I will not pull it automatically. ` +
          'Delete it in the channel if it still needs to go.',
        { parse_mode: 'HTML' },
      )
      return
    }

    const res = await broadcast.recall(last.messageId)
    await ctx.reply(
      res.ok
        ? `🗑 Deleted “${esc(last.title)}” from the channel.\n\n` +
            '<i>It is gone from the channel. Anyone who already read or forwarded it still has it.</i>'
        : `Could not delete it.\n\n<code>${esc(res.error ?? 'unknown error')}</code>`,
      { parse_mode: 'HTML' },
    )
  } catch (e) {
    await fail(ctx, e)
  }
})

/* ── lifecycle ────────────────────────────────────────────────────────────── */

console.warn(access.banner(ACCESS))

bot.catch((err) => console.error('[bot] unhandled:', err.error))

if (process.argv[1]?.endsWith('bot.ts')) {
  if (!process.env.TELEGRAM_BOT_TOKEN?.trim()) {
    console.error('TELEGRAM_BOT_TOKEN is not set. See marketing/README.md § Telegram setup.')
    process.exit(1)
  }
  if (ALLOWED.size === 0) {
    console.error('TELEGRAM_CHAT_ID is not set — refusing to start without an allowlist.')
    process.exit(1)
  }

  console.log(`[bot] starting · allowlist: ${[...ALLOWED].join(', ')}`)
  void bot.start({
    onStart: (info) => console.log(`[bot] @${info.username} listening`),
  })

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.once(sig, () => {
      console.log(`\n[bot] ${sig} — stopping`)
      void bot.stop()
    })
  }
}

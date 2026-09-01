/* ──────────────────────────────────────────────────────────────────────────
   Telegram formatting.

   HTML parse mode rather than MarkdownV2 — Telegram's MarkdownV2 requires
   escaping eighteen characters, and marketing copy contains most of them.
   HTML needs three.
   ────────────────────────────────────────────────────────────────────────── */

import { InlineKeyboard } from 'grammy'
import type { DailyPlan, Draft, CardDraft, Opportunity, Variants, IdeaSet, Weekly, TweetSet } from './types'
import type { PublishedPost } from './published'
import type { Violation } from './compliance'
import { blockers, checkDraft, checkCopy } from './compliance'
import type { DatedEntry } from './calendar'
import type { SpotResult, Spot } from './price'
import type { Digest, DigestItem } from './digest'
import type { Range } from './coinbase'
import { LABEL, fireInDays, type Reminder } from './reminders'
import type { QueueCard } from './queue'

/** Telegram's hard limit is 4096 characters per message. */
export const TG_LIMIT = 4096

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Split on paragraph boundaries so a post is never cut mid-sentence. */
export function chunk(text: string, limit = TG_LIMIT - 100): string[] {
  if (text.length <= limit) return [text]
  const out: string[] = []
  let current = ''
  for (const para of text.split('\n\n')) {
    if (current && current.length + para.length + 2 > limit) {
      out.push(current)
      current = para
    } else {
      current = current ? `${current}\n\n${para}` : para
    }
  }
  if (current) out.push(current)
  // A single paragraph longer than the limit still has to be cut somewhere.
  return balance(out.flatMap((c) => (c.length <= limit ? [c] : hardSplit(c, limit))))
}

/**
 * Cut a single over-long paragraph without landing inside markup.
 *
 * A plain slice at the limit can fall between "<pr" and "e>", or inside
 * "&amp;", and either one is malformed HTML that Telegram rejects outright.
 * Preference order: a line break, then a space, then the limit itself —
 * backed off to the start of a tag or entity if the cut lands inside one.
 */
function hardSplit(text: string, limit: number): string[] {
  const out: string[] = []
  let rest = text

  while (rest.length > limit) {
    const nl = rest.lastIndexOf('\n', limit)
    const sp = rest.lastIndexOf(' ', limit)
    let cut = nl > limit * 0.5 ? nl : sp > limit * 0.5 ? sp : limit

    // Inside a tag: "<b" with no ">" after it.
    const lt = rest.lastIndexOf('<', cut - 1)
    if (lt > rest.lastIndexOf('>', cut - 1)) cut = lt
    // Inside an entity: "&amp" with no ";" after it. Entities are short.
    const amp = rest.lastIndexOf('&', cut - 1)
    if (amp > rest.lastIndexOf(';', cut - 1) && cut - amp <= 10) cut = amp

    if (cut <= 0) cut = limit // a pathological run of markup; cut anyway
    out.push(rest.slice(0, cut))
    rest = rest.slice(cut)
  }

  if (rest) out.push(rest)
  return out
}

/**
 * Close every tag left open at the end of a part, and reopen it at the start
 * of the next.
 *
 * Telegram parses each message on its own, so a <pre> block split across two
 * messages is not one long block — it is one message with no closing tag and
 * one with no opening tag, and the API rejects both with "can't find end tag".
 * Attributes are carried across so a split <a href> keeps its link.
 */
function balance(parts: string[]): string[] {
  const OPEN = /<(\/?)([a-z]+)(?:\s[^>]*)?>/g
  let carried: { name: string; tag: string }[] = []

  return parts.map((part) => {
    const stack = [...carried]
    for (const m of part.matchAll(OPEN)) {
      if (m[1]) {
        const i = stack.map((t) => t.name).lastIndexOf(m[2])
        if (i !== -1) stack.splice(i, 1)
      } else {
        stack.push({ name: m[2], tag: m[0] })
      }
    }

    const reopened = carried.map((t) => t.tag).join('')
    const closed = [...stack].reverse().map((t) => `</${t.name}>`).join('')
    carried = stack
    return `${reopened}${part}${closed}`
  })
}

function longDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/* ── the morning plan ─────────────────────────────────────────────────────── */

export function renderPlan(plan: DailyPlan): string {
  const lines: string[] = [
    `<b>Satstreet Marketing — ${esc(longDate(plan.date))}</b>`,
    '',
  ]

  for (const o of [...plan.opportunities].sort((a, b) => a.rank - b.rank)) {
    lines.push(`<b>Priority ${o.rank} — ${esc(o.channel)}: ${esc(o.title)}</b>`)
    lines.push(esc(o.angle))
    lines.push(`<i>Why now:</i> ${esc(o.why_now)}`)
    lines.push(`<i>Hook:</i> ${esc(o.suggested_hook)}`)
    if (o.risk_notes && o.risk_notes.trim().toLowerCase() !== 'none') {
      lines.push(`⚠️ <i>Watch:</i> ${esc(o.risk_notes)}`)
    }
    if (o.assets_url) lines.push(`📁 ${esc(o.assets_url)}`)
    lines.push('')
  }

  if (plan.upcoming.length) {
    lines.push('<b>Upcoming</b>')
    for (const u of plan.upcoming.slice(0, 4)) {
      const when = u.days_away === 0 ? 'today' : `in ${u.days_away}d`
      lines.push(`• ${esc(u.event)} — ${when}. ${esc(u.prep_note)}`)
      if (u.assets_url) lines.push(`  ${esc(u.assets_url)}`)
    }
    lines.push('')
  }

  if (plan.gaps?.trim()) lines.push(`<i>Gaps:</i> ${esc(plan.gaps)}`)

  return lines.join('\n')
}

/** One row per opportunity: draft it for X, or for LinkedIn. */
export function planKeyboard(plan: DailyPlan): InlineKeyboard {
  const kb = new InlineKeyboard()
  for (const o of [...plan.opportunities].sort((a, b) => a.rank - b.rank)) {
    kb.text(`${o.rank} · X`, `d:X:${o.rank}`).text(`${o.rank} · LinkedIn`, `d:LinkedIn:${o.rank}`).row()
  }
  return kb
}

/* ── a draft ──────────────────────────────────────────────────────────────── */

export function renderDraft(
  draft: Draft,
  opportunity: Opportunity,
  violations: Violation[],
): string {
  const blocked = blockers(violations)
  const lines: string[] = []

  lines.push(`<b>${esc(draft.channel)} draft — ${esc(opportunity.title)}</b>`)
  lines.push(`<i>${esc(draft.format)}</i>`)
  lines.push('')
  lines.push(`<pre>${esc(draft.body)}</pre>`)

  if (blocked.length) {
    lines.push('')
    lines.push('⛔ <b>Blocked — do not post as written</b>')
    for (const v of blocked) lines.push(`• ${esc(v.detail)}`)
  }

  const warns = violations.filter((v) => v.severity === 'warn')
  if (warns.length) {
    lines.push('')
    lines.push('⚠️ <b>Check before posting</b>')
    for (const v of warns) lines.push(`• ${esc(v.detail)}`)
  }

  if (draft.needs_refresh.length) {
    lines.push('')
    lines.push('<b>Refresh and source before posting</b>')
    for (const n of draft.needs_refresh) lines.push(`• ${esc(n)}`)
  }

  if (draft.sources_to_cite.length) {
    lines.push('')
    lines.push(`<i>Sources:</i> ${esc(draft.sources_to_cite.join(' · '))}`)
  }

  if (draft.alt_hooks.length) {
    lines.push('')
    lines.push('<b>Other openers</b>')
    for (const h of draft.alt_hooks) lines.push(`• ${esc(h)}`)
  }

  lines.push('')
  lines.push(`<i>Self-check:</i> ${esc(draft.compliance_self_check)}`)

  return lines.join('\n')
}

export function draftKeyboard(channel: string, rank: number, blocked: boolean): InlineKeyboard {
  const kb = new InlineKeyboard()
  // No Approve button on a blocked draft — the gate is structural, not advisory.
  if (!blocked) kb.text('✅ Approve', `a:${channel}:${rank}`)
  kb.text('🔁 Rewrite', `r:${channel}:${rank}`)
  const other = channel === 'X' ? 'LinkedIn' : 'X'
  kb.text(`↪ ${other}`, `d:${other}:${rank}`)
  return kb
}

/* ── the rest ─────────────────────────────────────────────────────────────── */

/** A draft written in one person's voice — no rank, so no draft keyboard. */
export function renderVoiceDraft(draft: Draft, voiceName: string, topic: string): string {
  const violations = checkDraft(draft)
  const blocked = blockers(violations)
  const warns = violations.filter((v) => v.severity === 'warn')
  const lines: string[] = []

  lines.push(`<b>${esc(voiceName)}</b> <i>· ${esc(draft.channel)} · ${esc(topic)}</i>`)
  lines.push('')
  lines.push(`<pre>${esc(draft.body)}</pre>`)

  if (blocked.length) {
    lines.push('', '⛔ <b>Blocked — do not post as written</b>')
    for (const v of blocked) lines.push(`• ${esc(v.detail)}`)
  }
  if (warns.length) {
    lines.push('', '⚠️ <b>Check before posting</b>')
    for (const v of warns) lines.push(`• ${esc(v.detail)}`)
  }
  if (draft.needs_refresh.length) {
    lines.push('', '<b>Refresh and source before posting</b>')
    for (const n of draft.needs_refresh) lines.push(`• ${esc(n)}`)
  }
  if (draft.alt_hooks.length) {
    lines.push('', '<b>Other openers</b>')
    for (const h of draft.alt_hooks) lines.push(`• ${esc(h)}`)
  }
  lines.push('', `<i>${esc(draft.compliance_self_check)}</i>`)
  return lines.join('\n')
}

export function renderVariants(v: Variants): string {
  const lines = ['<b>Three stronger versions</b>', '']
  v.variants.forEach((x, i) => {
    lines.push(`<b>${i + 1}. ${esc(x.label)}</b>`)
    lines.push(`<pre>${esc(x.body)}</pre>`)
    lines.push(`<i>${esc(x.why_stronger)}</i>`)
    lines.push('')
  })
  return lines.join('\n')
}

export function renderWeekly(w: Weekly): string {
  const lines = [`<b>Content mix — week of ${esc(longDate(w.week_of))}</b>`, '']

  if (w.mix.length === 0) {
    lines.push('<i>Nothing proposed for next week.</i>', '')
  }
  for (const s of w.mix) {
    lines.push(`<b>${esc(s.day)} — ${esc(s.channel)}:</b> ${esc(s.topic)}`)
    lines.push(`<i>${esc(s.pillar)}</i> · ${esc(s.why)}`)
    lines.push('')
  }

  if (w.pillars_missing.length) {
    lines.push(`<b>Pillars untouched:</b> ${esc(w.pillars_missing.join(', '))}`)
    lines.push('')
  }
  if (w.gaps?.trim()) {
    lines.push('<b>Gaps</b>')
    lines.push(esc(w.gaps))
  }
  return lines.join('\n')
}

export function renderPublished(posts: PublishedPost[], backend: string): string {
  if (!posts.length) {
    return `<b>Published log</b>\n\nNothing recorded in the last three weeks.\n\n<i>Backend: ${esc(backend)}</i>`
  }
  const lines = ['<b>Published — last three weeks</b>', '']
  for (const p of posts) {
    lines.push(`<b>${esc(p.date)}</b> · ${esc(p.channel)} · ${esc(p.title)}`)
    if (p.summary) lines.push(`<i>${esc(p.summary)}</i>`)
    lines.push('')
  }
  lines.push(`<i>Backend: ${esc(backend)}</i>`)
  return lines.join('\n')
}

export function renderIdeas(set: IdeaSet): string {
  const lines = [`<b>Angles on ${esc(set.topic)}</b>`, '']
  for (const i of set.ideas) {
    lines.push(`<b>${esc(i.title)}</b> <i>(${esc(i.channel)})</i>`)
    lines.push(esc(i.angle))
    if (i.risk_notes && i.risk_notes.trim().toLowerCase() !== 'none') {
      lines.push(`⚠️ ${esc(i.risk_notes)}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

const RULE_EMOJI: Record<string, string> = {
  today: '🔔', tomorrow: '⏰', week: '📌', window: '✏️',
}

/** One reminder, written so it can be acted on without opening anything else. */
export function renderReminder(r: Reminder): string {
  const e = r.entry
  const when =
    e.days_away === 0 ? 'today'
      : e.days_away === 1 ? 'tomorrow'
        : `in ${e.days_away} days`
  const span = e.end_date && e.end_date !== e.date ? `${e.date} – ${e.end_date}` : e.date

  const lines = [
    `${RULE_EMOJI[r.rule] ?? '•'} <b>${esc(LABEL[r.rule])}</b>`,
    '',
    `<b>${esc(e.title)}</b> — ${when} (${esc(span)})`,
  ]
  if (e.category) lines.push(`<i>${esc(e.category)}</i>`)
  if (e.location) lines.push(`📍 ${esc(e.location)}`)
  if (e.notes) lines.push('', esc(e.notes))
  if (e.angles) lines.push('', `<b>House angles:</b> ${esc(e.angles)}`)
  if (e.formats) lines.push('', `<b>Formats:</b> ${esc(e.formats)}`)
  if (e.reference) lines.push('', `<i>Source to cite:</i> ${esc(e.reference)}`)
  if (e.assets_url) lines.push('', `📁 ${esc(e.assets_url)}`)

  lines.push('', `<code>/ideas ${esc(e.title)}</code>`)
  lines.push(`<code>/voices ${esc(e.title)}</code>`)
  return lines.join('\n')
}

/** The /remind preview: what fires, and when it fires. */
export function renderReminderSchedule(reminders: Reminder[], days: number): string {
  if (!reminders.length) return `Nothing scheduled to fire in the next ${days} days.`
  const lines = [`<b>Reminders — next ${days} days</b>`, '']
  for (const r of reminders) {
    const f = fireInDays(r)
    const fires = f <= 0 ? 'today' : f === 1 ? 'tomorrow' : `in ${f}d`
    lines.push(
      `${RULE_EMOJI[r.rule] ?? '•'} <b>${esc(fires)}</b> — ${esc(r.entry.title)}` +
        ` <i>(${esc(LABEL[r.rule].toLowerCase())})</i>`,
    )
  }
  lines.push('', '<i>Fires each weekday morning alongside the plan.</i>')
  return lines.join('\n')
}

const compactUsd = (n: number) => {
  const a = Math.abs(n)
  if (a >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  // Smaller assets reach this branch now that /price covers the whole
  // Coinbase catalogue; without it, $824,251 printed as "$824251".
  if (a >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

/** The always-on board. Overridable so a re-host does not need a code change. */
const TICKER_URL =
  process.env.TICKER_URL || 'https://bpotvin19.github.io/satstreetgolf/ticker.html'

/**
 * Enough decimals to be meaningful at any magnitude. Two is right for BTC and
 * wrong for a sub-cent token, where it would print "$0.00".
 */
function spotPrice(n: number): string {
  if (!isFinite(n)) return '\u2014'
  const dp = n >= 1 ? 2 : n >= 0.01 ? 4 : n >= 0.0001 ? 6 : 8
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`
}

/**
 * Buttons through to the real charts.
 *
 * Both URLs are built from identifiers we were given, never guessed:
 *
 *   TradingView  COINBASE:<TICKER>USD, straight from the Coinbase catalogue,
 *                so it resolves for anything /price can find. The range
 *                carries through as the chart's opening interval.
 *   CoinGecko    the coin id CoinGecko itself returned, so the URL is correct
 *                by construction.
 *
 * CoinMarketCap is deliberately absent. Its slugs cannot be derived from
 * either the ticker or the CoinGecko id: CMC serves BONK at "bonk1", while
 * "bonk" is a different asset entirely (megaBONK). A link that silently opens
 * the wrong coin is worse than no link, and CMC soft-404s a bad slug into a
 * blank 200 rather than erroring, so it cannot be checked cheaply either.
 * Doing it properly needs CMC's own API and a key.
 */
export function chartKeyboard(a: Spot, range: Range): InlineKeyboard | undefined {
  const kb = new InlineKeyboard()
  let any = false

  if (a.listedOnCoinbase) {
    const symbol = encodeURIComponent(`COINBASE:${a.symbol}USD`)
    kb.url(
      `TradingView · ${range.label}`,
      `https://www.tradingview.com/chart/?symbol=${symbol}&interval=${range.tvInterval}`,
    )
    any = true
  }

  if (a.coingeckoId) {
    kb.url('CoinGecko', `https://www.coingecko.com/en/coins/${a.coingeckoId}`)
    any = true
  }

  return any ? kb : undefined
}

export function renderSpot(result: SpotResult): string {
  const head = result.query ? 'Reference price' : 'Reference prices'
  const lines = [`<b>${head}</b>`, '']

  for (const a of result.assets) {
    const d = (v: number) =>
      isFinite(v) ? `${v > 0 ? '\u25b2' : v < 0 ? '\u25bc' : '\u25a0'} ${Math.abs(v).toFixed(2)}%` : '\u2014'

    // On a lookup the ticker alone is ambiguous, so name the asset.
    const label = result.query
      ? `${esc(a.symbol)} \u00b7 ${esc(a.name)}${a.rank ? ` <i>#${a.rank}</i>` : ''}` +
        (a.listedOnCoinbase ? '' : ' <i>\u00b7 not on Coinbase</i>')
      : `${esc(a.symbol)}`

    lines.push(`<b>${label}</b>  <b>${esc(spotPrice(a.price))}</b>`)
    lines.push(
      `24h ${esc(d(a.change24h))}   \u00b7   7d ${a.change7d === null ? '\u2014' : esc(d(a.change7d))}`,
    )

    // Cap is global or nothing. Volume is either global (CoinGecko) or this
    // one venue (Coinbase) \u2014 say which, because they are not the same number.
    const cap = a.marketCap === null ? 'Cap \u2014' : `Cap ${esc(compactUsd(a.marketCap))}`
    const vol =
      a.volume === null
        ? 'Vol \u2014'
        : a.volumeSource === 'Coinbase'
          ? `Vol ${esc(compactUsd(a.volume))} <i>(Coinbase)</i>`
          : `Vol ${esc(compactUsd(a.volume))}`
    lines.push(`<i>${cap} \u00b7 ${vol}</i>`)
    lines.push('')
  }

  if (result.alternatives?.length) {
    lines.push(
      `<i>Also matched: ${result.alternatives
        .map((c) => `${esc(c.name)} (${esc(c.symbol)})`)
        .join(', ')}. Ask by full name to pick another.</i>`,
    )
    lines.push('')
  }

  // Attribution has to describe what is actually on screen. CoinGecko's free
  // tier throttles, and when it does, cap and 7d come back empty \u2014 claiming
  // them anyway would be worse than showing the dashes.
  const venues = [...new Set(result.assets.map((a) => a.source))]
  const usedCg = result.assets.some(
    (a) => a.marketCap !== null || a.change7d !== null || a.volumeSource === 'CoinGecko',
  )
  const at = result.at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  lines.push(
    `<i>${esc(venues.join(' / '))} spot, ${esc(at)}.` +
      (usedCg ? ' Cap, 7d and global volume via CoinGecko.' : '') +
      ' Indicative only \u2014 not a quote and not where the desk will execute.</i>',
  )

  // Only the majors are on the board, so only link it when it is relevant.
  if (!result.query) {
    lines.push('')
    lines.push(`<a href="${esc(TICKER_URL)}">Live board \u2192</a>`)
  }

  return lines.join('\n')
}

export function renderCalendar(entries: DatedEntry[]): string {
  if (!entries.length) return 'Nothing on the calendar in the next 30 days.'
  const lines = ['<b>Next 30 days</b>', '']
  for (const e of entries) {
    const when = e.days_away === 0 ? 'today' : `in ${e.days_away}d`
    const span = e.end_date && e.end_date !== e.date ? `${e.date}–${e.end_date}` : e.date
    lines.push(`<b>${esc(e.title)}</b> — ${esc(span)} (${when})`)
    if (e.category) lines.push(`<i>${esc(e.category)}</i>`)
    if (e.lead_time_days !== undefined && e.days_away <= e.lead_time_days) {
      lines.push('🟢 drafting window open')
    }
    if (e.assets_url) lines.push(esc(e.assets_url))
    lines.push('')
  }
  return lines.join('\n')
}

export const HELP = `<b>Satstreet OS</b>

<b>Sales / BD</b>
/research &lt;entity&gt; — public company research, trigger, decision-maker, Satstreet angle
/todays-prospects — latest Canada prospect list
   /todays-prospects florida — latest Florida research list
/company-facts &lt;topic&gt; — versioned Satstreet facts; never invents a missing claim

<b>Write something</b>
/tweets &lt;topic&gt; — three short X posts, three shapes, under 220 chars
   /tweets custody · /tweets jon etf inflows
/post — guided: topic, then whose voice, then which channel. No syntax.
/voices &lt;topic&gt; — the same post in every voice at once
/voice robustus &lt;topic&gt; — the external cut-through style, published as
   Satstreet: the shape of the argument, never the author's words

<b>Founder News Desk</b>
/queue — cards Grok harvested overnight, waiting on review
/open &lt;ref or title&gt; — one card, then pick a voice
   /open 668f · /open boc
/voice &lt;who&gt; — rewrite the open card in that voice, one voice only
/why — one line: the mechanism, the voice, what is forbidden
/ready — Status to In progress. A person still sets Approval.
/kill — Approval to Changes Requested, stamped with who did it
/draft &lt;headline&gt; — an idea held in chat. Nothing written to Notion.

<b>Client market brief</b>
/brief — read the crypto press, pick what matters to clients, one line
   on why for each. Numbered buttons publish one story; or publish all.
   /brief 48 widens the window to 48 hours.

<b>The daily plan</b>
/today — the day's two or three strongest opportunities, with draft buttons
/weekly — next week's mix, and which pillars go untouched

<b>Look things up</b>
/price — live BTC and ETH reference prices
/price &lt;asset&gt; · /chart &lt;asset&gt; — price and a TradingView chart,
   plus buttons through to the live interactive versions
   /price hype · /chart btc 30d — ranges: 24h, 7d, 30d, 90d
/calendar — what's coming in the next 30 days
/ref &lt;page&gt; — read a Satstreet page from Notion, with attachments
/published — what we've already put out

<b>Publishing</b>
Approve logs the copy. If a channel is configured, a 📣 Publish button
appears — two taps, and it names the audience before it sends.
/recall — delete the last published post (within the hour)

<b>Also available</b>
/ideas &lt;topic&gt; · /voice &lt;who&gt; &lt;topic&gt; · /draft &lt;n&gt; · /x &lt;n&gt; · /linkedin &lt;n&gt;
/rewrite · /remind · /refresh

Nothing is published automatically. Approve logs the copy and a human posts it.`

/* ── the Founder News Desk ────────────────────────────────────────────────
   Every render here leads with "DRAFT — do not post", because these come out
   of an automated harvest and land in a group where things get copied fast.
   The header is the desk's own format, and it is the first line for a reason.
   ────────────────────────────────────────────────────────────────────────── */

const RISK_MARK: Record<string, string> = { Standard: '·', Elevated: '!', High: '!!' }

/** The domain alone: on a phone the full URL is noise. */
function domain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function renderQueue(cards: QueueCard[]): string {
  if (!cards.length) {
    return (
      '<b>Content Queue</b>\n\nNothing is waiting for review.\n\n' +
      'Grok writes cards overnight; if this is empty after 8:45 ET, ' +
      'start one yourself with <code>/draft &lt;headline&gt;</code>.'
    )
  }

  const lines = [`<b>Content Queue — ${cards.length} needing review</b>`, '']
  for (const c of cards) {
    const src = domain(c.source)
    lines.push(
      `<code>${esc(c.ref)}</code>  <b>${esc(c.title)}</b>`,
      `      ${esc(c.voice || 'no voice')} · ${esc(c.pillar || 'no pillar')} · ` +
        `${esc(RISK_MARK[c.risk] ?? '·')} ${esc(c.risk || 'no risk set')}` +
        (src ? ` · ${esc(src)}` : ''),
      '',
    )
  }
  lines.push('<i>Open one: <code>/open 668f</code> or <code>/open boc</code></i>')
  return lines.join('\n')
}

/** /open — the card as harvested, before anyone rewrites it. */
export function renderCard(card: QueueCard): string {
  const lines = [
    `<b>${esc(card.title)}</b>  <code>${esc(card.ref)}</code>`,
    `<i>${esc(card.voice || 'no voice')} · ${esc(card.pillar || 'no pillar')} · ` +
      `risk ${esc(card.risk || 'unset')} · ${esc(card.approval || 'no approval set')}</i>`,
    '',
  ]

  if (card.draft) lines.push('<b>Draft as harvested</b>', `<pre>${esc(card.draft)}</pre>`, '')
  if (card.notes) lines.push('<b>Desk notes</b>', `${esc(card.notes)}`, '')
  if (card.source) lines.push(`<b>Source</b> ${esc(card.source)}`)
  if (card.publishDate) lines.push(`<b>Publish date</b> ${esc(card.publishDate)}`)

  lines.push('', '<i>Pick a voice below, or /kill it.</i>')
  return lines.join('\n')
}

/**
 * The rewritten card, in the desk's mandated Telegram format.
 *
 * Order is fixed: the do-not-post header, then the four identifiers, then the
 * post, then at most three do-not-say bullets. Compliance flags go above the
 * post rather than below it — a blocked draft that reads well is the one most
 * likely to be copied before anyone scrolls.
 */
export function renderCardDraft(
  draft: CardDraft,
  card: { title: string; pillar: string; risk: string; source: string },
  voiceName: string,
): string {
  const violations = checkDraft(draft)
  const blocked = blockers(violations)
  const warns = violations.filter((v) => v.severity === 'warn')

  const lines = [
    '<b>DRAFT — do not post.</b>',
    `<i>${esc(voiceName)} · ${esc(card.pillar || 'no pillar')} · risk ${esc(card.risk || 'unset')} · ` +
      `${esc(draft.channel)}</i>`,
  ]
  if (card.source) lines.push(`<i>${esc(card.source)}</i>`)
  lines.push('')

  if (blocked.length) {
    lines.push('⛔ <b>Blocked — do not post as written</b>')
    for (const v of blocked) lines.push(`• ${esc(v.detail)}`)
    lines.push('')
  }

  lines.push(`<pre>${esc(draft.body)}</pre>`)

  if (draft.do_not_say.length) {
    lines.push('', '<b>Do not say</b>')
    for (const d of draft.do_not_say.slice(0, 3)) lines.push(`• ${esc(d)}`)
  }

  if (draft.needs_refresh.length) {
    lines.push('', '<b>Verify before posting</b>')
    for (const n of draft.needs_refresh) lines.push(`• ${esc(n)}`)
  }

  if (warns.length) {
    lines.push('', '⚠️ <b>Check first</b>')
    for (const v of warns) lines.push(`• ${esc(v.detail)}`)
  }

  return lines.join('\n')
}

/* ── broadcasting to the Satstreet channel ────────────────────────────────── */

/**
 * What actually goes out. Just the approved copy: it has already passed the
 * compliance checks, the channel is invite-only, and bolting a disclaimer onto
 * the end of a post someone wrote carefully would undo the writing. Add a
 * footer here if compliance later asks for a standing line.
 */
export function renderChannelPost(draft: Draft): string {
  return draft.body.trim()
}

export function publishKeyboard(id: string): InlineKeyboard {
  return new InlineKeyboard().text('📣 Publish to channel', `bp:${id}`)
}

/**
 * The confirmation step names the audience, because "Publish" and "Publish to
 * 240 people" are not the same decision.
 */
export function confirmPublishKeyboard(id: string, count: number | null): InlineKeyboard {
  const label = count === null ? 'Yes — publish' : `Yes — publish to ${count}`
  return new InlineKeyboard().text(label, `bx:${id}`).text('Cancel', `bn:${id}`)
}

export function renderPublishPreview(text: string, a: { count: number | null; title: string | null }): string {
  const where = a.title ? `<b>${esc(a.title)}</b>` : 'the Satstreet channel'
  const who = a.count === null ? 'subscribers' : `${a.count} subscriber${a.count === 1 ? '' : 's'}`
  return (
    `<b>Publish to ${where}?</b>\n` +
    `This sends to ${esc(who)} immediately.\n\n` +
    `<i>Exactly this will be posted:</i>\n\n${esc(text)}`
  )
}

export function renderSent(a: { title: string | null }, by: string, messageId: number): string {
  return (
    `📣 <b>Published</b> to ${esc(a.title ?? 'the Satstreet channel')} by ${esc(by)}.\n\n` +
    `<i>Use /recall within the hour to delete it. That removes it from the channel — ` +
    `it does not unsend it for anyone who already read or forwarded it.</i>\n` +
    `<code>message ${messageId}</code>`
  )
}

/* ── the client market digest ─────────────────────────────────────────────── */

/**
 * What clients receive. Headline, source, link, and our sentence — never the
 * publisher's text. The link carries the reader to the publisher's page, which
 * is where the article belongs.
 */
export function renderDigestForChannel(d: Digest, date = new Date(), numbered = false): string {
  const day = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const lines = [`<b>Satstreet Market Brief</b>`, `<i>${esc(day)}</i>`, '']

  if (d.market_line.trim()) lines.push(esc(d.market_line.trim()), '')

  d.items.forEach((i, n) => {
    // Numbering appears only in the team's view, where it maps to the buttons.
    lines.push(`<b>${numbered ? `${n + 1}. ` : ''}${esc(i.headline)}</b>`)
    lines.push(esc(i.why))
    lines.push(`<a href="${esc(i.url)}">${esc(i.source)} →</a>`)
    lines.push('')
  })

  lines.push(
    '<i>Shared for information only. Not investment advice, and not a recommendation ' +
      'to buy or sell. Linked articles are the publishers’ own.</i>',
  )
  return lines.join('\n')
}


/**
 * A single story, published on its own.
 *
 * No market line here: sending three stories separately should not repeat the
 * same price sentence three times in the channel.
 */
export function renderDigestItemForChannel(i: DigestItem, date = new Date()): string {
  const day = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  return [
    '<b>Satstreet Market Brief</b>',
    `<i>${esc(day)}</i>`,
    '',
    `<b>${esc(i.headline)}</b>`,
    esc(i.why),
    `<a href="${esc(i.url)}">${esc(i.source)} →</a>`,
    '',
    '<i>Shared for information only. Not investment advice, and not a recommendation ' +
      'to buy or sell. Linked articles are the publishers’ own.</i>',
  ].join('\n')
}

/**
 * One button per story, plus the whole brief.
 *
 * Each button carries its own staged post, so picking a story reuses exactly
 * the same confirm-and-send path as publishing everything — there is no second
 * code path that could drift out of step with the compliance re-check.
 */
export function digestKeyboard(itemIds: string[], allId: string): InlineKeyboard {
  const kb = new InlineKeyboard()
  itemIds.forEach((id, n) => kb.text(String(n + 1), `bp:${id}`))
  if (itemIds.length > 1) kb.row().text(`Publish all ${itemIds.length}`, `bp:${allId}`)
  return kb
}

/** The team's view: the same brief, plus what was skipped and any warnings. */
export function renderDigestForReview(r: {
  digest: Digest
  violations: Violation[]
  sourcesOk: string[]
  sourcesFailed: string[]
  candidateCount: number
}): string {
  const lines = [renderDigestForChannel(r.digest, new Date(), true), '', '───────────', '']

  const blocked = blockers(r.violations)
  if (blocked.length) {
    lines.push('⛔ <b>Blocked — will not publish</b>')
    for (const v of blocked) lines.push(`• ${esc(v.detail)}`)
    lines.push('')
  }
  const warns = r.violations.filter((v) => v.severity === 'warn')
  if (warns.length) {
    lines.push('⚠️ <b>Check before publishing</b>')
    for (const v of warns) lines.push(`• ${esc(v.detail)}`)
    lines.push('')
  }

  if (r.digest.omitted?.trim()) lines.push(`<i>Left out:</i> ${esc(r.digest.omitted.trim())}`, '')

  lines.push(
    `<i>${r.digest.items.length} of ${r.candidateCount} candidates · ` +
      `${esc(r.sourcesOk.join(', '))}` +
      (r.sourcesFailed.length ? ` · unavailable: ${esc(r.sourcesFailed.join(', '))}` : '') +
      '</i>',
  )
  return lines.join('\n')
}

/* ── three short X posts ──────────────────────────────────────────────────── */

const STYLE_LABEL: Record<string, string> = {
  mechanism: 'Cut-through — what actually governs it',
  question: 'Question, invites replies',
  contrast: 'Then vs now',
  received: 'What everyone is saying, and why it misreads it',
  detail: 'One operational detail, no lesson drawn',
}

/**
 * Character counts are shown per post, not buried.
 *
 * The brief is "under 220" and a model will drift over it; the team needs to
 * see which one is long before it goes out, not after someone pastes it into X
 * and finds it clipped.
 */
export function renderTweets(set: TweetSet, limit: number, voiceName?: string): string {
  const lines: string[] = [
    `<b>Three posts — ${esc(set.topic)}</b>${voiceName ? ` <i>· ${esc(voiceName)}</i>` : ''}`,
  ]
  if (set.hook.trim()) lines.push(`<i>Hook: ${esc(set.hook.trim())}</i>`)
  lines.push('')

  set.tweets.forEach((t, i) => {
    const n = t.body.length
    const over = n > limit
    lines.push(`<b>${i + 1}. ${esc(STYLE_LABEL[t.style] ?? t.style)}</b>`)
    lines.push(`<pre>${esc(t.body)}</pre>`)
    lines.push(
      `<i>${n} chars${over ? ` — over ${limit}, trim before posting` : ''}</i>` +
        (t.why.trim() ? ` · ${esc(t.why.trim())}` : ''),
    )

    const v = checkCopy(t.body)
    const blocked = blockers(v)
    if (blocked.length) {
      lines.push('⛔ <b>Blocked</b>')
      for (const b of blocked) lines.push(`• ${esc(b.detail)}`)
    }
    const warns = v.filter((x) => x.severity === 'warn')
    for (const w of warns) lines.push(`⚠️ ${esc(w.detail)}`)

    lines.push('')
  })

  lines.push('<i>Nothing is posted from here. Copy the one you want.</i>')
  return lines.join('\n')
}

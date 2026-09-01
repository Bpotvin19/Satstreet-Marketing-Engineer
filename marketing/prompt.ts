/* ──────────────────────────────────────────────────────────────────────────
   The marketing manager's instruction set.

   The job description lives here; everything Satstreet-specific lives in
   context/satstreet.md and is loaded in beneath it. That split is deliberate:
   the team edits the context pack, nobody has to touch this file to change
   what the bot knows, and the whole system block stays byte-stable between
   runs so it caches.
   ────────────────────────────────────────────────────────────────────────── */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MARKETING_DIR, type DatedEntry } from './calendar'
import { readReference } from './reference'

const JOB = `You are the marketing manager for Satstreet, a Canadian OTC trading desk for Bitcoin and digital assets.

Every morning you answer one question: given everything happening today, what are the two or three highest-value things Satstreet should say publicly?

You are not a scheduler and not a reminder service. Saying "Bitcoin Pizza Day is today" is worthless — the team can read a calendar. Your value is proposing what Satstreet should actually say about it, and being willing to say when the answer is nothing.

## How to choose

Rank by what would genuinely land with a professional audience of high-net-worth individuals, family offices, corporate treasuries, and the advisors who serve them. A post that gets engagement from retail traders and none from a family office has failed.

Prefer an angle that only Satstreet can credibly make. The desk sees execution, settlement, and custody decisions at size every day; almost nobody posting about Bitcoin has that vantage point. Use it. Generic Bitcoin commentary is the thing to avoid — it is what everyone else posts, and it makes a desk look like a retail account.

A calendar date is a prompt, not an obligation. If the only thing on the calendar is a minor anniversary and there is no interesting angle, say so in the gaps field and propose something better instead. Three strong opportunities beat three filled slots.

Calendar entries carry the desk's own prior thinking: house angles, formats that have worked, the source to cite, and a lead time. Treat that as a colleague's notes — build on it, sharpen it, or say why a different angle is better this year. Do not ignore it and do not merely repeat it back.

Lead time is how far ahead the team drafts. An entry whose drafting window is open is a live opportunity today even though the date itself is weeks away; an entry outside its window belongs in upcoming, not in the three.

Do not propose the same territory the team has covered recently. When you are told what was published lately, treat it as ground already taken.

## Ranking

Rank 1 is what you would post if the team only had time for one thing today. Ranks 2 and 3 are genuinely different — a different channel, a different audience, or a different idea. Three variations on one theme is one opportunity, not three.

## Voice

The reference material includes the desk's own voice guide and real posts the team has published. Those posts are the target. Not "inspired by" — the drafts should be indistinguishable in register from something Jon or Mike would write themselves.

Read the post examples for how the team actually builds an argument: short declarative lines, one idea per line, a plain statement of what Satstreet believes, and the Bitcoin connection arriving last rather than leading. Match that shape. Never open with "At Satstreet, we believe" — the examples make the point through the argument, not by announcing it.

The strongest post is often not about Satstreet at all. A worldview the audience recognises does more brand-building than a product line. Do not force the desk into every idea.

## Channels

X reaches practitioners: shorter, more direct, willing to argue a mechanism. LinkedIn reaches institutions: structural, about infrastructure and process more than about Bitcoin itself. Choose deliberately, and choose "Both" only when the same idea genuinely works in both registers without rewriting the argument.

## Risk

Satstreet is a regulated business heading into US expansion. Marketing copy that strays into claims about custody, insurance, regulatory status, or investment advice is a real problem, not a stylistic one — public, permanent, and screenshot-able.

For every opportunity, fill risk_notes with the specific claims that angle could stray into, so the human drafting it knows where the edge is. Write "none" only when you mean it. If an angle cannot be made safely at all, do not propose it.

The desk's standing editorial guardrail: any market value, ETF flow, AUM figure, transaction count, adoption statistic, or regulatory statement must be refreshed and sourced at the time of publication. When an angle depends on a live number, say so in risk_notes and name the figure that needs refreshing — you cannot see current data and must never supply the number yourself.

You propose and draft. A human decides what gets published. Never write as though a post is going out automatically.

## Output

suggested_hook is one opening line that proves the angle has a concrete shape. It is not a finished post — the team will ask for drafts separately.

Write angle and why_now in the same register the finished post would use: plain, concrete, unexcited. If your suggestion reads like marketing-speak in the proposal, it will read that way in the post.`

export function loadContextPack(): string {
  return readFileSync(resolve(MARKETING_DIR, 'context/satstreet.md'), 'utf8')
}

export function buildSystemPrompt(): string {
  const reference = readReference()

  return `${JOB}

---

# Satstreet context pack

Everything below is what you know about Satstreet. Sections marked TODO have not been filled in yet — do not invent an answer for them, and if a TODO section blocks a good suggestion, say so in the gaps field.

${loadContextPack()}${
    reference
      ? `

---

# Satstreet reference material

Pulled from the team's own Notion pages. This is the authoritative internal record of how Satstreet actually works — custody, fees, regulatory posture, onboarding, past announcements.

Two rules for it. Treat it as fact where the context pack is silent, and prefer it over anything you think you know about the company. But it is internal material, not approved public copy: a fee, a custody arrangement, or a regulatory detail written here has not necessarily been cleared for a post. When an angle depends on one of these specifics, say so in risk_notes and name what needs sign-off.

${reference}`
      : ''
  }`
}

export interface RecentPosts {
  /** False when nothing has ever been logged — different from "logged, but quiet". */
  tracked: boolean
  posts: { date: string; channel: string; title: string; summary: string }[]
}

export interface UserInput {
  date: string
  weekday: string
  calendar: DatedEntry[]
  recent: RecentPosts
  calendarSource: string
}

/** Rendered calendar text, shared by the daily plan and the weekly mix. */
export function formatCalendar(entries: DatedEntry[]): string {
  return entries.length ? entries.map(fmt).join('\n') : 'Nothing scheduled in this window.'
}

function renderRecent(recent: RecentPosts): string {
  if (!recent.tracked) {
    return 'Not yet tracked. Assume nothing about what has been posted recently, and do not claim the team has or has not covered a topic.'
  }
  if (recent.posts.length === 0) {
    return 'Tracked, and nothing has been published in the last three weeks. Every topic is open ground.'
  }
  return [
    'Already published — treat this as ground taken. Do not propose the same territory again unless there is a genuinely new development, and say so explicitly if you do.',
    '',
    ...recent.posts.map(
      (r) => `- ${r.date} · ${r.channel} · ${r.title}${r.summary ? `\n    ${r.summary}` : ''}`,
    ),
  ].join('\n')
}

export function buildUserMessage(input: UserInput): string {
  const today = input.calendar.filter((e) => e.days_away === 0)
  const soon = input.calendar.filter((e) => e.days_away > 0)

  return [
    `Today is ${input.weekday}, ${input.date}.`,
    '',
    `<calendar source="${input.calendarSource}">`,
    today.length
      ? `Dated today:\n${today.map(fmt).join('\n')}`
      : 'Nothing is dated today.',
    '',
    soon.length
      ? `Coming up:\n${soon.map(fmt).join('\n')}`
      : 'Nothing in the next 30 days.',
    '</calendar>',
    '',
    '<recently_published>',
    renderRecent(input.recent),
    '</recently_published>',
    '',
    '<external_signal>',
    'Not yet connected. You have no live information about what is being discussed in Bitcoin or crypto right now, and no market data. Do not claim a topic is trending, and do not reference prices, market moves, or current events you cannot see. Build the day from the calendar, from Satstreet\'s own vantage point as a desk, and from evergreen angles that stand up on any given morning.',
    '</external_signal>',
    '',
    'Give me the two or three highest-value things Satstreet should say publicly today.',
  ].join('\n')
}

/* ──────────────────────────────────────────────────────────────────────────
   Chat bundle.

   The structured-output schema does two jobs: it constrains the shape, and it
   tells the model which fields exist. Pasted into a chat window there is no
   schema, so the shape has to be described in prose instead. Same prompt,
   same calendar, output formatted for a human to read rather than for code
   to parse.
   ────────────────────────────────────────────────────────────────────────── */

const CHAT_OUTPUT_SHAPE = `
---

Respond in exactly this shape, and nothing else:

PRIORITY 1 — [X | LinkedIn | Both]: [short title]
[The angle. Two or three sentences.]
Why now: [one or two sentences]
Hook: "[one opening line — not a finished post]"
Watch: [claims this angle could stray into, or "none"]

PRIORITY 2 — ...
PRIORITY 3 — ...

UPCOMING
- [event] — in [n] days. [what to prepare, and when to start]

GAPS
[What the calendar is missing, or what you would have proposed if the calendar were richer.]`

/** One pasteable block for claude.ai, for running this without an API key. */
export function buildChatBundle(input: UserInput): string {
  return `${buildSystemPrompt()}\n\n---\n\n${buildUserMessage(input)}\n${CHAT_OUTPUT_SHAPE}`
}

function fmt(e: DatedEntry): string {
  const when = e.days_away === 0 ? 'today' : `in ${e.days_away} day${e.days_away === 1 ? '' : 's'}`
  const span = e.end_date && e.end_date !== e.date ? `${e.date} to ${e.end_date}` : e.date
  const due =
    e.lead_time_days !== undefined
      ? e.days_away <= e.lead_time_days
        ? `drafting window is open (${e.lead_time_days}-day lead time)`
        : `drafting starts in ${e.days_away - e.lead_time_days} days (${e.lead_time_days}-day lead time)`
      : ''

  return [
    `- ${span} (${when}) · ${e.title}`,
    e.category ? `    category: ${e.category}` : '',
    e.location ? `    location: ${e.location}` : '',
    e.channel ? `    channel: ${e.channel}` : '',
    e.notes ? `    why it matters: ${e.notes}` : '',
    e.angles ? `    house angles: ${e.angles}` : '',
    e.formats ? `    formats that work: ${e.formats}` : '',
    due ? `    lead time: ${due}` : '',
    e.reference ? `    source to cite: ${e.reference}` : '',
    e.assets_url ? `    assets: ${e.assets_url}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

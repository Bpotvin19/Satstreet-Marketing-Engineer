/* ──────────────────────────────────────────────────────────────────────────
   The client market digest.

   Headlines in, a short desk-voiced briefing out. What clients receive is:

     a market line       BTC and ETH, live from Coinbase
     three to five items each a headline, the source, a link, and one
                         sentence Satstreet wrote about why it matters here

   The one sentence is the whole product. Anyone can forward a link; a desk
   that sees execution, settlement and custody at size can say what a story
   means for someone holding size in Canada. That is the reason a client reads
   this instead of a news app.

   Two constraints the prompt enforces, both non-negotiable:

     Nothing is quoted.  Publisher excerpts go in as input and never come out.
                         Every word broadcast is ours or a factual headline.
     Nothing is advice.  No forecasts, no targets, no "consider buying". The
                         same compliance rules that gate a marketing post gate
                         this, and the output is checked before it can be sent.
   ────────────────────────────────────────────────────────────────────────── */

import { structured } from './claude'
import { buildSystemPrompt } from './prompt'
import { harvest, type Item } from './news'
import { fetchSpot, type Spot } from './price'
import { checkCopy, type Violation } from './compliance'
import * as broadcast from './broadcast'
// telegram-render imports only types from here, so this is not a runtime cycle.
import { renderDigestForChannel, renderDigestItemForChannel } from './telegram-render'
import type { Draft } from './types'

export interface DigestItem {
  headline: string
  source: string
  url: string
  /** One sentence, ours, on why a Satstreet client should care. */
  why: string
}

export interface Digest {
  /** One line on the session, factual. No direction calls. */
  market_line: string
  items: DigestItem[]
  /** Anything the desk chose to leave out and why — shown to the team, not sent. */
  omitted: string
}

export const DIGEST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['market_line', 'items', 'omitted'],
  properties: {
    market_line: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['headline', 'source', 'url', 'why'],
        properties: {
          headline: { type: 'string' },
          source: { type: 'string' },
          url: { type: 'string' },
          why: { type: 'string' },
        },
      },
    },
    omitted: { type: 'string' },
  },
} as const

const JOB = `
You are selecting stories for Satstreet's client market digest. It goes to an
invite-only Telegram channel of existing clients: high-net-worth individuals,
incorporated professionals, corporate treasuries and family offices, trading
$50K to $100M+ through a Canadian OTC desk.

Choose three to five stories from the candidates. Prefer, in order:

  1. Anything with a direct Canadian angle — regulation, banking, listings.
  2. Institutional flows and market structure: ETF flows, custody rules,
     settlement, clearing, liquidity, tokenisation of real assets.
  3. Security and custody events a holder of size should know about.
  4. Majors news that changes something operational, not just the price.

Skip price commentary that says only that the price moved, memecoin stories,
influencer opinion, and anything a client would already have seen everywhere.
If two candidates cover the same story, pick one.

For each story write "why" — ONE sentence, at most 30 words, on what it means
for someone holding or trading size in Canada. This is the entire value of the
digest. Do not restate the headline. Say the operational consequence.

Hard rules:

  - Write every word yourself. Never quote or paraphrase closely from the
    supplied excerpts; they are context for your judgement, not copy to reuse.
    The headline field must be the factual headline as given.
  - No forecasts, price targets, or predictions. Not yours, and do not repeat
    someone else's as though the desk endorses it. Attribute clearly if a
    story IS someone's forecast, and say so plainly.
  - No investment, tax or legal advice. Never suggest an action to take.
  - Never name a competitor desk or exchange as a comparison to Satstreet.
  - No claims about Satstreet's own products, insurance or regulatory status.

"market_line" is one factual sentence on where BTC and ETH are and how they
have moved. No direction calls, no explanation of why.

"omitted" is a short internal note on anything notable you left out and why.
It is shown to the team and is not broadcast.
`.trim()

function marketBlock(assets: Spot[]): string {
  return assets
    .map((a) => {
      const d = (v: number | null) => (v === null || !isFinite(v) ? 'n/a' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`)
      return `${a.symbol} $${a.price.toLocaleString('en-US', { maximumFractionDigits: 2 })} · 24h ${d(a.change24h)} · 7d ${d(a.change7d)}`
    })
    .join('\n')
}

function candidates(items: Item[]): string {
  return items
    .map(
      (i, n) =>
        `${n + 1}. ${i.title}\n   source: ${i.source}\n   url: ${i.link}\n` +
        `   excerpt (context only — do not reuse): ${i.blurb.slice(0, 260)}`,
    )
    .join('\n\n')
}

export interface DigestResult {
  digest: Digest
  /** Compliance findings on the text that would be broadcast. */
  violations: Violation[]
  sourcesOk: string[]
  sourcesFailed: string[]
  candidateCount: number
}

export async function buildDigest(hours = 24): Promise<DigestResult> {
  // Prices and headlines are independent; a failure in one should not cost
  // the other, so the digest degrades rather than disappears.
  const [news, spot] = await Promise.all([
    harvest(hours, 25),
    fetchSpot().catch(() => null),
  ])

  if (!news.items.length) {
    throw new Error(
      `No stories in the last ${hours}h. Sources reached: ${news.ok.join(', ') || 'none'}.`,
    )
  }

  const user = [
    `Today is ${new Date().toISOString().slice(0, 10)}.`,
    '',
    '<market>',
    spot ? marketBlock(spot.assets) : 'Price feed unavailable — write market_line as "Prices unavailable."',
    '</market>',
    '',
    `<candidates count="${news.items.length}">`,
    candidates(news.items),
    '</candidates>',
  ].join('\n')

  const digest = await structured<Digest>(
    `${buildSystemPrompt()}\n\n---\n\n${JOB}`,
    user,
    DIGEST_SCHEMA,
    6_000,
  )

  // Check exactly what would go out — the market line and every sentence we
  // wrote. Headlines are the publishers' factual words and are not ours to
  // rewrite, so they are excluded from the copy check.
  const ours = [digest.market_line, ...digest.items.map((i) => i.why)].join('\n')

  return {
    digest,
    violations: checkCopy(ours),
    sourcesOk: news.ok,
    sourcesFailed: news.failed,
    candidateCount: news.items.length,
  }
}

/* ── staging for publication ──────────────────────────────────────────────── */

/**
 * A digest is not a Draft, but the send-time compliance re-check works on one.
 * This wraps whichever sentences would actually be broadcast so the re-check
 * sees exactly those words and no others.
 */
function asDraft(body: string): Draft {
  return {
    channel: 'LinkedIn',
    format: 'market brief',
    body,
    alt_hooks: [],
    sources_to_cite: [],
    needs_refresh: [],
    compliance_self_check: 'digest',
  }
}

export interface StagedDigest {
  /** One staged post per story, in the order shown. */
  itemIds: string[]
  /** The whole brief as a single post. */
  allId: string
}

/**
 * Stage every story separately, plus the full brief.
 *
 * Each becomes an ordinary pending broadcast, so a single story and the whole
 * brief travel the identical confirm-check-send path. Nothing about picking
 * one story needs its own logic, which is the point — a second path is a
 * second place for the compliance gate to be forgotten.
 */
export function stageDigest(d: Digest, chatId: number, by: string, date = new Date()): StagedDigest {
  const day = date.toISOString().slice(0, 10)

  const itemIds = d.items.map((item, n) =>
    broadcast.stage({
      chatId,
      text: renderDigestItemForChannel(item, date),
      draft: asDraft(item.why),
      title: `Brief ${day} · ${n + 1}. ${item.headline.slice(0, 60)}`,
      approvedBy: by,
    }),
  )

  const allId = broadcast.stage({
    chatId,
    text: renderDigestForChannel(d, date),
    draft: asDraft([d.market_line, ...d.items.map((i) => i.why)].join('\n')),
    title: `Market brief — ${day}`,
    approvedBy: by,
  })

  return { itemIds, allId }
}

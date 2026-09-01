/* ──────────────────────────────────────────────────────────────────────────
   Drafting.

   Three jobs, one shape: take the same Satstreet system prompt the morning
   plan uses, add what we're drafting, and constrain the output to a schema.
   The system block is byte-identical to the planner's, so it hits the same
   prompt cache.
   ────────────────────────────────────────────────────────────────────────── */

import { buildSystemPrompt } from './prompt'
import { coverage, coverageBlock } from './news'
import { TWEETS_SCHEMA, type TweetSet } from './types'
import { structured } from './claude'
import {
  DRAFT_SCHEMA,
  CARD_DRAFT_SCHEMA,
  VARIANTS_SCHEMA,
  IDEAS_SCHEMA,
  type Draft,
  type CardDraft,
  type Variants,
  type IdeaSet,
  type Opportunity,
} from './types'

const CHANNEL_BRIEF: Record<'X' | 'LinkedIn', string> = {
  // No threads. The old brief invited one "when the mechanism needs more room",
  // and that permission is what produced long explanatory posts. If an idea
  // does not fit in one post it is a LinkedIn post, not a thread.
  X: 'ONE post, ideally under 220 characters and never over 280. Never a thread. Short sentences. Simple, direct language — no corporate speak, no jargon, no hashtags, no emoji. Open with a strong, simple hook. It should read like a person posting, not a company publishing. If the idea will not fit in one post, say so in compliance_self_check and write the strongest single post you can rather than stretching it.',
  LinkedIn:
    'A post of roughly 120 to 220 words. Short paragraphs, line breaks between them, no bullet-point walls. Opens with the substantive claim rather than a throat-clearing hook.',
}

const RULES = `
Write the post itself — not a description of a post, not notes toward one. A human is going to read this and decide whether to publish it as written.

Nothing you write is published automatically. Do not add a call to action that assumes scheduling, and do not write "link in bio" or similar unless the assets say there is one.

If the angle needs a live figure — a price, a flow, an AUM number, a transaction count, an adoption statistic — write the claim with a clear placeholder such as [ETF net inflow, refresh] and list that figure in needs_refresh. Never supply the number yourself: you cannot see current data, and an invented figure in public copy is the worst failure mode this system has.

Historical facts are different. Dates, events, and what happened are stable and can be stated plainly, with the source named in sources_to_cite.

In compliance_self_check, say in one or two sentences where this draft sits against the guardrails — custody, insurance, regulatory status, advice, client confidentiality. If it is clean, say why it is clean rather than just asserting it.`

export async function draftPost(opportunity: Opportunity, channel: 'X' | 'LinkedIn'): Promise<Draft> {
  // The plan's own words are the search: a priority about ETF flows should
  // draft against today's ETF stories, not against the calendar alone.
  const news = coverageBlock(await coverage(`${opportunity.title} ${opportunity.angle}`))
  const user = [
    `Draft a ${channel} post for this opportunity.`,
    '',
    '<opportunity>',
    `title: ${opportunity.title}`,
    `angle: ${opportunity.angle}`,
    `why now: ${opportunity.why_now}`,
    `suggested hook: ${opportunity.suggested_hook}`,
    opportunity.calendar_ref ? `from calendar: ${opportunity.calendar_ref}` : '',
    opportunity.assets_url ? `assets: ${opportunity.assets_url}` : '',
    `known risks: ${opportunity.risk_notes}`,
    '</opportunity>',
    '',
    news,
    '',
    `<channel>${CHANNEL_BRIEF[channel]}</channel>`,
    RULES,
  ]
    .filter(Boolean)
    .join('\n')

  return structured<Draft>(buildSystemPrompt(), user, DRAFT_SCHEMA, 8_000)
}

/* ── writing as someone, versus writing like something ────────────────────
   Two different instructions, and the difference is not stylistic.

   A founder profile is a person the desk can post as: the draft goes out from
   their account and sounds like them. An external style reference is nobody's
   account. The desk borrows how the argument is built and publishes it as
   Satstreet — no phrasing lifted, no author named, no endorsement implied.

   Sharing one prompt for both is how you end up impersonating a stranger, so
   the framing branches on kind and everything else stays common.
   ────────────────────────────────────────────────────────────────────────── */

export interface VoiceInput {
  name: string
  profile: string
  /** Defaults to a person, which is what every caller meant before styles. */
  kind?: 'person' | 'style' | 'house'
}

function voiceFraming(voice: VoiceInput): string[] {
  if (voice.kind === 'house') {
    return [
      'This is the Satstreet house account, not a founder posting personally. The post examples and voice guidance in your context are the target.',
    ]
  }

  if (voice.kind === 'style') {
    return [
      `This post goes out from the Satstreet house account. ${voice.name} is an external writing style the desk borrows the shape of an argument from — not a person Satstreet represents, and not a byline.`,
      '',
      'The reference below is the authority on structure, sentence rhythm and how a point is built. Borrow the shape. Do not reproduce its phrasing, do not name or allude to the author, do not adopt or imply their views, and do not write anything that reads as an imitation of a named individual.',
      '',
      'The payload is a MECHANISM, never a prediction. Explain how a constraint works and what it forces; never forecast a price, a rate decision or a market outcome, and never restate a forecast the reference makes as though the desk holds it. If the topic only supports a prediction, take a different angle on it.',
      '',
      'Everything in the Satstreet context still applies in full. A borrowed style does not loosen a single guardrail.',
      '',
      `<style_reference name="${voice.name}">`,
      voice.profile,
      '</style_reference>',
    ]
  }

  return [
    `You are drafting as ${voice.name}, in their personal voice, posting from their own account.`,
    '',
    'The profile below is the authority on how they write. Follow its structure, sentence rhythm, conviction level and vocabulary. Do not reproduce phrasing from its examples — they calibrate the voice, they are not a library to copy from.',
    '',
    'Everything in the Satstreet context still applies. A personal account does not loosen the guardrails: the same rules on custody, insurance, regulatory status, eligibility and advice hold, because a founder posting is still Satstreet speaking.',
    '',
    `<voice_profile name="${voice.name}">`,
    voice.profile,
    '</voice_profile>',
  ]
}

/**
 * Draft a post in one named person's voice, or in an external style.
 *
 * The profile rides in the user turn rather than the system block, so the
 * cached prefix stays identical across voices — three drafts of the same topic
 * pay for one system prompt, not three.
 */
export async function draftInVoice(
  topic: string,
  voice: VoiceInput,
  channel: 'X' | 'LinkedIn',
): Promise<Draft> {
  const news = coverageBlock(await coverage(topic))
  const user = [
    `Write a ${channel} post about: ${topic}`,
    '',
    ...voiceFraming(voice),
    '',
    news,
    '',
    `<channel>${CHANNEL_BRIEF[channel]}</channel>`,
    RULES,
    '',
    voice.kind === 'style'
      ? `In compliance_self_check, also say in one line what keeps this recognisably Satstreet rather than an imitation of the ${voice.name} author.`
      : `In compliance_self_check, also say in one line why this reads as ${voice.name} rather than as the house account.`,
  ].join('\n')

  return structured<Draft>(buildSystemPrompt(), user, DRAFT_SCHEMA, 8_000)
}

/* ── the Founder News Desk ────────────────────────────────────────────────
   Grok harvests the news overnight and writes a card into the Content Queue:
   a draft, the mechanism it turns on, a source, a voice, a pillar and a risk
   level. This bot rewrites that card in the named voice. A human publishes.

   The card's mechanism is the desk's own analysis and survives the rewrite —
   what changes is how it is said, not what it claims.
   ────────────────────────────────────────────────────────────────────────── */

/** The desk's one-line structural note per voice, from the News Desk brief. */
const VOICE_CHEAT: Record<string, string> = {
  michael: 'Hook with tension. Macro first, Bitcoin second. One clean close.',
  jon: 'Problem, then consequence, then one mechanism, then the takeaway. Short sentences.',
  george:
    'Only where there is a real operating, treasury, El Salvador or relationship angle. An open-door CTA is allowed here and nowhere else.',
  house: 'Development, why it matters, implication, takeaway. No forced CTA.',
}

const DESK_RULES = `
This is a Founder News Desk card. Grok harvested it, you rewrite it, a human publishes it. You are not publishing and you are not approving anything.

Keep the mechanism the card identified. That is the desk's own analysis and it is why the card exists — rewrite how it is said, not what it claims. If you think the mechanism is wrong, say so in compliance_self_check rather than quietly replacing it.

ONE voice. The one asked for. Never blend two, and never hedge toward the house voice when writing as a person.

Notion is not a live price feed. Every number on the card is stale until a human checks it. Carry a number over only when the post needs it, write it as [VERIFY: what it is] in the body, and list it in needs_refresh. Never introduce a figure the card did not have.

Never reproduce sentences or paragraphs from the source article, or from any newsletter the desk publishes. Rewrite in the voice, in your own words.

Hard limits on this account, all of them absolute:
  - No price targets, and no forecast of any market outcome.
  - Never say Satstreet is "safe", CIPF-covered, or insured for any amount. The $320M insurance figure and any assets-under-custody number are not public copy.
  - Never mention a $25,000 minimum, or zero or no slippage.
  - Never say or imply Satstreet serves Florida, the United States or the United Kingdom.
  - Never describe a lending, borrowing or credit product. There isn't one.
  - No client names, wallet addresses, ticket or order references.

If the card or the user's note involves a US or Florida lead, do not draft outreach of any kind. Say plainly that it goes to Florida Gatekeeper / Legal, and write nothing addressed to that lead.

do_not_say is at most three short bullets, written for the person about to publish: the specific claims THIS angle could stray into, not the general rules.

"why" is one sentence with three parts: the mechanism this post explains, why this voice suits it, and what is forbidden on this angle.`

export type RewriteMode = 'rewrite' | 'shorten' | 'linkedin'

const MODE_BRIEF: Record<RewriteMode, string> = {
  rewrite: 'Rewrite the card in this voice.',
  shorten:
    'Rewrite the card in this voice, materially shorter than the card\'s draft. Cut clauses, examples and second thoughts. Do not shrink the idea, and do not drop the mechanism.',
  linkedin:
    'Rewrite the card in this voice as a LinkedIn post: roughly 120 to 220 words, short paragraphs, line breaks between them, opening on the substantive claim rather than a hook.',
}

export async function rewriteCard(
  card: {
    title: string
    draft: string
    notes: string
    source: string
    voice: string
    pillar: string
    risk: string
  },
  voice: VoiceInput & { slug: string },
  mode: RewriteMode = 'rewrite',
): Promise<CardDraft> {
  const channel: 'X' | 'LinkedIn' = mode === 'linkedin' ? 'LinkedIn' : 'X'
  const cheat = VOICE_CHEAT[voice.slug]

  const user = [
    MODE_BRIEF[mode],
    '',
    '<card>',
    `title: ${card.title}`,
    `pillar: ${card.pillar}`,
    `compliance risk: ${card.risk}`,
    `source: ${card.source || 'none given'}`,
    card.notes ? `desk notes (the mechanism, from Grok): ${card.notes}` : '',
    '',
    'draft as harvested:',
    card.draft || '(the card has no draft text — work from the title and notes)',
    '</card>',
    '',
    ...voiceFraming(voice),
    cheat ? `\nStructural note for this voice, from the desk: ${cheat}` : '',
    '',
    `<channel>${CHANNEL_BRIEF[channel]}</channel>`,
    RULES,
    DESK_RULES,
  ]
    .filter(Boolean)
    .join('\n')

  return structured<CardDraft>(buildSystemPrompt(), user, CARD_DRAFT_SCHEMA, 8_000)
}

/** A post on an arbitrary topic in the house voice — the /post flow's default. */
export async function draftTopic(topic: string, channel: 'X' | 'LinkedIn'): Promise<Draft> {
  // Without current coverage the model has only the static context pack, and
  // every post comes out evergreen. This is what makes it topical.
  const news = coverageBlock(await coverage(topic))
  const user = [
    `Write a ${channel} post about: ${topic}`,
    '',
    'This is the Satstreet house account, not a founder posting personally. The post examples and voice guidance in your context are the target.',
    '',
    'If the topic is thin or the angle would be generic, say so in compliance_self_check and write the strongest version you can rather than padding it.',
    '',
    news,
    '',
    `<channel>${CHANNEL_BRIEF[channel]}</channel>`,
    RULES,
  ].join('\n')

  return structured<Draft>(buildSystemPrompt(), user, DRAFT_SCHEMA, 8_000)
}

export async function rewrite(draft: Draft, note?: string): Promise<Variants> {
  const user = [
    `Give me three stronger versions of this ${draft.channel} post.`,
    '',
    '<current_draft>',
    draft.body,
    '</current_draft>',
    '',
    note ? `<direction>${note}</direction>\n` : '',
    'Each version takes a genuinely different approach — a different opening move, a different structure, or a different aspect of the argument. Three rewordings of the same post is one version, not three.',
    'Label each in two or three words, and say in one sentence what makes it stronger than the current draft.',
    RULES,
  ]
    .filter(Boolean)
    .join('\n')

  return structured<Variants>(buildSystemPrompt(), user, VARIANTS_SCHEMA, 8_000)
}

export async function ideas(topic: string): Promise<IdeaSet> {
  const news = coverageBlock(await coverage(topic))
  const user = [
    `Generate content angles on: ${topic}`,
    '',
    'Give four to six angles Satstreet could credibly take. Prefer the ones that only a desk seeing execution, settlement and custody at size could make — generic commentary on this topic is what everyone else posts.',
    'For each, name the channel it suits and the claims it could stray into.',
    'These are angles, not finished posts. The team will ask for a draft separately.',
    '',
    news,
  ].join('\n')

  return structured<IdeaSet>(buildSystemPrompt(), user, IDEAS_SCHEMA, 8_000)
}

/* ── /tweets ──────────────────────────────────────────────────────────────────
   Three short posts, three different shapes, built to the desk's brief:
   punchy, human, no threads, no hashtags, under 220 characters.

   The three shapes are not decoration. Asking for one post three times gets
   the same thought reworded; asking for an observation, a question and a
   contrast forces three genuinely different angles on the same subject, and
   the team picks.
   ────────────────────────────────────────────────────────────────────────── */

export const TWEET_LIMIT = 220

/* The house register. Upbeat and hook-led, which is right for the Satstreet
   account and actively wrong for a borrowed style — see STYLE_REGISTER. */
const HOUSE_REGISTER = `Style rules, all three:
  - Simple, direct language. Short sentences.
  - Punchy and confident. Slightly exciting, still professional.
  - No corporate speak, no jargon, no hashtags, no emoji.
  - Constructively bullish, without predicting a price.
  - It should sound like a real person posting, not a content machine.
  - Open with a strong, simple hook.`

/* A style reference loses most of its point if the house tone rules stay in
   force underneath it: "punchy", "slightly exciting" and "open with a strong
   hook" are the three instructions that flatten every borrowed voice back into
   desk copy. So when a style is in play these replace them outright. */
const STYLE_REGISTER = `Style rules, all three. The style reference above sets the register, and where
it differs from the desk's usual tone it WINS:
  - Dry certainty, not excitement. No hype, no enthusiasm, no exclamation.
    Confidence comes from the reasoning being sound, never from volume. A post
    that sounds pleased with itself is off-voice.
  - Cold open. Start mid-thought, as though continuing a conversation the
    reader was already in. No framing line, no hook-building, and do not name
    the topic before making the point.
  - Short lines, stacked, with a blank line between them. Not a paragraph.
    Each line is one complete thought and sits alone.
  - Land flat. The closing line is short, unemphatic, restates nothing and
    asks nothing. It is often the driest line in the post.
  - Plain words, concrete nouns, the actual mechanism named. "The wire has to
    clear" beats "operational considerations".
  - No hedging. Not "arguably", not "it could be said", not "many would argue".
    If a claim needs a hedge to be safe, take a different angle instead of
    softening this one.
  - Argue with a position, never with a person. Never name, quote or
    characterise another account, commentator, official or firm.
  - No corporate speak, no jargon, no hashtags, no emoji.`

const TWEET_LENGTH = `  - HARD LIMIT: ${TWEET_LIMIT} characters INCLUDING spaces and line breaks.
    This is the constraint most often missed. Count before you answer. A post
    of 250 characters is a failed post, however good the sentence is. Cut a
    clause, cut an example, cut the second thought — do not shrink the idea.

"why" is one line for the team, at most 20 words. Not a paragraph.`

const MECHANISM_SHAPE = `  1. mechanism — the confident cut-through. Name what is being said publicly,
     then the structural constraint that governs the outcome regardless of the
     messaging. The shape is:

         "They will say X. But A and B mean Y, whatever they say."

     Certain, dry, slightly wry. Written by someone who has watched the
     plumbing long enough to be unimpressed by the press conference. A short
     deadpan closer lands it.

     CRITICAL: the payload is a MECHANISM, not a prediction. Explain how a
     constraint actually works and what it forces operationally. Never forecast
     a price, a rate decision or a market outcome, and never restate someone
     else's forecast as though the desk endorses it.

       forecast  (not allowed): "the debt ultimately forces the Fed to monetise"
       mechanism (allowed):     "settlement risk does not disappear because a
                                 counterparty says the word insured"

     If a topic only supports a prediction, take a different angle on it rather
     than making one.`

const HOUSE_SHAPES = `  2. question — a real question that invites replies. Not rhetorical, not a quiz.
  3. contrast — a short "then vs now". Two states, the gap between them doing the work.`

/* The house set asks for a question post, which is engagement-shaped and the
   most off-voice thing a borrowed style can be handed. These two replace it
   with shapes the reference actually uses. */
const STYLE_SHAPES = `  2. received — the received opinion, then the dismissal. List what everyone is
     currently saying about this: three or four of them, one per line, stated
     flatly and without caricature. Then one short line that dismisses the lot
     on structural grounds. The dismissal is the SHORTEST line in the post.

     It dismisses by explaining what the consensus misreads about how the thing
     works. It never dismisses by predicting the opposite outcome.

  3. detail — one small, concrete, operational observation, offered without
     explanation. What a settlement instruction actually requires. What a
     counterparty asks for at four o'clock. What breaks first at size. No moral
     drawn, no lesson stated, no "and that tells you something" line: the
     reader does the inference, and the post ends before the explanation would
     have started.

     Only what is generally true of how the desk works. Never invent a client,
     a trade, a conversation or an anecdote — a fabricated specific is worse
     here than a dull post, because it reads as true.`

/**
 * The brief the three posts are written to.
 *
 * Shared spine, two swappable parts: the register and shapes two and three.
 * A borrowed style needs both swapped — leaving the house tone underneath it
 * is what made every style read like the house account with shorter sentences.
 */
function tweetBrief(style: boolean): string {
  return [
    'Write three X posts. Each is a standalone post — never a thread, never numbered.',
    '',
    style ? STYLE_REGISTER : HOUSE_REGISTER,
    TWEET_LENGTH,
    '',
    'Each must use a DIFFERENT shape:',
    '',
    MECHANISM_SHAPE,
    '',
    style ? STYLE_SHAPES : HOUSE_SHAPES,
    '',
    TWEET_TAIL,
  ].join('\n')
}

const TWEET_TAIL = `The three must not be the same idea reworded. If you cannot find three
genuinely different angles, say so in "hook" rather than padding.

Use the current coverage below to make these timely when something genuinely
relates — name what happened. If nothing does, write the evergreen version and
leave "hook" empty. Never imply a news hook that is not there.

Guardrails still apply in full: no price targets or forecasts, no investment
advice, no claims about Satstreet's products, insurance or regulatory status,
no naming competitors.
`.trim()

export async function tweets(
  topic: string,
  voice?: VoiceInput,
): Promise<TweetSet> {
  const news = coverageBlock(await coverage(topic))
  const style = voice?.kind === 'style'

  const user = [
    `Topic: ${topic}`,
    '',
    !voice
      ? 'This is the Satstreet house account.'
      : style
        ? `These go out from the Satstreet house account. ${voice.name} is an external writing style, not a byline: borrow how the argument is built, never its phrasing, never the author's name or views, and never write something that reads as an imitation of a named individual.`
        : `You are drafting as ${voice.name}, posting from their own account. The profile below is the authority on how they write — follow its rhythm and vocabulary without reusing its phrasing.`,
    '',
    voice
      ? `<${style ? 'style_reference' : 'voice_profile'} name="${voice.name}">\n${voice.profile}\n</${style ? 'style_reference' : 'voice_profile'}>\n`
      : '',
    news,
    '',
    tweetBrief(style),
  ]
    .filter(Boolean)
    .join('\n')

  const set = await structured<TweetSet>(buildSystemPrompt(), user, TWEETS_SCHEMA, 4_000)
  return tighten(set, voice)
}

/**
 * Second pass over anything that came back too long.
 *
 * The length rule is the one the model reliably ignores — the first run
 * returned 269, 232 and 289 characters against a 220 limit. Telling it again
 * with the actual counts works where the original instruction did not, and it
 * costs one extra call only when something is over.
 */
async function tighten(set: TweetSet, voice?: VoiceInput): Promise<TweetSet> {
  const over = set.tweets.filter((t) => t.body.length > TWEET_LIMIT)
  if (!over.length) return set

  const user = [
    `These posts are over the ${TWEET_LIMIT}-character limit. Rewrite each one shorter.`,
    '',
    ...over.map(
      (t) => `[${t.style}] ${t.body.length} characters, needs to lose at least ` +
        `${t.body.length - TWEET_LIMIT}:\n${t.body}`,
    ),
    '',
    'Keep the shape, the voice and the point. Cut clauses, examples and second',
    'thoughts — do not summarise the idea into something blander. Return all',
    `three posts, with the ones already under ${TWEET_LIMIT} unchanged.`,
    '',
    ...set.tweets
      .filter((t) => t.body.length <= TWEET_LIMIT)
      .map((t) => `[${t.style}] already fine at ${t.body.length}:\n${t.body}`),
    voice ? `\nStill ${voice.kind === 'style' ? `in the ${voice.name} shape` : `writing as ${voice.name}`}.` : '',
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const second = await structured<TweetSet>(buildSystemPrompt(), user, TWEETS_SCHEMA, 3_000)
    // Only accept the rewrite where it actually helped; a longer "shorter"
    // version is worse than what we had.
    return {
      ...set,
      tweets: set.tweets.map((orig) => {
        const redo = second.tweets.find((t) => t.style === orig.style)
        if (!redo) return orig
        const better = redo.body.length < orig.body.length && redo.body.trim().length > 0
        return better ? { ...orig, body: redo.body, why: orig.why } : orig
      }),
    }
  } catch {
    return set // the render shows the counts; a failed retry is not fatal
  }
}

/* ──────────────────────────────────────────────────────────────────────────
   What the morning run returns.

   Same discipline as the client-brief pipeline: the model returns structured
   JSON against a schema, not prose. Here it also matters for Phase 1 — the
   Telegram buttons need a stable object to attach a callback to, and "draft
   opportunity 2" only means something if opportunity 2 is addressable.
   ────────────────────────────────────────────────────────────────────────── */

export interface Opportunity {
  rank: number
  channel: 'X' | 'LinkedIn' | 'Both'
  /** Short label — becomes the Telegram button text in Phase 1. */
  title: string
  /** The actual argument to make. Two or three sentences. */
  angle: string
  /** Why today rather than any other day. */
  why_now: string
  /** An opening line, to show the angle has a concrete shape. Not a finished post. */
  suggested_hook: string
  /** Title of the calendar entry this came from, when it came from one. */
  calendar_ref: string | null
  assets_url: string | null
  /** Claims this angle could stray into. The compliance gate reads this in Phase 1. */
  risk_notes: string
}

export interface UpcomingItem {
  event: string
  date: string
  days_away: number
  assets_url: string | null
  prep_note: string
}

export interface DailyPlan {
  date: string
  opportunities: Opportunity[]
  upcoming: UpcomingItem[]
  /** What the calendar is missing — the weekly-gap job in Phase 2 grows from this. */
  gaps: string
}

/* ── drafting ─────────────────────────────────────────────────────────────── */

export interface Draft {
  channel: 'X' | 'LinkedIn'
  /** e.g. "single post", "thread", "carousel outline". */
  format: string
  /** The post itself, ready to be read by a human and copied if approved. */
  body: string
  /** Two alternative openers, so the team isn't stuck with one hook. */
  alt_hooks: string[]
  /** Live figures that must be refreshed and sourced before this goes out. */
  needs_refresh: string[]
  sources_to_cite: string[]
  /** The model's own read on where this draft sits against the guardrails. */
  compliance_self_check: string
}

export interface Variant {
  label: string
  body: string
  why_stronger: string
}

export interface Variants {
  variants: Variant[]
}

export interface WeeklySlot {
  day: string
  channel: 'X' | 'LinkedIn' | 'Both'
  topic: string
  pillar: string
  why: string
}

export interface Weekly {
  week_of: string
  mix: WeeklySlot[]
  gaps: string
  /** Pillars untouched by this week's mix — the thing a calendar can't tell you. */
  pillars_missing: string[]
}

export interface IdeaSet {
  topic: string
  ideas: { title: string; angle: string; channel: 'X' | 'LinkedIn' | 'Both'; risk_notes: string }[]
}

const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] }

export const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['date', 'opportunities', 'upcoming', 'gaps'],
  properties: {
    date: { type: 'string', format: 'date' },
    opportunities: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'rank',
          'channel',
          'title',
          'angle',
          'why_now',
          'suggested_hook',
          'calendar_ref',
          'assets_url',
          'risk_notes',
        ],
        properties: {
          rank: { type: 'integer', enum: [1, 2, 3] },
          channel: { type: 'string', enum: ['X', 'LinkedIn', 'Both'] },
          title: { type: 'string' },
          angle: { type: 'string' },
          why_now: { type: 'string' },
          suggested_hook: { type: 'string' },
          calendar_ref: nullableString,
          assets_url: nullableString,
          risk_notes: {
            type: 'string',
            description:
              'Claims this angle could stray into (custody, insurance, regulation, advice). "none" if genuinely none.',
          },
        },
      },
    },
    upcoming: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['event', 'date', 'days_away', 'assets_url', 'prep_note'],
        properties: {
          event: { type: 'string' },
          date: { type: 'string' },
          days_away: { type: 'integer' },
          assets_url: nullableString,
          prep_note: { type: 'string' },
        },
      },
    },
    gaps: { type: 'string' },
  },
} as const

/* ── Sales/BD research ─────────────────────────────────────────────────────
   The shape of one entry in the Daily Prospect List, so /research produces
   something the sales team can paste straight into the list rather than a
   paragraph they have to reformat.

   Every field is public-data-only. The engine spec is explicit that this is a
   prioritisation thesis built from public sources, not a claim about anyone's
   intent to trade, and unknowns stay unknown rather than being filled in.
   ────────────────────────────────────────────────────────────────────────── */

export interface Research {
  company: string
  category: string
  /** Empty when nothing recent was found — never a manufactured event. */
  trigger: string
  why_now: string
  /** What Satstreet could plausibly provide. A hypothesis, labelled as one. */
  likely_flow: string
  decision_makers: string[]
  contact_path: string
  repeat_flow: 'Very High' | 'High' | 'Medium' | 'Low' | 'Unknown'
  satstreet_angle: string
  /** US/Florida entities are research-only until compliance says otherwise. */
  jurisdiction_note: string
  sources: string[]
  /** What could not be established from public sources. */
  gaps: string[]
}

export const RESEARCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'company', 'category', 'trigger', 'why_now', 'likely_flow', 'decision_makers',
    'contact_path', 'repeat_flow', 'satstreet_angle', 'jurisdiction_note', 'sources', 'gaps',
  ],
  properties: {
    company: { type: 'string' },
    category: { type: 'string', description: 'What the company actually does, in a few words.' },
    trigger: {
      type: 'string',
      description:
        'A specific, recent, publicly reported event with a date. Empty string if none was found — never invent or generalise one.',
    },
    why_now: { type: 'string' },
    likely_flow: {
      type: 'string',
      description:
        'The execution, liquidity or settlement need this company plausibly has. A hypothesis from public facts, never a claim about their intent.',
    },
    decision_makers: {
      type: 'array',
      items: { type: 'string' },
      description: 'Name — title, from public sources only. Empty if none could be established.',
    },
    contact_path: { type: 'string', description: 'Public route in: IR page, website form, LinkedIn.' },
    repeat_flow: { type: 'string', enum: ['Very High', 'High', 'Medium', 'Low', 'Unknown'] },
    satstreet_angle: {
      type: 'string',
      description:
        'The opening a Satstreet person would actually use. Execution redundancy beats pitching crypto to a company already in crypto.',
    },
    jurisdiction_note: {
      type: 'string',
      description:
        'Where the entity operates and what that means. US or Florida entities are RESEARCH AND RELATIONSHIP-BUILDING ONLY until Satstreet legal and compliance confirm permissions.',
    },
    sources: { type: 'array', items: { type: 'string' }, description: 'Public URLs only.' },
    gaps: {
      type: 'array',
      items: { type: 'string' },
      description: 'What public sources did not establish. Say so rather than filling it in.',
    },
  },
} as const

/* ── the Founder News Desk card rewrite ────────────────────────────────────
   A Draft plus the two things the desk's Telegram format requires and the
   other flows do not: the do-not-say list that ships beside every card, and
   the one-line rationale /why prints. Both come back from the same call, so
   /why costs nothing extra.
   ────────────────────────────────────────────────────────────────────────── */

export interface CardDraft extends Draft {
  /** At most three. What this specific angle must avoid claiming. */
  do_not_say: string[]
  /** One sentence: the mechanism, why this voice, and what is forbidden. */
  why: string
}

export const CARD_DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'channel',
    'format',
    'body',
    'alt_hooks',
    'needs_refresh',
    'sources_to_cite',
    'compliance_self_check',
    'do_not_say',
    'why',
  ],
  properties: {
    channel: { type: 'string', enum: ['X', 'LinkedIn'] },
    format: { type: 'string' },
    body: {
      type: 'string',
      description: 'The rewritten post, ready to read. Never a thread unless the idea genuinely needs one.',
    },
    alt_hooks: { type: 'array', items: { type: 'string' } },
    needs_refresh: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Every live figure the draft depends on. A number carried over from the source card counts — it must still be verified at publication.',
    },
    sources_to_cite: { type: 'array', items: { type: 'string' } },
    compliance_self_check: { type: 'string' },
    do_not_say: {
      type: 'array',
      items: { type: 'string' },
      description:
        'At most three. The specific claims this angle could stray into, written as short do-not-say bullets for the person publishing.',
    },
    why: {
      type: 'string',
      description:
        'ONE sentence, three parts: the mechanism this post explains, why this voice suits it, and what is forbidden on this angle.',
    },
  },
} as const

export const DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'channel',
    'format',
    'body',
    'alt_hooks',
    'needs_refresh',
    'sources_to_cite',
    'compliance_self_check',
  ],
  properties: {
    channel: { type: 'string', enum: ['X', 'LinkedIn'] },
    format: { type: 'string' },
    body: {
      type: 'string',
      description:
        'The post, ready to read. For an X thread, number the posts 1/, 2/, 3/. No hashtag stuffing, no emoji clusters.',
    },
    alt_hooks: { type: 'array', items: { type: 'string' } },
    needs_refresh: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Every live figure the draft depends on — price, flows, AUM, counts, adoption stats. Empty only if the draft contains none.',
    },
    sources_to_cite: { type: 'array', items: { type: 'string' } },
    compliance_self_check: { type: 'string' },
  },
} as const

export const VARIANTS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['variants'],
  properties: {
    variants: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'body', 'why_stronger'],
        properties: {
          label: { type: 'string', description: 'Two or three words naming the approach.' },
          body: { type: 'string' },
          why_stronger: { type: 'string' },
        },
      },
    },
  },
} as const

export const WEEKLY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['week_of', 'mix', 'gaps', 'pillars_missing'],
  properties: {
    week_of: { type: 'string', description: 'ISO date of the Monday this mix covers.' },
    mix: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['day', 'channel', 'topic', 'pillar', 'why'],
        properties: {
          day: { type: 'string', enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] },
          channel: { type: 'string', enum: ['X', 'LinkedIn', 'Both'] },
          topic: { type: 'string' },
          pillar: { type: 'string', description: 'Which content pillar this sits in.' },
          why: { type: 'string' },
        },
      },
    },
    gaps: { type: 'string' },
    pillars_missing: { type: 'array', items: { type: 'string' } },
  },
} as const

export const IDEAS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['topic', 'ideas'],
  properties: {
    topic: { type: 'string' },
    ideas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'angle', 'channel', 'risk_notes'],
        properties: {
          title: { type: 'string' },
          angle: { type: 'string' },
          channel: { type: 'string', enum: ['X', 'LinkedIn', 'Both'] },
          risk_notes: { type: 'string' },
        },
      },
    },
  },
} as const

/* ── short-form X posts ───────────────────────────────────────────────────── */

export type TweetStyle = 'mechanism' | 'question' | 'contrast' | 'received' | 'detail'

export interface Tweet {
  style: TweetStyle
  body: string
  /** One line on why this one earns a reader's attention. Team-facing. */
  why: string
}

export interface TweetSet {
  topic: string
  tweets: Tweet[]
  /** Named if the set leans on a current development; empty when evergreen. */
  hook: string
}

export const TWEETS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['topic', 'tweets', 'hook'],
  properties: {
    topic: { type: 'string' },
    hook: { type: 'string' },
    tweets: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['style', 'body', 'why'],
        properties: {
          style: { type: 'string', enum: ['mechanism', 'question', 'contrast', 'received', 'detail'] },
          body: { type: 'string' },
          why: { type: 'string' },
        },
      },
    },
  },
} as const

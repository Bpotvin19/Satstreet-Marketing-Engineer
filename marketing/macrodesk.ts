/* ──────────────────────────────────────────────────────────────────────────
   Macro Desk — reading the desk's own daily intel.

   The overnight bots consolidate the wires into a Macro Desk page in the
   Daily Intel database: a world brief, a must-read list with sources, and
   industry tiles. It is better source material than anything this bot could
   assemble by reading the press itself, because a person set the agenda.

   Two things in that document decide how it can be used, and both come from
   the desk rather than from me.

   The header says so in its own words:

       "Internal only. Not investment advice. Not client copy."

   So this file never publishes what it reads. The Macro Desk page is source
   material that a separate, compliance-checked, human-approved pass turns
   into client copy — the same relationship a reporter's notes have to a
   published story. Piping it through verbatim would publish casualty counts,
   sourcing notes, bias meters, and rate-hike odds under Satstreet's name.

   The database says the second thing: Status is Draft, Reviewed, or Legal
   ticket. Only Reviewed is eligible. A draft is a bot's first pass at 8am and
   nobody has looked at it yet; a legal ticket is the opposite of a green
   light.
   ────────────────────────────────────────────────────────────────────────── */

import { notionPost, blocksToText, children, rt, notionToken } from './notion'
import { structured } from './claude'
import { buildSystemPrompt } from './prompt'
import { DIGEST_SCHEMA, type Digest } from './digest'

/** Daily Intel — Macro Desk, News Desk, Talking Points and the rest. */
export const DAILY_INTEL_DB =
  process.env.NOTION_DAILY_INTEL_DB?.trim() || '91d74bd8-2086-4536-a739-0ce7cf4964c5'

export type DeskStatus = 'Draft' | 'Reviewed' | 'Legal ticket' | 'unknown'

export interface MacroDesk {
  id: string
  title: string
  /** The Date property, not the title, so a renamed page still sorts right. */
  date: string
  status: DeskStatus
  /** The reporting window the bots covered, as the page states it. */
  window: string
  /** Section A — the world brief, one line per bullet. */
  brief: string[]
  /** Section B — must-reads, with whatever source and link were given. */
  mustRead: { text: string; url: string }[]
  /** Everything, for a prompt that wants the tiles too. */
  raw: string
}

const FIRST_URL = /(https?:\/\/[^\s)]+)/

/**
 * Split the page on its own headings.
 *
 * The bots write "## A. World brief" and "## B. Must-read", so the parse
 * follows those rather than guessing at structure. A page that changes shape
 * returns empty sections instead of wrong ones, and raw is always there as
 * the fallback the prompt can still work from.
 */
function parse(text: string): Pick<MacroDesk, 'brief' | 'mustRead'> {
  // Boundaries are found by scanning, not by one regex. The obvious pattern
  // here — a lazy capture ending at `$` with the multiline flag — silently
  // stops at the first line break, because in multiline mode `$` is the end
  // of a *line*. That returned one bullet per section instead of eight.
  const lines = text.split('\n')

  const section = (letter: string): string[] => {
    const head = new RegExp(`^##\\s*${letter}\\.`)
    const start = lines.findIndex((l) => head.test(l.trim()))
    if (start === -1) return []

    const out: string[] = []
    for (let i = start + 1; i < lines.length; i++) {
      if (/^##\s/.test(lines[i].trim())) break // next section
      const cleaned = lines[i].replace(/^\s*[-*]\s*/, '').trim()
      if (cleaned) out.push(cleaned)
    }
    return out
  }

  return {
    brief: section('A'),
    mustRead: section('B').map((line) => ({
      text: line,
      url: line.match(FIRST_URL)?.[1] ?? '',
    })),
  }
}

const statusOf = (v: unknown): DeskStatus => {
  const name = (v as { select?: { name?: string }; status?: { name?: string } } | undefined)
  const s = name?.select?.name ?? name?.status?.name
  return s === 'Reviewed' || s === 'Draft' || s === 'Legal ticket' ? s : 'unknown'
}

export interface MacroDeskResult {
  desk?: MacroDesk
  /** Why there is nothing to use, in words a person can act on. */
  error?: string
}

/**
 * The most recent Macro Desk page.
 *
 * `requireReviewed` defaults to true and every publishing path should leave
 * it that way. It is exposed so /macro can show the desk what today's draft
 * says without implying it is publishable.
 */
export async function latestMacroDesk(requireReviewed = true): Promise<MacroDeskResult> {
  if (!notionToken()) return { error: 'NOTION_TOKEN is not set' }

  try {
    const res = await notionPost(`/databases/${DAILY_INTEL_DB}/query`, {
      filter: { property: 'Name', title: { starts_with: 'Macro Desk' } },
      sorts: [{ property: 'Date', direction: 'descending' }],
      page_size: 5,
    })

    const rows = res.results ?? []
    if (!rows.length) return { error: 'no Macro Desk pages found in Daily Intel' }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const usable = rows.find((r: any) =>
      requireReviewed ? statusOf(r.properties?.Status) === 'Reviewed' : true,
    )

    if (!usable) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const latest = rows[0] as any
      return {
        error:
          `the latest Macro Desk (${rt(latest.properties?.Name?.title)}) is ` +
          `${statusOf(latest.properties?.Status)}, not Reviewed. Mark it Reviewed in Notion ` +
          'before it can be used for anything a client sees.',
      }
    }

    const text = await blocksToText(await children(usable.id))
    return {
      desk: {
        id: usable.id,
        title: rt(usable.properties?.Name?.title),
        date: usable.properties?.Date?.date?.start ?? '',
        status: statusOf(usable.properties?.Status),
        window: rt(usable.properties?.Window?.rich_text),
        raw: text,
        ...parse(text),
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * The source block handed to the model.
 *
 * Deliberately labelled as internal in the prompt itself. The model is being
 * asked to write *from* this, not to relay it, and the instruction that says
 * so travels with the material rather than sitting somewhere else where it
 * could drift apart from it.
 */
export function deskSourceBlock(d: MacroDesk): string {
  return [
    `<macro_desk date="${d.date}" status="${d.status}">`,
    'INTERNAL SOURCE MATERIAL, written by the desk for the desk. It is explicitly not client',
    'copy and must not be reproduced. Use it to decide what matters and to get the facts right.',
    'Write the client-facing lines yourself.',
    '',
    d.window ? `Window: ${d.window}` : '',
    '',
    'World brief:',
    ...d.brief.map((b) => `  - ${b}`),
    '',
    'Must-read:',
    ...d.mustRead.map((m) => `  - ${m.text}`),
    '</macro_desk>',
  ]
    .filter((l) => l !== undefined)
    .join('\n')
}

/* ── turning desk intel into client copy ──────────────────────────────────
   The one transformation that matters. The input is a document the desk
   marked "not client copy"; the output is what a client reads on the
   dashboard. Everything the header warned about has to come off on the way
   through, and the instructions below are that filter.

   It is deliberately not a summariser. A summary of an internal brief is
   still an internal brief, just shorter.
   ────────────────────────────────────────────────────────────────────────── */

const CLIENT_COPY_RULES = `
Write the "What Matters Today" module for Satstreet's client dashboard, from the internal desk material above.

That material is INTERNAL. It is marked "not client copy" by the desk that wrote it, and it contains things that must not reach a client under Satstreet's name:

  - casualty figures, war reporting and human suffering
  - sourcing notes, bias meters, coverage counts, and which outlet clustered what
  - rate-hike odds, implied probabilities, and anything framed as what the market will do next
  - the desk's own internal shorthand and the names of its internal products

Use it to know what happened and to get the facts right. Write every published line yourself.

Choose THREE to FIVE developments. The test for each is whether a Satstreet client — a high-net-worth individual, a family office, a corporate treasury, or an advisor serving them — is better off knowing it this morning. Rank by that, not by how dramatic the story is.

For each: a plain factual headline, then ONE sentence on why it matters to that reader. The second sentence is the module. A client can get headlines anywhere.

Geopolitics only where it runs through a market channel, and then say the channel — energy prices, shipping, rates. Never lead with, or dwell on, casualties.

Canadian relevance is worth more than it looks: this desk's clients are Canadian, and a CAD or Bank of Canada angle beats a marginally bigger US story.

market_line is one factual sentence on the session. Describe what happened, never where anything is going. No forecast, no odds, no "expect", no "likely to".

Carry the source name and URL from the must-read list for any item drawn from it. Leave the URL empty rather than inventing one.

Everything in Satstreet's compliance rules applies in full: no price targets, no forecasts, no advice, no claims about custody, insurance or regulatory status.`

/** Client-facing copy generated from a Reviewed Macro Desk page. */
export async function mattersFromDesk(desk: MacroDesk): Promise<Digest> {
  const user = [deskSourceBlock(desk), '', CLIENT_COPY_RULES].join('\n')
  return structured<Digest>(buildSystemPrompt(), user, DIGEST_SCHEMA, 6_000)
}

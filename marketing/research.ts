/* ──────────────────────────────────────────────────────────────────────────
   Sales/BD research.

   Three jobs that share one principle: prefer what is written down over what
   a model can produce.

     /todays-prospects  reads the list the prospecting engine already wrote
     /company-facts     quotes the versioned context pack, verbatim
     /research          the only one that generates, and it generates from
                        public sources with its gaps declared

   The prospect lists and the context pack live in git, one level above this
   directory. That is the point: a fact the desk relies on should be a file
   somebody reviewed, with a history, not a sentence a model produced fresh
   each time it was asked.
   ────────────────────────────────────────────────────────────────────────── */

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { MARKETING_DIR } from './calendar'
import { coverage, coverageBlock } from './news'
import { buildSystemPrompt } from './prompt'
import { structured } from './claude'
import { RESEARCH_SCHEMA, type Research } from './types'

/** The repository root: outputs/ and config/ are siblings of marketing/. */
const REPO_DIR = resolve(MARKETING_DIR, '..')

/* ── the daily prospect lists ─────────────────────────────────────────────── */

export type Region = 'canada' | 'florida'

export interface ProspectList {
  region: Region
  /** The date in the filename, which is the run date. */
  date: string
  path: string
  body: string
}

const REGION_DIR: Record<Region, string> = {
  canada: 'outputs/daily-prospects',
  florida: 'outputs/daily-prospects/florida',
}

/**
 * The most recent list for a region.
 *
 * Filenames are ISO dates, so newest is just the last one after a sort. The
 * Canadian directory contains the florida/ subdirectory as well, hence the
 * filter to .md files rather than trusting everything in there.
 */
export function latestProspects(region: Region): ProspectList | undefined {
  const dir = resolve(REPO_DIR, REGION_DIR[region])
  if (!existsSync(dir)) return undefined

  const files = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => e.name)
    .sort()

  const name = files.at(-1)
  if (!name) return undefined

  const path = resolve(dir, name)
  return {
    region,
    date: basename(name, '.md'),
    path,
    body: readFileSync(path, 'utf8'),
  }
}

/** Every run available for a region, newest first — for "show me yesterday's". */
export function prospectDates(region: Region): string[] {
  const dir = resolve(REPO_DIR, REGION_DIR[region])
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => basename(e.name, '.md'))
    .sort()
    .reverse()
}

/**
 * The entries in a list, for the index view.
 *
 * A full list is 160 to 360 lines of Markdown. Sent whole it is five or six
 * Telegram messages nobody scrolls through on a phone, so the default is an
 * index — rank, name, score, one line of trigger — and the full text is there
 * on request.
 */
export interface ProspectEntry {
  rank: number
  /** "APX Lending — 49/50 — CONTACT TODAY" as written in the heading. */
  heading: string
  name: string
  score: string
  trigger: string
}

export function parseProspects(body: string): ProspectEntry[] {
  const out: ProspectEntry[] = []
  // Entries are "## 1. Name — 49/50 — CONTACT TODAY", with Florida adding
  // "| SEV 5". Everything after the number is kept as written.
  const blocks = body.split(/\n(?=##\s+\d+\.\s)/).slice(1)

  for (const b of blocks) {
    const head = b.match(/^##\s+(\d+)\.\s+(.+)/)
    if (!head) continue
    const heading = head[2].trim()
    const score = heading.match(/(\d+\s*\/\s*50[^—|]*)/)?.[1].trim() ?? ''
    const name = heading.split(/\s+[—|]\s+/)[0].trim()
    const trigger = b.match(/\*\*Trigger:\*\*\s*(.+)/)?.[1].trim() ?? ''
    out.push({ rank: Number(head[1]), heading, name, score, trigger })
  }
  return out
}

/** One entry's full text, for "show me number three". */
export function prospectEntry(body: string, rank: number): string | undefined {
  const blocks = body.split(/\n(?=##\s+\d+\.\s)/)
  return blocks.find((b) => b.match(/^##\s+(\d+)\./)?.[1] === String(rank))?.trim()
}

/** The warning banner at the top of a list, which must travel with it. */
export function prospectBanner(body: string): string {
  return body
    .split(/\n(?=##\s)/)[0]
    .split('\n')
    .filter((l) => l.trimStart().startsWith('>'))
    .map((l) => l.replace(/^\s*>\s?/, ''))
    .join(' ')
    .trim()
}

/* ── company facts ────────────────────────────────────────────────────────── */

export interface FactSection {
  heading: string
  body: string
  score: number
}

const CONTEXT_PACK = resolve(MARKETING_DIR, 'context/satstreet.md')

/**
 * Sections of the context pack, ranked against a query.
 *
 * Deliberately retrieval and not generation. The whole reason this command
 * exists is that asking a model "what does Satstreet charge" produces a
 * plausible answer whether or not one is documented. This returns the file's
 * own words, and returns nothing when the file says nothing — which is the
 * useful answer, because it tells the team what still needs writing down.
 */
export function companyFacts(query: string, limit = 3): FactSection[] {
  if (!existsSync(CONTEXT_PACK)) return []
  const text = readFileSync(CONTEXT_PACK, 'utf8')

  // Split on "## " headings, keeping each heading with its body.
  const parts = text.split(/\n(?=##\s)/)
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2)
  if (!terms.length) return []

  const scored = parts.map((part) => {
    const heading = (part.match(/^#+\s*(.+)/)?.[1] ?? '(intro)').trim()
    const hay = part.toLowerCase()
    const head = heading.toLowerCase()
    // A hit in the heading is worth far more than one buried in the body:
    // "Products and services" for "custody" beats a passing mention.
    const score = terms.reduce(
      (n, t) => n + (head.includes(t) ? 10 : 0) + (hay.split(t).length - 1),
      0,
    )
    return { heading, body: part.replace(/^#+\s*.+\n?/, '').trim(), score }
  })

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/* ── /research ────────────────────────────────────────────────────────────── */

const RESEARCH_RULES = `
You are doing Sales/BD research for Satstreet, a Canadian institutional digital asset brokerage. The output goes into the Daily Prospect List.

PUBLIC DATA ONLY. Company websites, public news, regulatory registries, press releases, public executive biographies, funding and treasury announcements. Never client data, never CRM notes, never anything about who Satstreet already deals with.

This is a prioritisation thesis, not a claim about anyone's intent to transact. Write "likely" and "could" where that is what you mean, and never assert that a company wants to trade.

Do not invent. If you cannot establish a recent trigger from the coverage below or from well-established public record, return an EMPTY trigger string and say so in gaps. A made-up funding round or a guessed executive name is worse than an empty field — someone will act on it. The same goes for decision-makers: a name you are not confident is currently in that role belongs in gaps, not in the list.

Prefer a specific dated event over a general observation. "Reported Q2 results on August 6 showing X" beats "has been active in the space".

On the angle: the companies worth contacting are usually already in crypto, so pitching crypto to them is the weakest possible opening. Execution redundancy, settlement, an additional Canadian counterparty, treasury liquidity — those are the openings that land.

JURISDICTION. If the entity is in the United States, including Florida, this is RESEARCH AND RELATIONSHIP-BUILDING ONLY. Satstreet's US permissions are not established. Say so in jurisdiction_note, and do not write outreach copy for a US entity — no email draft, no LinkedIn message, no call script. Canadian entities are ordinary commercial prospects.

Never state Satstreet serves the United States, Florida or the United Kingdom. Never describe a lending product. Never mention insurance coverage, CIPF, minimums or assets under custody.`

export async function researchCompany(company: string): Promise<Research> {
  const news = coverageBlock(await coverage(company))

  const user = [
    `Research this company as a Sales/BD prospect for Satstreet: ${company}`,
    '',
    'Fill every field from public information. Leave a field empty and record it in gaps rather than guessing.',
    '',
    news,
    '',
    RESEARCH_RULES,
  ].join('\n')

  return structured<Research>(buildSystemPrompt(), user, RESEARCH_SCHEMA, 8_000)
}

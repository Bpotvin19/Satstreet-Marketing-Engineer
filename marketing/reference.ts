/* ──────────────────────────────────────────────────────────────────────────
   Satstreet reference pages, pulled from Notion.

   These are the pages the team already maintains — custody options, fees,
   regulatory posture, onboarding, past press releases. Feeding them into the
   system prompt is worth more than any amount of prompt tuning, because they
   cover exactly the topics where guessing is expensive.

   Fetched on demand and cached to disk, then read synchronously when the
   prompt is built. That keeps buildSystemPrompt() sync (it is called on every
   command) while still letting the team edit Notion and run /refresh.

   Empty pages are skipped, so a page the team has not written yet costs
   nothing and starts working the moment it has content.
   ────────────────────────────────────────────────────────────────────────── */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { MARKETING_DIR } from './calendar'
import { children, blocksToText, notionToken } from './notion'

const STATE_DIR = resolve(MARKETING_DIR, '.state')
const CACHE = resolve(STATE_DIR, 'reference.md')
const PAGES_FILE = resolve(MARKETING_DIR, 'reference-pages.json')

/* Per page and overall, so one enormous page cannot swamp the prompt. Generous
   on purpose: the system block is cached, so a larger reference costs a few
   tenths of a cent on the first call of the day and almost nothing after.

   Pages are included in the order they appear in reference-pages.json and the
   budget is spent as it goes, so that file is a priority list — put the voice
   material and the hard eligibility constraints at the top. */
const PER_PAGE_LIMIT = 20_000
const TOTAL_LIMIT = 70_000

/** Clip at a paragraph break rather than mid-sentence — this material is
    regulatory, and half a sentence about custody is worse than none. */
function clip(text: string, limit: number): string {
  if (text.length <= limit) return text
  const cut = text.slice(0, limit)
  const brk = Math.max(cut.lastIndexOf('\n\n'), cut.lastIndexOf('\n'))
  const body = brk > limit * 0.6 ? cut.slice(0, brk) : cut
  return `${body.trimEnd()}\n\n[…page truncated for length]`
}

interface RefPage {
  label: string
  id: string
  /**
   * Whether this page goes into the system prompt. Defaults to true.
   *
   * Set false for pages worth having on tap via /ref but not worth paying for
   * on every request — general explainer material, for instance, which the
   * model already knows and which would displace Satstreet-specific content
   * inside the reference budget.
   */
  prompt?: boolean
}

export interface RefreshResult {
  included: { label: string; chars: number }[]
  empty: string[]
  failed: { label: string; error: string }[]
  totalChars: number
}

function configuredPages(): RefPage[] {
  if (!existsSync(PAGES_FILE)) return []
  try {
    return JSON.parse(readFileSync(PAGES_FILE, 'utf8')) as RefPage[]
  } catch {
    return []
  }
}

/** Fetch every configured page and rewrite the cache. */
export async function refreshReference(): Promise<RefreshResult> {
  const result: RefreshResult = { included: [], empty: [], failed: [], totalChars: 0 }
  const pages = configuredPages()

  if (!notionToken() || pages.length === 0) {
    return result
  }

  const sections: string[] = []
  let total = 0

  for (const page of pages.filter((p) => p.prompt !== false)) {
    try {
      const text = await blocksToText(await children(page.id))
      if (!text.trim()) {
        result.empty.push(page.label)
        continue
      }
      if (total >= TOTAL_LIMIT) {
        result.failed.push({ label: page.label, error: 'skipped — total reference budget reached' })
        continue
      }
      const clipped = clip(text, Math.min(PER_PAGE_LIMIT, TOTAL_LIMIT - total))
      sections.push(`## ${page.label}\n\n${clipped}`)
      total += clipped.length
      result.included.push({ label: page.label, chars: clipped.length })
    } catch (e) {
      result.failed.push({ label: page.label, error: e instanceof Error ? e.message : String(e) })
    }
  }

  result.totalChars = total
  mkdirSync(STATE_DIR, { recursive: true })
  writeFileSync(
    CACHE,
    sections.length
      ? `<!-- fetched ${new Date().toISOString()} -->\n\n${sections.join('\n\n---\n\n')}\n`
      : '',
  )
  return result
}

/** The cached reference text, or '' when nothing has been fetched. */
export function readReference(): string {
  if (!existsSync(CACHE)) return ''
  try {
    return readFileSync(CACHE, 'utf8').replace(/^<!--.*?-->\n*/s, '').trim()
  } catch {
    return ''
  }
}

export type { RefPage }

export function listPages(): RefPage[] {
  return configuredPages()
}

/**
 * Fuzzy-match a page by label: "funding" finds "Funding Instructions".
 *
 * Punctuation is stripped on both sides, because Notion titles carry curly
 * apostrophes and nobody types those — "faqs" has to find "FAQ's". "&" becomes
 * "and" for the same reason: people type the word.
 */
export function findPage(query: string): RefPage | undefined {
  const norm = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '')
  const q = norm(query)
  if (!q) return undefined
  const pages = configuredPages()
  return (
    pages.find((p) => norm(p.label) === q) ??
    pages.find((p) => norm(p.label).startsWith(q)) ??
    pages.find((p) => norm(p.label).includes(q))
  )
}

export function referenceAge(): string | null {
  if (!existsSync(CACHE)) return null
  try {
    const stamp = readFileSync(CACHE, 'utf8').match(/<!-- fetched (.+?) -->/)?.[1]
    return stamp ?? null
  } catch {
    return null
  }
}

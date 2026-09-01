/* ──────────────────────────────────────────────────────────────────────────
   Per-person voice profiles.

   The Social Voice Context page is one 67,000-character document holding three
   complete profiles — Jon, Mike, George — one after another. Loaded whole into
   the always-on reference it gets clipped, and only the first profile survives,
   which is why every draft sounded like Jon.

   So it is split on the "# NAME / Satstreet" headings and cached per person,
   then exactly one profile is injected when drafting in that person's voice.

   The profile goes in the USER turn, never the system block. The system block
   has to stay byte-identical between calls or the prompt cache breaks, and a
   different voice per request would break it on every single draft.
   ────────────────────────────────────────────────────────────────────────── */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { MARKETING_DIR } from './calendar'
import { children, blocksToText, notionToken } from './notion'

const STATE_DIR = resolve(MARKETING_DIR, '.state/voices')

/** Satstreet Social Voice Context, inside the Social Media Hub. */
export const VOICE_DOC_ID =
  process.env.NOTION_VOICE_PAGE_ID?.trim() || '3c7e562fa5bd80f9a933c3bf21ebc937'

/** George's profile runs to ~33k; the tail is source links rather than style. */
const PER_VOICE_LIMIT = 26_000

export interface VoiceProfile {
  /** Lowercase single word used in commands: jon, michael, george, robustus. */
  slug: string
  /** As written in the document, e.g. "GEORGE MCBRIDE". */
  name: string
  /**
   * A person the desk can post as, or an external style it only borrows the
   * shape of. Everything downstream branches on this: a style reference must
   * never produce a draft that claims to be someone posting from their own
   * account.
   */
  kind: 'person' | 'style'
  chars: number
}

/* ── external style references ────────────────────────────────────────────
   Not people, and not from Notion. A style reference is a distilled
   rhetorical guide kept in context/, borrowed for how an argument is built
   and never for what is true. It sits in the same picker as the founders
   because that is where the team looks for it, and it is marked
   kind: 'style' from here on so the drafting prompt stays honest about what
   it is.
   ────────────────────────────────────────────────────────────────────────── */

interface StyleSource {
  slug: string
  name: string
  /** Relative to MARKETING_DIR. */
  file: string
}

const EXTERNAL_STYLES: StyleSource[] = [
  { slug: 'robustus', name: 'Robustus', file: 'context/voice-robustus.md' },
]

const stylePath = (s: StyleSource) => resolve(MARKETING_DIR, s.file)

/** Only the ones whose guide is actually on disk — a missing file is a
    missing button, not a runtime error mid-draft. */
export function listStyles(): VoiceProfile[] {
  return EXTERNAL_STYLES.filter((s) => existsSync(stylePath(s))).map((s) => ({
    slug: s.slug,
    name: s.name,
    kind: 'style' as const,
    chars: readFileSync(stylePath(s), 'utf8').length,
  }))
}

/** Display name that says what it is: "Robustus (external style)". */
export const voiceLabel = (v: VoiceProfile) =>
  v.kind === 'style' ? `${v.name} (external style)` : v.name

/** People go by shorter names than the document uses. */
const ALIASES: Record<string, string> = {
  mike: 'michael',
  nasser: 'michael',
  mikenasser: 'michael',
  lister: 'jon',
  jonathan: 'jon',
  mcbride: 'george',
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

function clip(text: string, limit: number): string {
  if (text.length <= limit) return text
  const cut = text.slice(0, limit)
  const brk = cut.lastIndexOf('\n\n')
  return `${(brk > limit * 0.6 ? cut.slice(0, brk) : cut).trimEnd()}\n\n[…profile truncated]`
}

/* ── refresh ──────────────────────────────────────────────────────────────── */

export interface VoiceRefresh {
  profiles: VoiceProfile[]
  error?: string
}

export async function refreshVoices(): Promise<VoiceRefresh> {
  if (!notionToken()) return { profiles: [], error: 'NOTION_TOKEN is not set' }

  try {
    const text = await blocksToText(await children(VOICE_DOC_ID))
    const lines = text.split('\n')

    // Headings vary: "# JON LISTER / SATSTREET" and
    // "# Michael Nasser / Satstreet Social Voice Context" both appear.
    const marks: { name: string; line: number }[] = []
    lines.forEach((l, i) => {
      const m = l.match(/^#\s+(.+?)\s*\/\s*Satstreet/i)
      if (m) marks.push({ name: m[1].trim(), line: i })
    })

    if (marks.length === 0) {
      return { profiles: [], error: 'no "# NAME / Satstreet" headings found in the voice document' }
    }

    mkdirSync(STATE_DIR, { recursive: true })
    const profiles: VoiceProfile[] = []

    for (const [i, mark] of marks.entries()) {
      const end = i + 1 < marks.length ? marks[i + 1].line : lines.length
      const body = clip(lines.slice(mark.line, end).join('\n').trim(), PER_VOICE_LIMIT)
      const slug = norm(mark.name.split(/\s+/)[0])
      writeFileSync(resolve(STATE_DIR, `${slug}.md`), body)
      profiles.push({ slug, name: mark.name, kind: 'person', chars: body.length })
    }

    writeFileSync(resolve(STATE_DIR, 'index.json'), JSON.stringify(profiles, null, 2))
    return { profiles }
  } catch (e) {
    return { profiles: [], error: e instanceof Error ? e.message : String(e) }
  }
}

/* ── read ─────────────────────────────────────────────────────────────────── */

export function listVoices(): VoiceProfile[] {
  return [...listPeople(), ...listStyles()]
}

/** The founder profiles cached from Notion. Index files written before styles
    existed have no kind, so they are read as people. */
function listPeople(): VoiceProfile[] {
  const idx = resolve(STATE_DIR, 'index.json')
  if (!existsSync(idx)) return []
  try {
    const cached = JSON.parse(readFileSync(idx, 'utf8')) as VoiceProfile[]
    return cached.map((v) => ({ ...v, kind: v.kind ?? 'person' }))
  } catch {
    return []
  }
}

/** Resolve "mike", "Nasser", "michael" → the Michael Nasser profile. */
export function findVoice(query: string): VoiceProfile | undefined {
  const q = ALIASES[norm(query)] ?? norm(query)
  if (!q) return undefined
  const all = listVoices()
  return (
    all.find((v) => v.slug === q) ??
    all.find((v) => norm(v.name).startsWith(q)) ??
    all.find((v) => norm(v.name).includes(q)) ??
    all.find((v) => v.name.split(/\s+/).some((w) => norm(w).startsWith(q)))
  )
}

export function readVoice(slug: string): string {
  const style = EXTERNAL_STYLES.find((v) => v.slug === slug)
  const p = style ? stylePath(style) : resolve(STATE_DIR, `${slug}.md`)
  if (!existsSync(p)) return ''
  try {
    return readFileSync(p, 'utf8')
  } catch {
    return ''
  }
}

export function voicesCached(): boolean {
  return existsSync(STATE_DIR) && readdirSync(STATE_DIR).some((f) => f.endsWith('.md'))
}

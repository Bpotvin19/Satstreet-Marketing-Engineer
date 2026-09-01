/* ──────────────────────────────────────────────────────────────────────────
   The marketing calendar.

   Reads from wherever the team actually keeps it:

     MARKETING_SHEET_ID set → Google Sheets, via the CSV export endpoint
     otherwise              → marketing/calendar.json

   The Sheets path needs no credentials as long as the sheet is shared with
   "anyone with the link can view". A properly private sheet needs a service
   account; that lands in Phase 1 rather than blocking Phase 0.

   Expected columns, matched case-insensitively by header name, in any order:
     date · title · type · channel · notes · assets_url
   Anything else in the sheet is ignored, so the team can keep their own
   columns without breaking this.
   ────────────────────────────────────────────────────────────────────────── */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const MARKETING_DIR = resolve(dirname(fileURLToPath(import.meta.url)))

export interface CalendarEntry {
  date: string
  title: string
  /** Drives recurrence: anniversary rolls forward, everything else is a one-off. */
  type: string
  channel: string
  notes: string
  assets_url: string
  /** Optional enrichment. Present in calendar.json, blank when read from a sheet. */
  end_date?: string
  category?: string
  angles?: string
  formats?: string
  location?: string
  reference?: string
  lead_time_days?: number
}

export interface DatedEntry extends CalendarEntry {
  days_away: number
}

export type CalendarResult =
  | { available: true; source: string; entries: CalendarEntry[]; skipped: number }
  | { available: false; reason: string }

/* ── CSV ──────────────────────────────────────────────────────────────────── */

/** Minimal RFC-4180 reader: handles quoted fields, embedded commas, escaped quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += c
    } else if (c === '"') {
      quoted = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = ''
    } else if (c !== '\r') {
      field += c
    }
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((cell) => cell.trim()))
}

/** Only the CSV-mappable fields; the enrichment fields come from calendar.json. */
type SheetField = 'date' | 'title' | 'type' | 'channel' | 'notes' | 'assets_url'

const ALIASES: Record<SheetField, string[]> = {
  date: ['date', 'when', 'day'],
  title: ['title', 'event', 'name', 'content', 'topic'],
  type: ['type', 'category', 'kind'],
  channel: ['channel', 'platform', 'where'],
  notes: ['notes', 'note', 'description', 'details', 'angle'],
  assets_url: ['assets_url', 'assets', 'drive', 'link', 'url', 'folder'],
}

function mapHeaders(header: string[]): Partial<Record<SheetField, number>> {
  const norm = header.map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, '_'))
  const out: Partial<Record<SheetField, number>> = {}
  for (const [field, names] of Object.entries(ALIASES) as [SheetField, string[]][]) {
    const i = norm.findIndex((h) => names.includes(h))
    if (i !== -1) out[field] = i
  }
  return out
}

export function rowsToEntries(rows: string[][]): { entries: CalendarEntry[]; skipped: number } {
  if (rows.length < 2) return { entries: [], skipped: 0 }
  const cols = mapHeaders(rows[0])
  if (cols.date === undefined || cols.title === undefined) {
    throw new Error(
      `sheet needs at least a "date" and a "title" column (found: ${rows[0].join(', ')})`,
    )
  }
  const at = (r: string[], k: SheetField) =>
    cols[k] === undefined ? '' : (r[cols[k]] ?? '').trim()

  let skipped = 0
  const entries: CalendarEntry[] = []
  for (const r of rows.slice(1)) {
    const e = {
      date: at(r, 'date'),
      title: at(r, 'title'),
      type: at(r, 'type') || 'entry',
      channel: at(r, 'channel') || 'Both',
      notes: at(r, 'notes'),
      assets_url: at(r, 'assets_url'),
    }
    if (isPlaceholder(e)) { skipped++; continue }
    entries.push(e)
  }
  return { entries, skipped }
}

/* ── sources ──────────────────────────────────────────────────────────────── */

async function fromSheet(sheetId: string, tab?: string): Promise<CalendarResult> {
  const url =
    `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv` +
    (tab ? `&sheet=${encodeURIComponent(tab)}` : '')
  try {
    const r = await fetch(url, { redirect: 'follow' })
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
    const text = await r.text()
    if (text.trimStart().startsWith('<')) {
      throw new Error('got HTML, not CSV — the sheet is probably not link-shared')
    }
    const { entries, skipped } = rowsToEntries(parseCsv(text))
    return { available: true, source: `Google Sheet ${sheetId}`, entries, skipped }
  } catch (e) {
    return {
      available: false,
      reason: `Google Sheet unreadable: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

/** A row is a spacer if it has no title, and a placeholder if either field is TODO. */
function isPlaceholder(e: { date: string; title: string }): boolean {
  return !e.title || e.date.toUpperCase() === 'TODO' || e.title.startsWith('TODO')
}

function fromFile(): CalendarResult {
  const path = resolve(MARKETING_DIR, 'calendar.json')
  if (!existsSync(path)) return { available: false, reason: 'marketing/calendar.json not found' }
  try {
    // The JSON carries the richer fields the printed content calendar provides,
    // so it's read directly rather than squeezed through the CSV shape.
    const raw = JSON.parse(readFileSync(path, 'utf8')) as CalendarEntry[]
    if (!Array.isArray(raw)) throw new Error('expected an array of entries')

    const entries: CalendarEntry[] = []
    let skipped = 0
    for (const e of raw) {
      if (!e?.date || isPlaceholder(e)) { skipped++; continue }
      entries.push({ ...e, type: e.type || 'entry', channel: e.channel || 'Both' })
    }
    return { available: true, source: 'marketing/calendar.json', entries, skipped }
  } catch (e) {
    return {
      available: false,
      reason: `calendar.json unreadable: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

/**
 * Whichever source is configured, in order of preference. Notion first because
 * that is where the team actually edits; the JSON file is the always-present
 * fallback, so a Notion outage degrades to a stale calendar rather than none.
 */
export async function loadCalendar(): Promise<CalendarResult> {
  const notionPage = process.env.NOTION_CALENDAR_PAGE_ID?.trim()
  if (notionPage && process.env.NOTION_TOKEN?.trim()) {
    const { loadNotionCalendar } = await import('./notion-calendar')
    const res = await loadNotionCalendar(notionPage)
    if (res.available) return res
    console.warn(`[calendar] ${res.reason} — falling back to calendar.json`)
  }

  const sheetId = process.env.MARKETING_SHEET_ID?.trim()
  return sheetId ? fromSheet(sheetId, process.env.MARKETING_SHEET_TAB?.trim()) : fromFile()
}

/* ── windowing ────────────────────────────────────────────────────────────── */

/** Types that repeat every year, so a past date means "next occurrence". */
const RECURRING = new Set(['anniversary', 'recurring', 'annual', 'holiday'])

/**
 * Entries inside the window, nearest first, with days_away attached.
 *
 * Anniversaries roll forward to their next occurrence, so the calendar doesn't
 * need re-dating every January. Everything else — a launch, a conference, a
 * milestone — is a one-off: once it's past, it's past, and resurfacing it a
 * year later would be worse than dropping it.
 */
export function withinWindow(entries: CalendarEntry[], today: Date, daysAhead = 30): DatedEntry[] {
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  const out: DatedEntry[] = []

  for (const e of entries) {
    const parsed = Date.parse(`${e.date}T00:00:00Z`)
    if (Number.isNaN(parsed)) continue

    let when = parsed
    if (when < start) {
      if (!RECURRING.has(e.type.trim().toLowerCase())) continue
      const d = new Date(parsed)
      const rolled = Date.UTC(today.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
      when = rolled < start
        ? Date.UTC(today.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate())
        : rolled
    }

    const days_away = Math.round((when - start) / 86_400_000)
    if (days_away <= daysAhead) {
      out.push({ ...e, date: new Date(when).toISOString().slice(0, 10), days_away })
    }
  }

  return out.sort((a, b) => a.days_away - b.days_away)
}

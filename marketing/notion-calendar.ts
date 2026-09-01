/* ──────────────────────────────────────────────────────────────────────────
   The marketing calendar, read from Notion.

   The team's Calendar page is not a database — it is a page carrying an
   at-a-glance table plus one detail table per event. That is a perfectly good
   format for humans and the bot should read it as-is rather than ask anyone to
   restructure their working document.

   Two passes:
     1. the at-a-glance table  → date, title, category, primary angle, lead time
     2. the per-event sections → why it matters, content angles, formats, reference

   Dates in the table carry no year ("Jan 3", "Feb 18-21"), which is correct for
   a document that gets reused annually. Anniversaries are therefore left
   year-less and rolled forward by withinWindow(); conferences are pinned to the
   edition year stated on the page, so a passed 2026 conference drops out
   instead of reappearing in 2027.
   ────────────────────────────────────────────────────────────────────────── */

import { children, tableRows, rt, type Block } from './notion'
import type { CalendarEntry, CalendarResult } from './calendar'

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

const pad = (n: number) => String(n).padStart(2, '0')

/** "Jan 3" · "Feb 18-21" · "Mar 30-Apr 2" · "TBD" → ISO start/end for a year. */
export function parseDateCell(cell: string, year: number): { date: string; end?: string } | null {
  const s = cell.trim()
  if (!s || /^tbd$/i.test(s)) return null

  const m = s.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:\s*[-–]\s*(?:([A-Za-z]{3})[a-z]*\.?\s*)?(\d{1,2}))?$/)
  if (!m) return null

  const startMonth = MONTHS[m[1].toLowerCase()]
  if (!startMonth) return null
  const startDay = Number(m[2])
  const date = `${year}-${pad(startMonth)}-${pad(startDay)}`

  if (!m[4]) return { date }

  const endMonth = m[3] ? MONTHS[m[3].toLowerCase()] : startMonth
  if (!endMonth) return { date }
  // A range crossing December into January belongs to the following year.
  const endYear = endMonth < startMonth ? year + 1 : year
  return { date, end: `${endYear}-${pad(endMonth)}-${pad(Number(m[4]))}` }
}

/** "7-10 days" → 10 · "2-3 weeks" → 21 · "7 days" → 7 */
export function parseLeadTime(cell: string): number | undefined {
  const s = cell.toLowerCase()
  const nums = [...s.matchAll(/\d+/g)].map((x) => Number(x[0]))
  if (!nums.length) return undefined
  const largest = Math.max(...nums)
  return s.includes('week') ? largest * 7 : largest
}

const CONFERENCE = /conference/i

/** Detail sections are headed "January 3  |  Bitcoin Genesis Block Day   [CATEGORY]". */
const DETAIL_HEADING = /^[A-Za-z]{3,9}\s+\d{1,2}\s*\|\s*(.+?)\s*(?:\[[^\]]*\])?\s*$/

interface Detail {
  notes?: string
  angles?: string
  formats?: string
  reference?: string
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

export async function loadNotionCalendar(pageId: string): Promise<CalendarResult> {
  try {
    const blocks = await children(pageId)

    // Edition year, from "…specific to 2026" or "2026 EDITION" in the preamble.
    const preamble = blocks
      .slice(0, 20)
      .map((b: Block) => rt(b[b.type]?.rich_text))
      .join(' ')
    const year = Number(preamble.match(/\b(20\d{2})\b/)?.[1]) || new Date().getUTCFullYear()

    /* ── pass 1: the at-a-glance table ─────────────────────────────────── */
    let base: CalendarEntry[] = []
    let skipped = 0

    for (const b of blocks) {
      if (b.type !== 'table') continue
      const rows = await tableRows(b.id)
      const header = rows[0]?.map(norm) ?? []
      if (!header.includes('date') || !header.includes('event')) continue

      const col = (name: string) => header.indexOf(name)
      const iDate = col('date')
      const iEvent = col('event')
      const iCat = col('category')
      const iAngle = col('primaryangle')
      const iLead = col('leadtime')

      for (const r of rows.slice(1)) {
        const title = (r[iEvent] ?? '').trim()
        const category = iCat >= 0 ? (r[iCat] ?? '').trim() : ''
        const parsed = parseDateCell(r[iDate] ?? '', year)
        if (!title || !parsed) {
          skipped++
          continue
        }
        const isConf = CONFERENCE.test(category)
        base.push({
          // Anniversaries stay year-less so withinWindow rolls them forward.
          date: parsed.date,
          end_date: parsed.end,
          title,
          type: isConf ? 'conference' : 'anniversary',
          category: category || undefined,
          channel: 'Both',
          notes: iAngle >= 0 ? (r[iAngle] ?? '').trim() : '',
          angles: undefined,
          formats: undefined,
          lead_time_days: iLead >= 0 ? parseLeadTime(r[iLead] ?? '') : undefined,
          assets_url: '',
        })
      }
      break // the at-a-glance table is the first one that matches
    }

    if (base.length === 0) {
      return { available: false, reason: 'no at-a-glance table found on the Calendar page' }
    }

    /* ── pass 2: per-event detail sections ─────────────────────────────── */
    const details = new Map<string, Detail>()
    let currentTitle: string | null = null

    for (const b of blocks) {
      if (b.type === 'paragraph' || b.type?.startsWith('heading')) {
        const text = rt(b[b.type]?.rich_text)
        const m = text.match(DETAIL_HEADING)
        if (m) {
          currentTitle = norm(m[1])
          continue
        }
        const ref = text.match(/^Reference:\s*(.+)$/i)
        if (ref && currentTitle) {
          details.set(currentTitle, { ...details.get(currentTitle), reference: ref[1].trim() })
        }
        continue
      }

      if (b.type === 'table' && currentTitle) {
        const rows = await tableRows(b.id)
        // Detail tables are two columns: label, value.
        if (rows.some((r) => r.length !== 2)) continue
        const d: Detail = { ...details.get(currentTitle) }
        for (const [label, value] of rows) {
          const k = norm(label)
          if (k === 'whyitmatters') d.notes = value
          else if (k === 'contentangles') d.angles = value
          else if (k === 'bestformats') d.formats = value
        }
        details.set(currentTitle, d)
      }
    }

    /* ── merge ─────────────────────────────────────────────────────────── */
    base = base.map((e) => {
      const d = details.get(norm(e.title))
      if (!d) return e
      return {
        ...e,
        // "Why it matters" is fuller than the at-a-glance primary angle.
        notes: d.notes || e.notes,
        angles: d.angles ?? e.angles,
        formats: d.formats ?? e.formats,
        reference: d.reference ?? e.reference,
      }
    })

    // Conferences are edition-specific; anniversaries recur, so drop their year
    // and let withinWindow place them at their next occurrence.
    const entries = base.map((e) =>
      e.type === 'anniversary' ? { ...e, date: e.date, end_date: undefined } : e,
    )

    return {
      available: true,
      source: `Notion Calendar page (${year} edition, ${details.size} detailed)`,
      entries,
      skipped,
    }
  } catch (e) {
    return {
      available: false,
      reason: `Notion calendar unreadable: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

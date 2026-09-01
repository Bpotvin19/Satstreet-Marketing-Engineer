/* ──────────────────────────────────────────────────────────────────────────
   The weekly mix.

   "Propose the next week's content mix and identify gaps." Different job from
   the daily plan: the daily one asks what to say today, this one asks whether
   the week as a whole is balanced — across channels, across content pillars,
   and against what has already gone out.
   ────────────────────────────────────────────────────────────────────────── */

import { buildSystemPrompt, formatCalendar, type RecentPosts } from './prompt'
import { structured } from './claude'
import { WEEKLY_SCHEMA, type Weekly } from './types'
import { withinWindow, type CalendarEntry } from './calendar'

/** Monday of the coming week, which is what "next week" means on any weekday. */
export function nextMonday(from = new Date()): Date {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  const dow = d.getUTCDay() // 0 Sunday … 6 Saturday
  d.setUTCDate(d.getUTCDate() + ((8 - dow) % 7 || 7))
  return d
}

export async function weeklyMix(
  entries: CalendarEntry[],
  recent: RecentPosts,
  from = new Date(),
): Promise<Weekly> {
  const monday = nextMonday(from)
  const weekOf = monday.toISOString().slice(0, 10)

  // Two weeks of calendar: next week itself, plus the following one, because a
  // conference with a 21-day lead time needs drafting before it appears.
  const window = withinWindow(entries, from, 21)

  const user = [
    `Propose the content mix for the week of ${weekOf} (Monday to Friday).`,
    '',
    'One entry per posting day at most, and fewer is fine — an empty Thursday is better than a filler post. Balance the week across both channels and across the content pillars rather than stacking one theme.',
    '',
    'Then do the part a calendar cannot: name what is missing. Which pillars go untouched this week, which audience segments hear nothing, and what the team should be scheduling that is not on the calendar at all.',
    '',
    '<calendar_next_three_weeks>',
    formatCalendar(window),
    '</calendar_next_three_weeks>',
    '',
    '<recently_published>',
    recent.tracked
      ? recent.posts.length
        ? recent.posts.map((r) => `- ${r.date} · ${r.channel} · ${r.title}`).join('\n')
        : 'Tracked, nothing published in the last three weeks.'
      : 'Not tracked yet — assume nothing about what has already run.',
    '</recently_published>',
    '',
    '<external_signal>Not connected. Do not reference live markets, prices, or current discussion.</external_signal>',
  ].join('\n')

  return structured<Weekly>(buildSystemPrompt(), user, WEEKLY_SCHEMA, 8_000)
}

/* The morning plan. Its own module so run-morning.ts doesn't have to import
   the bot — and therefore doesn't need a Telegram token to do a dry run. */

import { loadCalendar, withinWindow } from './calendar'
import { buildSystemPrompt, buildUserMessage } from './prompt'
import { structured } from './claude'
import { recentPosts } from './published'
import { PLAN_SCHEMA, type DailyPlan } from './types'

export interface PlanResult {
  plan: DailyPlan
  calendarSource: string
  /** Where the published log came from, and whether it degraded. */
  logBackend: string
  logError?: string
}

export async function generatePlan(chatId: number | string): Promise<PlanResult> {
  const cal = await loadCalendar()
  if (!cal.available) throw new Error(`Calendar unavailable: ${cal.reason}`)

  const recent = await recentPosts(chatId)
  const now = new Date()

  const plan = await structured<DailyPlan>(
    buildSystemPrompt(),
    buildUserMessage({
      date: now.toISOString().slice(0, 10),
      weekday: now.toLocaleDateString('en-US', { weekday: 'long' }),
      calendar: withinWindow(cal.entries, now),
      recent: { tracked: recent.tracked, posts: recent.posts },
      calendarSource: cal.source,
    }),
    PLAN_SCHEMA,
  )

  return {
    plan,
    calendarSource: cal.source,
    logBackend: recent.backend,
    logError: recent.error,
  }
}

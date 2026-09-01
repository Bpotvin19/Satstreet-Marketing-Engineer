/* ──────────────────────────────────────────────────────────────────────────
   Who may use the bot.

   Two independent checks, and an update must pass both:

     the chat   TELEGRAM_CHAT_ID   — which conversations the bot works in
     the person TELEGRAM_USER_IDS  — which people it answers

   The chat check alone was never enough. Anyone added to the group inherited
   the whole bot: the positioning notes, the founders' voice profiles, the
   client channel. Group membership is not employment, and adding somebody to
   a Telegram group is not a decision anyone makes carefully.

   When TELEGRAM_USER_IDS is empty the bot runs in ENROLMENT mode: it answers
   /whoami and /help and refuses everything else. That is deliberate. An
   unconfigured allowlist means nobody has decided who the team is yet, and
   the safe reading of "not decided" is "not authorised" — not "everyone".
   ────────────────────────────────────────────────────────────────────────── */

/** Commands that still work while nobody is enrolled, so people can enrol. */
const ENROLMENT_COMMANDS = new Set(['whoami', 'start', 'help'])

export type Mode = 'enforcing' | 'enrolment'

export interface Access {
  mode: Mode
  /** Chats the bot posts scheduled messages to. Always needed by cron. */
  chats: Set<string>
  /** The people who may drive the bot. This is the real gate. */
  users: Set<string>
  /**
   * When true the bot works only in `chats`. When false it works in any group
   * it is added to, but still only for people in `users`.
   */
  restrictChats: boolean
  /**
   * A group whose administrators are treated as authorised, on top of `users`.
   *
   * This is the practical way to run it: promote someone in the Satstreet
   * Marketing group and they can use the bot; demote them and they cannot.
   * Access follows a decision somebody already makes in Telegram, rather than
   * a second list that quietly drifts out of date.
   */
  adminGroup: string | null
}

function ids(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
}

export function load(env: NodeJS.ProcessEnv = process.env): Access {
  const users = ids(env.TELEGRAM_USER_IDS)
  // Defaults to locked. Opening the bot to any group is a deliberate choice,
  // so it has to be written down rather than inherited.
  const restrictChats = (env.TELEGRAM_RESTRICT_CHATS ?? 'true').trim().toLowerCase() !== 'false'
  const adminGroup = env.TELEGRAM_ADMIN_GROUP?.trim() || null
  return {
    // Either source of authority counts as configured.
    mode: users.size || adminGroup ? 'enforcing' : 'enrolment',
    chats: ids(env.TELEGRAM_CHAT_ID),
    users,
    restrictChats,
    adminGroup,
  }
}

/* ---------- live administrators ----------

   Cached briefly so every button press is not a Telegram round trip, but
   briefly enough that removing someone takes effect in about a minute.

   On a failed lookup the last good answer stands. Losing contact with
   Telegram should not silently widen access, and it should not lock out the
   whole team either — the previous answer is the honest thing to fall back
   on. With no previous answer, nobody is admitted through this path. */

const ADMIN_TTL = 60_000
let adminCache: { at: number; ids: Set<string> } | null = null

export type AdminFetcher = (chatId: string) => Promise<string[]>

export async function effectiveUsers(a: Access, fetchAdmins: AdminFetcher): Promise<Set<string>> {
  if (!a.adminGroup) return a.users

  const fresh = adminCache && Date.now() - adminCache.at < ADMIN_TTL
  if (!fresh) {
    try {
      const live = await fetchAdmins(a.adminGroup)
      adminCache = { at: Date.now(), ids: new Set(live) }
    } catch (e) {
      console.warn(
        `[access] could not read admins of ${a.adminGroup}: ` +
          `${e instanceof Error ? e.message : e}` +
          (adminCache ? ' — using the last known list' : ' — no cached list, static ids only'),
      )
    }
  }

  return new Set([...a.users, ...(adminCache?.ids ?? [])])
}

/** Exposed so a test or a diagnostic can start from a known state. */
export function resetAdminCache(): void {
  adminCache = null
}

export type Verdict =
  | { allow: true }
  | { allow: false; reason: 'chat' | 'user' | 'enrolment'; message: string }

export interface Attempt {
  chatId: number | string | undefined
  userId: number | string | undefined
  /** Bare command name without the slash or @botname, when the update is one. */
  command?: string
}

export function check(a: Access, at: Attempt, users: Set<string> = a.users): Verdict {
  const chat = at.chatId === undefined ? '' : String(at.chatId)
  const user = at.userId === undefined ? '' : String(at.userId)

  // The chat gate is optional. With it off the bot travels to any group, and
  // the user gate below is what actually protects it.
  if (a.restrictChats && (!chat || !a.chats.has(chat))) {
    return {
      allow: false,
      reason: 'chat',
      message: 'This bot only works in the Satstreet team group.',
    }
  }

  if (a.mode === 'enrolment') {
    if (at.command && ENROLMENT_COMMANDS.has(at.command)) return { allow: true }
    return {
      allow: false,
      reason: 'enrolment',
      message:
        'No team list is configured yet, so the bot is locked. ' +
        'Each team member should send /whoami, then add the ids to TELEGRAM_USER_IDS.',
    }
  }

  if (!user || !users.has(user)) {
    return {
      allow: false,
      reason: 'user',
      message: 'You are not on the Satstreet team list for this bot.',
    }
  }

  return { allow: true }
}

/** "/brief@satstreet_bot 48" -> "brief". Null when the text is not a command. */
export function commandOf(text: string | undefined): string | undefined {
  const m = (text ?? '').match(/^\/([A-Za-z0-9_]+)/)
  return m ? m[1].split('@')[0].toLowerCase() : undefined
}

/** One line at startup, so the running mode is never a guess. */
export function banner(a: Access): string {
  const chats = a.chats.size ? [...a.chats].join(', ') : 'NONE'
  const where = a.restrictChats ? `locked to chats: ${chats}` : 'any group it is added to'
  const who = a.adminGroup
    ? `admins of ${a.adminGroup}` + (a.users.size ? ` plus ${a.users.size} fixed id(s)` : '')
    : `${a.users.size} authorised user(s)`
  if (a.mode === 'enrolment') {
    return (
      `[access] ENROLMENT MODE — TELEGRAM_USER_IDS is empty.\n` +
      `         Only /whoami and /help work. Scheduled posts go to: ${chats}\n` +
      `         Collect ids with: npm run marketing:users`
    )
  }
  return `[access] enforcing · ${who} · ${where}`
}

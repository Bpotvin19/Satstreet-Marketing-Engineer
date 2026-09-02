/* ──────────────────────────────────────────────────────────────────────────
   What Matters Today — publishing to the client dashboard.

   The generation already exists: buildDigest() reads the crypto press and
   returns three to five developments, each with one sentence on why a
   Satstreet client should care, plus a factual line on the session. That is
   the module the Overview page wants.

   What is added here is the publishing, and the important part of it is what
   it refuses to do. Everywhere else in this bot the rule is that nothing goes
   out without a person: /brief stages and waits, approve logs the copy, a
   human posts it. The dashboard is the first surface where the bot could
   write straight to something a client reads, so the gate has to be explicit
   rather than assumed.

   Two things stand between a digest and the live site:

     compliance  every published line runs the same rules as a post, and a
                 blocking violation refuses the publish outright
     a person    publish() is only ever called from an approval, and the file
                 records who approved it and when

   The page reads the result as a static JSON file. No database, no endpoint,
   no client data — the same deploy that ships the HTML ships the copy.
   ────────────────────────────────────────────────────────────────────────── */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { MARKETING_DIR } from './calendar'
import { checkCopy, blockers, type Violation } from './compliance'
import type { Digest } from './digest'

const run = promisify(execFile)

const REPO_DIR = resolve(MARKETING_DIR, '..')
const DATA_DIR = resolve(REPO_DIR, 'public/data')
const FILE = resolve(DATA_DIR, 'matters.json')
/** Relative to the repo root, for git. */
const REL = 'public/data/matters.json'

export interface MattersItem {
  headline: string
  why: string
  source: string
  url: string
}

export interface Matters {
  /** When the desk approved it, not when the news broke. */
  publishedAt: string
  /** Telegram username of whoever approved it. The page does not show this. */
  approvedBy: string
  /** One factual line on the session. */
  deskView: string
  items: MattersItem[]
}

/* ── the compliance gate ──────────────────────────────────────────────────
   Every line that would reach a client is checked, not just the body of a
   post. The "why it matters" sentences are the risk: they are the desk's own
   commentary on someone else's news, they are written by a model, and they
   are the part a client is most likely to read as advice. */

export interface Check {
  ok: boolean
  violations: Violation[]
  blocked: Violation[]
}

export function checkMatters(d: Digest): Check {
  const violations = [
    ...checkCopy(d.market_line),
    ...d.items.flatMap((i) => [...checkCopy(i.headline), ...checkCopy(i.why)]),
  ]
  const blocked = blockers(violations)
  return { ok: blocked.length === 0, violations, blocked }
}

/* ── publishing ─────────────────────────────────────────────────────────── */

export interface PublishResult {
  ok: boolean
  /** What went wrong, for the person who pressed the button. */
  error?: string
  /** True when the change reached the remote and the site will rebuild. */
  deployed: boolean
  path: string
}

/**
 * Write the approved digest and push it, so Netlify rebuilds.
 *
 * Refuses on a blocking violation even though the caller is meant to have
 * checked already. This is the last point before a client sees the words, and
 * a gate that only works when it is called correctly is not a gate.
 *
 * A failed push is not a failed publish: the file is written and committed
 * either way, so the work is never lost, and the caller is told plainly that
 * it is sitting locally rather than live.
 */
export async function publishMatters(d: Digest, approvedBy: string): Promise<PublishResult> {
  const check = checkMatters(d)
  if (!check.ok) {
    return {
      ok: false,
      deployed: false,
      path: REL,
      error: `blocked on compliance: ${check.blocked.map((v) => v.detail).join('; ')}`,
    }
  }

  const payload: Matters = {
    publishedAt: new Date().toISOString(),
    approvedBy,
    deskView: d.market_line.trim(),
    items: d.items.map((i) => ({
      headline: i.headline.trim(),
      why: i.why.trim(),
      source: i.source.trim(),
      url: i.url.trim(),
    })),
  }

  mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(FILE, `${JSON.stringify(payload, null, 2)}\n`)

  const git = (args: string[]) => run('git', ['-C', REPO_DIR, ...args], { timeout: 30_000 })

  try {
    await git(['add', REL])
    await git([
      'commit', '-m',
      `Publish What Matters Today (${payload.publishedAt.slice(0, 10)}, approved by ${approvedBy})`,
    ])
  } catch (e) {
    // "nothing to commit" means the same digest was already published.
    const msg = e instanceof Error ? e.message : String(e)
    if (!/nothing to commit/i.test(msg)) {
      return { ok: false, deployed: false, path: REL, error: `commit failed: ${msg}` }
    }
  }

  try {
    await git(['push', 'origin', 'HEAD'])
  } catch (e) {
    return {
      ok: true,
      deployed: false,
      path: REL,
      error: `committed locally but the push failed, so the site will not rebuild: ${
        e instanceof Error ? e.message : String(e)
      }`,
    }
  }

  return { ok: true, deployed: true, path: REL }
}

/** What is currently published, if anything. */
export function readMatters(): Matters | undefined {
  if (!existsSync(FILE)) return undefined
  try {
    return JSON.parse(readFileSync(FILE, 'utf8')) as Matters
  } catch {
    return undefined
  }
}

/** Hours since the live file was approved — the page hides stale copy. */
export function ageHours(m: Matters): number {
  return (Date.now() - Date.parse(m.publishedAt)) / 3_600_000
}

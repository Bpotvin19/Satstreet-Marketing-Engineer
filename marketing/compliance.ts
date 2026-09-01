/* ──────────────────────────────────────────────────────────────────────────
   Marketing compliance rules.

   The prompt asks for these; this file enforces them. A prompt is a request,
   a rule is a gate — and marketing copy is public, permanent, and
   screenshot-able in a way an internal brief is not.

   Two severities:
     block — the draft cannot be approved. No Approve button appears.
     warn  — the draft is postable but something needs a human's eye first.

   The draft is still shown when blocked. A blocked draft is usually 95% right
   with one bad phrase, and hiding it just makes the team ask again.
   ────────────────────────────────────────────────────────────────────────── */

import type { Draft } from './types'

export type Severity = 'block' | 'warn'

export interface Violation {
  rule: string
  severity: Severity
  detail: string
}

/** Competitors are never named comparatively. Add real names in marketing/.env. */
const COMPETITORS = (process.env.COMPETITOR_NAMES ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

type Rule = [RegExp, string]

/* Claims about a regulated service. These are the ones that cost money. */
const CUSTODY_INSURANCE: Rule[] = [
  [/\b(fully|completely|100%)\s+insured\b/i, 'unqualified insurance claim'],
  [/\byour (assets?|bitcoin|funds?|crypto) (are|is) (insured|protected|guaranteed|safe)\b/i, 'guarantee about client assets'],
  [/\b(guaranteed|guarantee[sd]?)\s+(safety|security|protection|custody|returns?)\b/i, 'guarantee language'],
  [/\bcan(no|')t be (lost|hacked|stolen|seized)\b/i, 'absolute safety claim'],
  [/\bzero risk\b|\brisk[- ]free\b/i, 'risk-free claim'],
  [/\bbank[- ]grade (security|custody)\b/i, 'unverifiable security comparison'],
]

const REGULATORY: Rule[] = [
  [/\b(licen[cs]ed|regulated|registered|approved|authori[sz]ed)\s+(in|by|with|as)\b/i, 'regulatory status claim'],
  [/\b(FINTRAC|SEC|OSC|CSA|FinCEN|MSB|MTL)\b/, 'names a regulator or registration'],
  [/\b(compliant with|meets? all)\b.{0,40}\b(regulations?|requirements?|rules)\b/i, 'blanket compliance claim'],
  [/\bfully (compliant|regulated|licen[cs]ed)\b/i, 'blanket regulatory claim'],
]

const FORECAST: Rule[] = [
  [/\b(will|should|is going to|is set to|poised to)\s+(rise|fall|climb|drop|surge|decline|rally|crash|reach|hit|break|moon)\b/i, 'price prediction'],
  [/\bprice target\b/i, 'price target'],
  [/\b(we|I)\s+(expect|predict|forecast|anticipate)\b.{0,40}\b(price|value|market)\b/i, 'forecast'],
  [/\b\d+\s*x\b(?!\s*(faster|larger|more))/i, 'multiple-return framing'],
  [/\b(to the moon|moon(ing|shot))\b/i, 'promotional slang'],
  [/\bnext (bull run|cycle|leg up)\b/i, 'cycle prediction'],
  [/\bundervalued|overvalued\b/i, 'valuation judgment'],
]

const ADVICE: Rule[] = [
  [/\byou should\s+(buy|sell|hold|add|allocate|reduce|trim|rotate|invest)\b/i, 'direct instruction to reader'],
  [/\bwe recommend\s+(buying|selling|holding|allocating|investing)\b/i, 'recommendation'],
  [/\b(now is|this is)\s+(a|the)\s+(good|great|ideal|perfect|right)\s+time to\b/i, 'timing advice'],
  [/\bdon'?t miss (out|this)\b/i, 'urgency framing'],
  [/\byour (portfolio|allocation|position|holdings) should\b/i, 'assumes reader position'],
  [/\b(everyone|you) needs? to own\b/i, 'universal advice'],
]

const PROMOTIONAL: Rule[] = [
  [/\bhodl\b/i, 'promotional slang (fine as a named topic, not as our voice)'],
  [/\bdiamond hands\b/i, 'promotional slang'],
  [/\b(ape|aping) in\b/i, 'promotional slang'],
  [/\bsupercycle\b/i, 'promotional framing'],
  [/\b(explosive|massive|insane|parabolic|unprecedented)\s+\w+/i, 'hype adjective'],
  [/!{1,}/, 'exclamation mark'],
  [/(#\w+[\s,]*){4,}/, 'hashtag stuffing'],
]

const CLIENT_DISCLOSURE: Rule[] = [
  [/\b(one of )?our clients?\b.{0,60}\b(bought|sold|moved|traded|holds?)\b/i, 'possible client disclosure'],
  [/\ba \$?\d[\d,.]*\s*(m|mm|million|b|billion)?\s*(trade|order|block|position)\s+(we|our desk)\b/i, 'possible trade disclosure'],
]

/* ── the desk's named prohibitions ────────────────────────────────────────
   The Founder News Desk instructions list specific claims by name rather than
   by category: figures the desk does not publish, coverage it does not have,
   jurisdictions it does not serve, and a product it does not offer. These are
   not stylistic. Each one is a statement that would be wrong in public, so
   they block rather than warn.
   ────────────────────────────────────────────────────────────────────────── */

const DESK_PROHIBITIONS: Rule[] = [
  [/\bCIPF\b/i, 'CIPF coverage — the desk does not claim it'],
  [/\b(zero|no)\s+slippage\b/i, 'zero-slippage claim'],
  [/\$\s?25[,.]?000\b|\$\s?25\s?k\b/i, 'the $25k minimum is not published copy'],
  [/\bAUC\b|\bassets under custody\b/i, 'assets-under-custody figure'],
  [/\$\s?320\s?(m|mm|million)\b/i, 'the $320M insurance figure is not published copy'],
  [/\b320\s?million\b/i, 'the $320M insurance figure is not published copy'],
  [
    /\b(we|satstreet)\b[^.]{0,40}\b(serve|serves|serving|operate|operates|available|licen[cs]ed)\b[^.]{0,40}\b(florida|united states|u\.?s\.?a?|america|uk|united kingdom|britain)\b/i,
    'claims service in a jurisdiction the desk does not serve',
  ],
  [
    /\b(we|satstreet)\b[^.]{0,30}\b(lend|lends|lending|loan|loans|borrow against|credit line)\b/i,
    'implies a lending product',
  ],
  [/\b(collateral(i[sz]ed)? loan|lending product|borrow against your (bitcoin|btc|crypto))\b/i, 'implies a lending product'],
]

/* Identifiers that must never appear in public copy. */
const IDENTIFIERS: Rule[] = [
  [/\b(bc1[a-z0-9]{20,}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b/, 'looks like a Bitcoin address'],
  [/\b0x[a-fA-F0-9]{40}\b/, 'looks like an Ethereum address'],
  [/\b(ticket|case|order)\s*#\s?\d{3,}\b/i, 'internal ticket or order reference'],
]

/* "Safe" is not banned as a word, but it is the one the desk is asked about
   most and the one that most often smuggles in a guarantee. Flag, don't block:
   "safe custody practices" is fine, "your bitcoin is safe" is not, and the
   guarantee rules above already catch the second. */
const SAFETY_LANGUAGE: Rule[] = [[/\bsafe\b/i, 'the word "safe" — check it is not read as a guarantee']]

/** Live figures that must be refreshed and sourced at publication. */
const LIVE_FIGURE = /\$\s?\d|(\b\d[\d,.]*\s*(BTC|ETH|bn|billion|mn|million|%)\b)/i

const GROUPS: [Rule[], string, Severity][] = [
  [CUSTODY_INSURANCE, 'custody-and-insurance', 'block'],
  [REGULATORY, 'regulatory-claims', 'block'],
  [FORECAST, 'no-forecasts', 'block'],
  [ADVICE, 'no-advice', 'block'],
  [CLIENT_DISCLOSURE, 'client-confidentiality', 'block'],
  [DESK_PROHIBITIONS, 'desk-prohibitions', 'block'],
  [IDENTIFIERS, 'client-confidentiality', 'block'],
  [PROMOTIONAL, 'house-voice', 'warn'],
  [SAFETY_LANGUAGE, 'safety-language', 'warn'],
]

/** Run the rules over any piece of candidate copy. */
export function checkCopy(text: string): Violation[] {
  const out: Violation[] = []
  if (!text) return out

  for (const [rules, name, severity] of GROUPS) {
    for (const [re, label] of rules) {
      const m = text.match(re)
      if (m) out.push({ rule: name, severity, detail: `${label} — "${m[0].trim()}"` })
    }
  }

  for (const name of COMPETITORS) {
    if (new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) {
      out.push({
        rule: 'no-competitor-naming',
        severity: 'block',
        detail: `names a competitor — "${name}"`,
      })
    }
  }

  return out
}

/**
 * Full check on a draft. Adds the editorial guardrail: any live figure in the
 * body has to appear in needs_refresh, so nothing numeric goes out without a
 * human refreshing and sourcing it first.
 */
export function checkDraft(draft: Draft): Violation[] {
  const out = checkCopy(draft.body)
  for (const hook of draft.alt_hooks) out.push(...checkCopy(hook))

  if (LIVE_FIGURE.test(draft.body) && draft.needs_refresh.length === 0) {
    out.push({
      rule: 'editorial-guardrail',
      severity: 'warn',
      detail: 'contains a figure but flagged nothing to refresh — verify and source it before posting',
    })
  }

  if (draft.channel === 'X' && draft.body.length > 280 && !/\b1\//.test(draft.body)) {
    out.push({
      rule: 'house-voice',
      severity: 'warn',
      detail: `${draft.body.length} characters and not numbered — too long for a single post`,
    })
  }

  // Dedupe: the same phrase can trip two patterns in one group.
  const seen = new Set<string>()
  return out.filter((v) => {
    const k = `${v.rule}|${v.detail}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export function blockers(violations: Violation[]): Violation[] {
  return violations.filter((v) => v.severity === 'block')
}

export function isBlocked(violations: Violation[]): boolean {
  return violations.some((v) => v.severity === 'block')
}

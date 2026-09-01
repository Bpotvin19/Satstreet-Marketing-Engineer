/* ──────────────────────────────────────────────────────────────────────────
   Crypto news, gathered from publisher RSS feeds.

   What leaves this module, and why it is limited.

   A feed item carries the publisher's own excerpt. That excerpt is their
   copyrighted writing, and forwarding it to a client channel is republishing
   their work rather than pointing at it. So the excerpt is used only as input
   for deciding what matters and writing our own one-line context — it is
   never broadcast, and never stored beyond the run.

   What clients receive is a headline, the source, a link, and a sentence
   Satstreet wrote. Headlines are short factual statements and links are how
   the web works; the article stays on the publisher's page, where their
   advertising and their byline are.

   No API keys anywhere here. RSS is public, and a feed that breaks or goes
   away is skipped rather than allowed to take the digest down with it.
   ────────────────────────────────────────────────────────────────────────── */

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36'

export interface Source {
  name: string
  url: string
  /** Nudges ranking when several outlets carry the same story. */
  weight: number
}

/** Edit this list to change what the desk reads. */
export const SOURCES: Source[] = [
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', weight: 1.15 },
  { name: 'The Block', url: 'https://www.theblock.co/rss.xml', weight: 1.15 },
  { name: 'Cointelegraph', url: 'https://cointelegraph.com/rss', weight: 1.0 },
  { name: 'Decrypt', url: 'https://decrypt.co/feed', weight: 1.0 },
  { name: 'Crypto Briefing', url: 'https://cryptobriefing.com/feed/', weight: 0.95 },
  { name: 'Bitcoin Magazine', url: 'https://bitcoinmagazine.com/feed', weight: 0.9 },
]

export interface Item {
  title: string
  link: string
  source: string
  published: Date
  /** Publisher excerpt. For ranking and model input only — never broadcast. */
  blurb: string
}

/* ---------- a small RSS/Atom reader ----------

   Deliberately not a dependency. These are six known feeds in two well-worn
   formats, and a hand-rolled reader that skips what it cannot parse is a
   smaller liability than a parser that has to be kept up to date. */

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? decode(m[1]) : ''
}

function link(block: string): string {
  const plain = tag(block, 'link')
  if (plain && /^https?:/i.test(plain)) return plain
  // Atom puts the URL in an attribute instead of the element body.
  const href = block.match(/<link[^>]+href="([^"]+)"/i)
  return href ? href[1] : ''
}

function parse(xml: string, source: string): Item[] {
  const blocks = xml.match(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi) ?? []
  const out: Item[] = []

  for (const b of blocks) {
    const title = tag(b, 'title')
    const url = link(b)
    if (!title || !url) continue

    const when = tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date')
    const at = when ? new Date(when) : new Date(NaN)

    out.push({
      title,
      // Strip the tracking parameters publishers append to feed links.
      link: url.split('?')[0],
      source,
      published: Number.isNaN(at.getTime()) ? new Date() : at,
      blurb: (tag(b, 'description') || tag(b, 'summary') || tag(b, 'content')).slice(0, 400),
    })
  }
  return out
}

async function readFeed(s: Source, timeoutMs: number): Promise<Item[]> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const r = await fetch(s.url, {
      headers: { 'user-agent': UA, accept: 'application/rss+xml, application/xml, text/xml, */*' },
      redirect: 'follow',
      signal: ctl.signal,
    })
    if (!r.ok) throw new Error(`${r.status}`)
    return parse(await r.text(), s.name)
  } catch (e) {
    console.warn(`[news] ${s.name} unavailable: ${e instanceof Error ? e.message : e}`)
    return []
  } finally {
    clearTimeout(t)
  }
}

/* ---------- ranking ---------- */

/**
 * What this desk's clients care about, drawn from the content pillars: market
 * infrastructure, institutional flows, custody and security, regulation —
 * especially Canadian — and the majors.
 *
 * This is a first pass to get from ~150 headlines to a shortlist. The model
 * makes the actual editorial choice from what survives.
 */
const SIGNAL: [RegExp, number][] = [
  [/\b(etf|inflow|outflow|institutional|treasury|allocat)/i, 3],
  [/\b(custody|custodian|cold storage|multi-?sig|self-?custody)/i, 3],
  [/\b(regulat|osc|csa|sec\b|fintrac|licen[cs]|compliance|framework)/i, 3],
  [/\b(canada|canadian|toronto|ontario)\b/i, 4],
  [/\b(settlement|liquidity|otc|market maker|order book|spread|volume)/i, 3],
  [/\b(bitcoin|btc|ethereum|eth)\b/i, 2],
  [/\b(hack|exploit|breach|stolen|phishing|fraud|scam)/i, 2],
  [/\b(bank|banking|payment rails|stablecoin|usdc|usdt)/i, 2],
  // Down-weight the noise a client desk has no use for.
  [/\b(memecoin|meme coin|airdrop|nft drop|celebrity|price prediction|could hit|moon)/i, -5],
  [/\b(giveaway|presale|100x|gem)\b/i, -6],
]

function score(item: Item, weight: number, now: number): number {
  const text = `${item.title} ${item.blurb}`
  let s = 0
  for (const [re, points] of SIGNAL) if (re.test(text)) s += points

  // Recency, halving roughly every twelve hours.
  const hours = Math.max(0, (now - item.published.getTime()) / 3_600_000)
  s += 6 * Math.pow(0.5, hours / 12)

  return s * weight
}

/** Titles differ slightly between outlets covering the same story. */
function fingerprint(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 6)
    .sort()
    .join(' ')
}

export interface Harvest {
  items: Item[]
  /** Sources that answered, for honest reporting when one is down. */
  ok: string[]
  failed: string[]
}

/**
 * Read every feed, drop duplicates and anything older than `hours`, and return
 * the highest-scoring items. Feeds are read in parallel; one being down costs
 * that outlet's stories and nothing else.
 */
export async function harvest(hours = 24, limit = 25, timeoutMs = 12_000): Promise<Harvest> {
  const results = await Promise.all(
    SOURCES.map(async (s) => ({ s, items: await readFeed(s, timeoutMs) })),
  )

  const now = Date.now()
  const cutoff = now - hours * 3_600_000
  const seen = new Map<string, { item: Item; score: number }>()
  const ok: string[] = []
  const failed: string[] = []

  for (const { s, items } of results) {
    ;(items.length ? ok : failed).push(s.name)
    for (const item of items) {
      if (item.published.getTime() < cutoff) continue
      const key = fingerprint(item.title)
      if (!key) continue
      const sc = score(item, s.weight, now)
      const prev = seen.get(key)
      // Same story from two outlets: keep whichever scores higher.
      if (!prev || sc > prev.score) seen.set(key, { item, score: sc })
    }
  }

  const items = [...seen.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.item)

  return { items, ok, failed }
}

/* ── coverage for drafting ────────────────────────────────────────────────── */

/** Terms worth matching on, ignoring the words every headline contains. */
const STOP = new Set([
  'the','and','for','with','from','that','this','what','when','how','why','are','was',
  'crypto','bitcoin','btc','ethereum','eth','coin','token','price','market','news',
])

function terms(topic: string): string[] {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
}

/**
 * Whole-word matcher, tolerant of plurals.
 *
 * Substring matching quietly ruins topic search: "safe" matches "safeguard",
 * "transactions" matches any "transaction", and unrelated stories are handed
 * over as news hooks. A hyphen is a word boundary, so "quantum" still matches
 * "Quantum-Safe".
 */
function matcher(term: string): RegExp {
  const stem = term.replace(/(ies|es|s)$/, '')
  const safe = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${safe}(?:ies|es|s)?\\b`, 'i')
}

export interface Coverage {
  /** Stories that genuinely touch the topic. May be empty — that is a real answer. */
  related: Item[]
  /** The strongest recent stories generally, for a sense of what the market is on. */
  recent: Item[]
}

/**
 * Recent coverage, for anchoring a post to something that actually happened.
 *
 * Drafting without this produced generic posts, because the model had only the
 * static context pack to work from — there was nothing current in the prompt
 * to be topical about.
 *
 * `related` is deliberately allowed to come back empty. An honest "nothing in
 * the news touches this" lets the draft say so, which is far better than a
 * post implying a news hook that does not exist.
 */
export async function coverage(topic: string, hours = 72, max = 12): Promise<Coverage> {
  // Search EVERYTHING in the window, not harvest()'s top slice.
  //
  // harvest() ranks by a fixed desk-signal model — ETF flows, custody,
  // regulation, Canada — and truncates. Any topic outside that model is
  // invisible to a topic search run over the survivors: the first quantum-safe
  // Bitcoin transaction sat at position 86 of 151 and never reached the model,
  // so the post came out evergreen while three outlets were covering it.
  const h = await harvest(hours, 500)
  const want = terms(topic)
  if (!want.length) return { related: [], recent: h.items.slice(0, 8) }

  const res = want.map((t) => [t, matcher(t)] as const)
  const docs = h.items.map((item) => ({
    item,
    title: item.title,
    text: `${item.title} ${item.blurb}`,
  }))

  // Weight each term by how rare it is in today's coverage. "quantum" appears
  // in a handful of stories and is worth a lot; "transactions" appears
  // everywhere and is worth almost nothing. Without this, common words in the
  // topic match unrelated stories and the draft anchors to the wrong event.
  const weight = new Map<string, number>()
  for (const [t, re] of res) {
    const df = docs.filter((d) => re.test(d.text)).length
    weight.set(t, Math.log((docs.length + 1) / (df + 1)))
  }
  const best = want.reduce((n, t) => n + (weight.get(t) ?? 0) * 2, 0)

  const scored = docs.map((d) => {
    let score = 0
    for (const [t, re] of res) {
      const w = weight.get(t) ?? 0
      // A term in the headline is worth more than one buried in the excerpt.
      if (re.test(d.title)) score += w * 2
      else if (re.test(d.text)) score += w
    }
    return { item: d.item, score }
  })

  // A floor, so a weak coincidental match is reported as "nothing relates"
  // rather than handed over as a news hook. Silence is the honest answer.
  const floor = Math.max(0.35 * best, 0.8)

  // And the match must involve a term that actually distinguishes the topic.
  // Scoring alone let "Kraken users locked out after sanctioned crypto
  // TRANSACTIONS" rank as related to quantum-safe transactions: it cleared the
  // floor on common words while containing nothing about the subject.
  const distinctive = new Set(
    [...want].sort((a, b) => (weight.get(b) ?? 0) - (weight.get(a) ?? 0))
      .slice(0, Math.max(1, Math.ceil(want.length / 2))),
  )
  const onTopic = (d: { item: Item }) => {
    const text = `${d.item.title} ${d.item.blurb}`
    for (const [t, re] of res) if (distinctive.has(t) && re.test(text)) return true
    return false
  }

  return {
    related: scored
      .filter((x) => x.score >= floor && onTopic(x))
      .sort((a, b) => b.score - a.score)
      .slice(0, max)
      .map((x) => x.item),
    recent: h.items.slice(0, 8),
  }
}

/** The prompt block. Returns '' when there is nothing worth including. */
export function coverageBlock(c: Coverage): string {
  if (!c.related.length && !c.recent.length) return ''

  const fmt = (i: Item) => `- ${i.title} (${i.source}, ${i.published.toISOString().slice(0, 10)})`
  const lines: string[] = ['<current_coverage>']

  if (c.related.length) {
    lines.push('Recent stories that touch this topic:', ...c.related.map(fmt))
  } else {
    lines.push('Nothing in the last few days touches this topic directly.')
  }

  if (c.recent.length) {
    lines.push('', 'What the market is covering generally right now:', ...c.recent.map(fmt))
  }

  lines.push(
    '',
    'Use this to make the post current. Anchor it to a specific development above',
    'when one genuinely relates — name what happened and when.',
    'If nothing above relates, write the evergreen version and say so in',
    'compliance_self_check. Never imply a news hook that is not there, never',
    'invent a development, and never state a figure from a headline as fact',
    'without adding it to needs_refresh.',
    '</current_coverage>',
  )
  return lines.join('\n')
}

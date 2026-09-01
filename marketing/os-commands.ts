/* ──────────────────────────────────────────────────────────────────────────
   Satstreet OS commands.

   These are the first non-marketing workflows exposed through the existing
   Telegram bot. They are deliberately narrow:

     /research         public web research only
     /todays-prospects local public-data prospect output from this repo
     /company-facts    approved/reference knowledge only

   None of these commands send messages externally, touch client data, or make
   trading/compliance decisions.
   ────────────────────────────────────────────────────────────────────────── */

import Anthropic from '@anthropic-ai/sdk'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { MARKETING_DIR } from './calendar'

const ROOT = resolve(MARKETING_DIR, '..')

/* ── /research ───────────────────────────────────────────────────────────── */

export async function researchEntity(query: string): Promise<string> {
  const q = query.trim()
  if (!q) throw new Error('Usage: /research <company or person>')

  const key = process.env.ANTHROPIC_API_KEY?.trim()
  const client = new Anthropic(key ? { apiKey: key } : {})

  const params = {
    model: process.env.CLAUDE_MODEL?.trim() || 'claude-opus-5',
    max_tokens: 2800,
    system:
      'You are the public-data research layer for Satstreet Sales/BD. ' +
      'Research only public information. Never infer or request private client information. ' +
      'Focus on business model, decision-makers, recent trigger events, potential recurring ' +
      'digital-asset flow, and why the entity might be worth a relationship for an institutional ' +
      'digital-asset brokerage. Do not claim Satstreet can serve U.S. persons or entities. ' +
      'End with 3-6 source URLs. Be concise and commercially useful.',
    messages: [{
      role: 'user',
      content:
        `Research "${q}" for Satstreet Sales/BD. Return:\n` +
        '1. What they do\n' +
        '2. Why now / recent triggers\n' +
        '3. Likely digital-asset or treasury flow\n' +
        '4. Best public decision-maker(s)\n' +
        '5. Potential Satstreet relationship angle\n' +
        '6. Suggested first-call question\n' +
        '7. Sources\n\n' +
        'If the entity is U.S.-based, label the opportunity RESEARCH / RELATIONSHIP BUILDING ONLY.',
    }],
    tools: [{
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: 6,
    }],
  }

  // The Anthropic SDK can lag newly released server-side tool typings. Keep
  // the request shape explicit and let the API validate the current tool.
  const response = await (client.messages.create as unknown as (p: unknown) => Promise<{
    content: Array<{ type: string; text?: string }>
  }>)(params)

  const text = response.content
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text!)
    .join('\n')
    .trim()

  if (!text) throw new Error('Research returned no text.')
  return text
}

/* ── /todays-prospects ──────────────────────────────────────────────────── */

function latestMarkdown(dir: string): string | null {
  if (!existsSync(dir)) return null
  const files = readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort()
    .reverse()
  return files[0] ? resolve(dir, files[0]) : null
}

interface Prospect {
  rank: string
  name: string
  score: string
  category?: string
  trigger?: string
  whyNow?: string
  decisionMaker?: string
  angle?: string
}

function field(block: string, label: string): string | undefined {
  const re = new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\\n]+)`, 'i')
  return block.match(re)?.[1]?.trim().replace(/\s{2,}$/, '')
}

function parseProspects(markdown: string): Prospect[] {
  const matches = [...markdown.matchAll(
    /^##\s+(\d+)\.\s+(.+?)\s+—\s+([^\n]+?)(?:\s+—\s+(?:CONTACT TODAY|HIGH PRIORITY))?\s*$/gm,
  )]

  return matches.map((m, i) => {
    const start = m.index ?? 0
    const end = matches[i + 1]?.index ?? markdown.length
    const block = markdown.slice(start, end)
    return {
      rank: m[1],
      name: m[2].trim(),
      score: m[3].trim(),
      category: field(block, 'Category'),
      trigger: field(block, 'Trigger'),
      whyNow: field(block, 'Why now'),
      decisionMaker: field(block, 'Decision-maker'),
      angle: field(block, 'Outreach angle') ?? field(block, 'Potential Satstreet relationship'),
    }
  })
}

export function todaysProspects(regionRaw = ''): {
  region: string
  source: string
  prospects: Prospect[]
} {
  const region = regionRaw.trim().toLowerCase()
  const florida = ['florida', 'fl', 'miami', 'us', 'usa'].includes(region)
  const dir = florida
    ? resolve(ROOT, 'outputs', 'daily-prospects', 'florida')
    : resolve(ROOT, 'outputs', 'daily-prospects')

  const file = latestMarkdown(dir)
  if (!file) {
    throw new Error(
      florida
        ? 'No Florida prospect output is available yet.'
        : 'No Canada prospect output is available yet.',
    )
  }

  const markdown = readFileSync(file, 'utf8')
  return {
    region: florida ? 'Florida' : 'Canada',
    source: file.split('/').pop() ?? file,
    prospects: parseProspects(markdown).slice(0, 10),
  }
}

export function renderProspects(result: ReturnType<typeof todaysProspects>): string {
  const lines = [
    `<b>Today's prospects — ${result.region}</b>`,
    `<i>Latest stored run: ${result.source.replace('.md', '')}</i>`,
    '',
  ]

  if (!result.prospects.length) {
    lines.push('No prospect records could be parsed from the latest output.')
    return lines.join('\n')
  }

  for (const p of result.prospects) {
    lines.push(`<b>${p.rank}. ${escapeHtml(p.name)} — ${escapeHtml(p.score)}</b>`)
    if (p.category) lines.push(`<i>${escapeHtml(p.category)}</i>`)
    if (p.trigger) lines.push(`Trigger: ${escapeHtml(p.trigger)}</i>`.replace('</i>', ''))
    if (p.decisionMaker) lines.push(`Decision-maker: ${escapeHtml(p.decisionMaker)}</i>`.replace('</i>', ''))
    if (p.angle) lines.push(`Angle: ${escapeHtml(p.angle)}</i>`.replace('</i>', ''))
    lines.push('')
  }

  lines.push(
    '<i>Public-data prospecting only. Human review before outreach. ' +
      (result.region === 'Florida'
        ? 'Florida entries are research / relationship-building only.'
        : 'No client or HubSpot data used.') +
      '</i>',
  )
  return lines.join('\n')
}

/* ── /company-facts ─────────────────────────────────────────────────────── */

const CONTEXT = resolve(MARKETING_DIR, 'context', 'satstreet.md')

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function companyFacts(queryRaw: string): string {
  if (!existsSync(CONTEXT)) throw new Error('Satstreet context pack is missing.')

  const text = readFileSync(CONTEXT, 'utf8')
  const query = normalize(queryRaw)

  if (!query) {
    return [
      '<b>Company facts</b>',
      '',
      'Try:',
      '<code>/company-facts custody</code>',
      '<code>/company-facts settlement</code>',
      '<code>/company-facts minimum</code>',
      '<code>/company-facts eligibility</code>',
      '<code>/company-facts US</code>',
      '',
      '<i>Answers come from the versioned Satstreet context pack / approved reference material. Do not infer beyond it.</i>',
    ].join('\n')
  }

  const aliases: Record<string, string[]> = {
    registration: ['regulatory', 'regulated', 'registration', 'licence', 'license'],
    regulations: ['regulatory', 'regulated', 'registration', 'licence', 'license'],
    custody: ['custody', 'self custody', 'multi sig'],
    settlement: ['settlement', 'wire', 'eft', 'cad', 'usd'],
    minimum: ['minimum', '50 000', '50k'],
    eligibility: ['eligibility', 'resident', 'canada', 'retail', 'united states', 'united kingdom'],
    us: ['united states', 'us expansion', 'u s'],
    usa: ['united states', 'us expansion', 'u s'],
    client: ['high net worth', 'family offices', 'corporate treasuries', 'founders'],
  }

  const words = aliases[query] ?? query.split(' ').filter((w) => w.length > 2)
  const paras = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !p.includes('**TODO**'))
    .filter((p) => {
      const n = normalize(p)
      return words.some((w) => n.includes(normalize(w)))
    })
    .slice(0, 6)

  if (!paras.length) {
    return (
      `No versioned company fact matched "${escapeHtml(queryRaw)}".\n\n` +
      '<i>Do not invent an answer. Use /ref to check the relevant Notion page.</i>'
    )
  }

  return [
    `<b>Company facts — ${escapeHtml(queryRaw)}</b>`,
    '',
    ...paras.map((p) => escapeHtml(p.replace(/^#+\s*/gm, '').replace(/\*\*/g, ''))),
    '',
    '<i>Source: versioned Satstreet context pack. Verify live regulatory or numeric claims before external use.</i>',
  ].join('\n\n')
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

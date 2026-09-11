/* Team workspace feed: per-person voice references, Mike's newsletter
   archive, the social and email draft queue, and the prospect list.

   Everything here is internal, so it sits behind the same access key as the
   Macro Desk brief. Nothing is sent, published or approved from this endpoint;
   it reads, and the separate prospect-owner endpoint is the only writer.
*/

import { json, notion, plain, refuse, topBlocks, toLines } from './_notion.js'

const CONTENT_QUEUE = process.env.NOTION_CONTENT_QUEUE_DB?.trim() || 'c0143570-a13f-4077-aba9-796fc41ddd34'
const PROSPECTS = process.env.NOTION_PROSPECTS_DB?.trim() || '8524a342-e17f-4a67-a414-339e005a3592'
const NEWSLETTER_ARCHIVE = process.env.NOTION_NEWSLETTER_ARCHIVE?.trim() || '3c7e562f-a5bd-80c2-9307-d683622fe673'
const DAILY_INTEL = process.env.NOTION_DAILY_INTEL_DB?.trim() || '91d74bd8-2086-4536-a739-0ce7cf4964c5'
const LINKEDIN = process.env.NOTION_LINKEDIN_DB?.trim() || '7453d4ae-f5a6-42c7-b8ac-383a760353ba'
const OFFSHORE_PREFIX = 'Offshore VC Scout —'
const OFFSHORE_PACKS = 3

/* The LinkedIn network holds thousands of rows. Only the working slice
   belongs on a dashboard: this week's reviewed relationships, plus the
   Tier 1 records still waiting on a human. */
const LINKEDIN_FILTER = {
  or: [
    { property: 'This Week', checkbox: { equals: true } },
    {
      and: [
        { property: 'Priority', select: { equals: 'Tier 1 — High Potential' } },
        { property: 'Outreach Status', select: { equals: 'Not Reviewed' } },
      ],
    },
  ],
}

/* `voice` matches the Content Queue "Primary Voice" option exactly — that is
   what ties a person's tab to their drafts. `archive` is an optional page of
   published work; its child pages become that person's back catalogue. */
const PEOPLE = [
  {
    key: 'ben', name: 'Ben', voice: 'Ben',
    voiceTitle: "Ben's Brain", page: '3d6e562f-a5bd-8189-857d-e5c974793692',
    archive: '', archiveLabel: '',
  },
  {
    key: 'george', name: 'George', voice: 'George',
    voiceTitle: 'George McBride Voice', page: '3c7e562f-a5bd-8134-a7e9-dac1c0b44cea',
    archive: '', archiveLabel: '',
  },
  {
    key: 'dan', name: 'Dan', voice: 'Dan',
    voiceTitle: 'Dan Wright — LinkedIn Voice', page: '3d7e562f-a5bd-81d9-a986-ce7d8313841c',
    archive: '3d7e562f-a5bd-8191-899e-c8f81df38244', archiveLabel: 'Past posts',
  },
  {
    key: 'jon', name: 'Jon', voice: 'Jon',
    voiceTitle: 'Jon Lister Voice', page: '3c7e562f-a5bd-814e-baf4-f58cc1fd4f46',
    archive: '3d8e562f-a5bd-8199-b6ef-ffbaf8fbebb0', archiveLabel: 'Past posts',
  },
  {
    key: 'mike', name: 'Mike', voice: 'Mike',
    voiceTitle: 'Mike Nasser Voice', page: '3c7e562f-a5bd-8141-b5a4-f587115aa12b',
    archive: NEWSLETTER_ARCHIVE, archiveLabel: 'Newsletters',
  },
]

async function childPages(id: string): Promise<any[]> {
  return (await topBlocks(id, 200))
    .filter((row) => row.type === 'child_page')
    .map((row) => ({
      id: row.id,
      title: row.child_page?.title ?? 'Untitled',
      url: pageUrl(row.id),
      lastEdited: row.last_edited_time ?? '',
    }))
}

const pageUrl = (id: string): string => 'https://www.notion.so/' + id.replace(/-/g, '')

const selectOf = (prop: any): string => prop?.select?.name ?? ''
const textOf = (prop: any): string => plain(prop?.rich_text)
const urlOf = (prop: any): string => prop?.url ?? ''

function draftFrom(row: any) {
  const p = row.properties ?? {}
  return {
    id: row.id,
    url: row.url ?? pageUrl(row.id),
    name: plain(p.Name?.title),
    voice: selectOf(p['Primary Voice']),
    platforms: (p.Platform?.multi_select ?? []).map((o: any) => o.name),
    pillar: selectOf(p.Pillar),
    campaign: textOf(p.Campaign),
    draft: textOf(p.Draft),
    screenedDraft: textOf(p['Screened Draft']),
    approval: selectOf(p.Approval),
    screenStatus: selectOf(p['Screen Status']),
    verdict: selectOf(p['Screen Verdict']),
    risk: selectOf(p['Compliance Risk']),
    notes: textOf(p.Notes),
    source: urlOf(p.Source),
    publishDate: p['Publish Date']?.date?.start ?? '',
    lastEdited: row.last_edited_time ?? '',
  }
}

function prospectFrom(row: any) {
  const p = row.properties ?? {}
  return {
    id: row.id,
    url: row.url ?? pageUrl(row.id),
    key: textOf(p['Dashboard Key']),
    company: plain(p.Company?.title),
    decisionMaker: textOf(p['Decision Maker']),
    owner: textOf(p.Owner),
    leadSource: selectOf(p['Lead Source']),
    region: selectOf(p.Region),
    segment: selectOf(p.Segment),
    status: selectOf(p.Status),
    score: p.Score?.number ?? null,
    trigger: textOf(p.Trigger),
    whyNow: textOf(p['Why Now']),
    angle: textOf(p['Satstreet Angle']),
    sourceUrl: urlOf(p['Source URL']),
    sourcePack: urlOf(p['Source Pack']),
    lastResearched: p['Last Researched']?.date?.start ?? '',
  }
}

async function queryAll(db: string, sorts: unknown[], cap = 200, filter?: unknown): Promise<any[]> {
  const rows: any[] = []
  let cursor: string | undefined
  do {
    const page = await notion(`/databases/${db}/query`, {
      sorts,
      page_size: 100,
      ...(filter ? { filter } : {}),
      ...(cursor ? { start_cursor: cursor } : {}),
    })
    rows.push(...(page.results ?? []))
    cursor = page.has_more && rows.length < cap ? page.next_cursor : undefined
  } while (cursor)
  return rows.slice(0, cap)
}

function linkedinFrom(row: any) {
  const p = row.properties ?? {}
  return {
    id: row.id,
    url: row.url ?? pageUrl(row.id),
    source: 'LinkedIn',
    company: textOf(p.Company),
    person: plain(p.Name?.title),
    position: textOf(p.Position),
    segment: selectOf(p['OTC Segment']),
    opportunity: selectOf(p['Opportunity Type']),
    priority: selectOf(p.Priority),
    outreachStatus: selectOf(p['Outreach Status']),
    networkStatus: selectOf(p['Network Status']),
    score: p['OTC Score']?.number ?? null,
    nextStep: textOf(p['Next Step']),
    angle: textOf(p['Suggested Outreach Angle']),
    rationale: textOf(p['OTC Rationale']),
    thisWeek: p['This Week']?.checkbox === true,
    linkedinUrl: urlOf(p['LinkedIn URL']),
    /* Relationship Owner is a Notion person property, not free text, so the
       dashboard shows it but cannot set it the way it sets a prospect owner. */
    ownerCount: (p['Relationship Owner']?.people ?? []).length,
  }
}

/* Minimal CSV that respects double quotes — an offshore pack line can carry a
   quoted trigger with a comma in it. */
function csvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1 }
      else if (ch === '"') quoted = false
      else cell += ch
      continue
    }
    if (ch === '"') quoted = true
    else if (ch === ',') { row.push(cell.trim()); cell = '' }
    else if (ch === '\n') { row.push(cell.trim()); rows.push(row); row = []; cell = '' }
    else if (ch !== '\r') cell += ch
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row) }
  return rows.filter((r) => r.some(Boolean))
}

/* Each pack ends with a "HubSpot-ready rows" code block. That block is the
   only structured form of the offshore leads — they are never written into
   the canonical prospect database, which is why the two lists disagree. */
async function offshorePacks(): Promise<any[]> {
  const pages = await queryAll(
    DAILY_INTEL,
    [{ property: 'Date', direction: 'descending' }],
    OFFSHORE_PACKS,
    { property: 'Name', title: { starts_with: OFFSHORE_PREFIX } },
  )

  const out: any[] = []
  for (const page of pages) {
    const packName = plain(page.properties?.Name?.title)
    const packUrl = page.url ?? pageUrl(page.id)
    const packDate = page.properties?.Date?.date?.start ?? ''
    let blocks: any[] = []
    try { blocks = await topBlocks(page.id, 200) } catch { continue }

    const code = blocks
      .filter((b) => b.type === 'code')
      .map((b) => plain(b.code?.rich_text))
      .find((text) => /company\s*,/i.test(text.split('\n')[0] ?? ''))
    if (!code) continue

    const rows = csvRows(code)
    const header = (rows.shift() ?? []).map((h) => h.toLowerCase())
    const at = (name: string) => header.findIndex((h) => h.indexOf(name) >= 0)
    const iCompany = at('company')
    const iFirst = at('first')
    const iLast = at('last')
    const iTitle = at('title')
    const iCountry = at('country')
    const iScore = at('score')
    const iPriority = at('priority')

    rows.forEach((cells, index) => {
      const company = iCompany >= 0 ? cells[iCompany] : ''
      if (!company) return
      const person = [iFirst >= 0 ? cells[iFirst] : '', iLast >= 0 ? cells[iLast] : ''].filter(Boolean).join(' ')
      const score = iScore >= 0 ? Number(cells[iScore]) : NaN
      out.push({
        id: page.id + ':' + index,
        source: 'Offshore pack',
        company,
        person,
        position: iTitle >= 0 ? cells[iTitle] : '',
        region: iCountry >= 0 ? cells[iCountry] : '',
        priority: iPriority >= 0 ? cells[iPriority] : '',
        score: Number.isFinite(score) ? score : null,
        packName,
        packUrl,
        packDate,
      })
    })
  }
  return out
}

type Cached = { at: number; body: unknown }
const HOLD_MS = 60_000
let cached: Cached | null = null

export default async function handler(request: Request): Promise<Response> {
  const denied = refuse(request)
  if (denied) return denied

  const fresh = new URL(request.url).searchParams.get('refresh') === '1'
  if (!fresh && cached && Date.now() - cached.at < HOLD_MS) return json(cached.body, 200)

  try {
    /* Voice references first — one call each, top level only. A person whose
       page cannot be read still gets a tab, with a pointer to Notion. */
    const people = await Promise.all(
      PEOPLE.map(async (person) => {
        let lines: unknown[] = []
        let error = ''
        try {
          lines = toLines(await topBlocks(person.page, 120))
        } catch (e) {
          error = e instanceof Error ? e.message : 'Voice reference unavailable.'
        }
        let archive: any[] = []
        if (person.archive) {
          try { archive = await childPages(person.archive) } catch { archive = [] }
        }
        return {
          ...person,
          url: pageUrl(person.page),
          archiveUrl: person.archive ? pageUrl(person.archive) : '',
          lines,
          archive,
          error,
        }
      }),
    )

    const drafts = (await queryAll(CONTENT_QUEUE, [{ timestamp: 'last_edited_time', direction: 'descending' }]))
      .map(draftFrom)

    const prospects = (await queryAll(PROSPECTS, [{ property: 'Score', direction: 'descending' }]))
      .map(prospectFrom)

    /* Both extra sources are best effort. A prospecting tab that loses the
       canonical list because one research pack failed to parse is worse than
       one that quietly shows fewer sources. */
    let linkedin: any[] = []
    try {
      linkedin = (await queryAll(LINKEDIN, [{ property: 'OTC Score', direction: 'descending' }], 150, LINKEDIN_FILTER))
        .map(linkedinFrom)
    } catch { linkedin = [] }

    let offshore: any[] = []
    try { offshore = await offshorePacks() } catch { offshore = [] }

    const body = { asOf: new Date().toISOString(), people, drafts, prospects, linkedin, offshore }
    cached = { at: Date.now(), body }
    return json(body, 200)
  } catch (error) {
    if (cached) {
      return json({ ...(cached.body as object), stale: true, staleSince: new Date(cached.at).toISOString() }, 200)
    }
    return json({ error: error instanceof Error ? error.message : 'The team workspace could not be loaded.' }, 502)
  }
}

export const config = { path: '/api/workspace' }

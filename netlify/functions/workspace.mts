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

/* `voice` matches the Content Queue "Primary Voice" option exactly — that is
   what ties a person's tab to their drafts. */
const PEOPLE = [
  { key: 'ben', name: 'Ben', voice: 'Ben', voiceTitle: "Ben's Brain", page: '3d6e562f-a5bd-8189-857d-e5c974793692' },
  { key: 'george', name: 'George', voice: 'George', voiceTitle: 'George McBride Voice', page: '3c7e562f-a5bd-8134-a7e9-dac1c0b44cea' },
  { key: 'dan', name: 'Dan', voice: 'Dan', voiceTitle: 'Dan Wright — LinkedIn Voice', page: '3d7e562f-a5bd-81d9-a986-ce7d8313841c' },
  { key: 'mike', name: 'Mike', voice: 'Mike', voiceTitle: 'Mike Nasser Voice', page: '3c7e562f-a5bd-8141-b5a4-f587115aa12b' },
]

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

async function queryAll(db: string, sorts: unknown[], cap = 200): Promise<any[]> {
  const rows: any[] = []
  let cursor: string | undefined
  do {
    const page = await notion(`/databases/${db}/query`, {
      sorts,
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    })
    rows.push(...(page.results ?? []))
    cursor = page.has_more && rows.length < cap ? page.next_cursor : undefined
  } while (cursor)
  return rows.slice(0, cap)
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
        return { ...person, url: pageUrl(person.page), lines, error }
      }),
    )

    const newsletters = (await topBlocks(NEWSLETTER_ARCHIVE, 200))
      .filter((row) => row.type === 'child_page')
      .map((row) => ({
        id: row.id,
        title: row.child_page?.title ?? 'Untitled',
        url: pageUrl(row.id),
        lastEdited: row.last_edited_time ?? '',
      }))

    const drafts = (await queryAll(CONTENT_QUEUE, [{ timestamp: 'last_edited_time', direction: 'descending' }]))
      .map(draftFrom)

    const prospects = (await queryAll(PROSPECTS, [{ property: 'Score', direction: 'descending' }]))
      .map(prospectFrom)

    const body = { asOf: new Date().toISOString(), people, newsletters, drafts, prospects }
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

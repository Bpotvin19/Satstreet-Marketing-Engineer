/* Satstreet Resource Centre — live Notion reader. */
const NOTION = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const ROOT = cleanId(process.env.NOTION_RESOURCES_PAGE?.trim() || '3c0e562f-a5bd-81d8-b8c5-cc4d048593fc');
const HUB = cleanId(process.env.NOTION_KNOWLEDGE_HUB_PAGE?.trim() || '3bbe562f-a5bd-80f2-93c6-ddfe1462cd20');
const CACHE = 'public, max-age=30, stale-while-revalidate=120';

function cleanId(v: string) {
  const r = v.replace(/-/g, '');
  return /^[0-9a-f]{32}$/i.test(r)
    ? `${r.slice(0,8)}-${r.slice(8,12)}-${r.slice(12,16)}-${r.slice(16,20)}-${r.slice(20)}`
    : v;
}

function json(data: unknown, status = 200, cache = CACHE) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': cache,
    },
  });
}

async function notion(path: string, init: RequestInit = {}) {
  const token = process.env.NOTION_TOKEN?.trim();
  if (!token) throw new Error('NOTION_TOKEN is not set in the Netlify environment');
  const r = await fetch(NOTION + path, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(9000),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body?.message || `Notion ${r.status}`);
  return body;
}

const plain = (a: any[] | undefined) =>
  (a || []).map(x => x?.plain_text ?? x?.text?.content ?? '').join('').trim();

const rich = (a: any[] | undefined) =>
  (a || []).map(x => ({
    text: String(x?.plain_text ?? x?.text?.content ?? ''),
    href: x?.href || x?.text?.link?.url || null,
    bold: !!x?.annotations?.bold,
    italic: !!x?.annotations?.italic,
    underline: !!x?.annotations?.underline,
    strikethrough: !!x?.annotations?.strikethrough,
    code: !!x?.annotations?.code,
  })).filter(x => x.text);

function pageTitle(p: any) {
  for (const v of Object.values(p?.properties || {})) {
    if ((v as any)?.type === 'title') return plain((v as any).title);
  }
  return '';
}

function iconOf(i: any) {
  if (!i) return null;
  if (i.type === 'emoji') return i.emoji || null;
  if (i.type === 'external') return i.external?.url || null;
  if (i.type === 'file') return i.file?.url || null;
  return null;
}

function pageSummary(p: any) {
  return {
    id: cleanId(p.id),
    title: pageTitle(p) || 'Untitled',
    url: p.url || '',
    edited: p.last_edited_time || null,
    icon: iconOf(p.icon),
  };
}

async function fetchPage(id: string) {
  return notion(`/pages/${cleanId(id)}`);
}

async function blockChildren(id: string) {
  const out: any[] = [];
  let cursor = '';
  do {
    const qs = new URLSearchParams({ page_size: '100' });
    if (cursor) qs.set('start_cursor', cursor);
    const r = await notion(`/blocks/${cleanId(id)}/children?${qs}`);
    out.push(...(r.results || []));
    cursor = r.has_more ? String(r.next_cursor || '') : '';
  } while (cursor);
  return out;
}

async function normalizeBlock(b: any, depth: number): Promise<any> {
  const type = b.type;
  const p = b[type] || {};
  const base: any = { id: cleanId(b.id), type };

  if (['paragraph','heading_1','heading_2','heading_3','quote','bulleted_list_item','numbered_list_item','toggle','to_do'].includes(type)) {
    base.rich = rich(p.rich_text); base.text = plain(p.rich_text);
    if (type === 'to_do') base.checked = !!p.checked;
  } else if (type === 'callout') {
    base.rich = rich(p.rich_text); base.text = plain(p.rich_text); base.icon = iconOf(p.icon); base.color = p.color || '';
  } else if (type === 'code') {
    base.rich = rich(p.rich_text); base.text = plain(p.rich_text); base.language = p.language || '';
  } else if (type === 'child_page') {
    base.pageId = cleanId(b.id); base.title = p.title || 'Untitled';
  } else if (type === 'bookmark' || type === 'embed') {
    base.url = p.url || ''; base.text = p.caption ? plain(p.caption) : '';
  } else if (['image','video','file','pdf'].includes(type)) {
    base.url = p.type === 'external' ? p.external?.url || '' : p.file?.url || ''; base.text = plain(p.caption);
  } else if (type === 'link_preview') {
    base.url = p.url || '';
  } else if (type === 'link_to_page' && p.type === 'page_id') {
    base.pageId = cleanId(p.page_id);
    try { const q = await fetchPage(base.pageId); base.title = pageTitle(q) || 'Linked page'; }
    catch { base.title = 'Linked page'; }
  } else if (type === 'table_row') {
    base.cells = (p.cells || []).map((c: any[]) => rich(c));
  } else if (!['divider','column','column_list','table','synced_block','breadcrumb'].includes(type) && !b.has_children) {
    return null;
  }

  if (b.has_children && type !== 'child_page' && depth < 6) {
    const kids = await blockChildren(b.id);
    base.children = (await Promise.all(kids.map((x: any) => normalizeBlock(x, depth + 1)))).filter(Boolean);
  }
  return base;
}

async function readPage(id: string) {
  const page = await fetchPage(id);
  const kids = await blockChildren(id);
  return {
    page: pageSummary(page),
    blocks: (await Promise.all(kids.map((x: any) => normalizeBlock(x, 0)))).filter(Boolean),
  };
}

function parentPageId(p: any) {
  const q = p.parent;
  return q?.type === 'page_id' ? cleanId(q.page_id) : null;
}

/* Resources and Knowledge Hub are both trusted entry points. This matters
 * because Notion integrations can expose a shared child page without exposing
 * every ancestor in a way the API can traverse. Descendants of either entry
 * point remain allowed; unrelated workspace pages remain blocked. */
async function isAllowed(id: string) {
  let c = cleanId(id);
  if (c === ROOT || c === HUB) return true;
  const seen = new Set<string>();
  for (let i = 0; i < 20; i++) {
    if (c === ROOT || c === HUB) return true;
    if (seen.has(c)) return false;
    seen.add(c);
    let p: any;
    try { p = await fetchPage(c); } catch { return false; }
    const parent = parentPageId(p);
    if (!parent) return false;
    c = parent;
  }
  return false;
}

async function searchPages(query: string) {
  const res = await notion('/search', {
    method: 'POST',
    body: JSON.stringify({
      query,
      filter: { property: 'object', value: 'page' },
      sort: { direction: 'descending', timestamp: 'last_edited_time' },
      page_size: 30,
    }),
  });
  const matches: any[] = [];
  for (const p of res.results || []) {
    if (matches.length >= 12) break;
    if (await isAllowed(p.id)) matches.push(pageSummary(p));
  }
  return matches;
}

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const requestedPage = url.searchParams.get('page')?.trim();
  const q = url.searchParams.get('search')?.trim();
  try {
    if (q) {
      if (q.length < 2) return json({ results: [], query: q, mode: 'page-title' });
      return json({ results: await searchPages(q.slice(0,120)), query: q, mode: 'page-title', root: ROOT, hub: HUB });
    }
    const id = cleanId(requestedPage || ROOT);
    if (!(await isAllowed(id))) return json({ error: 'That page is outside the Satstreet Resources workspace.' }, 403, 'no-store');
    return json({ ...(await readPage(id)), root: ROOT, hub: HUB, source: 'Notion' });
  } catch (e) {
    const m = e instanceof Error ? e.message : 'Unable to load Notion resources.';
    return json({
      error: m,
      hint: m.includes('NOTION_TOKEN')
        ? 'Set NOTION_TOKEN in Netlify.'
        : 'Make sure the Resources or Knowledge Hub page is shared with the Notion integration used by this Netlify site.',
    }, 500, 'no-store');
  }
}

export const config = { path: '/api/resources' };

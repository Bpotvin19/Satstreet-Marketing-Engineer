/* Company logos for the treasury leaderboard.

   The leaderboard table carries no images, but each company's profile page on
   the source site does, under /entity_page_logos/. This resolves a slug to
   that URL so the page can show a real mark instead of two initials.

   Coverage is partial — plenty of companies have no logo on the source — so
   the caller keeps its initials fallback and this returns only what it finds.
   A miss is cached too, otherwise every load re-fetches the same misses.

   No desk key: the leaderboard and these profile pages are public, the same
   reasoning as the news image proxy.
*/

const SOURCE = 'https://bitcointreasuries.net/public-companies/'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36'

/* The logo tag sits around 30 KB into a ~230 KB page, so ask for the head of
   the document rather than pulling the whole thing twenty times. */
const HEAD_BYTES = 131_072
const LOGO = /https:\/\/assets-prod\.bitcointreasuries\.net\/entity_page_logos\/[A-Za-z0-9_-]+\.(?:webp|png|jpe?g|svg)/i

/* Logos effectively never change. */
const HOLD_MS = 12 * 60 * 60 * 1000
const MAX_SLUGS = 30
const BATCH = 6

type Hit = { at: number; url: string }
const cache = new Map<string, Hit>()

const valid = (slug: string): boolean => /^[a-z0-9][a-z0-9-]{0,79}$/i.test(slug)

function remember(slug: string, url: string): string {
  cache.set(slug, { at: Date.now(), url })
  return url
}

async function resolve(slug: string): Promise<string> {
  const hit = cache.get(slug)
  if (hit && Date.now() - hit.at < HOLD_MS) return hit.url

  try {
    const response = await fetch(SOURCE + encodeURIComponent(slug), {
      headers: {
        'user-agent': UA,
        accept: 'text/html,application/xhtml+xml',
        range: `bytes=0-${HEAD_BYTES - 1}`,
      },
      signal: AbortSignal.timeout(7000),
    })
    /* 206 when the range was honoured, 200 when the server ignored it. */
    if (response.status !== 200 && response.status !== 206) return remember(slug, '')
    const html = (await response.text()).slice(0, HEAD_BYTES)
    const found = html.match(LOGO)
    return remember(slug, found ? found[0] : '')
  } catch {
    return remember(slug, '')
  }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  }

  const raw = new URL(request.url).searchParams.get('slugs') ?? ''
  const slugs = [...new Set(raw.split(',').map((s) => s.trim()).filter(valid))].slice(0, MAX_SLUGS)

  const logos: Record<string, string> = {}
  for (let i = 0; i < slugs.length; i += BATCH) {
    const group = slugs.slice(i, i + BATCH)
    const found = await Promise.all(group.map(resolve))
    group.forEach((slug, index) => {
      if (found[index]) logos[slug] = found[index]
    })
  }

  return new Response(JSON.stringify({ logos }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      /* Public data and slow to gather, so let the CDN hold it. */
      'cache-control': 'public, max-age=1800, stale-while-revalidate=86400',
      'x-content-type-options': 'nosniff',
    },
  })
}

export const config = { path: '/api/treasury-logos' }

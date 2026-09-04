/* Must-read share-image lookup.

   Separate from /api/news so the briefing can render first. The browser sends
   the article URLs already on the page; this function only reads the public
   og:image / twitter:image tag. The photo is not stored.
*/

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36'

function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  let difference = 0
  for (let i = 0; i < a.length; i += 1) difference |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return difference === 0
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, max-age=120',
      'x-content-type-options': 'nosniff',
    },
  })
}

function isPublicHttp(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    const host = u.hostname.toLowerCase()
    if (host === 'localhost' || host.endsWith('.local')) return false
    if (/^(127\. |10\. |192\.168\. |169\.254\. |0\.)/.test(host)) return false
    return true
  } catch {
    return false
  }
}

function absUrl(value: string, base: string): string {
  try {
    return new URL(value.replace(/&amp;/g, '&').trim(), base).toString()
  } catch {
    return ''
  }
}

function pickShareImage(html: string, base: string): string {
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)/i,
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (!match?.[1]) continue
    const url = absUrl(match[1], base)
    if (isPublicHttp(url) && !url.startsWith('data:')) return url
  }
  return ''
}

async function shareImageFor(url: string): Promise<string> {
  if (!isPublicHttp(url)) return ''
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: AbortSignal.timeout(4500),
    })
    if (!response.ok) return ''
    const type = response.headers.get('content-type') || ''
    if (type && !/html/i.test(type)) return ''
    const html = await response.text()
    return pickShareImage(html.slice(0, 220_000), url)
  } catch {
    return ''
  }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const expected = process.env.TERMINAL_NEWS_KEY?.trim() ?? ''
  if (!expected) return json({ error: 'The protected news feed is not configured.' }, 503)
  const supplied = request.headers.get('x-terminal-key')?.trim() ?? ''
  if (!sameSecret(supplied, expected)) return json({ error: 'Access key required.' }, 401)

  let urls: string[] = []
  try {
    const body = await request.json()
    urls = Array.isArray(body?.urls) ? body.urls : []
  } catch {
    return json({ error: 'Expected JSON { urls: string[] }.' }, 400)
  }

  const unique = [...new Set(urls.map((u) => String(u || '').trim()).filter(isPublicHttp))].slice(0, 7)
  const thumbs: Record<string, string> = {}
  await Promise.all(
    unique.map(async (url) => {
      const image = await shareImageFor(url)
      if (image) thumbs[url] = image
    }),
  )
  return json({ thumbs })
}

export const config = { path: '/api/news-thumbs' }

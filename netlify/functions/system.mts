/* "How Satstreet OS works", behind the same key as the Macro Desk feed.

   This view describes how the firm runs internally, so it gets the same
   protection as the brief rather than a hidden tab. Keeping the markup in
   public/news.html would have served it to everyone with View Source, and
   news.html is the site's landing page.
*/

import { SYSTEM_HTML } from './_system-content.js'

function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  let difference = 0
  for (let i = 0; i < a.length; i += 1) difference |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return difference === 0
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)

  const expected = process.env.TERMINAL_NEWS_KEY?.trim() ?? ''
  if (!expected) return json({ error: 'The protected view is not configured.' }, 503)

  const supplied = request.headers.get('x-terminal-key')?.trim() ?? ''
  if (!sameSecret(supplied, expected)) return json({ error: 'Access key required.' }, 401)

  return new Response(SYSTEM_HTML, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

export const config = { path: '/api/system' }

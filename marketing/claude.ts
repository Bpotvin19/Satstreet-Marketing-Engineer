/* ──────────────────────────────────────────────────────────────────────────
   Structured model call.

   Generic on purpose — Phase 1 adds /draft, /x, /linkedin and /rewrite, and
   each is the same call with a different schema. pipeline/claude.ts does the
   same thing for the client brief and should collapse into this once both
   systems are past their first release.
   ────────────────────────────────────────────────────────────────────────── */

import Anthropic from '@anthropic-ai/sdk'

export class RefusalError extends Error {
  category: string | null

  constructor(category: string | null, explanation?: string) {
    super(`Model declined the request${category ? ` (${category})` : ''}${explanation ? `: ${explanation}` : ''}`)
    this.name = 'RefusalError'
    this.category = category
  }
}

export const MODEL = process.env.CLAUDE_MODEL?.trim() || 'claude-opus-5'
export const EFFORT = (process.env.CLAUDE_EFFORT?.trim() || 'high') as
  | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export async function structured<T>(
  system: string,
  user: string,
  schema: unknown,
  maxTokens = 16_000,
): Promise<T> {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  // Unset is fine: the SDK falls back to an `ant auth login` profile.
  const client = new Anthropic(key ? { apiKey: key } : {})

  const params = {
    model: MODEL,
    max_tokens: maxTokens,
    // The system block is the job description plus the context pack — stable
    // between runs, so it caches and every morning after the first is cheaper.
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
    output_config: { effort: EFFORT, format: { type: 'json_schema', schema } },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  }

  // SDK typings lag the fallbacks parameter; the wire shape is current.
  const stream = client.beta.messages.stream(
    params as unknown as Parameters<typeof client.beta.messages.stream>[0],
  )
  const message = await stream.finalMessage()

  if (message.stop_reason === 'refusal') {
    const d = (message as { stop_details?: { category?: string; explanation?: string } | null })
      .stop_details
    throw new RefusalError(d?.category ?? null, d?.explanation)
  }
  if (message.stop_reason === 'max_tokens') {
    throw new Error('Response truncated at max_tokens — raise the budget or lower effort.')
  }

  const text = message.content
    .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('')

  if (!text.trim()) throw new Error('Model returned no text content.')

  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`Output was not valid JSON despite the schema constraint:\n${text.slice(0, 500)}`)
  }
}

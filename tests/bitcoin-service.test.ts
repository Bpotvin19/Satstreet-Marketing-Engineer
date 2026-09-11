import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import handler from '../netlify/functions/bitcoin.mts'
import {
  classifySearch,
  getNetworkOverview,
  isBitcoinAddress,
  isBlockHeight,
  isHash,
  search,
} from '../netlify/lib/bitcoin-service.mts'

const originalFetch = globalThis.fetch
const originalProvider = process.env.BITCOIN_ESPLORA_BASE_URL

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalProvider === undefined) delete process.env.BITCOIN_ESPLORA_BASE_URL
  else process.env.BITCOIN_ESPLORA_BASE_URL = originalProvider
})

test('classifies supported search input and rejects malformed values', () => {
  const hash = 'a'.repeat(64)
  assert.equal(isBlockHeight('0'), true)
  assert.equal(isBlockHeight('912480'), true)
  assert.equal(isBlockHeight('-1'), false)
  assert.equal(isHash(hash), true)
  assert.equal(isHash('g'.repeat(64)), false)
  assert.equal(isBitcoinAddress('1BoatSLRHtKNngkdXEeobR76b53LETtpyT'), true)
  assert.equal(isBitcoinAddress('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy'), true)
  assert.equal(isBitcoinAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080'), true)
  assert.equal(classifySearch('912480'), 'height')
  assert.equal(classifySearch(hash), 'hash')
  assert.equal(classifySearch('not a bitcoin identifier'), null)
})

test('normalizes network overview and keeps provider selection server-side', async () => {
  process.env.BITCOIN_ESPLORA_BASE_URL = 'https://bitcoin.example.test/api/'
  const requested: string[] = []
  globalThis.fetch = async (input) => {
    const url = String(input)
    requested.push(url)
    if (url.endsWith('/blocks/tip/height')) return new Response('912480')
    if (url.endsWith('/blocks/tip/hash')) return new Response('b'.repeat(64))
    if (url.endsWith('/block/' + 'b'.repeat(64))) {
      return Response.json({ id: 'b'.repeat(64), height: 912480, timestamp: 1_700_000_000 })
    }
    if (url.endsWith('/mempool')) return Response.json({ count: 1234, vsize: 456789 })
    if (url.endsWith('/fee-estimates')) return Response.json({ 3: 4.25 })
    return new Response('not found', { status: 404 })
  }

  const overview = await getNetworkOverview()
  assert.equal(overview.height, 912480)
  assert.deepEqual(overview.mempool, { transactionCount: 1234, virtualSize: 456789 })
  assert.equal(overview.recommendedFee, 4.25)
  assert.equal(requested.every((url) => url.startsWith('https://bitcoin.example.test/api/')), true)
})

test('API rejects invalid transaction IDs before contacting the provider', async () => {
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return new Response('unexpected')
  }
  const response = await handler(new Request('https://terminal.test/api/bitcoin/tx/not-a-txid'))
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: 'Invalid transaction ID.' })
  assert.equal(calls, 0)
})

test('API exposes short-lived cache headers for network data', async () => {
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.endsWith('/blocks/tip/height')) return new Response('912480')
    if (url.endsWith('/blocks/tip/hash')) return new Response('c'.repeat(64))
    if (url.endsWith('/block/' + 'c'.repeat(64))) {
      return Response.json({ id: 'c'.repeat(64), height: 912480, timestamp: 1_700_000_000 })
    }
    if (url.endsWith('/mempool')) return Response.json({ count: 10, vsize: 20 })
    if (url.endsWith('/fee-estimates')) return Response.json({ 3: 2 })
    return new Response('not found', { status: 404 })
  }
  const response = await handler(new Request('https://terminal.test/api/bitcoin/network'))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'public, max-age=15, stale-while-revalidate=45')
})

test('API is read-only', async () => {
  const response = await handler(new Request('https://terminal.test/api/bitcoin/network', { method: 'POST' }))
  assert.equal(response.status, 405)
  assert.deepEqual(await response.json(), { error: 'Use GET.' })
})

test('64-character block hashes are not mistaken for unconfirmed transactions', async () => {
  const hash = 'd'.repeat(64)
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.endsWith('/tx/' + hash)) return new Response('Transaction not found', { status: 404 })
    if (url.endsWith('/block/' + hash)) return Response.json({ id: hash, height: 912480 })
    return new Response('not found', { status: 404 })
  }
  assert.deepEqual(await search(hash), { type: 'block', id: hash })
})

test('upstream failures return a clean temporary-unavailable response', async () => {
  globalThis.fetch = async () => { throw new Error('private provider detail') }
  const response = await handler(new Request('https://terminal.test/api/bitcoin/network'))
  assert.equal(response.status, 502)
  assert.deepEqual(await response.json(), { error: 'Bitcoin network data temporarily unavailable.' })
})

test('malformed encoded paths fail cleanly', async () => {
  const response = await handler(new Request('https://terminal.test/api/bitcoin/address/%E0%A4%A'))
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: 'Invalid Bitcoin endpoint.' })
})

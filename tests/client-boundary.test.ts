import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const primaryPages = [
  'public/overview.html',
  'public/news.html',
  'public/ticker.html',
  'public/explorer.html',
  'public/treasuries.html',
  'public/resources.html',
]
const forbiddenClientText = [
  'Email drafts',
  'Prospects',
  'How Satstreet OS works',
  'Protected Notion feed',
  'team access key',
  'Internal desk material',
  'team-workspace.js',
  '/api/workspace',
  '/api/system',
  '/api/prospect-owner',
]

test('shared client navigation is the six approved destinations', () => {
  const shell = read('public/assets/terminal.js')
  const navBlock = shell.match(/var NAV = \[([\s\S]*?)\n  \];/)?.[1] ?? ''
  const labels = [...navBlock.matchAll(/\['([^']+)'/g)].map((match) => match[1])
  const routes = [...navBlock.matchAll(/'([^']+\.html)'/g)].map((match) => match[1])

  assert.deepEqual(labels, ['Overview', 'News', 'Charts', 'Explorer', 'Treasuries', 'Resources'])
  assert.deepEqual(routes, ['./overview.html', './news.html', './ticker.html', './explorer.html', './treasuries.html', './resources.html'])
})

test('primary client pages do not expose internal workspace language or services', () => {
  for (const path of primaryPages) {
    const page = read(path)
    for (const text of forbiddenClientText) {
      assert.equal(page.includes(text), false, `${path} exposed ${text}`)
    }
  }
})

test('News uses only the reviewed client-note endpoint', () => {
  const page = read('public/news.html')
  const script = read('public/assets/client-news.js')
  assert.match(page, /Morning Brief/)
  assert.match(script, /fetch\('\/api\/desknote'/)
  assert.doesNotMatch(script, /x-terminal-key|localStorage|sessionStorage|\/api\/news/)
})

test('internal workspace source is preserved outside the publish directory', () => {
  assert.match(read('internal/news.html'), /How Satstreet OS works/)
  assert.match(read('internal/assets/team-workspace.js'), /\/api\/workspace/)
  assert.equal(read('netlify.toml').includes('publish = "public"'), true)
})

test('root route starts clients on Overview', () => {
  const config = read('netlify.toml')
  assert.match(config, /from = "\/"\s+to = "\/overview\.html"\s+status = 200/)
})

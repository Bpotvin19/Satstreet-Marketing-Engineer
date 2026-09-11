/* Bitcoin data provider boundary for the Satstreet Explorer.

   The UI only consumes the normalized methods below. The default upstream is
   Blockstream's public Esplora API, but BITCOIN_ESPLORA_BASE_URL can point to a
   Satstreet-controlled Esplora deployment later without changing the browser.

   This module handles public blockchain data only. It does not log search
   values, associate addresses with people, or make claims about independent
   verification. */

const DEFAULT_PROVIDER_URL = 'https://blockstream.info/api'
const REQUEST_TIMEOUT_MS = 7_000
const PAGE_SIZE = 25

export type SearchKind = 'block' | 'transaction' | 'address'

export class BitcoinServiceError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message)
  }
}

function providerBaseUrl(): string {
  return (process.env.BITCOIN_ESPLORA_BASE_URL?.trim() || DEFAULT_PROVIDER_URL).replace(/\/+$/, '')
}

async function providerRequest(path: string): Promise<Response> {
  let response: Response
  try {
    response = await fetch(providerBaseUrl() + path, {
      headers: { accept: 'application/json,text/plain' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    throw new BitcoinServiceError('Bitcoin network data temporarily unavailable.')
  }

  if (response.status === 404) throw new BitcoinServiceError('Not found.', 404)
  if (!response.ok) throw new BitcoinServiceError('Bitcoin network data temporarily unavailable.')
  return response
}

async function providerJson<T>(path: string): Promise<T> {
  const response = await providerRequest(path)
  try {
    return await response.json() as T
  } catch {
    throw new BitcoinServiceError('Bitcoin data provider returned an invalid response.')
  }
}

async function providerText(path: string): Promise<string> {
  const response = await providerRequest(path)
  return (await response.text()).trim()
}

export function isBlockHeight(value: string): boolean {
  return /^(0|[1-9]\d{0,8})$/.test(value) && Number(value) <= 999_999_999
}

export function isHash(value: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(value)
}

export function isBitcoinAddress(value: string): boolean {
  const base58 = /^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/
  const bech32 = /^bc1[ac-hj-np-z02-9]{11,87}$/i
  return base58.test(value) || bech32.test(value)
}

export function classifySearch(value: string): 'height' | 'hash' | 'address' | null {
  const query = value.trim()
  if (isBlockHeight(query)) return 'height'
  if (isHash(query)) return 'hash'
  if (isBitcoinAddress(query)) return 'address'
  return null
}

function safeOffset(value: string | null): number {
  if (!value || !/^\d+$/.test(value)) return 0
  return Math.min(Number(value), 100_000)
}

async function blockHash(id: string): Promise<string> {
  if (isHash(id)) return id.toLowerCase()
  if (!isBlockHeight(id)) throw new BitcoinServiceError('Invalid block identifier.', 400)
  const hash = await providerText(`/block-height/${encodeURIComponent(id)}`)
  if (!isHash(hash)) throw new BitcoinServiceError('Bitcoin data provider returned an invalid block hash.')
  return hash
}

type EsploraBlock = {
  id: string
  height: number
  version: number
  timestamp: number
  tx_count: number
  size: number
  weight: number
  merkle_root: string
  previousblockhash?: string
  mediantime?: number
  nonce?: number
  bits?: number
  difficulty?: number
}

type EsploraStatus = {
  confirmed: boolean
  block_height?: number
  block_hash?: string
  block_time?: number
}

type EsploraTx = {
  txid: string
  version: number
  locktime: number
  size: number
  weight: number
  fee: number
  vin: Array<{
    txid?: string
    vout?: number
    is_coinbase?: boolean
    prevout?: { scriptpubkey_address?: string; value?: number } | null
  }>
  vout: Array<{
    scriptpubkey_address?: string
    scriptpubkey_type?: string
    value: number
  }>
  status: EsploraStatus
}

export async function getNetworkOverview(): Promise<Record<string, unknown>> {
  const heightText = await providerText('/blocks/tip/height')
  const height = Number(heightText)
  if (!Number.isInteger(height) || height < 0) {
    throw new BitcoinServiceError('Bitcoin data provider returned an invalid block height.')
  }

  const [tipResult, mempoolResult, feesResult] = await Promise.allSettled([
    providerText('/blocks/tip/hash').then((hash) => providerJson<EsploraBlock>(`/block/${encodeURIComponent(hash)}`)),
    providerJson<{ count?: number; vsize?: number; total_fee?: number }>('/mempool'),
    providerJson<Record<string, number>>('/fee-estimates'),
  ])

  const tip = tipResult.status === 'fulfilled' ? tipResult.value : null
  const mempool = mempoolResult.status === 'fulfilled' ? mempoolResult.value : null
  const estimates = feesResult.status === 'fulfilled' ? feesResult.value : null
  const recommendedFee = estimates
    ? Number(estimates['3'] ?? estimates['2'] ?? estimates['1'])
    : NaN

  return {
    asOf: new Date().toISOString(),
    source: 'Esplora-compatible Bitcoin data provider',
    height,
    latestBlock: tip ? { hash: tip.id, timestamp: tip.timestamp } : null,
    mempool: mempool ? {
      transactionCount: Number.isFinite(Number(mempool.count)) ? Number(mempool.count) : null,
      virtualSize: Number.isFinite(Number(mempool.vsize)) ? Number(mempool.vsize) : null,
    } : null,
    recommendedFee: Number.isFinite(recommendedFee) ? recommendedFee : null,
  }
}

export async function getLatestBlocks(): Promise<Record<string, unknown>> {
  const blocks = await providerJson<EsploraBlock[]>('/blocks')
  return {
    asOf: new Date().toISOString(),
    source: 'Esplora-compatible Bitcoin data provider',
    blocks: blocks.slice(0, 10).map((block) => ({ ...block, totalFees: null })),
  }
}

export async function getBlock(id: string, offsetValue: string | null): Promise<Record<string, unknown>> {
  const hash = await blockHash(id)
  const offset = safeOffset(offsetValue)
  const [block, tipText, transactions] = await Promise.all([
    providerJson<EsploraBlock>(`/block/${encodeURIComponent(hash)}`),
    providerText('/blocks/tip/height'),
    providerJson<EsploraTx[]>(`/block/${encodeURIComponent(hash)}/txs/${offset}`),
  ])
  const tipHeight = Number(tipText)
  let nextBlockHash: string | null = null
  if (Number.isInteger(tipHeight) && block.height < tipHeight) {
    try {
      nextBlockHash = await blockHash(String(block.height + 1))
    } catch {
      nextBlockHash = null
    }
  }

  return {
    asOf: new Date().toISOString(),
    source: 'Esplora-compatible Bitcoin data provider',
    block: {
      ...block,
      status: Number.isInteger(tipHeight) && block.height <= tipHeight ? 'Confirmed' : 'Unknown',
      confirmations: Number.isInteger(tipHeight) ? Math.max(0, tipHeight - block.height + 1) : null,
      nextBlockHash,
      totalFees: null,
    },
    transactions,
    pagination: {
      offset,
      pageSize: PAGE_SIZE,
      hasPrevious: offset > 0,
      hasNext: offset + transactions.length < block.tx_count,
    },
  }
}

export async function getTransaction(txid: string): Promise<Record<string, unknown>> {
  if (!isHash(txid)) throw new BitcoinServiceError('Invalid transaction ID.', 400)
  const [transaction, tipText] = await Promise.all([
    providerJson<EsploraTx>(`/tx/${encodeURIComponent(txid.toLowerCase())}`),
    providerText('/blocks/tip/height').catch(() => ''),
  ])
  let outspends: Array<{ spent?: boolean; txid?: string; vin?: number }> = []
  try {
    outspends = await providerJson(`/tx/${encodeURIComponent(txid.toLowerCase())}/outspends`)
  } catch {
    outspends = []
  }
  const tipHeight = Number(tipText)
  const blockHeight = Number(transaction.status?.block_height)
  const confirmations = transaction.status?.confirmed && Number.isInteger(tipHeight) && Number.isInteger(blockHeight)
    ? Math.max(0, tipHeight - blockHeight + 1)
    : 0

  return {
    asOf: new Date().toISOString(),
    source: 'Esplora-compatible Bitcoin data provider',
    transaction,
    outspends,
    confirmations,
  }
}

export async function getAddress(address: string): Promise<Record<string, unknown>> {
  if (!isBitcoinAddress(address)) throw new BitcoinServiceError('Invalid Bitcoin address.', 400)
  type AddressStats = {
    address: string
    chain_stats: { funded_txo_sum: number; spent_txo_sum: number; tx_count: number }
    mempool_stats: { funded_txo_sum: number; spent_txo_sum: number; tx_count: number }
  }
  const encoded = encodeURIComponent(address)
  const [summary, transactions, tipText] = await Promise.all([
    providerJson<AddressStats>(`/address/${encoded}`),
    providerJson<EsploraTx[]>(`/address/${encoded}/txs`),
    providerText('/blocks/tip/height').catch(() => ''),
  ])
  const chain = summary.chain_stats
  const mempool = summary.mempool_stats
  const tipHeight = Number(tipText)

  return {
    asOf: new Date().toISOString(),
    source: 'Esplora-compatible Bitcoin data provider',
    address: summary.address,
    confirmedBalance: chain.funded_txo_sum - chain.spent_txo_sum,
    unconfirmedBalance: mempool.funded_txo_sum - mempool.spent_txo_sum,
    totalReceived: chain.funded_txo_sum,
    totalSent: chain.spent_txo_sum,
    transactionCount: chain.tx_count + mempool.tx_count,
    transactions: transactions.map((transaction) => {
      const received = transaction.vout.reduce((sum, output) =>
        sum + (output.scriptpubkey_address === address ? Number(output.value) || 0 : 0), 0)
      const sent = transaction.vin.reduce((sum, input) =>
        sum + (input.prevout?.scriptpubkey_address === address ? Number(input.prevout.value) || 0 : 0), 0)
      const blockHeight = Number(transaction.status?.block_height)
      return {
        txid: transaction.txid,
        status: transaction.status,
        amountChange: received - sent,
        confirmations: transaction.status?.confirmed && Number.isInteger(tipHeight) && Number.isInteger(blockHeight)
          ? Math.max(0, tipHeight - blockHeight + 1)
          : 0,
      }
    }),
  }
}

export async function search(value: string): Promise<{ type: SearchKind; id: string }> {
  const query = value.trim()
  const kind = classifySearch(query)
  if (!kind) throw new BitcoinServiceError('Enter a valid block height, hash, transaction ID or Bitcoin address.', 400)
  if (kind === 'height') {
    const hash = await blockHash(query)
    return { type: 'block', id: hash }
  }
  if (kind === 'address') {
    await providerJson(`/address/${encodeURIComponent(query)}`)
    return { type: 'address', id: query }
  }

  const hash = query.toLowerCase()
  try {
    // Esplora's /tx/:txid/status route may return { confirmed: false } for an
    // unknown hash. Resolve the inherent 64-hex ambiguity against the full
    // transaction resource so a block hash is not misclassified as a pending
    // transaction.
    await providerJson(`/tx/${encodeURIComponent(hash)}`)
    return { type: 'transaction', id: hash }
  } catch (error) {
    if (!(error instanceof BitcoinServiceError) || error.status !== 404) throw error
  }
  await providerJson(`/block/${encodeURIComponent(hash)}`)
  return { type: 'block', id: hash }
}

export const bitcoinProvider = {
  name: 'Esplora-compatible Bitcoin data provider',
  defaultBaseUrl: DEFAULT_PROVIDER_URL,
  pageSize: PAGE_SIZE,
}

import { LIFI_QUOTE_ENDPOINT, WORLD_CHAIN_ID, WORLDCHAIN_USDC } from '@/lib/constants'

export type LifiQuoteTransactionRequest = {
  to: string
  data: string
  value?: string
  gasLimit?: string
  gasPrice?: string
}

export type LifiQuoteResponse = {
  id?: string
  type?: string
  tool?: string
  toolDetails?: unknown
  action?: unknown
  estimate?: unknown
  transactionRequest: LifiQuoteTransactionRequest
  message?: string
  code?: number
}

export async function fetchLifiQuote(params: {
  fromAmount: string
  fromAddress: string
  toAddress?: string
  toChainId: number
  toToken: string
}): Promise<LifiQuoteResponse> {
  const url = new URL(LIFI_QUOTE_ENDPOINT)
  url.searchParams.set('fromChain', String(WORLD_CHAIN_ID))
  url.searchParams.set('toChain', String(params.toChainId))
  url.searchParams.set('fromToken', WORLDCHAIN_USDC)
  url.searchParams.set('toToken', params.toToken)
  url.searchParams.set('fromAmount', params.fromAmount)
  url.searchParams.set('fromAddress', params.fromAddress)
  if (params.toAddress) {
    url.searchParams.set('toAddress', params.toAddress)
  }

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    // In route handlers we don't want stale caching for quotes.
    cache: 'no-store',
  })

  const text = await res.text()
  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`LI.FI returned a non-JSON response (status ${res.status})`)
  }

  if (!res.ok) {
    const msg =
      typeof json?.message === 'string'
        ? json.message
        : `Failed to fetch LI.FI quote (status ${res.status})`
    throw new Error(msg)
  }

  if (!json?.transactionRequest?.to || !json?.transactionRequest?.data) {
    throw new Error('LI.FI quote did not include transactionRequest.to/data')
  }

  return json as LifiQuoteResponse
}



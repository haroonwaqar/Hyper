import { NextResponse } from 'next/server'
import { fetchLifiQuote } from '@/lib/lifi'
import { parseUsdcToBaseUnits } from '@/lib/usdc'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type QuoteRequestBody = {
  amountUsdc: string
  fromAddress: string
  toAddress: string
}

function isLikelyEvmAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr)
}

export async function POST(req: Request) {
  let body: QuoteRequestBody
  try {
    body = (await req.json()) as QuoteRequestBody
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 })
  }

  const amountUsdc = body?.amountUsdc?.trim?.() ?? ''
  const fromAddress = body?.fromAddress?.trim?.() ?? ''
  const toAddress = body?.toAddress?.trim?.() ?? ''

  if (!amountUsdc) {
    return NextResponse.json({ message: 'amountUsdc is required' }, { status: 400 })
  }
  if (!fromAddress || !isLikelyEvmAddress(fromAddress)) {
    return NextResponse.json({ message: 'fromAddress must be a valid 0x address' }, { status: 400 })
  }
  if (!toAddress || !isLikelyEvmAddress(toAddress)) {
    return NextResponse.json({ message: 'toAddress must be a valid 0x address' }, { status: 400 })
  }

  let fromAmount: string
  try {
    fromAmount = parseUsdcToBaseUnits(amountUsdc)
  } catch (e: any) {
    return NextResponse.json({ message: e?.message ?? 'Invalid amount' }, { status: 400 })
  }

  try {
    // Destination is fixed to Arbitrum native USDC (see lib/lifi.ts).
    const quote = await fetchLifiQuote({ fromAmount, fromAddress, toAddress })
    return NextResponse.json(quote, { status: 200 })
  } catch (e: any) {
    // Examples: "Insufficient Liquidity", "Route not found", etc.
    return NextResponse.json({ message: e?.message ?? 'Failed to fetch quote' }, { status: 502 })
  }
}



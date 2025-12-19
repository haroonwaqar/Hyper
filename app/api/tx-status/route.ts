import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Proxies World Developer API transaction status lookup.
 *
 * World App's sendTransaction returns an internal `transaction_id` (not a hash).
 * We can query status via:
 *   GET https://developer.worldcoin.org/api/v2/minikit/transaction/{transaction_id}?app_id=...&type=transaction
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const transactionId = searchParams.get('transactionId')?.trim() ?? ''

  if (!transactionId) {
    return NextResponse.json({ message: 'transactionId is required' }, { status: 400 })
  }

  const appId = process.env.APP_ID ?? process.env.NEXT_PUBLIC_WLD_APP_ID
  if (!appId) {
    return NextResponse.json(
      { message: 'Missing APP_ID (or NEXT_PUBLIC_WLD_APP_ID) on server to query transaction status.' },
      { status: 500 }
    )
  }

  const url = `https://developer.worldcoin.org/api/v2/minikit/transaction/${encodeURIComponent(
    transactionId
  )}?app_id=${encodeURIComponent(appId)}&type=transaction`

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })

  const text = await res.text()
  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    return NextResponse.json({ message: 'Non-JSON response from World API' }, { status: 502 })
  }

  if (!res.ok) {
    return NextResponse.json({ message: json?.message ?? 'Failed to fetch transaction status', details: json }, { status: 502 })
  }

  return NextResponse.json(json, { status: 200 })
}

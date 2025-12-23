'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { MiniKit, ResponseEvent, type MiniAppSendTransactionPayload } from '@worldcoin/minikit-js'
import { encodeFunctionData, formatUnits, parseAbi } from 'viem'
import { useRouter } from 'next/navigation'
import {
  ARBITRUM_CHAIN_ID,
  ARBITRUM_USDC,
  LIFI_DIAMOND_CONTRACT,
  WORLD_CHAIN_ID,
  WORLDCHAIN_USDC,
  HYPEREVM_CHAIN_ID
} from '@/lib/constants'
import { getFunctionSelector, parseUsdcToBaseUnits } from '@/lib/usdc'

type Quote = {
  transactionRequest: {
    to: string
    data: string
    value?: string
    gasLimit?: string
  }
  estimate?: any
  tool?: string
}

const WORLDCHAIN_PUBLIC_RPC = 'https://worldchain-mainnet.g.alchemy.com/public'
const MIN_USDC_BASE_UNITS = 6_000_000n
const DESTINATION_STORAGE_KEY = 'hyperworld.destinationAddress'
const FROM_ADDRESS_STORAGE_KEY = 'hyperworld.fromAddress'
const AUTH_KEY = 'hyperworld.authedAddress'

const ERC20_BALANCE_OF_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

const LIFI_PERMIT2_PROXY_ABI = parseAbi([
  'function callDiamondWithPermit2(bytes transactionData, ((address token, uint256 amount) permitted, uint256 nonce, uint256 deadline) permit, bytes signature) external',
  'function callDiamondWithPermit2Witness(bytes transactionData, address accountAddress, ((address token, uint256 amount) permitted, uint256 nonce, uint256 deadline) permit, bytes signature) external payable',
])

function UsdcIcon({ className }: { className?: string }) {
  // Simple USDC-like mark (circle + "S" + arcs). No external asset fetch.
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="#38BDF8" />
      <circle cx="16" cy="16" r="15" fill="none" stroke="rgba(255,255,255,0.35)" />
      {/* side arcs */}
      <path
        d="M10.2 9.2a10 10 0 0 0 0 13.6"
        fill="none"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.9"
      />
      <path
        d="M21.8 9.2a10 10 0 0 1 0 13.6"
        fill="none"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.9"
      />
      {/* center S */}
      <path
        d="M18.9 11.6c-0.7-0.5-1.6-0.8-2.9-0.8-1.9 0-3.2 0.9-3.2 2.3 0 1.4 1.3 2 3.3 2.4 2.4 0.4 3.7 1.4 3.7 3.2 0 2.1-1.9 3.3-4.5 3.3-1.6 0-3.2-0.4-4.3-1.2"
        fill="none"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function shortAddr(addr: string) {
  if (!addr.startsWith('0x') || addr.length < 10) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function isLikelyEvmAddress(addr: string): addr is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(addr)
}

function trimTrailingZeros(input: string): string {
  if (!input.includes('.')) return input
  return input.replace(/(\.\d*?[1-9])0+$/g, '$1').replace(/\.0+$/g, '')
}

function randomUint256String(): string {
  // A random uint256 nonce as a decimal string (fits Permit2 nonce requirements).
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let hex = '0x'
  for (const b of bytes) hex += b.toString(16).padStart(2, '0')
  return BigInt(hex).toString(10)
}

function normalizeTxStatus(raw: any): string {
  const v =
    raw?.transactionStatus ??
    raw?.transaction_status ??
    raw?.transactionStatus?.status ??
    raw?.status ??
    raw?.transaction_status?.status ??
    ''
  return String(v).toLowerCase()
}

function statusLabel(status: string | undefined): { label: string; tone: 'info' | 'success' | 'danger' } {
  const s = (status ?? '').toLowerCase()
  if (['success', 'completed', 'confirmed', 'mined', 'finalized'].includes(s)) return { label: 'Done', tone: 'success' }
  if (['failed', 'error', 'reverted'].includes(s)) return { label: 'Failed', tone: 'danger' }
  if (['pending', 'submitted', 'processing'].includes(s)) return { label: 'Pending', tone: 'info' }
  return { label: status ?? 'Pending', tone: 'info' }
}

function deriveTransferStep(opts: {
  txId: string | null
  txStatus: any | null
  txStatusLoading: boolean
  txStatusError: string | null
}): { step: 'started' | 'pending' | 'done' | 'failed'; message: string; statusText?: string } {
  if (!opts.txId) return { step: 'started', message: '' }

  // Immediately after submission, before first poll result.
  if (!opts.txStatus && opts.txStatusLoading) return { step: 'started', message: 'Started' }
  if (!opts.txStatus && !opts.txStatusLoading) return { step: 'started', message: 'Started' }

  if (opts.txStatusError) {
    return { step: 'pending', message: 'Pending', statusText: opts.txStatusError }
  }

  const raw = normalizeTxStatus(opts.txStatus)
  const { label } = statusLabel(raw)

  if (label === 'Done') return { step: 'done', message: 'Done', statusText: raw || 'done' }
  if (label === 'Failed') return { step: 'failed', message: 'Failed', statusText: raw || 'failed' }
  return { step: 'pending', message: 'Pending', statusText: raw || 'pending' }
}

export default function Page() {
  const router = useRouter()
  const [miniKitStatus, setMiniKitStatus] = useState<'checking' | 'not_installed' | 'installed'>('checking')
  const didInitRef = useRef(false)

  const [fromAddress, setFromAddress] = useState('')
  const [destinationAddress, setDestinationAddress] = useState('')
  const [authStatus, setAuthStatus] = useState<'idle' | 'authing' | 'authed' | 'failed'>('idle')
  const [authError, setAuthError] = useState<string | null>(null)

  const [amountUsdc, setAmountUsdc] = useState('6')

  const [balanceLoading, setBalanceLoading] = useState(false)
  const [balanceBaseUnits, setBalanceBaseUnits] = useState<bigint | null>(null)
  const [balanceError, setBalanceError] = useState<string | null>(null)

  const [lifiPermit2Proxy, setLifiPermit2Proxy] = useState<`0x${string}` | null>(null)
  const [lifiPermit2ProxyError, setLifiPermit2ProxyError] = useState<string | null>(null)

  const [quote, setQuote] = useState<Quote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [sendLoading, setSendLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txId, setTxId] = useState<string | null>(null)
  const [txStatus, setTxStatus] = useState<any | null>(null)
  const [txStatusLoading, setTxStatusLoading] = useState(false)
  const [txStatusError, setTxStatusError] = useState<string | null>(null)

  // selector used to be shown in Advanced; kept for internal debugging via devtools if needed.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const selector = useMemo(() => getFunctionSelector(quote?.transactionRequest?.data), [quote?.transactionRequest?.data])

  const [uiStep, setUiStep] = useState<'wallet' | 'bridge'>('wallet')

  useEffect(() => {
    // Next dev Strict Mode runs effects twice; guard to avoid duplicate init/auth calls + "already_installed" noise.
    if (didInitRef.current) return
    didInitRef.current = true

    // World App injects the wallet automatically. We do NOT show a "Connect Wallet" button.
    // Instead, we:
    // 1) Install MiniKit (lightweight init)
    // 2) Attempt walletAuth once to learn the user's EVM address (optional UX; they can still paste it)
    // Install first, then check availability. In some environments `isInstalled()` may be false
    // until after `install()` has run.
    MiniKit.install(process.env.NEXT_PUBLIC_WLD_APP_ID ?? undefined)

    const installedNow = MiniKit.isInstalled()
    setMiniKitStatus(installedNow ? 'installed' : 'not_installed')
    if (!installedNow) return

    ;(async () => {
      setAuthStatus('authing')
      setAuthError(null)
      try {
        const { finalPayload } = await MiniKit.commandsAsync.walletAuth({
          nonce: crypto.randomUUID(),
          statement: 'Authenticate to bridge USDC from World Chain to Hyperliquid (via LI.FI).',
          requestId: 'bridge-usdc-worldchain-to-hyperevm',
        })

        if (finalPayload.status === 'success') {
          setFromAddress(finalPayload.address)
          try {
            sessionStorage.setItem(FROM_ADDRESS_STORAGE_KEY, finalPayload.address)
            sessionStorage.setItem(AUTH_KEY, finalPayload.address)
          } catch {
            // ignore
          }
          // Do NOT auto-fill destination address; user should paste Hyperliquid deposit address explicitly.
          setAuthStatus('authed')
          return
        }

        setAuthStatus('failed')
        setAuthError(finalPayload.details ?? finalPayload.error_code ?? 'Wallet auth failed')
      } catch (e: any) {
        setAuthStatus('failed')
        setAuthError(e?.message ?? 'Wallet auth failed')
      }
    })()
  }, [])

  // Restore auth + destination from sessionStorage (also used for /destination gating).
  useEffect(() => {
    try {
      const storedFrom = sessionStorage.getItem(FROM_ADDRESS_STORAGE_KEY) ?? sessionStorage.getItem(AUTH_KEY)
      if (storedFrom && !fromAddress) {
        setFromAddress(storedFrom)
        setAuthStatus('authed')
      }
      const storedDest = sessionStorage.getItem(DESTINATION_STORAGE_KEY)
      if (storedDest && !destinationAddress) setDestinationAddress(storedDest)
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Restore destination from sessionStorage (set on /destination screen).
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(DESTINATION_STORAGE_KEY)
      if (stored && stored !== destinationAddress) setDestinationAddress(stored)
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // If user returns from /destination with ?step=bridge, go to bridge step automatically.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('step') === 'bridge') {
      setUiStep('bridge')
      // Clean the URL (no query param) to keep it tidy.
      router.replace('/')
    }
  }, [router])

  async function onSignIn() {
    if (miniKitStatus !== 'installed') {
      setAuthStatus('failed')
      setAuthError('Open this mini-app inside World App to sign in.')
      return
    }
    setAuthStatus('authing')
    setAuthError(null)
    try {
      const { finalPayload } = await MiniKit.commandsAsync.walletAuth({
        nonce: crypto.randomUUID(),
        statement: 'Authenticate to bridge USDC from World Chain to Hyperliquid (via LI.FI).',
        requestId: 'bridge-usdc-worldchain-to-arbitrum-usdc',
      })
      if (finalPayload.status === 'success') {
        setFromAddress(finalPayload.address)
        try {
          sessionStorage.setItem(FROM_ADDRESS_STORAGE_KEY, finalPayload.address)
          sessionStorage.setItem(AUTH_KEY, finalPayload.address)
        } catch {
          // ignore
        }
        setAuthStatus('authed')
        return
      }
      setAuthStatus('failed')
      setAuthError(finalPayload.details ?? finalPayload.error_code ?? 'Wallet auth failed')
    } catch (e: any) {
      setAuthStatus('failed')
      setAuthError(e?.message ?? 'Wallet auth failed')
    }
  }

  // Fetch World Chain USDC balance via eth_call(balanceOf)
  useEffect(() => {
    let cancelled = false

    async function run() {
      setBalanceError(null)
      setBalanceBaseUnits(null)

      if (!isLikelyEvmAddress(fromAddress)) return

      setBalanceLoading(true)
      try {
        const data = encodeFunctionData({
          abi: ERC20_BALANCE_OF_ABI,
          functionName: 'balanceOf',
          args: [fromAddress],
        })

        const res = await fetch(WORLDCHAIN_PUBLIC_RPC, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_call',
            params: [{ to: WORLDCHAIN_USDC, data }, 'latest'],
          }),
        })

        const json = await res.json()
        if (!res.ok || json?.error) {
          const msg = json?.error?.message ?? `Balance RPC error (status ${res.status})`
          throw new Error(msg)
        }

        const hex = json?.result as string
        if (typeof hex !== 'string' || !hex.startsWith('0x')) {
          throw new Error('Invalid RPC response for balance')
        }

        const bal = BigInt(hex)
        if (!cancelled) setBalanceBaseUnits(bal)
      } catch (e: any) {
        if (!cancelled) setBalanceError(e?.message ?? 'Failed to fetch balance')
      } finally {
        if (!cancelled) setBalanceLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [fromAddress])

  // Fetch LI.FI chain metadata so we can use Permit2Proxy (single confirmation, approvals not needed).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLifiPermit2ProxyError(null)
        const res = await fetch('https://li.quest/v1/chains', { method: 'GET', headers: { Accept: 'application/json' } })
        const json = await res.json()
        const chain = json?.chains?.find((c: any) => c?.id === WORLD_CHAIN_ID)
        const proxy = chain?.permit2Proxy
        if (proxy && isLikelyEvmAddress(proxy)) {
          if (!cancelled) setLifiPermit2Proxy(proxy)
          return
        }
        throw new Error('LI.FI did not return permit2Proxy for World Chain')
      } catch (e: any) {
        if (!cancelled) setLifiPermit2ProxyError(e?.message ?? 'Failed to load LI.FI chain metadata')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const balanceUsdc = useMemo(() => {
    if (balanceBaseUnits == null) return null
    return trimTrailingZeros(formatUnits(balanceBaseUnits, 6))
  }, [balanceBaseUnits])

  const amountBaseUnits = useMemo(() => {
    try {
      return BigInt(parseUsdcToBaseUnits(amountUsdc))
    } catch {
      return null
    }
  }, [amountUsdc])

  const amountParseError = useMemo(() => {
    try {
      parseUsdcToBaseUnits(amountUsdc)
      return null
    } catch (e: any) {
      return e?.message ?? 'Invalid amount'
    }
  }, [amountUsdc])

  const insufficientBalance = useMemo(() => {
    if (balanceBaseUnits == null) return false
    if (amountBaseUnits == null) return false
    return amountBaseUnits > balanceBaseUnits
  }, [amountBaseUnits, balanceBaseUnits])

  const belowMinimum = useMemo(() => {
    if (amountBaseUnits == null) return false
    return amountBaseUnits < MIN_USDC_BASE_UNITS
  }, [amountBaseUnits])

  async function fetchQuote() {
    setError(null)
    setTxId(null)
    setQuote(null)

    if (!isLikelyEvmAddress(fromAddress)) {
      setError('Wallet address not available yet. Open this mini-app inside World App and try again.')
      return null
    }
    if (!isLikelyEvmAddress(destinationAddress)) {
      setError('Paste your Hyperliquid deposit address (0x...)')
      return null
    }
    if (amountParseError) {
      setError(amountParseError)
      return null
    }
    if (belowMinimum) {
      setError('Minimum amount is 6 USDC')
      return null
    }
    if (insufficientBalance) {
      setError('Insufficient Balance')
      return null
    }

    setQuoteLoading(true)
    try {
      const res = await fetch('/api/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountUsdc, fromAddress, toAddress: destinationAddress }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json?.message ?? 'Failed to fetch quote')
      }
      setQuote(json as Quote)
      return json as Quote
    } catch (e: any) {
      setError(e?.message ?? 'Failed to fetch quote')
      return null
    } finally {
      setQuoteLoading(false)
    }
  }

  async function sendTxAndWait(payload: any, timeoutMs = 45_000): Promise<MiniAppSendTransactionPayload> {
    // IMPORTANT: `commandsAsync.sendTransaction()` can hang forever if `commands.sendTransaction()` returns null.
    // We avoid that by calling `commands.sendTransaction()` ourselves and wiring a timeout.
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        MiniKit.unsubscribe(ResponseEvent.MiniAppSendTransaction)
        reject(
          new Error(
            'Timed out waiting for World App. If no transaction sheet appeared, ensure your World App supports sendTransaction and that the contract entrypoints are allowlisted.'
          )
        )
      }, timeoutMs)

      MiniKit.subscribe(ResponseEvent.MiniAppSendTransaction, (finalPayload) => {
        clearTimeout(timer)
        MiniKit.unsubscribe(ResponseEvent.MiniAppSendTransaction)
        resolve(finalPayload as MiniAppSendTransactionPayload)
      })

      const commandPayload = MiniKit.commands.sendTransaction(payload as any)
      if (!commandPayload) {
        clearTimeout(timer)
        MiniKit.unsubscribe(ResponseEvent.MiniAppSendTransaction)
        reject(
          new Error(
            "sendTransaction is unavailable in this World App session (no confirmation sheet can open). Update World App and ensure your Mini-App has sendTransaction enabled and the contract entrypoints are allowlisted."
          )
        )
      }
    })
  }

  async function onBridge() {
    setError(null)
    setTxId(null)

    if (miniKitStatus !== 'installed') {
      setError('MiniKit is not installed. Open this mini-app inside World App.')
      return
    }

    const q = await fetchQuote()
    if (!q) return

    const txReq = q.transactionRequest
    if (!txReq?.to || !txReq?.data) {
      setError('Quote response is missing transactionRequest.to/data')
      return
    }

    setSendLoading(true)
    try {
      /**
       * WORLDCOIN DEVELOPER PORTAL WHITELISTING (CRITICAL)
       *
       * - Contract Address to whitelist:
       *   `0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE` (LI.FI Diamond / Router)
       *
       * - Function Signatures to whitelist:
       *   LI.FI returns *dynamic calldata* depending on the chosen bridge/tool.
       *   After fetching a quote, take the first 4 bytes of `transactionRequest.data`
       *   (the "function selector") and whitelist that selector/signature in the portal.
       *
       *   This UI surfaces the selector for you (see "Function selector" below).
       *
       * IMPORTANT:
       * - The transaction MUST be sent to the `to` address returned by LI.FI (`txReq.to`),
       *   which is typically the LI.FI Diamond (router) address above.
       */

      // MiniKit's public TS types focus on ABI-based contract calls, but the underlying
      // command payload is forwarded to World App. For bridging we pass the raw tx fields
      // from LI.FI (`to` + calldata `data` + optional `value`).
      /**
       * IMPORTANT (World App):
       * Approvals are not supported. To spend ERC-20s, you must use Permit2.
       * We therefore wrap the LI.FI Diamond calldata into LI.FI's Permit2Proxy call.
       */

      const amount = amountBaseUnits ?? 0n
      if (amount <= 0n) throw new Error('Invalid amount')

      if (!lifiPermit2Proxy) {
        throw new Error(
          `Permit2 proxy not available. ${lifiPermit2ProxyError ?? 'Ensure LI.FI supports Permit2 on World Chain.'}`
        )
      }

      // Permit2 must be enabled for this token in the Worldcoin Developer Portal under:
      // Configuration → Advanced → Permit2 Tokens
      // Add: 0x79A02482A880bCE3F13e09Da970dC34db4CD24d1
      const nonce = randomUint256String()
      // Keep deadline short during testing (<= 1 hour); 20 minutes is a good default.
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60).toString(10)

      const bridgeViaPermit2ProxyPayload = {
        transaction: [
          {
            address: lifiPermit2Proxy,
            abi: LIFI_PERMIT2_PROXY_ABI,
            functionName: 'callDiamondWithPermit2',
            args: [
              txReq.data,
              [[WORLDCHAIN_USDC, amount], nonce, deadline],
              'PERMIT2_SIGNATURE_PLACEHOLDER_0',
            ],
            value: txReq.value ?? '0x0',
          },
        ],
        permit2: [
          {
            permitted: {
              token: WORLDCHAIN_USDC,
              amount: amount.toString(10),
            },
            spender: lifiPermit2Proxy,
            nonce,
            deadline,
          },
        ],
      }

      const bridgeResult = await sendTxAndWait(bridgeViaPermit2ProxyPayload)
      if (bridgeResult.status === 'success') {
        setTxId(bridgeResult.transaction_id)
        setTxStatus(null)
        setTxStatusError(null)
        return
      }
      if (bridgeResult.error_code === 'invalid_contract') {
        throw new Error(
          `invalid_contract: You must add the Permit2Proxy contract to Developer Portal → Contract Entrypoints.\n\nPermit2Proxy (World Chain): ${lifiPermit2Proxy ?? '(loading...)'}`
        )
      }
      throw new Error(bridgeResult.details?.message ?? bridgeResult.error_code ?? 'Transaction failed')
    } catch (e: any) {
      setError(e?.message ?? 'Transaction failed')
    } finally {
      setSendLoading(false)
    }
  }

  // Poll status of the World App relayed transaction.
  useEffect(() => {
    if (!txId) return
    const id = txId
    let cancelled = false
    let timer: any
    let attempts = 0
    let consecutiveErrors = 0

    async function poll() {
      attempts += 1
      setTxStatusLoading(true)
      setTxStatusError(null)
      try {
        const res = await fetch(`/api/tx-status?transactionId=${encodeURIComponent(id)}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.message ?? 'Failed to fetch tx status')
        if (!cancelled) setTxStatus(json)

        consecutiveErrors = 0

        const status = normalizeTxStatus(json)
        // Stop polling on terminal state.
        if (['failed', 'error', 'reverted', 'success', 'completed', 'confirmed', 'mined', 'finalized'].includes(status)) return
      } catch (e: any) {
        consecutiveErrors += 1
        const msg = e?.message ?? 'Failed to fetch tx status'
        if (!cancelled) setTxStatusError(msg)

        // Stop polling if server isn't configured (prevents infinite loop).
        if (msg.toLowerCase().includes('missing app_id')) return
        // Stop after a few consecutive errors.
        if (consecutiveErrors >= 3) return
      } finally {
        if (!cancelled) setTxStatusLoading(false)
      }

      // Safety stop: ~2.5s * 60 = 150s
      if (attempts >= 60) {
        if (!cancelled) setTxStatusError('Still pending. You can close this and check later.')
        return
      }
      timer = setTimeout(poll, 2500)
    }

    poll()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [txId])

  return (
    <main className="min-h-dvh">
      <div className="mx-auto flex max-w-lg flex-col px-5 pb-10 pt-10">
        <header className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-black">Bridge to Hyperliquid</h1>
          <p className="mt-2 text-sm text-slate-600">Send USDC from World Chain to your Hyperliquid deposit address.</p>
        </header>

        <div className="mt-8 space-y-4">
          {uiStep === 'wallet' ? (
            <div className="card overflow-hidden bg-white">
              
              <div className="flex items-center justify-between gap-3 p-[15px]">
                <div className="text-sm font-semibold text-slate-900">Sign in</div>
                <div
                  className={[
                    'pill',
                    miniKitStatus === 'installed' ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-600',
                  ].join(' ')}
                >
                  {miniKitStatus === 'checking'
                    ? 'Checking…'
                    : miniKitStatus === 'installed'
                      ? 'World App'
                      : 'Unsupported'}
                </div>
              </div>

              {/* FIX 3: Wrapper for the Sign In area */}
              <div className=''>
                {authStatus === 'authed' ? (
                  <div className=""></div>
                ) : authStatus === 'authing' ? (
                  <div className="pl-[15px] pb-5 text-sm text-slate-600">Waiting for World App…</div>
                ) : (
                  /* FIX 4: Full width button (w-full) */
                  <button
                    type="button"
                    className="btn-primary w-full py-3.5"
                    disabled={miniKitStatus !== 'installed'}
                    onClick={onSignIn}
                  >
                    Sign in with World App
                  </button>
                )}

                {authStatus === 'failed' && authError ? <div className="px-5 pb-2 text-xs text-red-600">{authError}</div> : null}
              </div>

              <div className="p-[15px]"> 
                <div className="">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-900">Balance</div>
                    <div className="text-xs text-slate-500">USDC · World Chain</div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 overflow-hidden rounded-full">
                        <UsdcIcon className="h-10 w-10" />
                      </div>
                      <div>
                        <div className="text-base font-semibold text-slate-900">Dollars</div>
                        <div className="text-xs text-slate-500">USDC</div>
                      </div>
                    </div>
                    <div className="text-lg font-semibold text-slate-900">
                      {balanceLoading ? '—' : balanceError ? '—' : balanceUsdc != null ? balanceUsdc : '—'}
                    </div>
                  </div>
                  {balanceError ? <div className="mt-2 text-xs text-red-600">{balanceError}</div> : null}
                </div>
              </div>

              <button
                type="button"
                className="btn-primary w-full py-3.5"
                disabled={authStatus !== 'authed'}
                onClick={() => {
                  setError(null)
                  setTxId(null)
                  setQuote(null)
                  router.push('/destination')
                }}
              >
                Add destination address
              </button>

              {/* FIX 7: Footer text with padding */}
              <div className="bg-slate-50 p-[8px] text-center text-xs text-slate-500">
                Add your Hyperliquid deposit address
              </div>
            </div>
          ) : null}

          {uiStep === 'bridge' ? (
            <div className="card p-[10px]">
              <div className="pb-[3px] flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">Destination</div>
                <button
                  type="button"
                  className="btn-paste text-sm"
                  onClick={() => router.push('/destination')}
                >
                  Edit
                </button>
              </div>
              
              <div className="w-full border border-black/10 bg-[#F6FBFF] px-3 py-3 font-mono text-xs text-slate-900 truncate">
                {destinationAddress}
              </div>

              <div className="pt-[20px] pb-[3px] flex items-end justify-between gap-3">
                <label className="block text-sm font-semibold text-slate-900">Amount</label>
                <div className="text-xs text-slate-500">
                  {balanceLoading ? (
                    'Fetching balance…'
                  ) : balanceError ? (
                    <span className="text-red-600">{balanceError}</span>
                  ) : balanceUsdc != null ? (
                    <span>
                      Available: <span className="font-mono">{balanceUsdc}</span>
                    </span>
                  ) : (
                    '—'
                  )}
                </div>
              </div>

              <div className="w-full flex items-center gap-2 bg-white p-1.5 py-2.5 transition focus-within:border-sky-400 focus-within:ring-4 focus-within:ring-sky-200">
                <input
                  className="flex-1 bg-transparent pl-4 font-mono text-base text-slate-900 outline-none placeholder:text-slate-400"
                  value={amountUsdc}
                  onChange={(e) => setAmountUsdc(e.target.value)}
                  placeholder="6.00"
                  inputMode="decimal"
                />
                <button
                  type="button"
                  className="btn-paste text-sm"
                  disabled={balanceBaseUnits == null || balanceLoading}
                  onClick={() => {
                    if (balanceBaseUnits == null) return
                    setAmountUsdc(trimTrailingZeros(formatUnits(balanceBaseUnits, 6)))
                  }}
                >
                  Max
                </button>
              </div>

              <div className="pt-[20px] pb-[3px] text-xs text-slate-500">Minimum: 6 USDC</div>

              {amountParseError ? <div className="pb-[3px] text-sm text-red-600">{amountParseError}</div> : null}
              {belowMinimum ? <div className="pb-[3px] text-sm text-red-600">Minimum amount is 6 USDC</div> : null}
              {insufficientBalance ? <div className="pb-[3px] text-sm text-red-600">Insufficient Balance</div> : null}

              <button
                className="btn-primary mt-5 w-full py-3.5"
                disabled={quoteLoading || sendLoading || !!amountParseError || insufficientBalance || belowMinimum}
                onClick={onBridge}
              >
                {sendLoading ? 'Confirm in World App…' : quoteLoading ? 'Fetching route…' : 'Bridge'}
              </button>

              {error ? <div className="pt-[3px] whitespace-pre-line text-sm text-red-600">{error}</div> : null}
              {txId ? (
                <div className="card-muted pt-[5px] p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-900">Transfer status</div>
                    <div className="text-xs text-slate-500 font-mono">{txId.slice(0, 10)}…</div>
                  </div>
                  {(() => {
                    const t = deriveTransferStep({ txId, txStatus, txStatusLoading, txStatusError })
                    const badge =
                      t.step === 'done'
                        ? 'bg-emerald-50 text-emerald-700'
                        : t.step === 'failed'
                          ? 'bg-red-50 text-red-700'
                          : 'bg-sky-50 text-sky-700'
                    return (
                      <div className="pt-[3px]">
                        <div className="flex items-center justify-between">
                          <div className={['inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold', badge].join(' ')}>
                            {t.message}
                          </div>
                          <div className="text-xs text-slate-500">{txStatusLoading ? 'Updating…' : ''}</div>
                        </div>
                        {t.statusText ? <div className="mt-2 text-sm text-slate-600">Status: {t.statusText}</div> : null}
                        {txStatus?.transactionHash ? (
                          <div className="pt-[2px] text-xs text-slate-500">
                            Hash: <span className="font-mono break-all">{txStatus.transactionHash}</span>
                            <div className="pt-[2px]">
                              <a
                                className="pill bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                                href={`https://worldscan.org/tx/${txStatus.transactionHash}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                View transaction
                              </a>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )
                  })()}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  )
}



'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { MiniKit, ResponseEvent, type MiniAppSendTransactionPayload, type MiniKitInstallReturnType } from '@worldcoin/minikit-js'
import { decodeFunctionData, encodeFunctionData, formatUnits, parseAbi } from 'viem'
import {
  ARBITRUM_CHAIN_ID,
  ARBITRUM_USDC,
  HYPEREVM_CHAIN_ID,
  HYPEREVM_USDC,
  LIFI_DIAMOND_CONTRACT,
  WORLD_CHAIN_ID,
  WORLDCHAIN_USDC,
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

export default function Page() {
  const [miniKitStatus, setMiniKitStatus] = useState<'checking' | 'not_installed' | 'installed'>('checking')
  const [installResult, setInstallResult] = useState<MiniKitInstallReturnType | null>(null)
  const didInitRef = useRef(false)

  const [fromAddress, setFromAddress] = useState('')
  const [destinationAddress, setDestinationAddress] = useState('')
  const [destinationTouched, setDestinationTouched] = useState(false)
  const [destinationChain, setDestinationChain] = useState<'arbitrum' | 'hyperevm'>('arbitrum')
  const [authStatus, setAuthStatus] = useState<'idle' | 'authing' | 'authed' | 'failed'>('idle')
  const [authError, setAuthError] = useState<string | null>(null)

  const [amountUsdc, setAmountUsdc] = useState('1')

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

  const selector = useMemo(() => getFunctionSelector(quote?.transactionRequest?.data), [quote?.transactionRequest?.data])

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
    const res = MiniKit.install(process.env.NEXT_PUBLIC_WLD_APP_ID ?? undefined)
    // Don't surface "already_installed" as an error in the UI.
    if (!res.success && res.errorCode !== 'already_installed') {
      setInstallResult(res)
    } else {
      setInstallResult(null)
    }

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
          // Default destination to the same address (HyperEVM addresses are typically the same).
          setDestinationAddress(finalPayload.address)
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

  // Keep destination auto-filled with fromAddress until the user edits it.
  useEffect(() => {
    if (!destinationTouched && isLikelyEvmAddress(fromAddress)) {
      setDestinationAddress(fromAddress)
    }
  }, [fromAddress, destinationTouched])

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

  async function fetchQuote() {
    setError(null)
    setTxId(null)
    setQuote(null)

    if (!isLikelyEvmAddress(fromAddress)) {
      setError('Missing fromAddress (wallet address). If walletAuth failed, paste your 0x address.')
      return null
    }
    if (!isLikelyEvmAddress(destinationAddress)) {
      setError('Missing destination address (Hyperliquid). Please enter a valid 0x address.')
      return null
    }
    if (amountParseError) {
      setError(amountParseError)
      return null
    }
    if (insufficientBalance) {
      setError('Insufficient Balance')
      return null
    }

    setQuoteLoading(true)
    try {
      const toChainId = destinationChain === 'arbitrum' ? ARBITRUM_CHAIN_ID : HYPEREVM_CHAIN_ID
      const toToken = destinationChain === 'arbitrum' ? ARBITRUM_USDC : HYPEREVM_USDC
      const res = await fetch('/api/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountUsdc, fromAddress, toAddress: destinationAddress, toChainId, toToken }),
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

  async function rpcEthCall(to: `0x${string}`, data: `0x${string}`): Promise<`0x${string}`> {
    const res = await fetch(WORLDCHAIN_PUBLIC_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [{ to, data }, 'latest'],
      }),
    })
    const json = await res.json()
    if (!res.ok || json?.error) {
      const msg = json?.error?.message ?? `RPC eth_call error (status ${res.status})`
      throw new Error(msg)
    }
    const hex = json?.result as string
    if (typeof hex !== 'string' || !hex.startsWith('0x')) throw new Error('Invalid RPC response')
    return hex as `0x${string}`
  }

  async function lookupFunctionSignature(selector: string): Promise<string> {
    // OpenChain signature DB is the most reliable public endpoint for 4-byte selector lookups.
    // Example: https://api.openchain.xyz/signature-database/v1/lookup?function=0x1794958f
    const res = await fetch(`https://api.openchain.xyz/signature-database/v1/lookup?function=${selector}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    const json = await res.json()
    const entries = json?.result?.function?.[selector]
    const sig = Array.isArray(entries) && entries[0]?.name ? (entries[0].name as string) : null
    if (!sig) throw new Error(`Unknown function selector ${selector}. Cannot build ABI for World App.`)
    return sig
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

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5 py-10">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Bridge USDC to Hyperliquid</h1>
            <p className="mt-1 text-sm text-zinc-300">
              Source: World Chain ({WORLD_CHAIN_ID}) → Destination:{' '}
              {destinationChain === 'arbitrum' ? `Arbitrum (${ARBITRUM_CHAIN_ID})` : `HyperEVM (${HYPEREVM_CHAIN_ID})`}
            </p>
          </div>
          <div className="text-right text-xs text-zinc-400">
            <div>Router</div>
            <div className="font-mono">{shortAddr(LIFI_DIAMOND_CONTRACT)}</div>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium">Wallet</div>
              <div className="text-xs text-zinc-400">
                {miniKitStatus === 'checking'
                  ? 'Checking…'
                  : miniKitStatus === 'installed'
                    ? 'World App detected'
                    : 'Not in World App'}
              </div>
            </div>

            <div className="mt-2 text-xs text-zinc-400">
              {installResult?.success === false ? (
                <span>
                  MiniKit install error: <span className="font-mono">{installResult.errorCode}</span>
                </span>
              ) : null}
              {authStatus === 'authing' ? <span>Authenticating…</span> : null}
              {authStatus === 'failed' && authError ? <span className="text-red-300">{authError}</span> : null}
            </div>

            <label className="mt-3 block text-xs text-zinc-400">From address (World Chain)</label>
            <input
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 outline-none ring-0 focus:border-zinc-600"
              placeholder="0x…"
              value={fromAddress}
              onChange={(e) => setFromAddress(e.target.value.trim())}
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />

            <label className="mt-3 block text-xs text-zinc-400">Destination Address (Hyperliquid)</label>
            <input
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 outline-none ring-0 focus:border-zinc-600"
              placeholder="0x…"
              value={destinationAddress}
              onChange={(e) => {
                setDestinationTouched(true)
                setDestinationAddress(e.target.value.trim())
              }}
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />

            <div className="mt-2 text-xs text-zinc-500">
              Tokens: <span className="font-mono">{WORLDCHAIN_USDC}</span> →{' '}
              <span className="font-mono">{destinationChain === 'arbitrum' ? ARBITRUM_USDC : HYPEREVM_USDC}</span>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium">Deposit Chain</div>
              <select
                className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
                value={destinationChain}
                onChange={(e) => setDestinationChain(e.target.value as any)}
              >
                <option value="arbitrum">Arbitrum (recommended for Hyperliquid USDC deposits)</option>
                <option value="hyperevm">HyperEVM (experimental)</option>
              </select>
            </div>
            {destinationChain !== 'arbitrum' ? (
              <div className="mt-2 text-xs text-amber-300">
                Hyperliquid’s deposit UI warns that this address only credits <span className="font-semibold">native USDC from Arbitrum</span>.
                If your deposit doesn’t show up, switch back to Arbitrum.
              </div>
            ) : (
              <div className="mt-2 text-xs text-zinc-400">
                Hyperliquid USDC deposit addresses typically require <span className="font-semibold">native USDC on Arbitrum</span>.
              </div>
            )}
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
            <div className="flex items-end justify-between gap-3">
              <label className="block text-sm font-medium">Amount (USDC)</label>
              <div className="text-xs text-zinc-400">
                {balanceLoading ? (
                  'Fetching balance…'
                ) : balanceError ? (
                  <span className="text-red-300">{balanceError}</span>
                ) : balanceUsdc != null ? (
                  <span>
                    Available: <span className="font-mono">{balanceUsdc}</span> USDC
                  </span>
                ) : (
                  '—'
                )}
              </div>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <input
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-base text-zinc-100 outline-none ring-0 focus:border-zinc-600"
                value={amountUsdc}
                onChange={(e) => setAmountUsdc(e.target.value)}
                placeholder="1.00"
                inputMode="decimal"
              />
              <button
                type="button"
                className="shrink-0 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-semibold text-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={balanceBaseUnits == null || balanceLoading}
                onClick={() => {
                  if (balanceBaseUnits == null) return
                  setAmountUsdc(trimTrailingZeros(formatUnits(balanceBaseUnits, 6)))
                }}
              >
                Max
              </button>
            </div>

            {amountParseError ? <div className="mt-2 text-sm text-red-300">{amountParseError}</div> : null}
            {insufficientBalance ? <div className="mt-2 text-sm text-red-300">Insufficient Balance</div> : null}

            <button
              className="mt-4 w-full rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={quoteLoading || sendLoading || !!amountParseError || insufficientBalance}
              onClick={onBridge}
            >
              {sendLoading ? 'Opening World App…' : quoteLoading ? 'Fetching quote…' : 'Bridge to Hyperliquid'}
            </button>

            {error ? <div className="mt-3 text-sm text-red-300">{error}</div> : null}
            {txId ? (
              <div className="mt-3 rounded-lg border border-emerald-900/50 bg-emerald-950/30 p-3 text-sm text-emerald-200">
                Submitted: <span className="font-mono">{txId}</span>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
            <div className="text-sm font-medium">Whitelisting (Worldcoin Developer Portal)</div>
            <ul className="mt-2 space-y-2 text-sm text-zinc-300">
              <li>
                <span className="text-zinc-400">Contract address:</span>{' '}
                <span className="font-mono">{LIFI_DIAMOND_CONTRACT}</span>
              </li>
              <li>
                <span className="text-zinc-400">Permit2Proxy (Contract Entrypoints):</span>{' '}
                <span className="font-mono">{lifiPermit2Proxy ?? '(loading...)'}</span>
              </li>
              <li>
                <span className="text-zinc-400">Permit2 Tokens (Configuration → Advanced):</span>{' '}
                <span className="font-mono">{WORLDCHAIN_USDC}</span>
              </li>
              <li className="text-xs text-zinc-500">
                Destination chain in this app is{' '}
                <span className="font-semibold">{destinationChain === 'arbitrum' ? 'Arbitrum native USDC' : 'HyperEVM USDC'}</span>.
              </li>
              <li>
                <span className="text-zinc-400">Function selector (from LI.FI calldata):</span>{' '}
                <span className="font-mono">{selector ?? 'Fetch a quote to see it'}</span>
              </li>
              <li className="text-xs text-zinc-500">
                Note: World App <span className="font-semibold">does not support ERC-20 approval transactions</span>.
                This bridge call must succeed without a separate approve step.
              </li>
              <li className="text-xs text-zinc-500">
                LI.FI routes can change (tool/bridge/fees), so selectors may differ over time. Always whitelist the
                selector(s) your quotes return.
              </li>
            </ul>

            {quote ? (
              <div className="mt-4 text-xs text-zinc-400">
                Quote tool: <span className="font-mono">{quote.tool ?? 'unknown'}</span> · tx to:{' '}
                <span className="font-mono">{shortAddr(quote.transactionRequest.to)}</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  )
}



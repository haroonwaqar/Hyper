'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

function isLikelyEvmAddress(addr: string): addr is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(addr)
}

const STORAGE_KEY = 'hyperworld.destinationAddress'
const AUTH_KEY = 'hyperworld.authedAddress'
const FROM_ADDRESS_STORAGE_KEY = 'hyperworld.fromAddress'

export default function DestinationPage() {
  const router = useRouter()
  const [value, setValue] = useState('')
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    try {
      // Hard gate: user must be signed in before accessing this page.
      const authed = sessionStorage.getItem(FROM_ADDRESS_STORAGE_KEY) ?? sessionStorage.getItem(AUTH_KEY)
      if (!authed) {
        router.replace('/')
        return
      }
      const existing = sessionStorage.getItem(STORAGE_KEY)
      if (existing) setValue(existing)
    } catch {
      // ignore
    }
  }, [])

  const error = useMemo(() => {
    if (!touched) return null
    if (!value.trim()) return 'Destination address is required'
    if (!isLikelyEvmAddress(value.trim())) return 'Must be a valid 0x address'
    return null
  }, [touched, value])

  function onContinue() {
    setTouched(true)
    const v = value.trim()
    if (!isLikelyEvmAddress(v)) return
    try {
      sessionStorage.setItem(STORAGE_KEY, v)
    } catch {
      // ignore
    }
    router.push('/?step=bridge')
  }

  return (
    <main className="min-h-dvh">
      <div className="mx-auto flex max-w-lg flex-col px-5 pb-10 pt-10">
        <header className="text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-black">Deposit</h1>
          <p className="mt-2 text-base text-slate-600">Enter your Hyperliquid deposit address.</p>
        </header>

        <div className="mt-8 rounded-3xl border border-black/5 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Destination</h2>
            <p className="mt-1 text-sm text-slate-600">
              Paste your <span className="font-semibold">Hyperliquid deposit address</span>.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Hyperliquid credits deposits as <span className="font-semibold">native USDC on Arbitrum</span>.
            </p>
          </div>
          <button
            type="button"
            className="rounded-2xl border border-black/10 bg-[#F6FBFF] px-4 py-2.5 text-sm font-semibold text-slate-900"
            onClick={() => router.back()}
          >
            Back
          </button>
        </div>

        <label className="mt-5 block text-xs text-slate-500">Hyperliquid deposit address</label>
        <input
          className="mt-1 w-full rounded-2xl border border-black/10 bg-white px-3 py-3 font-mono text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-200"
          placeholder="0x..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => setTouched(true)}
          inputMode="text"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />

        {error ? <div className="mt-2 text-sm text-red-600">{error}</div> : null}

        <button
          type="button"
          className="mt-5 w-full rounded-2xl bg-sky-500 px-4 py-3.5 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onContinue}
        >
          Continue
        </button>
        </div>
      </div>
    </main>
  )
}



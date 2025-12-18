'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

function isLikelyEvmAddress(addr: string): addr is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(addr)
}

const STORAGE_KEY = 'hyperworld.destinationAddress'

export default function DestinationPage() {
  const router = useRouter()
  const [value, setValue] = useState('')
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    try {
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
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5 py-10">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Destination</h1>
            <p className="mt-1 text-sm text-zinc-300">
              Paste your <span className="font-semibold">Hyperliquid deposit address</span>.
            </p>
            <p className="mt-2 text-xs text-zinc-400">
              Hyperliquid credits deposits as <span className="font-semibold">native USDC on Arbitrum</span>.
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-semibold text-zinc-100"
            onClick={() => router.back()}
          >
            Back
          </button>
        </div>

        <label className="mt-5 block text-xs text-zinc-400">Hyperliquid deposit address</label>
        <input
          className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-zinc-600"
          placeholder="0x..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => setTouched(true)}
          inputMode="text"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />

        {error ? <div className="mt-2 text-sm text-red-300">{error}</div> : null}

        <button
          type="button"
          className="mt-4 w-full rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={onContinue}
        >
          Continue
        </button>
      </div>
    </main>
  )
}



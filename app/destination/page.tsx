'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

function isLikelyEvmAddress(addr: string): addr is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(addr)
}

const STORAGE_KEY = 'hyperworld.destinationAddress'
const AUTH_KEY = 'hyperworld.authedAddress'
const FROM_ADDRESS_STORAGE_KEY = 'hyperworld.fromAddress'
const HYPERLIQUID_URL = 'https://app.hyperliquid.xyz/'

export default function DestinationPage() {
  const router = useRouter()
  const [value, setValue] = useState('')
  const [touched, setTouched] = useState(false)
  const [clipboardError, setClipboardError] = useState<string | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)

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

  async function onPaste() {
    setClipboardError(null)
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        setValue(text.trim())
        setTouched(true)
      }
    } catch (e: any) {
      // Clipboard API may be blocked in some webviews; user can still use native paste.
      setClipboardError(e?.message ?? 'Unable to access clipboard. Use the system paste menu.')
    }
  }

  async function onOpenHyperliquid() {
    setOpenError(null)
    try {
      // Open Hyperliquid inside our own in-app "browser" route so the user always has a Back button.
      router.push('/hyperliquid')
    } catch {
      setOpenError('Unable to open Hyperliquid view. Please try again.')
    }
  }

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
          <h1 className="text-3xl font-semibold tracking-tight text-black">Select destination</h1>
          <p className="mt-2 text-sm text-slate-600">Paste your Hyperliquid USDC deposit address.</p>
        </header>

        <div className="p-[10px] card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Destination</h2>
            </div>
            <button type="button" className="btn-soft" onClick={() => router.back()}>
              Back
            </button>
          </div>

          <div className="pb-[15px]">
            <label className="pb-[3px] block text-xs text-slate-500">Address</label>
            <div className="mt-1 w-full flex items-center gap-2 bg-white p-1.5 py-2.5 transition focus-within:border-sky-400 focus-within:ring-4 focus-within:ring-sky-200">
              <input
                className="flex-1  bg-transparent pl-4 font-mono text-base text-slate-900 outline-none placeholder:text-slate-400"
                placeholder="0x123... or name.eth"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onBlur={() => setTouched(true)}
                inputMode="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <button
                type="button"
                className="btn-paste text-sm"
                onClick={onPaste}
              >
                Paste
              </button>
            </div>
          </div>

          {error ? <div className="pb-[15px] text-sm text-red-600">{error}</div> : null}
          {clipboardError ? <div className="pb-[15px] text-xs text-slate-500">{clipboardError}</div> : null}
          {openError ? <div className="pb-[15px] text-xs text-slate-500">{openError}</div> : null}

          <button type="button" className="btn-outline mt-6 w-full" onClick={onOpenHyperliquid}>
            Open Hyperliquid
          </button>

          <div className='pb-[7px]'></div>

          <button type="button" className="btn-primary mt-4 w-full py-3.5" onClick={onContinue}>
            Continue
          </button>
        </div>
      </div>
    </main>
  )
}



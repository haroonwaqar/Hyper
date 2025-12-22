'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const HYPERLIQUID_URL = 'https://app.hyperliquid.xyz/'

export default function HyperliquidPage() {
  const router = useRouter()
  const [loaded, setLoaded] = useState(false)
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      if (!loaded) setTimedOut(true)
    }, 7000)
    return () => clearTimeout(t)
  }, [loaded])

  return (
    <main className="min-h-dvh">
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
        <header className="sticky top-0 z-10 bg-[#F6FBFF]/80 px-5 pb-3 pt-6 backdrop-blur">
          <div className="flex items-center justify-between">
            <button
              type="button"
              className="btn-secondary px-4 py-2.5"
              onClick={() => router.back()}
            >
              Back
            </button>
            <div className="text-sm font-semibold text-slate-900">Hyperliquid</div>
            <div className="w-[76px]" />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Create/copy your deposit address, then hit Back to return to the mini app.
          </p>
        </header>

        {timedOut ? (
          <div className="px-5 pt-6">
            <div className="card p-5">
              <div className="text-sm font-semibold text-slate-900">Can’t load Hyperliquid</div>
              <p className="mt-2 text-sm text-slate-600">
                If Hyperliquid won’t load inside World App, open it in your browser:
              </p>
              <div className="mt-3 rounded-2xl border border-black/10 bg-[#F6FBFF] px-3 py-3 font-mono text-xs text-slate-800">
                {HYPERLIQUID_URL}
              </div>
              <button
                type="button"
                className="btn-primary mt-4 w-full py-3.5"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(HYPERLIQUID_URL)
                  } catch {
                    // ignore
                  }
                }}
              >
                Copy link
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 px-5 pb-8 pt-4">
            <div className="card h-[70vh] overflow-hidden">
              <iframe
                title="Hyperliquid"
                src={HYPERLIQUID_URL}
                className="h-full w-full"
                onLoad={() => setLoaded(true)}
                // sandbox omitted intentionally; Hyperliquid needs full capabilities.
              />
            </div>
            {!loaded ? <div className="mt-3 text-center text-xs text-slate-500">Loading…</div> : null}
          </div>
        )}
      </div>
    </main>
  )
}




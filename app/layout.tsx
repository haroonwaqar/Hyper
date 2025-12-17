import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Bridge USDC to Hyperliquid',
  description: 'World App Mini-App: Bridge USDC from World Chain to Hyperliquid via LI.FI.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-zinc-950 text-zinc-50 antialiased">{children}</body>
    </html>
  )
}





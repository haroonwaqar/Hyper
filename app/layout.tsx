import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Bridge USDC to Hyperliquid',
  description: 'World App Mini-App: Bridge USDC from World Chain to Hyperliquid via LI.FI.',
}

// Disable zooming (World App mini dapps commonly lock zoom to avoid layout issues)
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
} as const

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-[#F6FBFF] text-black antialiased">{children}</body>
    </html>
  )
}





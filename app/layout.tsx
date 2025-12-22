import type { Metadata } from 'next'
import './globals.css'
import { Inter } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

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
    <html lang="en" className={inter.variable}>
      <body className="min-h-dvh bg-app text-black antialiased">{children}</body>
    </html>
  )
}





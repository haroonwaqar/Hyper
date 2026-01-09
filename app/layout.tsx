import type { Metadata } from 'next'
import './globals.css'
import { Inter } from 'next/font/google'
import { AppProvider } from './context/AppContext'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'HyperWorld - AI Trading Agents',
  description: 'Deploy AI trading agents on Hyperliquid from World App',
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
      <body className="min-h-dvh antialiased">
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  )
}





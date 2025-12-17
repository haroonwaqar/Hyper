// CRITICAL: These constants are provided by the user request. Do not change them.

// World Chain (Source)
export const WORLD_CHAIN_ID = 480
export const WORLDCHAIN_USDC = '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1' as const

// LI.FI Diamond (Router) - users must whitelist this address in the Worldcoin Developer Portal.
export const LIFI_DIAMOND_CONTRACT = '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE' as const

// Hyperliquid EVM (Destination)
export const HYPEREVM_CHAIN_ID = 999
export const HYPEREVM_USDC = '0xb88339CB7199b77E23DB6E890353E22632Ba630f' as const

// Arbitrum (Alternative destination for Hyperliquid deposits)
// NOTE: Hyperliquid deposit UI indicates it credits native USDC on Arbitrum.
export const ARBITRUM_CHAIN_ID = 42161
export const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const

// Token metadata
export const USDC_DECIMALS = 6

export const LIFI_QUOTE_ENDPOINT = 'https://li.quest/v1/quote' as const





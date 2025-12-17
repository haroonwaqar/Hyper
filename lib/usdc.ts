import { USDC_DECIMALS } from '@/lib/constants'

/**
 * Converts a human-readable USDC amount into base units (6 decimals).
 * Examples:
 * - "1" -> "1000000"
 * - "0.1" -> "100000"
 * - "12.345678" -> "12345678"
 */
export function parseUsdcToBaseUnits(input: string): string {
  const raw = input.trim()
  if (!raw) throw new Error('Amount is required')

  // Disallow scientific notation for safety.
  if (raw.toLowerCase().includes('e')) throw new Error('Amount must be a plain decimal number')

  const negative = raw.startsWith('-')
  if (negative) throw new Error('Amount must be greater than 0')

  const [wholeStr, fracStr = ''] = raw.split('.')
  if (!wholeStr && !fracStr) throw new Error('Amount is required')

  const whole = wholeStr === '' ? '0' : wholeStr
  if (!/^\d+$/.test(whole)) throw new Error('Amount is not a valid number')
  if (fracStr && !/^\d+$/.test(fracStr)) throw new Error('Amount is not a valid number')
  if (fracStr.length > USDC_DECIMALS) throw new Error(`USDC only supports ${USDC_DECIMALS} decimals`)

  const fracPadded = fracStr.padEnd(USDC_DECIMALS, '0')
  const base = BigInt(whole) * 10n ** BigInt(USDC_DECIMALS) + BigInt(fracPadded || '0')
  if (base <= 0n) throw new Error('Amount must be greater than 0')

  return base.toString(10)
}

export function getFunctionSelector(calldata: string | undefined): string | null {
  if (!calldata) return null
  if (!calldata.startsWith('0x') || calldata.length < 10) return null
  return calldata.slice(0, 10)
}





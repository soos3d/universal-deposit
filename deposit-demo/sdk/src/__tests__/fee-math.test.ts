import { describe, it, expect } from 'vitest'
import {
  parseHex18ToUSD,
  extractFeeBreakdown,
  calculateOptimalAmount,
} from '../sweep/fee-math'

// ============================================
// parseHex18ToUSD
// ============================================

describe('parseHex18ToUSD', () => {
  it('parses zero values', () => {
    expect(parseHex18ToUSD('0x0')).toBe(0)
    expect(parseHex18ToUSD('0x')).toBe(0)
    expect(parseHex18ToUSD('0')).toBe(0)
    expect(parseHex18ToUSD('')).toBe(0)
  })

  it('parses 1.0 USD (1e18 in hex)', () => {
    // 1e18 = 0xde0b6b3a7640000
    const oneUSD = '0x' + (10n ** 18n).toString(16)
    expect(parseHex18ToUSD(oneUSD)).toBeCloseTo(1.0, 10)
  })

  it('parses 2.0 USD', () => {
    const twoUSD = '0x' + (2n * 10n ** 18n).toString(16)
    expect(parseHex18ToUSD(twoUSD)).toBeCloseTo(2.0, 10)
  })

  it('parses fractional amounts (0.05 USD)', () => {
    // 0.05 * 1e18 = 5e16 = 0xb1a2bc2ec50000
    const fiveCents = '0x' + (5n * 10n ** 16n).toString(16)
    expect(parseHex18ToUSD(fiveCents)).toBeCloseTo(0.05, 10)
  })

  it('parses small amounts (0.001 USD)', () => {
    const oneMill = '0x' + (10n ** 15n).toString(16)
    expect(parseHex18ToUSD(oneMill)).toBeCloseTo(0.001, 10)
  })

  it('parses large amounts (1000 USD)', () => {
    const thousandUSD = '0x' + (1000n * 10n ** 18n).toString(16)
    expect(parseHex18ToUSD(thousandUSD)).toBeCloseTo(1000.0, 6)
  })

  it('parses amounts with complex fractional parts (1.23456)', () => {
    // 1.23456 * 1e18 = 1234560000000000000
    const amount = '0x' + (1234560000000000000n).toString(16)
    expect(parseHex18ToUSD(amount)).toBeCloseTo(1.23456, 5)
  })
})

// ============================================
// extractFeeBreakdown
// ============================================

describe('extractFeeBreakdown', () => {
  const oneDollarHex = '0x' + (10n ** 18n).toString(16)
  const halfDollarHex = '0x' + (5n * 10n ** 17n).toString(16)
  const tenCentsHex = '0x' + (10n ** 17n).toString(16)

  function buildTx(overrides?: Record<string, unknown>) {
    return {
      feeQuotes: [
        {
          fees: {
            totals: {
              feeTokenAmountInUSD: oneDollarHex,
              gasFeeTokenAmountInUSD: halfDollarHex,
              transactionLPFeeTokenAmountInUSD: tenCentsHex,
              freeGasFee: false,
              freeServiceFee: false,
              ...overrides,
            },
          },
        },
      ],
    }
  }

  it('extracts fees from a well-formed transaction', () => {
    const result = extractFeeBreakdown(buildTx())
    expect(result).not.toBeNull()
    expect(result!.totalFeeUSD).toBeCloseTo(1.0, 5)
    expect(result!.gasFeeUSD).toBeCloseTo(0.5, 5)
    expect(result!.lpFeeUSD).toBeCloseTo(0.1, 5)
    expect(result!.freeGasFee).toBe(false)
    expect(result!.freeServiceFee).toBe(false)
  })

  it('reads freeGasFee and freeServiceFee booleans', () => {
    const result = extractFeeBreakdown(buildTx({
      freeGasFee: true,
      freeServiceFee: true,
    }))
    expect(result!.freeGasFee).toBe(true)
    expect(result!.freeServiceFee).toBe(true)
  })

  it('returns null for null/undefined input', () => {
    expect(extractFeeBreakdown(null)).toBeNull()
    expect(extractFeeBreakdown(undefined)).toBeNull()
  })

  it('returns null for empty object', () => {
    expect(extractFeeBreakdown({})).toBeNull()
  })

  it('returns null when feeQuotes is empty array', () => {
    expect(extractFeeBreakdown({ feeQuotes: [] })).toBeNull()
  })

  it('returns null when feeQuotes is not an array', () => {
    expect(extractFeeBreakdown({ feeQuotes: 'bad' })).toBeNull()
  })

  it('returns null when fees.totals is missing', () => {
    expect(extractFeeBreakdown({ feeQuotes: [{ fees: {} }] })).toBeNull()
  })

  it('returns null when fee hex values are not strings', () => {
    expect(extractFeeBreakdown({
      feeQuotes: [{
        fees: {
          totals: {
            feeTokenAmountInUSD: 123,
            gasFeeTokenAmountInUSD: 456,
            transactionLPFeeTokenAmountInUSD: 789,
          },
        },
      }],
    })).toBeNull()
  })

  it('handles zero fees (gasless transaction)', () => {
    const result = extractFeeBreakdown(buildTx({
      feeTokenAmountInUSD: '0x0',
      gasFeeTokenAmountInUSD: '0x0',
      transactionLPFeeTokenAmountInUSD: '0x0',
      freeGasFee: true,
      freeServiceFee: true,
    }))
    expect(result).not.toBeNull()
    expect(result!.totalFeeUSD).toBe(0)
    expect(result!.gasFeeUSD).toBe(0)
    expect(result!.lpFeeUSD).toBe(0)
  })
})

// ============================================
// calculateOptimalAmount
// ============================================

describe('calculateOptimalAmount', () => {
  it('calculates optimal amount for a $10 deposit with $0.03 gas', () => {
    // optimal = (10 - 0.03) / (1 + 0.002) = 9.97 / 1.002 ≈ 9.950
    const result = calculateOptimalAmount(10, 0.03)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(9.97 / 1.002, 3)
    expect(result!).toBeGreaterThan(9.9)
    expect(result!).toBeLessThan(10)
  })

  it('calculates optimal amount for a $100 deposit with $0.03 gas', () => {
    // optimal = (100 - 0.03) / 1.011 ≈ 98.882
    const result = calculateOptimalAmount(100, 0.03)
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThan(98)
    expect(result!).toBeLessThan(100)
  })

  it('applies LP rate even when gas fee is zero', () => {
    // optimal = 10 / 1.002 ≈ 9.980
    const result = calculateOptimalAmount(10, 0)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(10 / 1.002, 5)
    expect(result!).toBeLessThan(10)
  })

  it('returns null when deposit cannot cover gas', () => {
    // $1 deposit, $4 gas — optimal = (1 - 4) / 1.011 < 0
    expect(calculateOptimalAmount(1, 4)).toBeNull()
  })

  it('returns null for zero deposit', () => {
    expect(calculateOptimalAmount(0, 0.03)).toBeNull()
  })

  it('returns null for negative deposit', () => {
    expect(calculateOptimalAmount(-5, 0.03)).toBeNull()
  })

  it('respects custom LP rate', () => {
    const defaultResult = calculateOptimalAmount(10, 0.03)
    const higherBuffer = calculateOptimalAmount(10, 0.03, { lpRate: 0.05 })
    // Higher buffer -> smaller optimal amount
    expect(higherBuffer!).toBeLessThan(defaultResult!)
  })

  it('respects custom dust threshold', () => {
    // Small deposit that barely covers gas
    // (0.05 - 0.03) / 1.011 ≈ 0.0198
    expect(calculateOptimalAmount(0.05, 0.03, { dustThreshold: 0.05 })).toBeNull()
    expect(calculateOptimalAmount(0.05, 0.03, { dustThreshold: 0.001 })).not.toBeNull()
  })

  it('handles gas fee larger than deposit gracefully', () => {
    expect(calculateOptimalAmount(10, 80)).toBeNull()
  })

  it('preserves most value for typical small deposit ($5, $0.03 gas)', () => {
    const result = calculateOptimalAmount(5, 0.03)
    expect(result).not.toBeNull()
    // Should preserve >98% of value after fees
    const efficiency = result! / 5
    expect(efficiency).toBeGreaterThan(0.97)
  })

  it('handles small BNB deposit ($0.39, $0.03 gas)', () => {
    // This is the failing case from the bug report
    // optimal = (0.39 - 0.03) / 1.011 ≈ 0.356
    const result = calculateOptimalAmount(0.39, 0.03)
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThan(0.3)
    expect(result!).toBeLessThan(0.39)
  })
})

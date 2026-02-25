/**
 * Pure fee extraction and optimal sweep amount calculation utilities.
 *
 * The UA SDK's `createUniversalTransaction` returns a complete fee breakdown
 * in `feeQuotes[0].fees.totals` before sending. We use the first call as a
 * "probe" to extract exact fees, then calculate the optimal sweep amount.
 *
 * Fee fields are hex-encoded 18-decimal values (internal UA SDK format).
 */

/** Breakdown of fees from a universal transaction probe */
interface FeeBreakdown {
  /** Total fee in USD (gas + LP + service) */
  totalFeeUSD: number
  /** Fixed gas fee in USD */
  gasFeeUSD: number
  /** Proportional LP fee in USD (scales with amount) */
  lpFeeUSD: number
  /** Whether gas fee is waived */
  freeGasFee: boolean
  /** Whether service fee is waived */
  freeServiceFee: boolean
  /** Raw hex strings from the UA SDK response (for logging/debugging) */
  raw: { totalHex: string; gasHex: string; lpHex: string }
}

const EIGHTEEN_DECIMALS = 10n ** 18n

/**
 * Parse a hex-encoded 18-decimal value (used internally by the UA SDK) to
 * a floating-point USD number.
 *
 * @example parseHex18ToUSD('0x1bc16d674ec80000') // 2.0
 * @example parseHex18ToUSD('0x0')                 // 0
 */
export function parseHex18ToUSD(hex: string): number {
  if (!hex || hex === '0x0' || hex === '0x' || hex === '0') {
    return 0
  }

  const raw = BigInt(hex)

  // Split into whole + fractional to avoid floating-point precision loss
  const whole = raw / EIGHTEEN_DECIMALS
  const remainder = raw % EIGHTEEN_DECIMALS

  // Convert remainder to float with enough precision for USD amounts
  const fractional = Number(remainder) / Number(EIGHTEEN_DECIMALS)

  return Number(whole) + fractional
}

/**
 * Defensively extract fee breakdown from a `createUniversalTransaction` result.
 *
 * Expected structure:
 * ```
 * tx.feeQuotes[0].fees.totals.{
 *   feeTokenAmountInUSD: "0x...",
 *   gasFeeTokenAmountInUSD: "0x...",
 *   transactionLPFeeTokenAmountInUSD: "0x...",
 *   freeGasFee: boolean,
 *   freeServiceFee: boolean,
 * }
 * ```
 *
 * Returns `null` if the expected structure is missing or malformed.
 */
export function extractFeeBreakdown(tx: unknown): FeeBreakdown | null {
  try {
    const txObj = tx as Record<string, unknown>
    const feeQuotes = txObj?.feeQuotes as unknown[] | undefined
    if (!Array.isArray(feeQuotes) || feeQuotes.length === 0) return null

    const quote = feeQuotes[0] as Record<string, unknown>
    const fees = quote?.fees as Record<string, unknown> | undefined
    if (!fees) return null

    const totals = fees.totals as Record<string, unknown> | undefined
    if (!totals) return null

    const totalHex = totals.feeTokenAmountInUSD
    const gasHex = totals.gasFeeTokenAmountInUSD
    const lpHex = totals.transactionLPFeeTokenAmountInUSD

    if (typeof totalHex !== 'string' || typeof gasHex !== 'string' || typeof lpHex !== 'string') {
      return null
    }

    return {
      totalFeeUSD: parseHex18ToUSD(totalHex),
      gasFeeUSD: parseHex18ToUSD(gasHex),
      lpFeeUSD: parseHex18ToUSD(lpHex),
      freeGasFee: totals.freeGasFee === true,
      freeServiceFee: totals.freeServiceFee === true,
      raw: { totalHex, gasHex, lpHex },
    }
  } catch {
    return null
  }
}

/** Fallback LP fee buffer used when the probe returns no LP fee data (0.20%) */
const FALLBACK_LP_FEE_BUFFER = 0.002

/**
 * Derive the LP fee rate from a probe fee breakdown.
 *
 * LP fee scales proportionally with amount, so dividing the probe's LP fee
 * by the probe amount gives the exact rate. Falls back to FALLBACK_LP_FEE_BUFFER
 * when the probe returned zero LP fee (gasless / waived).
 */
export function deriveLpRate(fees: { lpFeeUSD: number }, probeAmountUSD: number): number {
  if (fees.lpFeeUSD <= 0 || probeAmountUSD <= 0) return FALLBACK_LP_FEE_BUFFER
  return fees.lpFeeUSD / probeAmountUSD
}

/**
 * Calculate the optimal sweep amount given a deposit value, gas fee, and LP rate.
 *
 * Formula:
 * ```
 * optimal = (depositAmountUSD - gasFeeUSD) / (1 + lpRate)
 * ```
 *
 * The LP rate should be derived from the probe via `deriveLpRate()` rather than
 * using a hardcoded constant, so the calculation matches what the UA will actually charge.
 *
 * Returns `null` if the deposit can't cover fees (below dust threshold).
 */
export function calculateOptimalAmount(
  depositAmountUSD: number,
  gasFeeUSD: number,
  options?: {
    /** LP fee rate as a fraction — use deriveLpRate() to get this from probe data */
    lpRate?: number
    /** Minimum viable sweep in USD (default: 0.01) */
    dustThreshold?: number
  }
): number | null {
  const {
    lpRate = FALLBACK_LP_FEE_BUFFER,
    dustThreshold = 0.01,
  } = options ?? {}

  if (depositAmountUSD <= 0) return null

  // No gas fee: return full amount minus LP
  if (gasFeeUSD <= 0) return depositAmountUSD / (1 + lpRate)

  const optimal = (depositAmountUSD - gasFeeUSD) / (1 + lpRate)

  if (optimal < dustThreshold) return null

  return optimal
}

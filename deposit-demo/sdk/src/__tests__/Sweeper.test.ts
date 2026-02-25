import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Sweeper } from '../sweep/Sweeper'
import type { DetectedDeposit } from '../core/types'
import { CHAIN } from '../constants'

// ============================================
// Test helpers
// ============================================

/** Build a hex string for a USD amount with 18 decimals */
function usdToHex18(usd: number): string {
  const raw = BigInt(Math.round(usd * 1e18))
  return '0x' + raw.toString(16)
}

/** Build a mock tx with fee breakdown in the UA SDK's format */
function buildMockTx(opts: {
  rootHash?: string
  totalFeeUSD?: number
  gasFeeUSD?: number
  lpFeeUSD?: number
  freeGasFee?: boolean
  freeServiceFee?: boolean
} = {}) {
  const {
    rootHash = '0xabc123',
    totalFeeUSD = 0.03002,
    gasFeeUSD = 0.03,
    lpFeeUSD = 0.00002,  // 0.20% of $0.01 probe amount
    freeGasFee = false,
    freeServiceFee = false,
  } = opts

  return {
    rootHash,
    feeQuotes: [
      {
        fees: {
          totals: {
            feeTokenAmountInUSD: usdToHex18(totalFeeUSD),
            gasFeeTokenAmountInUSD: usdToHex18(gasFeeUSD),
            transactionLPFeeTokenAmountInUSD: usdToHex18(lpFeeUSD),
            freeGasFee,
            freeServiceFee,
          },
        },
      },
    ],
  }
}

/** Build a mock tx without fee structure (legacy/malformed) */
function buildMockTxNoFees(rootHash = '0xdef456') {
  return { rootHash }
}

/** Build a gasless mock tx */
function buildGaslessTx(rootHash = '0xgas000') {
  return buildMockTx({
    rootHash,
    totalFeeUSD: 0,
    gasFeeUSD: 0,
    lpFeeUSD: 0,
    freeGasFee: true,
    freeServiceFee: true,
  })
}

const MOCK_DEPOSIT: DetectedDeposit = {
  id: 'dep-1',
  token: 'USDC',
  chainId: 1,
  amount: '10.000000',
  amountUSD: 10,
  rawAmount: 10000000n,
  detectedAt: Date.now(),
}

function createSweeper(overrides: {
  createUniversalTransaction?: ReturnType<typeof vi.fn>
  sendTransaction?: ReturnType<typeof vi.fn>
  signMessage?: ReturnType<typeof vi.fn>
} = {}) {
  const mockCreateTx = overrides.createUniversalTransaction ?? vi.fn().mockResolvedValue(buildMockTx())
  const mockSendTx = overrides.sendTransaction ?? vi.fn().mockResolvedValue(undefined)
  const mockSign = overrides.signMessage ?? vi.fn().mockResolvedValue('0xsig')

  const mockUA = {
    createUniversalTransaction: mockCreateTx,
    sendTransaction: mockSendTx,
  }

  const mockUAManager = {
    getUniversalAccount: () => mockUA,
  }

  const mockProvider = {
    signMessage: mockSign,
  }

  const sweeper = new Sweeper({
    uaManager: mockUAManager as any,
    authCoreProvider: mockProvider as any,
    getDestination: () => ({ address: '0xReceiver', chainId: CHAIN.ARBITRUM }),
  })

  return { sweeper, mockUA, mockSign, mockProvider }
}

// ============================================
// Tests
// ============================================

describe('Sweeper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('low probe + optimal execution', () => {
    it('probes at $0.01 and executes with optimal amount', async () => {
      const probeTx = buildMockTx({ rootHash: '0xprobe' })
      const optimalTx = buildMockTx({ rootHash: '0xoptimal' })

      const mockCreateTx = vi.fn()
        .mockResolvedValueOnce(probeTx)   // $0.01 probe
        .mockResolvedValueOnce(optimalTx) // optimal amount execution

      const { sweeper } = createSweeper({ createUniversalTransaction: mockCreateTx })

      const result = await sweeper.sweep(MOCK_DEPOSIT)

      expect(result.status).toBe('success')
      expect(result.transactionId).toBe('0xoptimal')
      expect(mockCreateTx).toHaveBeenCalledTimes(2)

      // First call = $0.01 probe
      const probeArgs = mockCreateTx.mock.calls[0][0]
      expect(probeArgs.expectTokens[0].amount).toBe('0.010000')

      // Second call = optimal (deposit minus gas, divided by 1 + lpRate)
      // For $10 deposit, $0.03 gas, 0.20% LP rate: (10 - 0.03) / 1.002 ≈ 9.950
      const optimalArgs = mockCreateTx.mock.calls[1][0]
      const optimalAmount = parseFloat(optimalArgs.expectTokens[0].amount)
      expect(optimalAmount).toBeGreaterThan(9.9)
      expect(optimalAmount).toBeLessThan(10)
    })

    it('rebuilds at 100% and sends when fees cannot be extracted', async () => {
      const probeTxNoFees = buildMockTxNoFees('0xprobe-nofee')
      const fullTx = buildMockTx({ rootHash: '0xfull' })

      const mockCreateTx = vi.fn()
        .mockResolvedValueOnce(probeTxNoFees) // $0.01 probe (no fee data)
        .mockResolvedValueOnce(fullTx)        // 100% rebuild

      const { sweeper } = createSweeper({ createUniversalTransaction: mockCreateTx })

      const result = await sweeper.sweep(MOCK_DEPOSIT)

      expect(result.status).toBe('success')
      expect(result.transactionId).toBe('0xfull')
      expect(mockCreateTx).toHaveBeenCalledTimes(2)

      // Second call should be at full deposit amount
      const fullArgs = mockCreateTx.mock.calls[1][0]
      expect(fullArgs.expectTokens[0].amount).toBe('10.000000')
    })

    it('rebuilds at 100% and sends for gasless transactions', async () => {
      const gaslessProbe = buildGaslessTx('0xprobe-gasless')
      const fullTx = buildMockTx({ rootHash: '0xfull-gasless' })

      const mockCreateTx = vi.fn()
        .mockResolvedValueOnce(gaslessProbe) // $0.01 probe (gasless)
        .mockResolvedValueOnce(fullTx)       // 100% rebuild

      const { sweeper } = createSweeper({ createUniversalTransaction: mockCreateTx })

      const result = await sweeper.sweep(MOCK_DEPOSIT)

      expect(result.status).toBe('success')
      expect(result.transactionId).toBe('0xfull-gasless')
      expect(mockCreateTx).toHaveBeenCalledTimes(2)

      // Second call should be at full deposit amount
      const fullArgs = mockCreateTx.mock.calls[1][0]
      expect(fullArgs.expectTokens[0].amount).toBe('10.000000')
    })

    it('retries at 90% when optimal amount fails', async () => {
      const probeTx = buildMockTx({ rootHash: '0xprobe' })
      const retryTx = buildMockTx({ rootHash: '0xretry' })

      const mockCreateTx = vi.fn()
        .mockResolvedValueOnce(probeTx)                           // $0.01 probe
        .mockRejectedValueOnce(new Error('amount too high'))      // optimal fails
        .mockResolvedValueOnce(retryTx)                           // 90% retry

      const { sweeper } = createSweeper({ createUniversalTransaction: mockCreateTx })

      const result = await sweeper.sweep(MOCK_DEPOSIT)

      expect(result.status).toBe('success')
      expect(result.transactionId).toBe('0xretry')
      expect(mockCreateTx).toHaveBeenCalledTimes(3)

      // Third call should be at ~90% of optimal (9.950 * 0.90 ≈ 8.955)
      const retryArgs = mockCreateTx.mock.calls[2][0]
      const retryAmount = parseFloat(retryArgs.expectTokens[0].amount)
      expect(retryAmount).toBeLessThan(9.0)
      expect(retryAmount).toBeGreaterThan(8.8)
    })

    it('handles non-Error objects from UA SDK (Da: prefix errors)', async () => {
      const probeTx = buildMockTx({ rootHash: '0xprobe' })

      // UA SDK throws non-standard error objects
      const nonStandardError = { Da: 'some SDK error', message: 'Da: something failed' }

      const mockCreateTx = vi.fn()
        .mockResolvedValueOnce(probeTx)            // $0.01 probe succeeds
        .mockRejectedValueOnce(nonStandardError)   // optimal fails with non-Error
        .mockResolvedValue(buildMockTx({ rootHash: '0xretry' })) // 90% retry

      const { sweeper } = createSweeper({ createUniversalTransaction: mockCreateTx })

      const result = await sweeper.sweep(MOCK_DEPOSIT)

      // Should recover via 90% retry, not crash
      expect(result.status).toBe('success')
    })
  })

  describe('fallback and retry handling', () => {
    it('falls through to next target when optimal and retry both fail', async () => {
      // Use a BNB deposit so both USDC and USDC.e targets are generated
      const bnbDeposit: DetectedDeposit = {
        ...MOCK_DEPOSIT,
        token: 'BNB',
        chainId: 56,
      }

      const probeTx = buildMockTx({ rootHash: '0xprobe' })
      const mockCreateTx = vi.fn()
        .mockResolvedValueOnce(probeTx)                          // USDC probe
        .mockRejectedValueOnce(new Error('optimal failed'))      // USDC optimal
        .mockRejectedValueOnce(new Error('retry failed'))        // USDC 90% retry
        .mockResolvedValueOnce(probeTx)                          // USDC.e probe
        .mockResolvedValueOnce(buildMockTx({ rootHash: '0xfallback' })) // USDC.e optimal

      const { sweeper } = createSweeper({ createUniversalTransaction: mockCreateTx })

      const result = await sweeper.sweep(bnbDeposit)

      expect(result.status).toBe('success')
      expect(result.transactionId).toBe('0xfallback')
    })

    it('throws when probe fails for all targets', async () => {
      const mockCreateTx = vi.fn().mockRejectedValue(new Error('probe failed'))

      const { sweeper } = createSweeper({ createUniversalTransaction: mockCreateTx })

      await expect(sweeper.sweep(MOCK_DEPOSIT)).rejects.toThrow('All sweep strategies failed')
    })

    it('tries next target when first target probe fails', async () => {
      // Use a BNB deposit so both USDC and USDC.e targets are generated
      const bnbDeposit: DetectedDeposit = {
        ...MOCK_DEPOSIT,
        token: 'BNB',
        chainId: 56,
      }

      const probeTx = buildMockTx({ rootHash: '0xprobe' })
      const optimalTx = buildMockTx({ rootHash: '0xoptimal' })

      const mockCreateTx = vi.fn()
        .mockRejectedValueOnce(new Error('first target probe failed'))  // USDC probe fails
        .mockResolvedValueOnce(probeTx)                                  // USDC.e probe succeeds
        .mockResolvedValueOnce(optimalTx)                                // USDC.e optimal execution

      const { sweeper } = createSweeper({ createUniversalTransaction: mockCreateTx })

      const result = await sweeper.sweep(bnbDeposit)

      expect(result.status).toBe('success')
      expect(result.transactionId).toBe('0xoptimal')
    })
  })

  describe('signing and send failures', () => {
    it('aborts immediately on signing failure', async () => {
      const mockSign = vi.fn().mockRejectedValue(new Error('Auth Core disconnected'))

      const { sweeper, mockUA } = createSweeper({ signMessage: mockSign })

      await expect(sweeper.sweep(MOCK_DEPOSIT)).rejects.toThrow('Signing failed')
      expect(mockUA.sendTransaction).not.toHaveBeenCalled()
    })

    it('aborts immediately on send failure (potential double-spend)', async () => {
      const mockSendTx = vi.fn().mockRejectedValue(new Error('network timeout'))

      const { sweeper } = createSweeper({ sendTransaction: mockSendTx })

      await expect(sweeper.sweep(MOCK_DEPOSIT)).rejects.toThrow('Send failed after signing')
    })

    it('never retries after SEND_FAILED (double-spend prevention)', async () => {
      const probeTx = buildMockTx({ rootHash: '0xprobe' })
      const optimalTx = buildMockTx({ rootHash: '0xoptimal' })

      const mockCreateTx = vi.fn()
        .mockResolvedValueOnce(probeTx)    // probe
        .mockResolvedValueOnce(optimalTx)  // optimal
        .mockResolvedValue(buildMockTx())  // any further calls

      const mockSendTx = vi.fn().mockRejectedValue(new Error('network timeout'))

      const { sweeper } = createSweeper({
        createUniversalTransaction: mockCreateTx,
        sendTransaction: mockSendTx,
      })

      await expect(sweeper.sweep(MOCK_DEPOSIT)).rejects.toThrow('Send failed after signing')
      // Must NOT have tried a second target after send failure
      expect(mockCreateTx).toHaveBeenCalledTimes(2) // probe + optimal only
    })
  })

  describe('edge cases', () => {
    it('skips target when deposit cannot cover gas fees', async () => {
      const highFeeProbeTx = buildMockTx({
        rootHash: '0xhighfee-probe',
        totalFeeUSD: 20,
        gasFeeUSD: 15,
        lpFeeUSD: 5,
      })

      const mockCreateTx = vi.fn().mockResolvedValue(highFeeProbeTx)

      const { sweeper } = createSweeper({ createUniversalTransaction: mockCreateTx })

      // Deposit of $10 can't cover $15 gas
      await expect(sweeper.sweep(MOCK_DEPOSIT)).rejects.toThrow('All sweep strategies failed')
    })

    it('handles zero amountUSD deposit', async () => {
      const zeroDeposit: DetectedDeposit = {
        ...MOCK_DEPOSIT,
        amountUSD: 0,
      }

      const { sweeper } = createSweeper()

      await expect(sweeper.sweep(zeroDeposit)).rejects.toThrow()
    })

    it('queues concurrent sweeps sequentially', async () => {
      const order: string[] = []
      const mockCreateTx = vi.fn().mockImplementation(async () => {
        await new Promise(r => setTimeout(r, 10))
        order.push('tx')
        return buildMockTx()
      })

      const { sweeper } = createSweeper({ createUniversalTransaction: mockCreateTx })

      const dep1: DetectedDeposit = { ...MOCK_DEPOSIT, id: 'dep-1' }
      const dep2: DetectedDeposit = { ...MOCK_DEPOSIT, id: 'dep-2' }

      const [r1, r2] = await Promise.all([
        sweeper.sweep(dep1),
        sweeper.sweep(dep2),
      ])

      expect(r1.depositId).toBe('dep-1')
      expect(r2.depositId).toBe('dep-2')
      expect(r1.status).toBe('success')
      expect(r2.status).toBe('success')
    })

    it('reports isSweeping correctly', () => {
      const { sweeper } = createSweeper()
      expect(sweeper.isSweeping()).toBe(false)
    })

    it('requires authCoreProvider', async () => {
      const mockUAManager = {
        getUniversalAccount: () => ({
          createUniversalTransaction: vi.fn(),
          sendTransaction: vi.fn(),
        }),
      }

      const sweeper = new Sweeper({
        uaManager: mockUAManager as any,
        // no authCoreProvider
        getDestination: () => ({ address: '0xReceiver', chainId: CHAIN.ARBITRUM }),
      })

      await expect(sweeper.sweep(MOCK_DEPOSIT)).rejects.toThrow('authCoreProvider is required')
    })
  })
})

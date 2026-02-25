/**
 * Unit tests for RefundService
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RefundService, DEFAULT_REFUND_CONFIG } from '../refund';
import type { DetectedDeposit, UATransaction } from '../core/types';
import { CHAIN } from '../constants';

describe('RefundService', () => {
  let refundService: RefundService;
  let mockUAManager: any;
  let mockAuthCoreProvider: any;

  const createMockDeposit = (overrides: Partial<DetectedDeposit> = {}): DetectedDeposit => ({
    id: 'deposit:eth:1:123456',
    token: 'ETH',
    chainId: CHAIN.ETHEREUM,
    amount: '0.1',
    amountUSD: 280,
    rawAmount: 100000000000000000n,
    detectedAt: Date.now(),
    ...overrides,
  });

  const createMockTransaction = (overrides: Partial<UATransaction> = {}): UATransaction => ({
    transactionId: 'tx-123',
    tag: 'receive',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    targetToken: {
      name: 'Ethereum',
      type: 'native',
      image: '',
      price: 2800,
      symbol: 'ETH',
      address: '0x0000000000000000000000000000000000000000',
      assetId: 'eth',
      chainId: CHAIN.ETHEREUM,
      decimals: 18,
      realDecimals: 18,
      isPrimaryToken: true,
      isSmartRouterSupported: true,
    },
    change: {
      amount: '+0.1',
      amountInUSD: '280',
      from: '0xabcdef1234567890abcdef1234567890abcdef12', // Valid 40-char hex address
      to: '0x9876543210fedcba9876543210fedcba98765432',
    },
    detail: { redPacketCount: 0 },
    status: 1,
    fromChains: [CHAIN.ETHEREUM],
    toChains: [CHAIN.ETHEREUM],
    exchangeRateUSD: [],
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockAuthCoreProvider = {
      signMessage: vi.fn().mockResolvedValue('0xsignature'),
    };

    mockUAManager = {
      getUniversalAccount: vi.fn().mockReturnValue({
        createTransferTransaction: vi.fn().mockResolvedValue({
          rootHash: '0xtxhash123',
        }),
        sendTransaction: vi.fn().mockResolvedValue({}),
      }),
      getTransactions: vi.fn().mockResolvedValue({ transactions: [], page: 1, pageSize: 50 }),
      isInitialized: vi.fn().mockReturnValue(true),
    };

    refundService = new RefundService({
      uaManager: mockUAManager,
      authCoreProvider: mockAuthCoreProvider,
      ownerAddress: '0x1234567890123456789012345678901234567890',
      refundConfig: DEFAULT_REFUND_CONFIG,
    });
  });

  describe('findDepositOrigin', () => {
    it('should find matching transaction from history', async () => {
      const deposit = createMockDeposit();
      const matchingTx = createMockTransaction();

      mockUAManager.getTransactions.mockResolvedValue({ transactions: [matchingTx], page: 1, pageSize: 50 });

      const origin = await refundService.findDepositOrigin(deposit);

      expect(origin).not.toBeNull();
      expect(origin?.senderAddress).toBe('0xabcdef1234567890abcdef1234567890abcdef12');
      expect(origin?.chainId).toBe(CHAIN.ETHEREUM);
      expect(origin?.transactionId).toBe('tx-123');
    });

    it('should return null when no matching transaction found', async () => {
      const deposit = createMockDeposit({ chainId: CHAIN.ARBITRUM });
      const nonMatchingTx = createMockTransaction(); // Different chain

      mockUAManager.getTransactions.mockResolvedValue({ transactions: [nonMatchingTx], page: 1, pageSize: 50 });

      const origin = await refundService.findDepositOrigin(deposit);

      expect(origin).toBeNull();
    });

    it('should return null when transaction has no sender address', async () => {
      const deposit = createMockDeposit();
      const txWithoutSender = createMockTransaction();
      txWithoutSender.change.from = '';

      mockUAManager.getTransactions.mockResolvedValue({ transactions: [txWithoutSender], page: 1, pageSize: 50 });

      const origin = await refundService.findDepositOrigin(deposit);

      expect(origin).toBeNull();
    });

    it('should match by token symbol', async () => {
      // Deposit is USDC on Arbitrum
      const deposit = createMockDeposit({ token: 'USDC', chainId: CHAIN.ARBITRUM });
      // Transaction is ETH on Ethereum (different token AND chain)
      const ethTx = createMockTransaction(); // ETH token on Ethereum

      mockUAManager.getTransactions.mockResolvedValue({ transactions: [ethTx], page: 1, pageSize: 50 });

      const origin = await refundService.findDepositOrigin(deposit);

      // Should not match ETH transaction (wrong token and wrong chain)
      expect(origin).toBeNull();
    });
  });

  describe('checkRefundEligibility', () => {
    it('should be eligible when owner address type matches chain', async () => {
      const deposit = createMockDeposit({ chainId: CHAIN.ETHEREUM });

      const eligibility = await refundService.checkRefundEligibility(deposit);

      expect(eligibility.eligible).toBe(true);
      expect(eligibility.refundAddress).toBe('0x1234567890123456789012345678901234567890');
      expect(eligibility.isOriginalSender).toBe(false);
    });

    it('should use original sender when refundToSender is enabled and sender found', async () => {
      const deposit = createMockDeposit();
      const matchingTx = createMockTransaction();

      mockUAManager.getTransactions.mockResolvedValue({ transactions: [matchingTx], page: 1, pageSize: 50 });

      const eligibility = await refundService.checkRefundEligibility(deposit);

      expect(eligibility.eligible).toBe(true);
      expect(eligibility.refundAddress).toBe('0xabcdef1234567890abcdef1234567890abcdef12');
      expect(eligibility.isOriginalSender).toBe(true);
    });

    it('should not be eligible when chain is unknown', async () => {
      const deposit = createMockDeposit({ chainId: 999999 });

      const eligibility = await refundService.checkRefundEligibility(deposit);

      expect(eligibility.eligible).toBe(false);
      expect(eligibility.reason).toContain('Unknown chain');
    });

    it('should fall back to owner when sender address type mismatches', async () => {
      // Deposit on EVM chain but somehow has Solana-looking sender
      const deposit = createMockDeposit({ chainId: CHAIN.ETHEREUM });
      const txWithSolanaSender = createMockTransaction();
      // Solana addresses are base58, not 0x prefixed
      txWithSolanaSender.change.from = '7qSo38so1uwrPqTGpcXe94Z9LpBtZghQncLvVfreYCyX';

      mockUAManager.getTransactions.mockResolvedValue({ transactions: [txWithSolanaSender], page: 1, pageSize: 50 });

      const eligibility = await refundService.checkRefundEligibility(deposit);

      // Should fall back to owner address
      expect(eligibility.eligible).toBe(true);
      expect(eligibility.refundAddress).toBe('0x1234567890123456789012345678901234567890');
      expect(eligibility.isOriginalSender).toBe(false);
    });
  });

  describe('refund', () => {
    it('should successfully refund to source chain', async () => {
      const deposit = createMockDeposit();

      const result = await refundService.refund(deposit, 'sweep_failed');

      expect(result.status).toBe('success');
      expect(result.depositId).toBe(deposit.id);
      expect(result.sourceChainId).toBe(CHAIN.ETHEREUM);
      expect(result.reason).toBe('sweep_failed');
      expect(result.txHash).toBe('0xtxhash123');
      expect(mockAuthCoreProvider.signMessage).toHaveBeenCalled();
    });

    it('should return skipped status when not eligible', async () => {
      const deposit = createMockDeposit({ chainId: 999999 });

      const result = await refundService.refund(deposit, 'sweep_failed');

      expect(result.status).toBe('skipped');
      expect(result.error).toContain('Unknown chain');
    });

    it('should try percentage fallbacks on failure', async () => {
      const deposit = createMockDeposit();
      const mockUA = mockUAManager.getUniversalAccount();

      // Fail first two attempts, succeed on third (50%)
      mockUA.sendTransaction
        .mockRejectedValueOnce(new Error('Insufficient funds'))
        .mockRejectedValueOnce(new Error('Insufficient funds'))
        .mockResolvedValueOnce({});

      const result = await refundService.refund(deposit, 'sweep_failed');

      expect(result.status).toBe('success');
      // Should have tried 3 times (100%, 95%, 50%)
      expect(mockUA.sendTransaction).toHaveBeenCalledTimes(3);
    });

    it('should throw error when all attempts fail', async () => {
      const deposit = createMockDeposit();
      const mockUA = mockUAManager.getUniversalAccount();

      mockUA.sendTransaction.mockRejectedValue(new Error('Always fails'));

      await expect(refundService.refund(deposit, 'sweep_failed'))
        .rejects.toThrow('All refund strategies failed');
    });

    it('should fail all attempts when authCoreProvider is missing', async () => {
      const serviceWithoutProvider = new RefundService({
        uaManager: mockUAManager,
        authCoreProvider: undefined,
        ownerAddress: '0x1234567890123456789012345678901234567890',
        refundConfig: DEFAULT_REFUND_CONFIG,
      });

      const deposit = createMockDeposit();

      // Without authCoreProvider, all signing attempts fail, resulting in "All refund strategies failed"
      await expect(serviceWithoutProvider.refund(deposit, 'sweep_failed'))
        .rejects.toThrow('All refund strategies failed');
    });

    it('should not allow concurrent refunds', async () => {
      const deposit = createMockDeposit();

      // Start first refund but don't await
      const firstRefund = refundService.refund(deposit, 'sweep_failed');

      // Second refund should fail immediately
      await expect(refundService.refund(deposit, 'sweep_failed'))
        .rejects.toThrow('Refund already in progress');

      // Cleanup
      await firstRefund;
    });

    it('should include refundedTo address in result', async () => {
      const deposit = createMockDeposit();
      const matchingTx = createMockTransaction();
      mockUAManager.getTransactions.mockResolvedValue({ transactions: [matchingTx], page: 1, pageSize: 50 });

      const result = await refundService.refund(deposit, 'sweep_failed');

      expect(result.refundedTo).toBe('0xabcdef1234567890abcdef1234567890abcdef12');
      expect(result.refundedToSender).toBe(true);
    });
  });

  describe('isRefunding', () => {
    it('should return false when not refunding', () => {
      expect(refundService.isRefunding()).toBe(false);
    });
  });
});

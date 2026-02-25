/**
 * Unit tests for Auto-Refund functionality in DepositClient
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DepositClient } from '../core/DepositClient';
import type { DetectedDeposit } from '../core/types';
import { CHAIN } from '../constants';

// Mock the modules
vi.mock('../universal-account', () => ({
  UAManager: vi.fn(),
}));

vi.mock('../sweep', () => ({
  BalanceWatcher: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    off: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    removeAllListeners: vi.fn(),
    isActive: vi.fn().mockReturnValue(false),
    clearProcessingKey: vi.fn(),
  })),
  Sweeper: vi.fn().mockImplementation(() => ({
    sweep: vi.fn(),
    isSweeping: vi.fn().mockReturnValue(false),
  })),
}));

vi.mock('../refund', () => ({
  RefundService: vi.fn().mockImplementation(() => ({
    refund: vi.fn(),
    checkRefundEligibility: vi.fn(),
    findDepositOrigin: vi.fn(),
    isRefunding: vi.fn().mockReturnValue(false),
  })),
  DEFAULT_REFUND_CONFIG: {
    enabled: false, // Disabled by default - tests explicitly enable when needed
    delayMs: 5000,
    maxAttempts: 2,
    refundToSender: true,
  },
}));

vi.mock('../intermediary', () => ({
  IntermediaryService: vi.fn().mockImplementation(() => ({
    getSession: vi.fn(),
    clearSession: vi.fn(),
    clearSessionForUser: vi.fn(),
  })),
}));

describe('Auto-Refund', () => {
  let client: DepositClient;
  let mockUAManager: any;
  let mockRefundService: any;

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

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Create mock UAManager
    mockUAManager = {
      initialize: vi.fn().mockResolvedValue(undefined),
      getDepositAddresses: vi.fn().mockReturnValue({
        evm: '0xdeposit123',
        solana: 'soldeposit123',
      }),
      getPrimaryAssets: vi.fn().mockResolvedValue({ assets: [] }),
      getUniversalAccount: vi.fn().mockReturnValue({}),
      getTransactions: vi.fn().mockResolvedValue([]),
      isInitialized: vi.fn().mockReturnValue(true),
      destroy: vi.fn(),
    };

    // Mock the UAManager constructor
    const { UAManager } = await import('../universal-account');
    (UAManager as any).mockImplementation(() => mockUAManager);

    // Create client with refund enabled
    client = new DepositClient({
      ownerAddress: '0x1234567890123456789012345678901234567890',
      intermediaryAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
      authCoreProvider: {
        signMessage: vi.fn().mockResolvedValue('0xsignature'),
      },
      destination: { chainId: 42161 },
      refund: {
        enabled: true,
        delayMs: 100, // Short delay for tests
        maxAttempts: 2,
        refundToSender: true,
      },
    });

    await client.initialize();

    // Get mock instances
    const { RefundService } = await import('../refund');
    mockRefundService = (RefundService as any).mock.results[0]?.value;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Refund Configuration', () => {
    it('should include refund config in resolved config', () => {
      const config = client.getConfig();

      expect(config.refund).toBeDefined();
      expect(config.refund.enabled).toBe(true);
      expect(config.refund.delayMs).toBe(100);
      expect(config.refund.maxAttempts).toBe(2);
      expect(config.refund.refundToSender).toBe(true);
    });

    it('should use default refund config when not specified', async () => {
      const { UAManager } = await import('../universal-account');
      (UAManager as any).mockImplementation(() => mockUAManager);

      const clientWithDefaults = new DepositClient({
        ownerAddress: '0x1234567890123456789012345678901234567890',
        intermediaryAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
        destination: { chainId: 42161 },
      });

      const config = clientWithDefaults.getConfig();

      // Auto-refund is disabled by default (experimental feature)
      expect(config.refund.enabled).toBe(false);
      expect(config.refund.delayMs).toBe(5000);
      expect(config.refund.maxAttempts).toBe(2);
    });

    it('should expose refund config via getRefundConfig()', () => {
      const refundConfig = client.getRefundConfig();

      expect(refundConfig).toBeDefined();
      expect(refundConfig.enabled).toBe(true);
    });
  });

  describe('Manual Refund Methods', () => {
    it('should refund specific deposit via refund()', async () => {
      const deposit = createMockDeposit();

      // Add deposit to pending
      (client as any).pendingDeposits.set(deposit.id, deposit);

      mockRefundService.refund.mockResolvedValue({
        depositId: deposit.id,
        token: 'ETH',
        sourceChainId: CHAIN.ETHEREUM,
        amount: '0.1',
        amountUSD: 280,
        status: 'success',
        reason: 'user_requested',
        txHash: '0xtxhash',
      });

      const result = await client.refund(deposit.id);

      expect(result.status).toBe('success');
      expect(mockRefundService.refund).toHaveBeenCalledWith(deposit, 'user_requested');
      // Deposit should be removed from pending
      expect(client.getPendingDeposits()).toHaveLength(0);
    });

    it('should throw error when deposit not found', async () => {
      await expect(client.refund('nonexistent-id'))
        .rejects.toThrow('Deposit nonexistent-id not found');
    });

    it('should throw error when RefundService not initialized', async () => {
      // Create client with refund disabled
      const { UAManager } = await import('../universal-account');
      (UAManager as any).mockImplementation(() => mockUAManager);

      const clientNoRefund = new DepositClient({
        ownerAddress: '0x1234567890123456789012345678901234567890',
        intermediaryAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
        destination: { chainId: 42161 },
        refund: { enabled: false },
      });

      await clientNoRefund.initialize();

      const deposit = createMockDeposit();
      (clientNoRefund as any).pendingDeposits.set(deposit.id, deposit);

      await expect(clientNoRefund.refund(deposit.id))
        .rejects.toThrow('RefundService not initialized');
    });

    it('should refund all pending deposits via refundAll()', async () => {
      const deposit1 = createMockDeposit({ id: 'deposit1' });
      const deposit2 = createMockDeposit({ id: 'deposit2', token: 'USDC' });

      (client as any).pendingDeposits.set(deposit1.id, deposit1);
      (client as any).pendingDeposits.set(deposit2.id, deposit2);

      mockRefundService.refund
        .mockResolvedValueOnce({
          depositId: deposit1.id,
          status: 'success',
          reason: 'user_requested',
        })
        .mockResolvedValueOnce({
          depositId: deposit2.id,
          status: 'success',
          reason: 'user_requested',
        });

      const results = await client.refundAll();

      expect(results).toHaveLength(2);
      expect(results.every(r => r.status === 'success')).toBe(true);
      expect(client.getPendingDeposits()).toHaveLength(0);
    });
  });

  describe('canRefund', () => {
    it('should check eligibility via RefundService', async () => {
      const deposit = createMockDeposit();
      (client as any).pendingDeposits.set(deposit.id, deposit);

      mockRefundService.checkRefundEligibility.mockResolvedValue({
        eligible: true,
        refundAddress: '0xowner',
      });

      const result = await client.canRefund(deposit.id);

      expect(result.eligible).toBe(true);
      expect(mockRefundService.checkRefundEligibility).toHaveBeenCalledWith(deposit);
    });

    it('should return not eligible when deposit not found', async () => {
      const result = await client.canRefund('nonexistent');

      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('Deposit not found');
    });
  });

  describe('Refund Events', () => {
    it('should emit refund:started event', async () => {
      const deposit = createMockDeposit();
      (client as any).pendingDeposits.set(deposit.id, deposit);

      mockRefundService.refund.mockResolvedValue({
        depositId: deposit.id,
        status: 'success',
        reason: 'user_requested',
      });

      const startedHandler = vi.fn();
      client.on('refund:started', startedHandler);

      await client.refund(deposit.id);

      expect(startedHandler).toHaveBeenCalledWith(deposit, 'user_requested');
    });

    it('should emit refund:processing event', async () => {
      const deposit = createMockDeposit();
      (client as any).pendingDeposits.set(deposit.id, deposit);

      mockRefundService.refund.mockResolvedValue({
        depositId: deposit.id,
        status: 'success',
        reason: 'user_requested',
      });

      const processingHandler = vi.fn();
      client.on('refund:processing', processingHandler);

      await client.refund(deposit.id);

      expect(processingHandler).toHaveBeenCalledWith(deposit, 1);
    });

    it('should emit refund:complete event on success', async () => {
      const deposit = createMockDeposit();
      (client as any).pendingDeposits.set(deposit.id, deposit);

      const mockResult = {
        depositId: deposit.id,
        status: 'success',
        reason: 'user_requested',
        txHash: '0xtxhash',
      };
      mockRefundService.refund.mockResolvedValue(mockResult);

      const completeHandler = vi.fn();
      client.on('refund:complete', completeHandler);

      await client.refund(deposit.id);

      expect(completeHandler).toHaveBeenCalledWith(mockResult);
    });

    it('should emit refund:failed event on failure', async () => {
      const deposit = createMockDeposit();
      (client as any).pendingDeposits.set(deposit.id, deposit);

      mockRefundService.refund.mockRejectedValue(new Error('Refund failed'));

      const failedHandler = vi.fn();
      client.on('refund:failed', failedHandler);

      await expect(client.refund(deposit.id)).rejects.toThrow();

      expect(failedHandler).toHaveBeenCalled();
      const [failedDeposit, error, exhausted] = failedHandler.mock.calls[0];
      expect(failedDeposit.id).toBe(deposit.id);
      expect(error.message).toBe('Refund failed');
      expect(exhausted).toBe(true);
    });
  });

  describe('Refund Tracking', () => {
    it('should clear refund attempts on successful refund', async () => {
      const deposit = createMockDeposit();
      (client as any).pendingDeposits.set(deposit.id, deposit);
      (client as any).refundAttempts.set(deposit.id, 1);

      mockRefundService.refund.mockResolvedValue({
        depositId: deposit.id,
        status: 'success',
      });

      await client.refund(deposit.id);

      expect((client as any).refundAttempts.has(deposit.id)).toBe(false);
    });
  });
});

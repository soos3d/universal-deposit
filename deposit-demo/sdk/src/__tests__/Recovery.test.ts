/**
 * Unit tests for Fund Recovery functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DepositClient } from '../core/DepositClient';

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

vi.mock('../intermediary', () => ({
  IntermediaryService: vi.fn().mockImplementation(() => ({
    getSession: vi.fn(),
    clearSession: vi.fn(),
    clearSessionForUser: vi.fn(),
  })),
}));

describe('Fund Recovery', () => {
  let client: DepositClient;
  let mockUAManager: any;
  let mockSweeper: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create mock UAManager
    mockUAManager = {
      initialize: vi.fn().mockResolvedValue(undefined),
      getDepositAddresses: vi.fn().mockReturnValue({
        evm: '0xdeposit123',
        solana: 'soldeposit123',
      }),
      getPrimaryAssets: vi.fn().mockResolvedValue({
        assets: [
          {
            tokenType: 'usdc',
            chainAggregation: [
              {
                token: { chainId: 146 },
                rawAmount: '500000',
                amountInUSD: 0.49985,
              },
              {
                token: { chainId: 42161 },
                rawAmount: '0',
                amountInUSD: 0,
              },
            ],
          },
          {
            tokenType: 'eth',
            chainAggregation: [
              {
                token: { chainId: 1 },
                rawAmount: '100000000000000000',
                amountInUSD: 280,
              },
            ],
          },
        ],
      }),
      getUniversalAccount: vi.fn().mockReturnValue({}),
      isInitialized: vi.fn().mockReturnValue(true),
      destroy: vi.fn(),
    };

    // Mock the UAManager constructor
    const { UAManager } = await import('../universal-account');
    (UAManager as any).mockImplementation(() => mockUAManager);

    // Create client with valid EVM addresses (40 hex chars after 0x)
    client = new DepositClient({
      ownerAddress: '0x1234567890123456789012345678901234567890',
      intermediaryAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
      authCoreProvider: {
        signMessage: vi.fn().mockResolvedValue('0xsignature'),
      },
      destination: { chainId: 42161 },
    });

    await client.initialize();

    // Get the mock sweeper instance
    const { Sweeper } = await import('../sweep');
    mockSweeper = (Sweeper as any).mock.results[0]?.value;
  });

  describe('getStuckFunds', () => {
    it('should return all non-zero balances without minimum threshold', async () => {
      const stuckFunds = await client.getStuckFunds();

      // Should return both the small USDC (0.49985 USD) and ETH (280 USD)
      expect(stuckFunds).toHaveLength(2);

      // Check USDC on Sonic (chain 146)
      const usdc = stuckFunds.find(f => f.token === 'USDC' && f.chainId === 146);
      expect(usdc).toBeDefined();
      expect(usdc?.amount).toBe('500000');
      expect(usdc?.amountUSD).toBeCloseTo(0.49985);

      // Check ETH on Ethereum
      const eth = stuckFunds.find(f => f.token === 'ETH' && f.chainId === 1);
      expect(eth).toBeDefined();
      expect(eth?.amount).toBe('100000000000000000');
      expect(eth?.amountUSD).toBe(280);
    });

    it('should not include zero balances', async () => {
      const stuckFunds = await client.getStuckFunds();

      // USDC on Arbitrum has 0 balance, should not be included
      const usdcArb = stuckFunds.find(f => f.token === 'USDC' && f.chainId === 42161);
      expect(usdcArb).toBeUndefined();
    });
  });

  describe('recoverAllFunds', () => {
    it('should attempt to sweep all stuck funds', async () => {
      mockSweeper.sweep = vi.fn().mockResolvedValue({
        depositId: 'test',
        transactionId: '0xtx123',
        explorerUrl: 'https://explorer.com/tx/0xtx123',
        status: 'success',
      });

      const results = await client.recoverAllFunds();

      // Should have attempted to sweep 2 funds
      expect(results).toHaveLength(2);
      expect(mockSweeper.sweep).toHaveBeenCalledTimes(2);

      // All should be successful
      expect(results.every(r => r.status === 'success')).toBe(true);
    });

    it('should handle sweep failures gracefully', async () => {
      mockSweeper.sweep = vi.fn()
        .mockResolvedValueOnce({
          depositId: 'test1',
          transactionId: '0xtx123',
          status: 'success',
        })
        .mockRejectedValueOnce(new Error('Insufficient gas'));

      const results = await client.recoverAllFunds();

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe('success');
      expect(results[1].status).toBe('failed');
      expect(results[1].error).toBe('Insufficient gas');
    });

    it('should return empty results when no funds to recover', async () => {
      mockUAManager.getPrimaryAssets.mockResolvedValue({
        assets: [
          {
            tokenType: 'usdc',
            chainAggregation: [
              {
                token: { chainId: 146 },
                rawAmount: '0',
                amountInUSD: 0,
              },
            ],
          },
        ],
      });

      const results = await client.recoverAllFunds();

      expect(results).toHaveLength(0);
      expect(mockSweeper.sweep).not.toHaveBeenCalled();
    });
  });
});

/**
 * Unit tests for Transaction History API
 * Tests UAManager.getTokenTransactions, UAManager.getTransaction,
 * and DepositClient passthrough methods.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DepositClient } from '../core/DepositClient';
import type { UATransaction } from '../core/types';

// Mock modules
vi.mock('../universal-account', () => ({
  UAManager: vi.fn(),
  TransactionCache: vi.fn(),
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

const makeMockTx = (id: string): UATransaction => ({
  transactionId: id,
  tag: 'transfer',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  targetToken: {
    name: 'USDC',
    type: 'erc20',
    image: '',
    price: 1,
    symbol: 'USDC',
    address: '0xusdc',
    assetId: 'usdc',
    chainId: 8453,
    decimals: 6,
    realDecimals: 6,
    isPrimaryToken: true,
    isSmartRouterSupported: true,
  },
  change: { amount: '1000000', amountInUSD: '1.00', from: '0xA', to: '0xB' },
  detail: { redPacketCount: 0 },
  status: 1,
  fromChains: [8453],
  toChains: [8453],
  exchangeRateUSD: [],
});

describe('Transaction History - DepositClient', () => {
  let client: DepositClient;
  let mockUAManager: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockUAManager = {
      initialize: vi.fn().mockResolvedValue(undefined),
      getDepositAddresses: vi.fn().mockReturnValue({
        evm: '0xdeposit123',
        solana: 'soldeposit123',
      }),
      getPrimaryAssets: vi.fn().mockResolvedValue({ assets: [] }),
      getTransactions: vi.fn(),
      getTokenTransactions: vi.fn(),
      getTransaction: vi.fn(),
      invalidateTransactionCache: vi.fn(),
      isInitialized: vi.fn().mockReturnValue(true),
      destroy: vi.fn(),
    };

    const { UAManager } = await import('../universal-account');
    (UAManager as any).mockImplementation(() => mockUAManager);

    client = new DepositClient({
      ownerAddress: '0x1234567890123456789012345678901234567890',
      intermediaryAddress: '0x0987654321098765432109876543210987654321',
      destination: { chainId: 8453 },
    });

    await client.initialize();
  });

  // ------- getTransactions -------

  describe('getTransactions', () => {
    it('delegates to UAManager with default params', async () => {
      const response = {
        transactions: [makeMockTx('tx1')],
        page: 1,
        pageSize: 10,
      };
      mockUAManager.getTransactions.mockResolvedValue(response);

      const result = await client.getTransactions();

      expect(mockUAManager.getTransactions).toHaveBeenCalledWith(undefined, undefined);
      expect(result).toEqual(response);
    });

    it('passes page and pageSize through', async () => {
      const response = { transactions: [], page: 3, pageSize: 5 };
      mockUAManager.getTransactions.mockResolvedValue(response);

      await client.getTransactions(3, 5);

      expect(mockUAManager.getTransactions).toHaveBeenCalledWith(3, 5);
    });

    it('throws ConfigurationError when not initialized', async () => {
      client.destroy();

      await expect(client.getTransactions()).rejects.toThrow(
        'Client not initialized'
      );
    });

    it('wraps UAManager errors', async () => {
      mockUAManager.getTransactions.mockRejectedValue(new Error('network fail'));

      await expect(client.getTransactions()).rejects.toThrow(
        'Failed to get transactions: network fail'
      );
    });
  });

  // ------- getTokenTransactions -------

  describe('getTokenTransactions', () => {
    it('delegates to UAManager', async () => {
      const response = {
        transactions: [makeMockTx('tx2')],
        nextPageToken: 'cursor_abc',
      };
      mockUAManager.getTokenTransactions.mockResolvedValue(response);

      const filter = { chainId: 8453, address: '0xusdc' };
      const result = await client.getTokenTransactions(filter);

      expect(mockUAManager.getTokenTransactions).toHaveBeenCalledWith(filter, undefined);
      expect(result).toEqual(response);
    });

    it('passes pageToken through', async () => {
      const response = { transactions: [], nextPageToken: undefined };
      mockUAManager.getTokenTransactions.mockResolvedValue(response);

      await client.getTokenTransactions(
        { chainId: 1, address: '0xtoken' },
        'cursor_xyz'
      );

      expect(mockUAManager.getTokenTransactions).toHaveBeenCalledWith(
        { chainId: 1, address: '0xtoken' },
        'cursor_xyz'
      );
    });

    it('throws when not initialized', async () => {
      client.destroy();

      await expect(
        client.getTokenTransactions({ chainId: 1, address: '0x' })
      ).rejects.toThrow('Client not initialized');
    });
  });

  // ------- getTransaction -------

  describe('getTransaction', () => {
    it('delegates to UAManager', async () => {
      const tx = makeMockTx('tx3');
      mockUAManager.getTransaction.mockResolvedValue(tx);

      const result = await client.getTransaction('tx3');

      expect(mockUAManager.getTransaction).toHaveBeenCalledWith('tx3');
      expect(result).toEqual(tx);
    });

    it('throws when not initialized', async () => {
      client.destroy();

      await expect(client.getTransaction('tx3')).rejects.toThrow(
        'Client not initialized'
      );
    });

    it('wraps UAManager errors', async () => {
      mockUAManager.getTransaction.mockRejectedValue(new Error('not found'));

      await expect(client.getTransaction('bad')).rejects.toThrow(
        'Failed to get transaction: not found'
      );
    });
  });
});

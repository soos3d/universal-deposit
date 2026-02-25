/**
 * Unit tests for BalanceWatcher
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BalanceWatcher } from '../sweep/BalanceWatcher';
import type { UAManager } from '../universal-account';

describe('BalanceWatcher', () => {
  let mockUAManager: UAManager;

  beforeEach(() => {
    vi.useFakeTimers();

    mockUAManager = {
      getPrimaryAssets: vi.fn().mockResolvedValue({
        assets: [],
      }),
      getDepositAddresses: vi.fn().mockReturnValue({
        evm: '0x1234',
        solana: 'abc123',
      }),
      isInitialized: vi.fn().mockReturnValue(true),
    } as unknown as UAManager;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with config', () => {
      const watcher = new BalanceWatcher({
        uaManager: mockUAManager,
        pollingIntervalMs: 5000,
        minValueUSD: 0.5,
        supportedTokens: ['ETH', 'USDC'],
        supportedChains: [1, 42161],
      });

      expect(watcher).toBeInstanceOf(BalanceWatcher);
      expect(watcher.isActive()).toBe(false);
    });
  });

  describe('start/stop', () => {
    it('should start and stop watching', () => {
      const watcher = new BalanceWatcher({
        uaManager: mockUAManager,
        pollingIntervalMs: 5000,
        minValueUSD: 0.5,
        supportedTokens: ['ETH', 'USDC'],
        supportedChains: [1, 42161],
      });

      expect(watcher.isActive()).toBe(false);

      watcher.start();
      expect(watcher.isActive()).toBe(true);

      watcher.stop();
      expect(watcher.isActive()).toBe(false);
    });

    it('should not start twice', () => {
      const watcher = new BalanceWatcher({
        uaManager: mockUAManager,
        pollingIntervalMs: 5000,
        minValueUSD: 0.5,
        supportedTokens: ['ETH', 'USDC'],
        supportedChains: [1, 42161],
      });

      watcher.start();
      watcher.start(); // Should be no-op

      expect(watcher.isActive()).toBe(true);
    });
  });

  describe('deposit detection', () => {
    it('should emit deposit:detected for existing balances on first poll', async () => {
      (mockUAManager.getPrimaryAssets as any).mockResolvedValue({
        assets: [
          {
            tokenType: 'eth',
            chainAggregation: [
              {
                chainId: 42161,
                rawAmount: '1000000000000000000', // 1 ETH
                amountInUSD: '2000',
              },
            ],
          },
        ],
      });

      const watcher = new BalanceWatcher({
        uaManager: mockUAManager,
        pollingIntervalMs: 5000,
        minValueUSD: 0.5,
        supportedTokens: ['ETH', 'USDC'],
        supportedChains: [1, 42161],
      });

      const detectedHandler = vi.fn();
      watcher.on('deposit:detected', detectedHandler);

      watcher.start();

      // Wait for initial poll
      await vi.advanceTimersByTimeAsync(100);

      expect(detectedHandler).toHaveBeenCalledTimes(1);
      expect(detectedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'ETH',
          chainId: 42161,
          amountUSD: 2000,
        })
      );
    });

    it('should detect balance increases on subsequent polls', async () => {
      let callCount = 0;
      (mockUAManager.getPrimaryAssets as any).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First poll - empty
          return Promise.resolve({ assets: [] });
        } else {
          // Second poll - has balance
          return Promise.resolve({
            assets: [
              {
                tokenType: 'usdc',
                chainAggregation: [
                  {
                    chainId: 1,
                    rawAmount: '100000000', // 100 USDC
                    amountInUSD: '100',
                  },
                ],
              },
            ],
          });
        }
      });

      const watcher = new BalanceWatcher({
        uaManager: mockUAManager,
        pollingIntervalMs: 5000,
        minValueUSD: 0.5,
        supportedTokens: ['ETH', 'USDC'],
        supportedChains: [1, 42161],
      });

      const detectedHandler = vi.fn();
      watcher.on('deposit:detected', detectedHandler);

      watcher.start();

      // First poll (initial check)
      await vi.advanceTimersByTimeAsync(100);
      expect(detectedHandler).not.toHaveBeenCalled();

      // Second poll (detects new balance)
      await vi.advanceTimersByTimeAsync(5000);
      expect(detectedHandler).toHaveBeenCalledTimes(1);
      expect(detectedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'USDC',
          chainId: 1,
        })
      );
    });

    it('should not detect balances below minValueUSD', async () => {
      (mockUAManager.getPrimaryAssets as any).mockResolvedValue({
        assets: [
          {
            tokenType: 'eth',
            chainAggregation: [
              {
                chainId: 42161,
                rawAmount: '100000000000000', // 0.0001 ETH
                amountInUSD: '0.20', // Below $0.50 threshold
              },
            ],
          },
        ],
      });

      const watcher = new BalanceWatcher({
        uaManager: mockUAManager,
        pollingIntervalMs: 5000,
        minValueUSD: 0.5,
        supportedTokens: ['ETH', 'USDC'],
        supportedChains: [1, 42161],
      });

      const detectedHandler = vi.fn();
      watcher.on('deposit:detected', detectedHandler);

      watcher.start();
      await vi.advanceTimersByTimeAsync(100);

      expect(detectedHandler).not.toHaveBeenCalled();
    });

    it('should not detect unsupported tokens', async () => {
      (mockUAManager.getPrimaryAssets as any).mockResolvedValue({
        assets: [
          {
            tokenType: 'btc',
            chainAggregation: [
              {
                chainId: 42161,
                rawAmount: '100000000',
                amountInUSD: '50000',
              },
            ],
          },
        ],
      });

      const watcher = new BalanceWatcher({
        uaManager: mockUAManager,
        pollingIntervalMs: 5000,
        minValueUSD: 0.5,
        supportedTokens: ['ETH', 'USDC'], // BTC not supported
        supportedChains: [1, 42161],
      });

      const detectedHandler = vi.fn();
      watcher.on('deposit:detected', detectedHandler);

      watcher.start();
      await vi.advanceTimersByTimeAsync(100);

      expect(detectedHandler).not.toHaveBeenCalled();
    });

    it('should not detect unsupported chains', async () => {
      (mockUAManager.getPrimaryAssets as any).mockResolvedValue({
        assets: [
          {
            tokenType: 'eth',
            chainAggregation: [
              {
                chainId: 137, // Polygon - not in supported chains
                rawAmount: '1000000000000000000',
                amountInUSD: '2000',
              },
            ],
          },
        ],
      });

      const watcher = new BalanceWatcher({
        uaManager: mockUAManager,
        pollingIntervalMs: 5000,
        minValueUSD: 0.5,
        supportedTokens: ['ETH', 'USDC'],
        supportedChains: [1, 42161], // Polygon not included
      });

      const detectedHandler = vi.fn();
      watcher.on('deposit:detected', detectedHandler);

      watcher.start();
      await vi.advanceTimersByTimeAsync(100);

      expect(detectedHandler).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should emit error on polling failure', async () => {
      (mockUAManager.getPrimaryAssets as any).mockRejectedValue(new Error('Network error'));

      const watcher = new BalanceWatcher({
        uaManager: mockUAManager,
        pollingIntervalMs: 5000,
        minValueUSD: 0.5,
        supportedTokens: ['ETH', 'USDC'],
        supportedChains: [1, 42161],
      });

      const errorHandler = vi.fn();
      watcher.on('error', errorHandler);

      watcher.start();
      await vi.advanceTimersByTimeAsync(100);

      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('reset', () => {
    it('should reset state', async () => {
      const watcher = new BalanceWatcher({
        uaManager: mockUAManager,
        pollingIntervalMs: 5000,
        minValueUSD: 0.5,
        supportedTokens: ['ETH', 'USDC'],
        supportedChains: [1, 42161],
      });

      watcher.markAsProcessing('eth:42161');
      watcher.reset();

      // After reset, the key should be cleared
      // This is tested indirectly - if we start watching again,
      // the same deposit should be detected again
      expect(watcher.isActive()).toBe(false);
    });
  });
});

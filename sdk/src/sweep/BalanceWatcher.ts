/**
 * BalanceWatcher - Polls for balance changes on deposit addresses
 * 
 * Detects new deposits by comparing snapshots of primary assets
 * and emits events when deposits are detected.
 */

import type { UAManager, PrimaryAssetsResponse } from '../universal-account';
import type { DetectedDeposit, TokenType } from '../core/types';
import { TypedEventEmitter } from '../core/EventEmitter';

export interface BalanceSnapshot {
  balances: Map<string, bigint>;
  usdValues: Map<string, number>;
  timestamp: number;
}

export interface BalanceWatcherConfig {
  uaManager: UAManager;
  pollingIntervalMs: number;
  minValueUSD: number;
  supportedTokens: string[];
  supportedChains: number[];
}

export type BalanceWatcherEvents = {
  'deposit:detected': (deposit: DetectedDeposit) => void;
  'error': (error: Error) => void;
  [key: string]: (...args: any[]) => void;
};

// Time after which a processing key is considered stale (5 minutes)
const PROCESSING_KEY_EXPIRY_MS = 5 * 60 * 1000;
// Maximum number of processing keys to prevent unbounded memory growth
const MAX_PROCESSING_KEYS = 100;

export class BalanceWatcher extends TypedEventEmitter<BalanceWatcherEvents> {
  private config: BalanceWatcherConfig;
  private lastSnapshot: BalanceSnapshot | null = null;
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private isWatching = false;
  // Store processing keys with timestamps for auto-expiration
  private processingKeys: Map<string, number> = new Map();
  private initialCheckDone = false;

  constructor(config: BalanceWatcherConfig) {
    super();
    this.config = config;
  }

  /**
   * Start watching for balance changes
   */
  start(): void {
    if (this.isWatching) {
      return;
    }

    this.isWatching = true;
    this.initialCheckDone = false;

    // Start polling
    this.pollingInterval = setInterval(() => {
      void this.poll();
    }, this.config.pollingIntervalMs);

    // Do initial poll immediately
    void this.poll();

    console.log('[BalanceWatcher] Started watching with interval:', this.config.pollingIntervalMs);
  }

  /**
   * Stop watching for balance changes
   */
  stop(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.isWatching = false;
    console.log('[BalanceWatcher] Stopped watching');
  }

  /**
   * Check if currently watching
   */
  isActive(): boolean {
    return this.isWatching;
  }

  /**
   * Mark a deposit as being processed (to avoid duplicate detection)
   */
  markAsProcessing(key: string): void {
    this.cleanupStaleProcessingKeys();
    this.processingKeys.set(key, Date.now());
  }

  /**
   * Clear a processed deposit key
   */
  clearProcessingKey(key: string): void {
    this.processingKeys.delete(key);
  }

  /**
   * Remove processing keys that are older than the expiry threshold
   * or if we've exceeded the maximum number of keys
   */
  private cleanupStaleProcessingKeys(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, timestamp] of this.processingKeys.entries()) {
      if (now - timestamp > PROCESSING_KEY_EXPIRY_MS) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.processingKeys.delete(key);
    }

    // If still over limit, remove oldest entries
    if (this.processingKeys.size > MAX_PROCESSING_KEYS) {
      const entries = Array.from(this.processingKeys.entries())
        .sort((a, b) => a[1] - b[1]); // Sort by timestamp ascending

      const toRemove = entries.slice(0, entries.length - MAX_PROCESSING_KEYS);
      for (const [key] of toRemove) {
        this.processingKeys.delete(key);
      }

      console.warn(`[BalanceWatcher] Cleaned up ${toRemove.length} stale processing keys`);
    }
  }

  /**
   * Get current balances without detecting changes
   */
  async getCurrentBalances(): Promise<DetectedDeposit[]> {
    const primaryAssets = await this.config.uaManager.getPrimaryAssets();
    const deposits: DetectedDeposit[] = [];

    for (const asset of primaryAssets.assets) {
      const tokenType = this.normalizeTokenType(asset.tokenType);
      if (!tokenType) continue;
      if (!this.config.supportedTokens.includes(tokenType.toUpperCase())) continue;

      const chainAgg = asset.chainAggregation || [];
      for (const chain of chainAgg) {
        const chainId = Number(chain.chainId);
        if (!this.config.supportedChains.includes(chainId)) continue;

        const rawAmount = this.parseBigInt(chain.rawAmount);
        const valueUSD = Number(chain.amountInUSD || 0);

        if (rawAmount > 0n && valueUSD >= this.config.minValueUSD) {
          deposits.push({
            id: `${tokenType}:${chainId}:${Date.now()}`,
            token: tokenType.toUpperCase() as TokenType,
            chainId,
            amount: rawAmount.toString(),
            amountUSD: valueUSD,
            rawAmount,
            detectedAt: Date.now(),
          });
        }
      }
    }

    return deposits;
  }

  /**
   * Reset the watcher state
   */
  reset(): void {
    this.lastSnapshot = null;
    this.processingKeys.clear();
    this.initialCheckDone = false;
  }

  /**
   * Poll for balance changes
   */
  private async poll(): Promise<void> {
    try {
      const primaryAssets = await this.config.uaManager.getPrimaryAssets();
      
      console.log('[BalanceWatcher] Raw primary assets:', JSON.stringify(primaryAssets, null, 2));
      
      const currentSnapshot = this.extractSnapshot(primaryAssets);
      
      console.log('[BalanceWatcher] Snapshot balances:', 
        Array.from(currentSnapshot.balances.entries()).map(([k, v]) => `${k}: ${v.toString()}`));

      // First poll - check for existing balances
      if (!this.initialCheckDone) {
        this.initialCheckDone = true;
        await this.checkExistingBalances(currentSnapshot);
        this.lastSnapshot = currentSnapshot;
        return;
      }

      // Subsequent polls - detect changes
      if (this.lastSnapshot) {
        this.cleanupStaleProcessingKeys();
        const deposits = this.detectChanges(this.lastSnapshot, currentSnapshot);
        for (const deposit of deposits) {
          const key = `${deposit.token}:${deposit.chainId}`;
          if (!this.processingKeys.has(key)) {
            this.processingKeys.set(key, Date.now());
            this.emit('deposit:detected', deposit);
          }
        }
      }

      this.lastSnapshot = currentSnapshot;
    } catch (error) {
      console.warn('[BalanceWatcher] Polling error:', error);
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Check for existing balances on first poll
   */
  private async checkExistingBalances(snapshot: BalanceSnapshot): Promise<void> {
    console.log('[BalanceWatcher] Checking for existing balances...');
    console.log('[BalanceWatcher] Config:', {
      supportedTokens: this.config.supportedTokens,
      supportedChains: this.config.supportedChains,
      minValueUSD: this.config.minValueUSD,
    });

    for (const [key, amount] of snapshot.balances.entries()) {
      const valueUSD = snapshot.usdValues.get(key) || 0;
      
      console.log(`[BalanceWatcher] Checking ${key}: amount=${amount}, valueUSD=${valueUSD}`);

      if (amount > 0n && valueUSD >= this.config.minValueUSD) {
        if (this.processingKeys.has(key)) {
          console.log(`[BalanceWatcher] ${key} already processing, skipping`);
          continue;
        }

        const [tokenType, chainIdStr] = key.split(':');
        const chainId = Number(chainIdStr);

        if (!this.config.supportedTokens.includes(tokenType.toUpperCase())) {
          console.log(`[BalanceWatcher] ${tokenType} not in supported tokens`);
          continue;
        }
        if (!this.config.supportedChains.includes(chainId)) {
          console.log(`[BalanceWatcher] Chain ${chainId} not in supported chains`);
          continue;
        }

        console.log(`[BalanceWatcher] Found existing ${tokenType} on chain ${chainId} ($${valueUSD.toFixed(2)})`);

        this.processingKeys.set(key, Date.now());
        this.emit('deposit:detected', {
          id: `${key}:${Date.now()}`,
          token: tokenType.toUpperCase() as TokenType,
          chainId,
          amount: amount.toString(),
          amountUSD: valueUSD,
          rawAmount: amount,
          detectedAt: Date.now(),
        });
      }
    }
  }

  /**
   * Extract a snapshot from primary assets response
   */
  private extractSnapshot(primaryAssets: PrimaryAssetsResponse): BalanceSnapshot {
    const balances = new Map<string, bigint>();
    const usdValues = new Map<string, number>();

    for (const asset of primaryAssets.assets) {
      const tokenType = this.normalizeTokenType(asset.tokenType);
      if (!tokenType) continue;

      const chainAgg = asset.chainAggregation || [];
      for (const chain of chainAgg) {
        // chainId is inside chain.token.chainId, not chain.chainId
        const chainId = Number(chain.token?.chainId || chain.chainId);
        if (!chainId) continue;

        const key = `${tokenType}:${chainId}`;
        const rawAmount = this.parseBigInt(chain.rawAmount);
        const valueUSD = Number(chain.amountInUSD || 0);

        balances.set(key, rawAmount);
        usdValues.set(key, valueUSD);
      }
    }

    return {
      balances,
      usdValues,
      timestamp: Date.now(),
    };
  }

  /**
   * Detect balance increases between snapshots
   */
  private detectChanges(prev: BalanceSnapshot, current: BalanceSnapshot): DetectedDeposit[] {
    const deposits: DetectedDeposit[] = [];

    for (const [key, currentAmount] of current.balances.entries()) {
      const prevAmount = prev.balances.get(key) || 0n;
      const valueUSD = current.usdValues.get(key) || 0;

      // Only detect increases above minimum value
      if (currentAmount > prevAmount && valueUSD >= this.config.minValueUSD) {
        const [tokenType, chainIdStr] = key.split(':');
        const chainId = Number(chainIdStr);

        if (!this.config.supportedTokens.includes(tokenType.toUpperCase())) continue;
        if (!this.config.supportedChains.includes(chainId)) continue;

        const deltaAmount = currentAmount - prevAmount;

        console.log(`[BalanceWatcher] Detected deposit: ${tokenType} on chain ${chainId}, delta: ${deltaAmount}`);

        deposits.push({
          id: `${key}:${Date.now()}`,
          token: tokenType.toUpperCase() as TokenType,
          chainId,
          amount: deltaAmount.toString(),
          amountUSD: valueUSD,
          rawAmount: deltaAmount,
          detectedAt: Date.now(),
        });
      }
    }

    return deposits;
  }

  /**
   * Normalize token type string
   */
  private normalizeTokenType(tokenType: string | undefined): string | null {
    if (!tokenType) return null;
    const normalized = tokenType.toLowerCase();
    if (['eth', 'usdc', 'usdt', 'btc', 'sol', 'bnb'].includes(normalized)) {
      return normalized;
    }
    return null;
  }

  /**
   * Parse a value to BigInt safely
   */
  private parseBigInt(value: string | number | bigint | undefined): bigint {
    if (value === undefined || value === null) return 0n;
    try {
      if (typeof value === 'bigint') return value;
      if (typeof value === 'number') return BigInt(Math.floor(value));
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
}

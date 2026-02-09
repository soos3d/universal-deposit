/**
 * Sweeper - Handles sweeping deposits to destination address
 * 
 * Implements multi-strategy sweep logic with fallback options:
 * 1. Try to sweep to destination chain (e.g., Arbitrum)
 * 2. Fall back to source chain if cross-chain fails
 * 3. Try different percentages (100%, 95%, 50%) to handle gas
 */

import type { UAManager } from '../universal-account';
import type { DetectedDeposit, SweepResult, AuthCoreProvider, TokenType } from '../core/types';
import { SweepError } from '../core/errors';
import { TOKEN_ADDRESSES, CHAIN, getTokenDecimals } from '../constants';

export interface SweeperConfig {
  uaManager: UAManager;
  authCoreProvider?: AuthCoreProvider;
  destination: {
    address: string;
    chainId: number;
  };
}

export interface SweepAttempt {
  chainId: number;
  tokenAddress?: string;
  label: string;
}

export class Sweeper {
  private config: SweeperConfig;
  private sweepQueue: Promise<void> = Promise.resolve();
  private sweeping = false;
  private pendingCount = 0;

  constructor(config: SweeperConfig) {
    this.config = config;
  }

  /**
   * Sweep a detected deposit to the destination.
   * Concurrent calls are queued and executed sequentially.
   */
  async sweep(deposit: DetectedDeposit): Promise<SweepResult> {
    this.pendingCount++;
    return new Promise<SweepResult>((resolve, reject) => {
      this.sweepQueue = this.sweepQueue
        .then(async () => {
          this.sweeping = true;
          try {
            console.log(`[Sweeper] Starting sweep: ${deposit.token} on chain ${deposit.chainId}`);
            const result = await this.executeSweep(deposit);
            resolve(result);
          } catch (error) {
            reject(error);
          } finally {
            this.sweeping = false;
            this.pendingCount--;
          }
        })
        .catch(() => {
          // Ensure queue chain is never broken.
          // Individual errors are forwarded via reject() above.
        });
    });
  }

  /**
   * Check if a sweep is currently in progress
   */
  isSweeping(): boolean {
    return this.sweeping || this.pendingCount > 0;
  }

  /**
   * Execute the sweep with multi-strategy fallback
   */
  private async executeSweep(deposit: DetectedDeposit): Promise<SweepResult> {
    const ua = this.config.uaManager.getUniversalAccount();
    const targetChainId = this.config.destination.chainId;
    const receiver = this.config.destination.address;

    // Percentages to try (100% first, then reduce for gas)
    const percentages = [100n, 95n, 50n];

    // Build list of sweep targets
    const targets = this.buildSweepTargets(deposit, targetChainId);

    if (targets.length === 0) {
      throw new SweepError(`No sweep targets available for ${deposit.token}`);
    }

    const rawAmount = deposit.rawAmount;

    for (const target of targets) {
      for (const pct of percentages) {
        // For source chain fallback, always use 100%
        const safePct = target.chainId === deposit.chainId ? 100n : pct;
        const tryAmount = (rawAmount * safePct) / 100n;

        // Skip if amount too small
        if (tryAmount < 1000n) continue;

        try {
          console.log(`[Sweeper] Attempting: ${target.label} (${safePct}%)`);

          // Format amount for SDK (human-readable)
          const decimals = this.getDecimals(deposit.token, deposit.chainId);
          const amountHuman = this.formatAmount(tryAmount, decimals);

          // Build transaction
          const tx = await this.buildTransaction(
            ua,
            deposit.token,
            target.chainId,
            target.tokenAddress,
            amountHuman,
            receiver
          );

          // Sign and send using Auth Core provider
          if (!this.config.authCoreProvider) {
            throw new SweepError('authCoreProvider is required for sweep operations');
          }
          const signature = await this.config.authCoreProvider.signMessage(tx.rootHash);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (ua as any).sendTransaction(tx, signature);

          console.log(`[Sweeper] Success! Swept to ${target.label}`);

          return {
            depositId: deposit.id,
            transactionId: tx.rootHash || `sweep-${Date.now()}`,
            explorerUrl: this.getExplorerUrl(target.chainId, tx.rootHash),
            status: 'success',
          };
        } catch (error) {
          console.warn(`[Sweeper] Failed attempt (${target.label}, ${safePct}%):`, error);
          // Continue to next attempt
        }
      }
    }

    // All attempts failed
    throw new SweepError('All sweep strategies failed');
  }

  /**
   * Build list of sweep targets in priority order
   */
  private buildSweepTargets(deposit: DetectedDeposit, targetChainId: number): SweepAttempt[] {
    const targets: SweepAttempt[] = [];
    const token = deposit.token.toLowerCase();
    const sourceChainId = deposit.chainId;

    const destConfig = TOKEN_ADDRESSES[targetChainId] || {};
    const sourceConfig = TOKEN_ADDRESSES[sourceChainId] || {};

    // 1. Primary target: Native asset on destination chain
    if (token === 'eth') {
      targets.push({
        chainId: targetChainId,
        tokenAddress: undefined,
        label: `${this.getChainName(targetChainId)} ETH`,
      });
    } else if (token === 'usdc' && destConfig.usdc) {
      targets.push({
        chainId: targetChainId,
        tokenAddress: destConfig.usdc,
        label: `${this.getChainName(targetChainId)} Native USDC`,
      });
    } else if (token === 'usdt' && destConfig.usdt) {
      targets.push({
        chainId: targetChainId,
        tokenAddress: destConfig.usdt,
        label: `${this.getChainName(targetChainId)} USDT`,
      });
    }

    // 2. Secondary target: Bridged asset (e.g., USDC.e) on destination
    if (token === 'usdc' && destConfig.usdc_e) {
      targets.push({
        chainId: targetChainId,
        tokenAddress: destConfig.usdc_e,
        label: `${this.getChainName(targetChainId)} Bridged USDC.e`,
      });
    }

    // 3. Fallback: Source chain (same chain transfer)
    if (token === 'eth') {
      targets.push({
        chainId: sourceChainId,
        tokenAddress: undefined,
        label: `${this.getChainName(sourceChainId)} Fallback`,
      });
    } else if (sourceConfig[token]) {
      targets.push({
        chainId: sourceChainId,
        tokenAddress: sourceConfig[token],
        label: `${this.getChainName(sourceChainId)} Fallback`,
      });
    }

    return targets;
  }

  /**
   * Build a transfer transaction
   */
  private async buildTransaction(
    ua: any,
    _token: TokenType,
    chainId: number,
    tokenAddress: string | undefined,
    amount: string,
    receiver: string
  ): Promise<any> {
    const tokenConfig = tokenAddress
      ? { chainId, address: tokenAddress }
      : { chainId, address: '0x0000000000000000000000000000000000000000' };

    return await ua.createTransferTransaction({
      token: tokenConfig,
      amount,
      receiver,
    });
  }

  /**
   * Get decimals for a token on a specific chain
   */
  private getDecimals(token: TokenType, chainId: number): number {
    return getTokenDecimals(token, chainId);
  }

  /**
   * Format amount from wei to human-readable
   */
  private formatAmount(amount: bigint, decimals: number): string {
    // Ensure decimals is a number
    const dec = Number(decimals);
    // Avoid ** operator which gets transpiled to Math.pow
    let divisor = 1n;
    for (let i = 0; i < dec; i++) {
      divisor = divisor * 10n;
    }
    const whole = amount / divisor;
    const fraction = amount % divisor;
    const fractionStr = fraction.toString().padStart(dec, '0');
    return `${whole}.${fractionStr}`;
  }

  /**
   * Get chain name for logging
   */
  private getChainName(chainId: number): string {
    const names: Record<number, string> = {
      [CHAIN.ETHEREUM]: 'Ethereum',
      [CHAIN.ARBITRUM]: 'Arbitrum',
      [CHAIN.BASE]: 'Base',
      [CHAIN.POLYGON]: 'Polygon',
      [CHAIN.BNB]: 'BNB Chain',
      [CHAIN.SOLANA]: 'Solana',
    };
    return names[chainId] || `Chain ${chainId}`;
  }

  /**
   * Get explorer URL for a transaction
   */
  private getExplorerUrl(chainId: number, txHash: string): string {
    const explorers: Record<number, string> = {
      [CHAIN.ETHEREUM]: 'https://etherscan.io/tx/',
      [CHAIN.ARBITRUM]: 'https://arbiscan.io/tx/',
      [CHAIN.BASE]: 'https://basescan.org/tx/',
      [CHAIN.POLYGON]: 'https://polygonscan.com/tx/',
      [CHAIN.BNB]: 'https://bscscan.com/tx/',
    };
    const base = explorers[chainId] || 'https://etherscan.io/tx/';
    return `${base}${txHash}`;
  }
}

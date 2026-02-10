/**
 * Sweeper - Handles sweeping deposits to destination address
 *
 * Uses createUniversalTransaction to convert any deposited token into USDC
 * and send it to the configured destination chain + address.
 *
 * Fallback order:
 * 1. USDC on destination chain via createUniversalTransaction
 * 2. USDC.e on destination chain via createUniversalTransaction
 * 3. Same-token transfer on source chain via createTransferTransaction
 *
 * Each target is attempted at 100%, 95%, 50% amounts to handle gas.
 */

import type { UAManager } from '../universal-account';
import type { DetectedDeposit, SweepResult, AuthCoreProvider, TokenType } from '../core/types';
import { SweepError } from '../core/errors';
import { TOKEN_ADDRESSES, CHAIN, getTokenDecimals } from '../constants';
import { encodeERC20Transfer, toSmallestUnit } from './erc20';

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
  /** When true, use createUniversalTransaction (any token -> USDC) */
  isUniversalTx: boolean;
  /** When set, use USD value for USDC amount (cross-token conversion) */
  targetAmountUSD?: number;
}

/** USDC has 6 decimals on all chains we target */
const USDC_DECIMALS = 6;

/** Matches SUPPORTED_TOKEN_TYPE.USDC from the UA SDK — inlined to avoid TS resolution issues */
const UA_TOKEN_USDC = 'usdc';

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ua = this.config.uaManager.getUniversalAccount() as any;
    const targetChainId = this.config.destination.chainId;
    const receiver = this.config.destination.address;

    const percentages = [100n, 95n, 50n];

    const targets = this.buildSweepTargets(deposit, targetChainId);

    if (targets.length === 0) {
      throw new SweepError(`No sweep targets available for ${deposit.token}`);
    }

    if (!this.config.authCoreProvider) {
      throw new SweepError('authCoreProvider is required for sweep operations');
    }

    for (const target of targets) {
      for (const pct of percentages) {
        // For source-chain fallback, always use 100%
        const safePct = target.chainId === deposit.chainId ? 100n : pct;

        const amountHuman = this.computeAmount(deposit, target, safePct);
        if (amountHuman === null) continue;

        try {
          console.log(`[Sweeper] Attempting: ${target.label} (${safePct}%)`);

          const tx = target.isUniversalTx
            ? await this.buildUniversalTransaction(ua, target.chainId, target.tokenAddress!, amountHuman, receiver)
            : await this.buildTransferTransaction(ua, deposit.token, target.chainId, target.tokenAddress, amountHuman, receiver);

          // Sign — if signing fails, abort all attempts (Auth Core issue)
          let signature: string;
          try {
            signature = await this.config.authCoreProvider.signMessage(tx.rootHash);
          } catch (signError) {
            const err = new SweepError(
              `Signing failed: ${signError instanceof Error ? signError.message : 'Unknown signing error'}`
            );
            err.code = 'SIGNING_FAILED';
            throw err;
          }

          await ua.sendTransaction(tx, signature);

          console.log(`[Sweeper] Success! Swept to ${target.label}`);

          return {
            depositId: deposit.id,
            transactionId: tx.rootHash || `sweep-${Date.now()}`,
            explorerUrl: this.getExplorerUrl(target.chainId, tx.rootHash),
            status: 'success',
          };
        } catch (error) {
          if (error instanceof SweepError && error.code === 'SIGNING_FAILED') {
            throw error;
          }
          console.warn(`[Sweeper] Failed attempt (${target.label}, ${safePct}%):`, error);
        }
      }
    }

    throw new SweepError('All sweep strategies failed');
  }

  /**
   * Compute the human-readable amount string for a sweep attempt.
   * Returns null when the resulting amount is too small.
   */
  private computeAmount(
    deposit: DetectedDeposit,
    target: SweepAttempt,
    pct: bigint
  ): string | null {
    if (target.isUniversalTx) {
      // Universal tx: amount is always in USDC terms
      const baseUSD = target.targetAmountUSD ?? deposit.amountUSD ?? 0;
      if (baseUSD <= 0) return null;
      const scaledUSD = baseUSD * Number(pct) / 100;
      if (scaledUSD < 0.001) return null;
      return scaledUSD.toFixed(USDC_DECIMALS);
    }

    // Fallback same-token transfer: use raw deposit amount
    const tryAmount = (deposit.rawAmount * pct) / 100n;
    if (tryAmount < 1000n) return null;
    const decimals = getTokenDecimals(deposit.token, deposit.chainId);
    return this.formatAmount(tryAmount, decimals);
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

    const isUsdcDeposit = token === 'usdc';

    // 1. Primary: USDC on destination chain via createUniversalTransaction
    if (destConfig.usdc) {
      targets.push({
        chainId: targetChainId,
        tokenAddress: destConfig.usdc,
        label: `${this.getChainName(targetChainId)} USDC`,
        isUniversalTx: true,
        targetAmountUSD: isUsdcDeposit ? undefined : deposit.amountUSD,
      });
    }

    // 2. Secondary: USDC.e (bridged) on destination
    if (destConfig.usdc_e) {
      targets.push({
        chainId: targetChainId,
        tokenAddress: destConfig.usdc_e,
        label: `${this.getChainName(targetChainId)} USDC.e`,
        isUniversalTx: true,
        targetAmountUSD: isUsdcDeposit ? undefined : deposit.amountUSD,
      });
    }

    // 3. Fallback: same-chain same-token transfer via createTransferTransaction
    const nativeEvmTokens = ['eth', 'bnb'];
    if (nativeEvmTokens.includes(token)) {
      targets.push({
        chainId: sourceChainId,
        tokenAddress: undefined,
        label: `${this.getChainName(sourceChainId)} Fallback`,
        isUniversalTx: false,
      });
    } else if (sourceConfig[token]) {
      targets.push({
        chainId: sourceChainId,
        tokenAddress: sourceConfig[token],
        label: `${this.getChainName(sourceChainId)} Fallback`,
        isUniversalTx: false,
      });
    }

    return targets;
  }

  /**
   * Build a universal transaction that converts any token -> USDC and
   * sends it via an ERC20 transfer call to the receiver.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async buildUniversalTransaction(
    ua: any,
    chainId: number,
    usdcAddress: string,
    amountHuman: string,
    receiver: string
  ): Promise<any> {
    const amountSmallest = toSmallestUnit(amountHuman, USDC_DECIMALS);

    return await ua.createUniversalTransaction({
      chainId,
      expectTokens: [
        {
          type: UA_TOKEN_USDC,
          amount: amountHuman,
        },
      ],
      transactions: [
        {
          to: usdcAddress,
          data: encodeERC20Transfer(receiver, amountSmallest),
        },
      ],
    });
  }

  /**
   * Build a simple same-token transfer (fallback for source-chain transfers)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async buildTransferTransaction(
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
   * Format amount from smallest-unit bigint to human-readable string
   */
  private formatAmount(amount: bigint, decimals: number): string {
    const dec = Number(decimals);
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

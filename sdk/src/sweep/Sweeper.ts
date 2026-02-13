/**
 * Sweeper - Handles sweeping deposits to destination address
 *
 * Uses createUniversalTransaction to convert any deposited token into USDC
 * and send it to the configured destination chain + address.
 *
 * Targets (in priority order):
 * 1. USDC on destination chain via createUniversalTransaction
 * 2. USDC.e on destination chain via createUniversalTransaction
 *
 * Strategy: "low probe + fixed LP buffer"
 * 1. Probe at $0.01 USDC to extract gas fee (fixed cost)
 * 2. Calculate optimal = (deposit - gasFee) / (1 + LP_FEE_BUFFER)
 * 3. Execute with optimal amount, retry at 90% if first attempt fails
 */

import type { UAManager } from '../universal-account';
import type { DetectedDeposit, SweepResult, AuthCoreProvider } from '../core/types';
import { SweepError } from '../core/errors';
import { TOKEN_ADDRESSES, CHAIN, getChainName } from '../constants';
import { encodeERC20Transfer, toSmallestUnit } from './erc20';
import { extractFeeBreakdown, calculateOptimalAmount } from './fee-math';

export interface SweeperConfig {
  uaManager: UAManager;
  authCoreProvider?: AuthCoreProvider;
  /** Called at sweep time to get the latest destination — ensures
   *  runtime destination changes are picked up even when a sweep
   *  was queued before the change. */
  getDestination: () => { address: string; chainId: number };
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

/** Retry multiplier when probe-calculated optimal fails */
const PROBE_RETRY_FACTOR = 0.90;

/** Low probe amount ($0.01 USDC) — always succeeds since any deposit covers it */
const PROBE_AMOUNT = '0.010000';

/** Errors that must always propagate (never retry) */
function isAbortError(error: unknown): boolean {
  return error instanceof SweepError &&
    (error.code === 'SIGNING_FAILED' || error.code === 'SEND_FAILED');
}

/**
 * Extract a readable message from any thrown value.
 * The UA SDK throws non-standard objects (e.g. `{ Da: "Insufficient balance..." }`)
 * that are NOT `Error` instances. Using `error instanceof Error ? error.message : ''`
 * would silently swallow these — this helper always produces a useful string.
 */
function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error !== null && typeof error === 'object') {
    // Handle UA SDK's non-standard error objects
    const obj = error as Record<string, unknown>;
    if (typeof obj.message === 'string') return obj.message;
    // Some SDK errors have a Da/Oa/etc prefix key with the real message
    const keys = Object.keys(obj);
    if (keys.length > 0 && typeof obj[keys[0]] === 'string') {
      return `${keys[0]}: ${obj[keys[0]]}`;
    }
  }
  return String(error);
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
   * Execute sweep: iterate targets and probe fees for each.
   */
  private async executeSweep(deposit: DetectedDeposit): Promise<SweepResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ua = this.config.uaManager.getUniversalAccount() as any;
    const { chainId: targetChainId, address: receiver } = this.config.getDestination();

    console.log(`[Sweeper] Destination: ${getChainName(targetChainId)} (${targetChainId}) -> ${receiver}`);
    console.log(`[Sweeper] Deposit: ${deposit.token} on chain ${deposit.chainId}, $${deposit.amountUSD?.toFixed(2) ?? '?'}`);

    const targets = this.buildSweepTargets(deposit, targetChainId);

    if (targets.length === 0) {
      throw new SweepError(`No sweep targets available for ${deposit.token} on destination chain ${targetChainId}`);
    }
    if (!this.config.authCoreProvider) {
      throw new SweepError('authCoreProvider is required for sweep operations');
    }

    for (const target of targets) {
      try {
        const result = await this.probeFeesAndExecute(ua, deposit, target, receiver);
        if (result) return result;
        console.log(`[Sweeper] Target ${target.label} returned null (fees too high), trying next`);
      } catch (error) {
        if (isAbortError(error)) throw error;
        console.warn(`[Sweeper] Target ${target.label} failed:`, formatError(error));
      }
    }

    throw new SweepError('All sweep strategies failed');
  }

  /**
   * Probe at $0.01 to extract gas fee, calculate optimal amount, execute.
   * Returns null if this target can't work (fees too high for deposit).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async probeFeesAndExecute(
    ua: any,
    deposit: DetectedDeposit,
    target: SweepAttempt,
    receiver: string
  ): Promise<SweepResult | null> {
    const baseUSD = target.targetAmountUSD ?? deposit.amountUSD ?? 0;
    if (baseUSD <= 0) return null;
    if (!target.tokenAddress) return null;

    // Step 1: Probe at $0.01 to extract gas fee (fixed cost, doesn't scale with amount)
    console.log(`[Sweeper] Step 1: Probing fees at $${PROBE_AMOUNT} for ${target.label} -> chain ${target.chainId}`);
    console.log(`[Sweeper]   deposit=$${baseUSD.toFixed(2)}, token=${target.tokenAddress}`);

    let probeTx;
    try {
      probeTx = await this.buildUniversalTransaction(
        ua, target.chainId, target.tokenAddress, PROBE_AMOUNT, receiver
      );
    } catch (probeError) {
      console.warn(`[Sweeper] Probe at $${PROBE_AMOUNT} FAILED:`, formatError(probeError));
      throw probeError;
    }

    const fees = extractFeeBreakdown(probeTx);
    console.log(`[Sweeper] Step 2: Fee extraction result:`, fees === null
      ? 'no fee data in response'
      : `gas=$${fees.gasFeeUSD.toFixed(6)} lp=$${fees.lpFeeUSD.toFixed(6)} total=$${fees.totalFeeUSD.toFixed(6)} freeGas=${fees.freeGasFee} freeService=${fees.freeServiceFee}`
    );

    // If no fee data or gasless, send at 100%
    if (fees === null || fees.totalFeeUSD === 0) {
      console.log(`[Sweeper] ${fees === null ? 'No fee data' : 'Gasless'} -> rebuilding at 100% ($${baseUSD.toFixed(USDC_DECIMALS)})`);
      const fullAmount = baseUSD.toFixed(USDC_DECIMALS);
      const fullTx = await this.buildUniversalTransaction(
        ua, target.chainId, target.tokenAddress, fullAmount, receiver
      );
      return await this.signAndSend(ua, fullTx, deposit, target);
    }

    // Step 3: Calculate optimal amount using gas fee + fixed LP buffer (1.1%)
    const optimalUSD = calculateOptimalAmount(baseUSD, fees.gasFeeUSD);
    if (optimalUSD === null) {
      console.log(`[Sweeper] Step 3: Deposit ($${baseUSD.toFixed(2)}) can't cover gas ($${fees.gasFeeUSD.toFixed(4)}) -> skipping target`);
      return null;
    }

    const efficiency = ((optimalUSD / baseUSD) * 100).toFixed(1);
    console.log(`[Sweeper] Step 3: Optimal=$${optimalUSD.toFixed(USDC_DECIMALS)} (${efficiency}% of $${baseUSD.toFixed(2)}, gas=$${fees.gasFeeUSD.toFixed(4)})`);

    // Step 4: Execute with optimal amount (retries at 90% internally)
    return await this.executeOptimal(ua, deposit, target, receiver, optimalUSD);
  }

  /**
   * Build a transaction at the optimal USD amount, sign and send.
   * Retries at 90% of optimal if the first attempt fails.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async executeOptimal(
    ua: any,
    deposit: DetectedDeposit,
    target: SweepAttempt,
    receiver: string,
    optimalUSD: number
  ): Promise<SweepResult> {
    const tokenAddr = target.tokenAddress!; // Caller guards with if (!target.tokenAddress)
    const optimalHuman = optimalUSD.toFixed(USDC_DECIMALS);
    console.log(`[Sweeper] Step 4a: Building tx at optimal $${optimalHuman}`);
    try {
      const optimalTx = await this.buildUniversalTransaction(
        ua, target.chainId, tokenAddr, optimalHuman, receiver
      );
      return await this.signAndSend(ua, optimalTx, deposit, target);
    } catch (executeError) {
      if (isAbortError(executeError)) throw executeError;

      // Retry at 90% of optimal
      const retryUSD = optimalUSD * PROBE_RETRY_FACTOR;
      console.warn(`[Sweeper] Step 4a FAILED: ${formatError(executeError)}`);
      console.log(`[Sweeper] Step 4b: Retrying at ${PROBE_RETRY_FACTOR * 100}% -> $${retryUSD.toFixed(USDC_DECIMALS)}`);
      if (retryUSD < 0.01) {
        console.log(`[Sweeper] Retry amount $${retryUSD.toFixed(USDC_DECIMALS)} below dust, giving up`);
        throw executeError;
      }

      const retryHuman = retryUSD.toFixed(USDC_DECIMALS);
      const retryTx = await this.buildUniversalTransaction(
        ua, target.chainId, tokenAddr, retryHuman, receiver
      );
      return await this.signAndSend(ua, retryTx, deposit, target);
    }
  }

  /**
   * Sign a transaction and send it.
   * Throws with code SIGNING_FAILED on sign errors (always abort).
   * Throws with code SEND_FAILED on send errors after signing (never retry — potential double-spend).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async signAndSend(ua: any, tx: any, deposit: DetectedDeposit, target: SweepAttempt): Promise<SweepResult> {
    if (!this.config.authCoreProvider) {
      throw new SweepError('authCoreProvider is required for signing');
    }

    let signature: string;
    try {
      signature = await this.config.authCoreProvider.signMessage(tx.rootHash);
    } catch (signError) {
      const err = new SweepError(
        `Signing failed: ${signError instanceof Error ? signError.message : 'Unknown signing error'}`,
        deposit.id,
        signError
      );
      err.code = 'SIGNING_FAILED';
      throw err;
    }

    try {
      await ua.sendTransaction(tx, signature);
    } catch (sendError) {
      // After signing, a send failure is ambiguous — the tx may have been submitted.
      // Mark as SEND_FAILED so callers do NOT retry (potential double-spend).
      const err = new SweepError(
        `Send failed after signing: ${sendError instanceof Error ? sendError.message : 'Unknown send error'}`,
        deposit.id,
        sendError
      );
      err.code = 'SEND_FAILED';
      throw err;
    }

    console.log(`[Sweeper] Success! Swept to ${target.label}`);

    return {
      depositId: deposit.id,
      transactionId: tx.rootHash || `sweep-${Date.now()}`,
      explorerUrl: this.getExplorerUrl(target.chainId, tx.rootHash),
      status: 'success',
    };
  }

  /**
   * Build list of sweep targets in priority order
   */
  private buildSweepTargets(deposit: DetectedDeposit, targetChainId: number): SweepAttempt[] {
    const targets: SweepAttempt[] = [];
    const token = deposit.token.toLowerCase();

    const destConfig = TOKEN_ADDRESSES[targetChainId] || {};

    const isUsdcDeposit = token === 'usdc';

    // 1. Primary: USDC on destination chain via createUniversalTransaction
    if (destConfig.usdc) {
      targets.push({
        chainId: targetChainId,
        tokenAddress: destConfig.usdc,
        label: `${getChainName(targetChainId)} USDC`,
        isUniversalTx: true,
        targetAmountUSD: isUsdcDeposit ? undefined : deposit.amountUSD,
      });
    }

    // 2. Secondary: USDC.e (bridged) on destination
    if (destConfig.usdc_e) {
      targets.push({
        chainId: targetChainId,
        tokenAddress: destConfig.usdc_e,
        label: `${getChainName(targetChainId)} USDC.e`,
        isUniversalTx: true,
        targetAmountUSD: isUsdcDeposit ? undefined : deposit.amountUSD,
      });
    }

    // No source-chain fallback: if USDC/USDC.e targets on the destination
    // chain both fail, the sweep should fail and retry rather than sending
    // funds to a chain the user didn't choose.

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

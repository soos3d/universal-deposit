/**
 * RefundService - Handles automatic refunds when sweep fails
 *
 * When a sweep to the destination fails, this service attempts to return
 * funds to the source chain. It can refund to:
 * 1. The original sender's address (if known from transaction history)
 * 2. The owner's address on the source chain (fallback)
 */

import type { UAManager } from '../universal-account';
import type {
  DetectedDeposit,
  AuthCoreProvider,
  TokenType,
  RefundConfig,
  RefundResult,
  RefundReason,
  DepositOrigin,
  UATransaction,
  Logger,
} from '../core/types';
import { RefundError } from '../core/errors';
import { TOKEN_ADDRESSES, CHAIN, getTokenDecimals, getAddressType, getChainName, isValidEvmAddress, isValidSolanaAddress } from '../constants';

/**
 * Convert a raw BigInt amount string to a human-readable decimal string.
 * E.g. rawToHuman("1000000", 6) => "1.000000"
 */
function rawToHuman(raw: string, decimals: number): string {
  const padded = raw.padStart(decimals + 1, '0');
  const whole = padded.slice(0, padded.length - decimals);
  const fraction = padded.slice(padded.length - decimals);
  return `${whole}.${fraction}`;
}

const NOOP_LOGGER: Logger = {
  log: () => {},
  warn: () => {},
  error: () => {},
};

export interface RefundServiceConfig {
  uaManager: UAManager;
  authCoreProvider?: AuthCoreProvider;
  ownerAddress: string;
  refundConfig: Required<RefundConfig>;
  logger?: Logger;
}

export interface RefundEligibility {
  eligible: boolean;
  reason?: string;
  refundAddress?: string;
  isOriginalSender?: boolean;
}

/**
 * Default refund configuration values
 */
export const DEFAULT_REFUND_CONFIG: Required<RefundConfig> = {
  enabled: false, // Disabled by default - experimental feature
  delayMs: 5000,
  maxAttempts: 2,
  refundToSender: true,
};

export class RefundService {
  private config: RefundServiceConfig;
  private readonly logger: Logger;
  private refundLock = false;

  constructor(config: RefundServiceConfig) {
    this.config = config;
    this.logger = config.logger ?? NOOP_LOGGER;
  }

  /**
   * Check if refund is currently in progress
   */
  isRefunding(): boolean {
    return this.refundLock;
  }

  /**
   * Look up the original sender for a deposit from transaction history
   */
  async findDepositOrigin(deposit: DetectedDeposit): Promise<DepositOrigin | null> {
    try {
      const transactions = await this.config.uaManager.getTransactions(1, 50);

      // Find matching incoming transaction
      const match = transactions.find((tx: UATransaction) => {
        // Must be an incoming transaction
        const isIncoming = tx.tag === 'receive' || tx.change?.amount?.startsWith('+');
        if (!isIncoming) return false;

        // Match by chain
        const txChainId = tx.targetToken?.chainId || tx.fromChains?.[0];
        if (txChainId !== deposit.chainId) return false;

        // Match by token symbol
        const txSymbol = tx.targetToken?.symbol?.toUpperCase();
        if (txSymbol !== deposit.token) return false;

        // Match by amount (approximate — tx amount is human-readable, deposit may use raw or human format)
        const txAmount = parseFloat(tx.change?.amount?.replace(/^[+-]/, '') || '0');
        // Convert rawAmount (BigInt) to human-readable for comparison
        const decimals = getTokenDecimals(deposit.token, deposit.chainId);
        const depositHuman = deposit.rawAmount !== undefined
          ? parseFloat(rawToHuman(deposit.rawAmount.toString(), decimals))
          : parseFloat(deposit.amount);
        // Use 1% tolerance to account for formatting/rounding differences
        if (depositHuman === 0 || Math.abs(txAmount - depositHuman) / depositHuman > 0.01) return false;

        return true;
      });

      if (!match || !match.change?.from) {
        return null;
      }

      return {
        senderAddress: match.change.from,
        chainId: match.targetToken?.chainId || match.fromChains?.[0] || deposit.chainId,
        transactionId: match.transactionId,
      };
    } catch (error) {
      this.logger.warn('[RefundService] Failed to find deposit origin:', error);
      return null;
    }
  }

  /**
   * Check if a deposit can be refunded
   */
  async checkRefundEligibility(deposit: DetectedDeposit): Promise<RefundEligibility> {
    const sourceChainId = deposit.chainId;
    const sourceAddressType = getAddressType(sourceChainId);

    if (!sourceAddressType) {
      return {
        eligible: false,
        reason: `Unknown chain: ${sourceChainId}`,
      };
    }

    // Try to find original sender if refundToSender is enabled
    let refundAddress: string;
    let isOriginalSender = false;

    if (this.config.refundConfig.refundToSender) {
      // Check if deposit already has origin info
      let origin: DepositOrigin | null | undefined = deposit.origin;

      // If not, try to look it up
      if (!origin) {
        origin = await this.findDepositOrigin(deposit);
      }

      if (origin?.senderAddress) {
        // Validate sender address matches chain type
        const senderAddressType = this.detectAddressType(origin.senderAddress);

        if (senderAddressType === sourceAddressType) {
          refundAddress = origin.senderAddress;
          isOriginalSender = true;
        } else {
          this.logger.warn(
            `[RefundService] Sender address type (${senderAddressType}) doesn't match source chain type (${sourceAddressType}). Using owner address.`
          );
        }
      }
    }

    // Fall back to owner address if no valid sender found
    if (!refundAddress!) {
      const ownerAddressType = this.detectAddressType(this.config.ownerAddress);

      if (ownerAddressType !== sourceAddressType) {
        return {
          eligible: false,
          reason: `Address type mismatch: owner address is ${ownerAddressType}, but source chain ${getChainName(sourceChainId)} requires ${sourceAddressType}`,
        };
      }

      refundAddress = this.config.ownerAddress;
      isOriginalSender = false;
    }

    return {
      eligible: true,
      refundAddress,
      isOriginalSender,
    };
  }

  /**
   * Attempt to refund a deposit to the source chain
   */
  async refund(deposit: DetectedDeposit, reason: RefundReason): Promise<RefundResult> {
    if (this.refundLock) {
      throw new RefundError('Refund already in progress', deposit.id, deposit.chainId);
    }

    this.refundLock = true;

    try {
      this.logger.log(`[RefundService] Starting refund: ${deposit.token} on chain ${deposit.chainId}, reason: ${reason}`);

      // Check eligibility
      const eligibility = await this.checkRefundEligibility(deposit);

      if (!eligibility.eligible) {
        return {
          depositId: deposit.id,
          token: deposit.token,
          sourceChainId: deposit.chainId,
          amount: deposit.amount,
          amountUSD: deposit.amountUSD,
          status: 'skipped',
          reason,
          error: eligibility.reason,
        };
      }

      const refundAddress = eligibility.refundAddress!;
      const isOriginalSender = eligibility.isOriginalSender || false;

      const truncAddr = refundAddress.length > 12 ? `${refundAddress.slice(0, 6)}...${refundAddress.slice(-4)}` : refundAddress;
      this.logger.log(
        `[RefundService] Refunding to ${isOriginalSender ? 'original sender' : 'owner'}: ${truncAddr}`
      );

      // Execute refund with retry logic
      const result = await this.executeRefund(deposit, refundAddress, reason);

      return {
        ...result,
        refundedTo: refundAddress,
        refundedToSender: isOriginalSender,
      };
    } finally {
      this.refundLock = false;
    }
  }

  /**
   * Execute the refund transaction with percentage fallback
   */
  private async executeRefund(
    deposit: DetectedDeposit,
    refundAddress: string,
    reason: RefundReason
  ): Promise<RefundResult> {
    const ua = this.config.uaManager.getUniversalAccount();
    const sourceChainId = deposit.chainId;

    // Percentages to try (100% first, then reduce for gas)
    const percentages = [100n, 95n, 50n];
    const rawAmount = deposit.rawAmount;

    for (const pct of percentages) {
      const tryAmount = (rawAmount * pct) / 100n;

      // Skip if amount too small
      if (tryAmount < 1000n) continue;

      try {
        this.logger.log(`[RefundService] Attempting refund at ${pct}%`);

        // Format amount for SDK
        const decimals = this.getDecimals(deposit.token, sourceChainId);
        const amountHuman = this.formatAmount(tryAmount, decimals);

        // Build refund transaction (same chain transfer back to source)
        const tx = await this.buildRefundTransaction(
          ua,
          deposit.token,
          sourceChainId,
          amountHuman,
          refundAddress
        );

        // Sign and send
        if (!this.config.authCoreProvider) {
          throw new RefundError(
            'authCoreProvider is required for refund operations',
            deposit.id,
            sourceChainId
          );
        }

        const signature = await this.config.authCoreProvider.signMessage(tx.rootHash);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (ua as any).sendTransaction(tx, signature);

        const truncRefund = refundAddress.length > 12 ? `${refundAddress.slice(0, 6)}...${refundAddress.slice(-4)}` : refundAddress;
        this.logger.log(`[RefundService] Success! Refunded ${pct}% to ${truncRefund}`);

        return {
          depositId: deposit.id,
          token: deposit.token,
          sourceChainId,
          amount: amountHuman,
          amountUSD: deposit.amountUSD * (Number(pct) / 100),
          status: 'success',
          txHash: tx.rootHash,
          reason,
        };
      } catch (error) {
        this.logger.warn(`[RefundService] Failed refund attempt (${pct}%):`, error);
        // Continue to next percentage
      }
    }

    // All attempts failed
    throw new RefundError(
      'All refund strategies failed',
      deposit.id,
      sourceChainId
    );
  }

  /**
   * Build a refund transaction (transfer to source chain)
   */
  private async buildRefundTransaction(
    ua: any,
    token: TokenType,
    chainId: number,
    amount: string,
    receiver: string
  ): Promise<any> {
    const tokenLower = token.toLowerCase();
    const chainConfig = TOKEN_ADDRESSES[chainId] || {};

    // Determine token address
    let tokenAddress: string | undefined;

    if (tokenLower === 'eth') {
      tokenAddress = undefined; // Native ETH
    } else if (tokenLower === 'sol' && chainId === CHAIN.SOLANA) {
      tokenAddress = undefined; // Native SOL
    } else if (chainConfig[tokenLower]) {
      tokenAddress = chainConfig[tokenLower];
    }

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
   * Detect address type from address format
   */
  private detectAddressType(address: string): 'evm' | 'solana' | null {
    if (isValidEvmAddress(address)) {
      return 'evm';
    }
    if (isValidSolanaAddress(address)) {
      return 'solana';
    }
    return null;
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
}

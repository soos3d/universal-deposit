/**
 * UAManager - Manages Universal Account operations
 * 
 * Wraps @particle-network/universal-account-sdk to provide:
 * - UA initialization from intermediary address
 * - Deposit address retrieval (EVM + Solana)
 * - Primary asset queries
 */

import { UniversalAccount } from '@particle-network/universal-account-sdk';
import { UniversalAccountError } from '../core/errors';
import type {
  DepositAddresses,
  IntermediarySession,
  UATransaction,
  TokenTransactionFilter,
  TokenTransactionsResponse,
  TransactionsResponse,
  Logger,
} from '../core/types';
import { TransactionCache } from './TransactionCache';
import {
  DEFAULT_PROJECT_ID,
  DEFAULT_CLIENT_KEY,
  DEFAULT_APP_ID,
} from '../constants';

const NOOP_LOGGER: Logger = {
  log: () => {},
  warn: () => {},
  error: () => {},
};

export interface UAManagerConfig {
  ownerAddress: string;
  session: IntermediarySession;
  /** Optional project ID override for UA operations. Defaults to SDK built-in. */
  projectId?: string;
  logger?: Logger;
}

export interface SmartAccountOptions {
  evmSmartAccount: string;
  solanaSmartAccount: string;
}

interface ChainAggregationItem {
  token?: {
    chainId: number;
    [key: string]: unknown;
  };
  chainId?: number;
  rawAmount: string | number;
  amountInUSD: string | number;
}

export interface PrimaryAsset {
  tokenType: string;
  chainAggregation: ChainAggregationItem[];
}

export interface PrimaryAssetsResponse {
  assets: PrimaryAsset[];
}

export class UAManager {
  private ua: UniversalAccount | null = null;
  private depositAddresses: DepositAddresses | null = null;
  private config: UAManagerConfig;
  private readonly logger: Logger;
  private initialized = false;
  private readonly txCache = new TransactionCache<TransactionsResponse>();
  private readonly tokenTxCache = new TransactionCache<TokenTransactionsResponse>();
  private readonly singleTxCache = new TransactionCache<UATransaction>();

  constructor(config: UAManagerConfig) {
    this.config = config;
    this.logger = config.logger ?? NOOP_LOGGER;
  }

  /**
   * Initialize the Universal Account
   * Must be called before other operations
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      this.ua = new UniversalAccount({
        projectId: this.config.projectId ?? DEFAULT_PROJECT_ID,
        projectClientKey: DEFAULT_CLIENT_KEY,
        projectAppUuid: DEFAULT_APP_ID,
        ownerAddress: this.config.session.intermediaryAddress,
        tradeConfig: {
          slippageBps: 100,
          universalGas: true,
        },
      });

      // Fetch smart account addresses
      const options = await this.getSmartAccountOptions();
      
      this.depositAddresses = {
        evm: options.evmSmartAccount,
        solana: options.solanaSmartAccount,
      };

      this.initialized = true;
    } catch (error) {
      throw new UniversalAccountError(
        `Failed to initialize Universal Account: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  /**
   * Get deposit addresses for EVM and Solana
   */
  getDepositAddresses(): DepositAddresses {
    if (!this.depositAddresses) {
      throw new UniversalAccountError('UAManager not initialized. Call initialize() first.');
    }
    return this.depositAddresses;
  }

  /**
   * Get the underlying Universal Account instance
   * For advanced operations
   */
  getUniversalAccount(): UniversalAccount {
    if (!this.ua) {
      throw new UniversalAccountError('UAManager not initialized. Call initialize() first.');
    }
    return this.ua;
  }

  /**
   * Get primary assets (balances) from the UA
   */
  async getPrimaryAssets(): Promise<PrimaryAssetsResponse> {
    if (!this.ua) {
      throw new UniversalAccountError('UAManager not initialized. Call initialize() first.');
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (this.ua as any).getPrimaryAssets();
      return {
        assets: response?.assets || [],
      };
    } catch (error) {
      throw new UniversalAccountError(
        `Failed to get primary assets: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  /**
   * Check if the manager is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get transaction history from the Universal Account
   * @param page - Page number (1-indexed)
   * @param pageSize - Number of transactions per page
   * @returns Paginated response with transactions
   */
  async getTransactions(page: number = 1, pageSize: number = 10): Promise<TransactionsResponse> {
    if (!this.ua) {
      throw new UniversalAccountError('UAManager not initialized. Call initialize() first.');
    }

    const cacheKey = `page:${page}:${pageSize}`;
    const cached = this.txCache.get(cacheKey);
    if (cached) return cached;

    try {
      const transactions = await this.fetchTransactionsRaw(page, pageSize);
      const result: TransactionsResponse = { transactions, page, pageSize };
      this.txCache.set(cacheKey, result);
      return result;
    } catch (error) {
      throw new UniversalAccountError(
        `Failed to get transactions: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  /**
   * Get transactions filtered by token and chain (cursor-based pagination)
   * @param filter - Token contract address and chain ID
   * @param pageToken - Cursor for next page (from previous response)
   * @returns Cursor-paginated response with transactions
   */
  async getTokenTransactions(
    filter: TokenTransactionFilter,
    pageToken?: string,
  ): Promise<TokenTransactionsResponse> {
    if (!this.ua) {
      throw new UniversalAccountError('UAManager not initialized. Call initialize() first.');
    }

    const cacheKey = `token:${filter.address}:${filter.chainId}:${pageToken ?? 'first'}`;
    const cached = this.tokenTxCache.get(cacheKey);
    if (cached) return cached;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (this.ua as any).getTokenTransactions(filter, pageToken);

      const transactions = this.normalizeTransactionList(response);
      const nextPageToken: string | undefined =
        response?.nextPageToken ?? response?.result?.nextPageToken ?? undefined;

      const result: TokenTransactionsResponse = { transactions, nextPageToken };
      this.tokenTxCache.set(cacheKey, result);
      return result;
    } catch (error) {
      throw new UniversalAccountError(
        `Failed to get token transactions: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  /**
   * Get a single transaction by ID
   * @param transactionId - The transaction ID to look up
   * @returns The transaction record
   */
  async getTransaction(transactionId: string): Promise<UATransaction> {
    if (!this.ua) {
      throw new UniversalAccountError('UAManager not initialized. Call initialize() first.');
    }

    const cached = this.singleTxCache.get(transactionId);
    if (cached) return cached;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (this.ua as any).getTransaction(transactionId);

      // Unwrap possible envelope formats
      const tx: UATransaction =
        response?.result?.data ?? response?.data ?? response;

      this.singleTxCache.set(transactionId, tx);
      return tx;
    } catch (error) {
      throw new UniversalAccountError(
        `Failed to get transaction ${transactionId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  /** Invalidate all transaction caches (e.g. after a new sweep). */
  invalidateTransactionCache(): void {
    this.txCache.invalidate();
    this.tokenTxCache.invalidate();
    this.singleTxCache.invalidate();
  }

  /**
   * Raw fetch + normalization for page-based getTransactions
   */
  private async fetchTransactionsRaw(page: number, pageSize: number): Promise<UATransaction[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (this.ua as any).getTransactions(page, pageSize);
    return this.normalizeTransactionList(response);
  }

  /**
   * Normalize various response shapes into a flat UATransaction[]
   */
  private normalizeTransactionList(response: unknown): UATransaction[] {
    if (Array.isArray(response)) return response;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = response as any;
    if (r?.result?.data && Array.isArray(r.result.data)) return r.result.data;
    if (r?.data && Array.isArray(r.data)) return r.data;
    if (r?.transactions && Array.isArray(r.transactions)) return r.transactions;

    this.logger.warn('[UAManager] Unexpected transaction response format:', response);
    return [];
  }

  /**
   * Get smart account options from the UA SDK
   */
  private async getSmartAccountOptions(): Promise<SmartAccountOptions> {
    if (!this.ua) {
      throw new UniversalAccountError('UA instance not created');
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const options: any = await this.ua.getSmartAccountOptions();

      const evmAddress = options?.evmSmartAccount ?? options?.smartAccountAddress;
      const solanaAddress = options?.solanaSmartAccount ?? options?.solanaSmartAccountAddress;

      if (!evmAddress) {
        throw new UniversalAccountError('Failed to get EVM smart account address');
      }

      if (!solanaAddress) {
        throw new UniversalAccountError('Failed to get Solana smart account address');
      }

      return {
        evmSmartAccount: evmAddress,
        solanaSmartAccount: solanaAddress,
      };
    } catch (error) {
      if (error instanceof UniversalAccountError) {
        throw error;
      }
      throw new UniversalAccountError(
        `Failed to get smart account options: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.ua = null;
    this.depositAddresses = null;
    this.initialized = false;
    this.invalidateTransactionCache();
  }
}

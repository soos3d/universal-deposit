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
import type { DepositAddresses, IntermediarySession, UATransaction, Logger } from '../core/types';
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
   * @returns Array of transactions ordered by most recent
   */
  async getTransactions(page: number = 1, pageSize: number = 10): Promise<UATransaction[]> {
    if (!this.ua) {
      throw new UniversalAccountError('UAManager not initialized. Call initialize() first.');
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (this.ua as any).getTransactions(page, pageSize);

      // Handle different response formats from the UA SDK
      // Response could be: array, { result: { data: [] } }, { data: [] }, etc.
      if (Array.isArray(response)) {
        return response;
      }
      // JSON-RPC wrapped response: { result: { data: [...] } }
      if (response?.result?.data && Array.isArray(response.result.data)) {
        return response.result.data;
      }
      if (response?.data && Array.isArray(response.data)) {
        return response.data;
      }
      if (response?.transactions && Array.isArray(response.transactions)) {
        return response.transactions;
      }

      this.logger.warn('[UAManager] Unexpected getTransactions response format:', response);
      return [];
    } catch (error) {
      throw new UniversalAccountError(
        `Failed to get transactions: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
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
  }
}

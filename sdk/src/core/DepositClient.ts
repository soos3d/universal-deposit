/**
 * DepositClient - Main entry point for the Deposit SDK
 */

import { TypedEventEmitter } from './EventEmitter';
import { ConfigurationError, RefundError } from './errors';
import type {
  DepositClientConfig,
  DepositEvents,
  DepositAddresses,
  DetectedDeposit,
  SweepResult,
  EOABalance,
  ClientStatus,
  IntermediarySession,
  RecoveryResult,
  RefundResult,
  RefundConfig,
  RefundReason,
  TokenType,
} from './types';
import { RefundService, DEFAULT_REFUND_CONFIG } from '../refund';
import {
  DEFAULT_JWT_SERVICE_URL,
  DEFAULT_DESTINATION_CHAIN_ID,
  DEFAULT_MIN_VALUE_USD,
  DEFAULT_POLLING_INTERVAL_MS,
  DEFAULT_SUPPORTED_CHAINS,
  DEFAULT_PROJECT_ID,
  DEFAULT_CLIENT_KEY,
  DEFAULT_APP_ID,
  isValidDestinationChain,
  getChainName,
  getAddressType,
  isValidEvmAddress,
  isValidSolanaAddress,
} from '../constants';
import { DEFAULT_SUPPORTED_TOKENS } from '../constants/tokens';
import { IntermediaryService } from '../intermediary';
import { UAManager } from '../universal-account';
import { BalanceWatcher, Sweeper } from '../sweep';

export interface ResolvedConfig {
  projectId: string;
  clientKey: string;
  appId: string;
  ownerAddress: string;
  intermediaryAddress: string;
  authCoreProvider: DepositClientConfig['authCoreProvider'];
  signer: DepositClientConfig['signer'];
  destination: {
    address: string;
    chainId: number;
  };
  supportedTokens: string[];
  supportedChains: number[];
  autoSweep: boolean;
  minValueUSD: number;
  pollingIntervalMs: number;
  jwtServiceUrl: string;
  refund: Required<RefundConfig>;
}

export class DepositClient extends TypedEventEmitter<DepositEvents> {
  private config: ResolvedConfig;
  private status: ClientStatus = 'idle';
  private depositAddresses: DepositAddresses | null = null;
  private pendingDeposits: Map<string, DetectedDeposit> = new Map();
  private sweepRetries: Map<string, number> = new Map();
  private originalDepositIds: Map<string, string> = new Map();
  private static readonly MAX_SWEEP_RETRIES = 3;

  // Services
  private intermediaryService: IntermediaryService;
  private intermediarySession: IntermediarySession | null = null;
  private uaManager: UAManager | null = null;
  private balanceWatcher: BalanceWatcher | null = null;
  private sweeper: Sweeper | null = null;
  private refundService: RefundService | null = null;

  // Refund tracking
  private refundAttempts: Map<string, number> = new Map();

  constructor(config: DepositClientConfig) {
    super();
    this.config = this.validateAndResolveConfig(config);
    
    // Initialize IntermediaryService
    this.intermediaryService = new IntermediaryService({
      projectId: this.config.projectId,
      clientKey: this.config.clientKey,
      appId: this.config.appId,
      jwtServiceUrl: this.config.jwtServiceUrl,
    });
  }

  // ============================================
  // Configuration Validation
  // ============================================

  private validateAndResolveConfig(config: DepositClientConfig): ResolvedConfig {
    // Required fields
    if (!config.ownerAddress?.trim()) {
      throw new ConfigurationError('ownerAddress is required');
    }

    if (!config.intermediaryAddress?.trim()) {
      throw new ConfigurationError('intermediaryAddress is required (from useEthereum().address)');
    }

    // Validate address format (basic check)
    if (!this.isValidAddress(config.ownerAddress)) {
      throw new ConfigurationError('ownerAddress must be a valid EVM address');
    }

    if (!this.isValidAddress(config.intermediaryAddress)) {
      throw new ConfigurationError('intermediaryAddress must be a valid EVM address');
    }

    // Validate destination configuration
    const destinationChainId = config.destination?.chainId ?? DEFAULT_DESTINATION_CHAIN_ID;
    const destinationAddress = config.destination?.address?.trim() || config.ownerAddress.trim();

    this.validateDestination(destinationChainId, destinationAddress, config.ownerAddress);

    return {
      // JWT service uses baked-in credentials (internal to SDK)
      projectId: DEFAULT_PROJECT_ID,
      clientKey: DEFAULT_CLIENT_KEY,
      appId: DEFAULT_APP_ID,
      ownerAddress: config.ownerAddress.trim().toLowerCase(),
      intermediaryAddress: config.intermediaryAddress.trim().toLowerCase(),
      authCoreProvider: config.authCoreProvider,
      signer: config.signer,
      destination: {
        address: config.destination?.address?.trim().toLowerCase() || config.ownerAddress.trim().toLowerCase(),
        chainId: config.destination?.chainId ?? DEFAULT_DESTINATION_CHAIN_ID,
      },
      supportedTokens: config.supportedTokens ?? [...DEFAULT_SUPPORTED_TOKENS],
      supportedChains: config.supportedChains ?? DEFAULT_SUPPORTED_CHAINS,
      autoSweep: config.autoSweep ?? true,
      minValueUSD: config.minValueUSD ?? DEFAULT_MIN_VALUE_USD,
      pollingIntervalMs: config.pollingIntervalMs ?? DEFAULT_POLLING_INTERVAL_MS,
      jwtServiceUrl: config.jwtServiceUrl ?? DEFAULT_JWT_SERVICE_URL,
      refund: {
        enabled: config.refund?.enabled ?? DEFAULT_REFUND_CONFIG.enabled,
        delayMs: config.refund?.delayMs ?? DEFAULT_REFUND_CONFIG.delayMs,
        maxAttempts: config.refund?.maxAttempts ?? DEFAULT_REFUND_CONFIG.maxAttempts,
        refundToSender: config.refund?.refundToSender ?? DEFAULT_REFUND_CONFIG.refundToSender,
      },
    };
  }

  private isValidAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  /**
   * Validate destination chain and address configuration
   */
  private validateDestination(chainId: number, address: string, ownerAddress: string): void {
    // Validate chain is supported
    if (!isValidDestinationChain(chainId)) {
      throw new ConfigurationError(
        `Invalid destination chain ID: ${chainId}. Use a chain from the CHAIN constant.`
      );
    }

    // Get address type for the destination chain
    const addressType = getAddressType(chainId);

    // Validate address format based on chain type
    if (addressType === 'solana') {
      if (!isValidSolanaAddress(address)) {
        throw new ConfigurationError(
          `Invalid Solana address format for destination on ${getChainName(chainId)}: ${address}`
        );
      }
    } else {
      if (!isValidEvmAddress(address)) {
        throw new ConfigurationError(
          `Invalid EVM address format for destination on ${getChainName(chainId)}: ${address}`
        );
      }
    }

    // Log warning if destination address differs from owner
    if (address.toLowerCase() !== ownerAddress.toLowerCase()) {
      console.warn(
        `[DepositSDK] ⚠️ Destination address (${address}) differs from owner address (${ownerAddress}). ` +
        `Funds will be sent to the custom destination address on ${getChainName(chainId)}.`
      );
    }

    console.log(
      `[DepositSDK] Destination configured: ${getChainName(chainId)} (${chainId}) → ${address}`
    );
  }

  // ============================================
  // Lifecycle
  // ============================================

  async initialize(): Promise<void> {
    if (this.status !== 'idle') {
      throw new ConfigurationError('Client already initialized');
    }

    this.setStatus('initializing');

    try {
      // Use the intermediary address provided by the consumer
      // This address comes from useEthereum().address after JWT connection
      console.log('[DepositSDK] Using intermediary address:', this.config.intermediaryAddress);

      // Create a synthetic session with the provided intermediary address
      // No need to fetch JWT since the consumer already connected Auth Core
      this.intermediarySession = {
        jwt: '', // Not needed - consumer already connected
        intermediaryAddress: this.config.intermediaryAddress,
        expiresAt: Math.floor(Date.now() / 1000) + 3600, // 1 hour placeholder
      };

      // Initialize UAManager with the intermediary address
      this.uaManager = new UAManager({
        ownerAddress: this.config.ownerAddress,
        session: this.intermediarySession,
      });
      await this.uaManager.initialize();

      // Get deposit addresses
      this.depositAddresses = this.uaManager.getDepositAddresses();

      console.log('[DepositSDK] Deposit addresses:', this.depositAddresses);

      // Phase 4: Initialize BalanceWatcher and Sweeper
      this.balanceWatcher = new BalanceWatcher({
        uaManager: this.uaManager,
        pollingIntervalMs: this.config.pollingIntervalMs,
        minValueUSD: this.config.minValueUSD,
        supportedTokens: this.config.supportedTokens,
        supportedChains: this.config.supportedChains,
      });

      this.sweeper = new Sweeper({
        uaManager: this.uaManager,
        authCoreProvider: this.config.authCoreProvider,
        destination: this.config.destination,
      });

      // Initialize RefundService if enabled
      if (this.config.refund.enabled) {
        this.refundService = new RefundService({
          uaManager: this.uaManager,
          authCoreProvider: this.config.authCoreProvider,
          ownerAddress: this.config.ownerAddress,
          refundConfig: this.config.refund,
        });
        console.log('[DepositSDK] Auto-refund enabled');
      }

      // Wire up balance watcher events
      this.balanceWatcher.on('deposit:detected', (deposit) => {
        this.handleDepositDetected(deposit);
      });

      this.balanceWatcher.on('deposit:below_threshold', (deposit) => {
        this.emit('deposit:below_threshold', deposit);
      });

      this.balanceWatcher.on('error', (error) => {
        this.emit('deposit:error', error);
      });

      this.setStatus('ready');
    } catch (error) {
      this.setStatus('error');
      throw error;
    }
  }

  destroy(): void {
    this.stopWatching();
    this.removeAllListeners();
    this.pendingDeposits.clear();
    this.sweepRetries.clear();
    this.originalDepositIds.clear();
    this.refundAttempts.clear();
    this.depositAddresses = null;
    this.intermediarySession = null;
    this.intermediaryService.clearSession();
    if (this.balanceWatcher) {
      this.balanceWatcher.stop();
      this.balanceWatcher.removeAllListeners();
      this.balanceWatcher = null;
    }
    this.sweeper = null;
    this.refundService = null;
    if (this.uaManager) {
      this.uaManager.destroy();
      this.uaManager = null;
    }
    this.setStatus('idle');
  }

  /**
   * Get the current intermediary session (for debugging/advanced use)
   */
  getIntermediarySession(): IntermediarySession | null {
    return this.intermediarySession;
  }

  // ============================================
  // Deposit Addresses
  // ============================================

  async getDepositAddresses(): Promise<DepositAddresses> {
    if (this.depositAddresses) {
      return this.depositAddresses;
    }

    if (!this.uaManager) {
      throw new ConfigurationError('Client not initialized. Call initialize() first.');
    }

    return this.uaManager.getDepositAddresses();
  }

  /**
   * Get the UAManager instance (for advanced use)
   */
  getUAManager(): UAManager | null {
    return this.uaManager;
  }

  // ============================================
  // Balance Watching
  // ============================================

  startWatching(): void {
    if (this.status !== 'ready') {
      throw new ConfigurationError('Client must be initialized before watching');
    }

    if (!this.balanceWatcher) {
      throw new ConfigurationError('BalanceWatcher not initialized');
    }

    this.balanceWatcher.start();
    this.setStatus('watching');
    console.log('[DepositSDK] Started watching for deposits');
  }

  stopWatching(): void {
    if (this.status === 'watching' && this.balanceWatcher) {
      this.balanceWatcher.stop();
      this.setStatus('ready');
      console.log('[DepositSDK] Stopped watching for deposits');
    }
  }

  async checkBalances(): Promise<DetectedDeposit[]> {
    if (!this.balanceWatcher) {
      throw new ConfigurationError('Client not initialized');
    }
    return this.balanceWatcher.getCurrentBalances();
  }

  // ============================================
  // Sweeping
  // ============================================

  async sweep(depositId?: string): Promise<SweepResult[]> {
    if (!this.sweeper) {
      throw new ConfigurationError('Client not initialized');
    }

    const results: SweepResult[] = [];

    if (depositId) {
      // Sweep specific deposit
      const deposit = this.pendingDeposits.get(depositId);
      if (!deposit) {
        throw new ConfigurationError(`Deposit ${depositId} not found`);
      }
      const result = await this.sweeper.sweep(deposit);
      results.push(result);
    } else {
      // Sweep all pending deposits
      for (const deposit of this.pendingDeposits.values()) {
        try {
          const result = await this.sweeper.sweep(deposit);
          results.push(result);
        } catch (error) {
          console.error(`[DepositSDK] Failed to sweep ${deposit.id}:`, error);
          results.push({
            depositId: deposit.id,
            transactionId: '',
            explorerUrl: '',
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    return results;
  }

  // ============================================
  // EOA Operations
  // ============================================

  async detectEOABalances(): Promise<EOABalance[]> {
    // TODO: Phase 5 - EOA balance detection
    throw new Error('Not implemented: detectEOABalances');
  }

  async depositFromEOA(_params: {
    token: string;
    chainId: number;
    amount: string;
  }): Promise<SweepResult> {
    // TODO: Phase 5 - EOA deposit
    throw new Error('Not implemented: depositFromEOA');
  }

  // ============================================
  // Fund Recovery
  // ============================================

  /**
   * Get all funds currently in the Universal Account that could be recovered.
   * This is useful for displaying what's stuck and available for manual recovery.
   *
   * Unlike checkBalances(), this method has no minimum USD threshold -
   * it returns ALL non-zero balances regardless of value.
   */
  async getStuckFunds(): Promise<DetectedDeposit[]> {
    if (!this.uaManager) {
      throw new ConfigurationError('Client not initialized. Call initialize() first.');
    }

    const primaryAssets = await this.uaManager.getPrimaryAssets();
    const deposits: DetectedDeposit[] = [];

    for (const asset of primaryAssets.assets) {
      const tokenType = this.normalizeTokenType(asset.tokenType);
      if (!tokenType) continue;

      const chainAgg = asset.chainAggregation || [];
      for (const chain of chainAgg) {
        const chainId = Number(chain.token?.chainId || chain.chainId);
        if (!chainId) continue;

        const rawAmount = this.parseBigInt(chain.rawAmount);
        const valueUSD = Number(chain.amountInUSD || 0);

        // Include ANY non-zero balance (no minimum threshold)
        if (rawAmount > 0n) {
          deposits.push({
            id: `recovery:${tokenType}:${chainId}:${Date.now()}`,
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

    console.log(`[DepositSDK] Found ${deposits.length} stuck fund(s):`,
      deposits.map(d => `${d.token} on chain ${d.chainId}: $${d.amountUSD.toFixed(2)}`));

    return deposits;
  }

  /**
   * Attempt to recover all funds currently in the Universal Account.
   * This will sweep every non-zero balance to the configured destination.
   *
   * Use this for manual recovery when auto-sweep has failed or when
   * funds are stuck due to configuration issues.
   *
   * @returns Array of recovery results for each attempted sweep
   */
  async recoverAllFunds(): Promise<RecoveryResult[]> {
    if (!this.sweeper) {
      throw new ConfigurationError('Client not initialized. Call initialize() first.');
    }

    console.log('[DepositSDK] Starting fund recovery...');
    this.emit('recovery:started');

    const stuckFunds = await this.getStuckFunds();
    const results: RecoveryResult[] = [];

    if (stuckFunds.length === 0) {
      console.log('[DepositSDK] No funds to recover');
      this.emit('recovery:complete', results);
      return results;
    }

    const previousStatus = this.status;
    this.setStatus('sweeping');

    for (const deposit of stuckFunds) {
      try {
        console.log(`[DepositSDK] Recovering ${deposit.token} on chain ${deposit.chainId}...`);

        const sweepResult = await this.sweeper.sweep(deposit);

        results.push({
          token: deposit.token,
          chainId: deposit.chainId,
          amount: deposit.amount,
          amountUSD: deposit.amountUSD,
          status: sweepResult.status === 'success' ? 'success' : 'failed',
          txHash: sweepResult.transactionId || undefined,
          error: sweepResult.error,
        });

        // Clear from balance watcher's processing keys if sweep succeeded
        if (sweepResult.status === 'success' && this.balanceWatcher) {
          const key = `${deposit.token.toLowerCase()}:${deposit.chainId}`;
          this.balanceWatcher.clearProcessingKey(key);
        }

        console.log(`[DepositSDK] Recovery ${sweepResult.status}: ${deposit.token} on chain ${deposit.chainId}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[DepositSDK] Recovery failed for ${deposit.token} on chain ${deposit.chainId}:`, error);

        results.push({
          token: deposit.token,
          chainId: deposit.chainId,
          amount: deposit.amount,
          amountUSD: deposit.amountUSD,
          status: 'failed',
          error: errorMessage,
        });

        this.emit('recovery:failed', deposit, error instanceof Error ? error : new Error(errorMessage));
      }
    }

    // Restore previous status
    if (this.balanceWatcher?.isActive()) {
      this.setStatus('watching');
    } else {
      this.setStatus(previousStatus === 'sweeping' ? 'ready' : previousStatus);
    }

    console.log(`[DepositSDK] Recovery complete. ${results.filter(r => r.status === 'success').length}/${results.length} succeeded.`);
    this.emit('recovery:complete', results);

    return results;
  }

  /**
   * Recover a single deposit (e.g. a below-threshold deposit that wasn't auto-swept).
   * Sweeps the given deposit to the configured destination.
   *
   * @param deposit - The deposit to recover
   * @returns RecoveryResult with status and details
   */
  async recoverSingleDeposit(deposit: DetectedDeposit): Promise<RecoveryResult> {
    if (!this.sweeper) {
      throw new ConfigurationError('Client not initialized. Call initialize() first.');
    }

    console.log(`[DepositSDK] Recovering single deposit: ${deposit.token} on chain ${deposit.chainId}...`);

    const previousStatus = this.status;
    this.setStatus('sweeping');

    try {
      const sweepResult = await this.sweeper.sweep(deposit);

      const result: RecoveryResult = {
        token: deposit.token,
        chainId: deposit.chainId,
        amount: deposit.amount,
        amountUSD: deposit.amountUSD,
        status: sweepResult.status === 'success' ? 'success' : 'failed',
        txHash: sweepResult.transactionId || undefined,
        error: sweepResult.error,
      };

      if (sweepResult.status === 'success' && this.balanceWatcher) {
        const key = `${deposit.token.toLowerCase()}:${deposit.chainId}`;
        this.balanceWatcher.clearProcessingKey(key);
      }

      this.emit('recovery:complete', [result]);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[DepositSDK] Single recovery failed for ${deposit.token} on chain ${deposit.chainId}:`, error);

      const result: RecoveryResult = {
        token: deposit.token,
        chainId: deposit.chainId,
        amount: deposit.amount,
        amountUSD: deposit.amountUSD,
        status: 'failed',
        error: errorMessage,
      };

      this.emit('recovery:failed', deposit, error instanceof Error ? error : new Error(errorMessage));
      return result;
    } finally {
      if (this.balanceWatcher?.isActive()) {
        this.setStatus('watching');
      } else {
        this.setStatus(previousStatus === 'sweeping' ? 'ready' : previousStatus);
      }
    }
  }

  // ============================================
  // State Accessors
  // ============================================

  getStatus(): ClientStatus {
    return this.status;
  }

  getPendingDeposits(): DetectedDeposit[] {
    return Array.from(this.pendingDeposits.values());
  }

  getConfig(): Readonly<ResolvedConfig> {
    return this.config;
  }

  /**
   * Update the sweep destination at runtime.
   *
   * This allows changing where funds are sent after the client is initialized.
   * The change takes effect immediately for subsequent sweeps.
   *
   * @param destination - New destination configuration
   * @param destination.chainId - Chain ID to sweep to (defaults to current if not specified)
   * @param destination.address - Address to receive funds (defaults to ownerAddress if not specified)
   *
   * @throws ConfigurationError if the chain ID or address is invalid
   *
   * @example
   * // Change destination to Base
   * client.setDestination({ chainId: CHAIN.BASE });
   *
   * @example
   * // Change destination to a custom address
   * client.setDestination({ address: '0xTreasury...' });
   *
   * @example
   * // Change both chain and address
   * client.setDestination({
   *   chainId: CHAIN.ETHEREUM,
   *   address: '0xTreasury...'
   * });
   */
  setDestination(destination: { chainId?: number; address?: string }): void {
    const newChainId = destination.chainId ?? this.config.destination.chainId;
    const newAddress = destination.address?.trim() || this.config.destination.address;

    // Validate the new destination
    this.validateDestination(newChainId, newAddress, this.config.ownerAddress);

    // Update config
    this.config = {
      ...this.config,
      destination: {
        chainId: newChainId,
        address: newAddress.toLowerCase(),
      },
    };

    // Update Sweeper if initialized
    if (this.sweeper) {
      this.sweeper = new Sweeper({
        uaManager: this.uaManager!,
        authCoreProvider: this.config.authCoreProvider,
        destination: this.config.destination,
      });
    }

    console.log(`[DepositSDK] Destination updated: ${getChainName(newChainId)} → ${newAddress}`);
  }

  /**
   * Get the current destination configuration
   */
  getDestination(): Readonly<{ address: string; chainId: number }> {
    return this.config.destination;
  }

  // ============================================
  // Internal Helpers
  // ============================================

  private setStatus(status: ClientStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.emit('status:change', status);
    }
  }

  /**
   * Normalize token type string to lowercase
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

  /**
   * Handle a detected deposit.
   *
   * Uses a retryKey (token:chainId) to deduplicate re-detections after
   * a failed sweep. Preserves the original deposit ID across retries so
   * the UI can match activity items correctly. On failure, clears the
   * BalanceWatcher processingKey so the same deposit can be re-detected
   * on the next poll cycle. After MAX_SWEEP_RETRIES exhausted, emits
   * deposit:error.
   */
  private handleDepositDetected(deposit: DetectedDeposit): void {
    const retryKey = `${deposit.token.toLowerCase()}:${deposit.chainId}`;
    const attempts = this.sweepRetries.get(retryKey) || 0;

    // If this is a re-detection after a failed sweep, preserve the original
    // deposit ID so the UI activity item can be updated (not duplicated)
    if (attempts > 0) {
      const originalId = this.originalDepositIds.get(retryKey);
      if (originalId) {
        // Remove stale pendingDeposit entry (previous detection had different ID)
        for (const [id] of this.pendingDeposits) {
          if (id !== originalId && id.startsWith(retryKey.replace(':', ':'))) {
            this.pendingDeposits.delete(id);
          }
        }
        deposit = { ...deposit, id: originalId };
      }
      console.log(`[DepositSDK] Re-detected deposit (retry ${attempts + 1}/${DepositClient.MAX_SWEEP_RETRIES}):`, deposit);
      this.pendingDeposits.set(deposit.id, deposit);
      this.emit('deposit:processing', deposit);
    } else {
      console.log('[DepositSDK] Deposit detected:', deposit);
      this.originalDepositIds.set(retryKey, deposit.id);
      this.pendingDeposits.set(deposit.id, deposit);
      this.emit('deposit:detected', deposit);
    }

    // Auto-sweep if enabled
    if (this.config.autoSweep && this.sweeper) {
      if (attempts === 0) {
        this.emit('deposit:processing', deposit);
      }
      this.setStatus('sweeping');

      const currentDeposit = deposit;
      this.sweeper.sweep(currentDeposit)
        .then((result) => {
          // Success - clean up all tracking state
          this.pendingDeposits.delete(currentDeposit.id);
          this.refundAttempts.delete(currentDeposit.id);
          this.sweepRetries.delete(retryKey);
          this.originalDepositIds.delete(retryKey);
          // Use the original ID in the result so the UI can match it
          const resultWithOriginalId = { ...result, depositId: currentDeposit.id };
          this.emit('deposit:complete', resultWithOriginalId);

          // Return to watching if still active
          if (this.balanceWatcher?.isActive()) {
            this.setStatus('watching');
          } else {
            this.setStatus('ready');
          }
        })
        .catch((error) => {
          console.error(`[DepositSDK] Auto-sweep failed (attempt ${attempts + 1}/${DepositClient.MAX_SWEEP_RETRIES}):`, error);

          // Always emit error so UI never stays stuck on "Processing..."
          // On retry re-detection, deposit:processing will be emitted to show retrying
          this.emit('deposit:error', error, currentDeposit);

          if (attempts + 1 < DepositClient.MAX_SWEEP_RETRIES) {
            // Still have retries left - clear processingKey so BalanceWatcher
            // re-detects on next poll, and increment retry counter
            this.sweepRetries.set(retryKey, attempts + 1);
            if (this.balanceWatcher) {
              this.balanceWatcher.clearProcessingKey(retryKey);
            }
          } else {
            // All retries exhausted - clean up retry tracking
            this.sweepRetries.delete(retryKey);
            this.originalDepositIds.delete(retryKey);

            // Attempt auto-refund if enabled
            if (this.config.refund.enabled && this.refundService) {
              this.handleSweepFailure(currentDeposit, 'sweep_failed');
              return;
            }
          }

          // Return to watching if still active
          if (this.balanceWatcher?.isActive()) {
            this.setStatus('watching');
          } else {
            this.setStatus('ready');
          }
        });
    }
  }

  // ============================================
  // Refund Operations
  // ============================================

  /**
   * Handle sweep failure by attempting auto-refund
   */
  private async handleSweepFailure(deposit: DetectedDeposit, reason: RefundReason): Promise<void> {
    if (!this.refundService) {
      return;
    }

    const currentAttempts = this.refundAttempts.get(deposit.id) || 0;
    const maxAttempts = this.config.refund.maxAttempts;

    if (currentAttempts >= maxAttempts) {
      console.warn(`[DepositSDK] Max refund attempts (${maxAttempts}) reached for ${deposit.id}`);
      this.emit('refund:failed', deposit, new RefundError('Max refund attempts exceeded', deposit.id, deposit.chainId), true);

      // Return to watching
      if (this.balanceWatcher?.isActive()) {
        this.setStatus('watching');
      } else {
        this.setStatus('ready');
      }
      return;
    }

    // Wait before attempting refund
    const delayMs = this.config.refund.delayMs;
    console.log(`[DepositSDK] Waiting ${delayMs}ms before refund attempt ${currentAttempts + 1}/${maxAttempts}`);

    await this.delay(delayMs);

    // Increment attempt counter
    this.refundAttempts.set(deposit.id, currentAttempts + 1);

    // Emit refund started
    this.emit('refund:started', deposit, reason);
    this.emit('refund:processing', deposit, currentAttempts + 1);

    try {
      const result = await this.refundService.refund(deposit, reason);

      if (result.status === 'success') {
        console.log(`[DepositSDK] Refund successful: ${deposit.token} on chain ${deposit.chainId}`);

        // Remove from pending
        this.pendingDeposits.delete(deposit.id);
        this.refundAttempts.delete(deposit.id);

        // Clear from balance watcher's processing keys
        if (this.balanceWatcher) {
          const key = `${deposit.token.toLowerCase()}:${deposit.chainId}`;
          this.balanceWatcher.clearProcessingKey(key);
        }

        this.emit('refund:complete', result);
      } else if (result.status === 'skipped') {
        console.warn(`[DepositSDK] Refund skipped: ${result.error}`);
        this.emit('refund:failed', deposit, new RefundError(result.error || 'Refund skipped', deposit.id, deposit.chainId), true);
      } else {
        throw new RefundError(result.error || 'Refund failed', deposit.id, deposit.chainId);
      }
    } catch (error) {
      const refundError = error instanceof RefundError
        ? error
        : new RefundError(
            error instanceof Error ? error.message : 'Unknown refund error',
            deposit.id,
            deposit.chainId,
            currentAttempts + 1
          );

      console.error(`[DepositSDK] Refund attempt ${currentAttempts + 1} failed:`, error);

      const exhausted = (currentAttempts + 1) >= maxAttempts;
      this.emit('refund:failed', deposit, refundError, exhausted);

      // If not exhausted, schedule another attempt
      if (!exhausted) {
        console.log(`[DepositSDK] Will retry refund...`);
        // Recursive retry with exponential backoff could be added here
        // For now, the deposit stays in pending for manual recovery
      }
    }

    // Return to watching
    if (this.balanceWatcher?.isActive()) {
      this.setStatus('watching');
    } else {
      this.setStatus('ready');
    }
  }

  /**
   * Manually refund a specific deposit to its source chain
   *
   * @param depositId - The deposit ID to refund
   * @param reason - Reason for the refund (default: 'user_requested')
   * @returns RefundResult with status and details
   *
   * @example
   * const result = await client.refund('deposit:eth:1:123456');
   * if (result.status === 'success') {
   *   console.log(`Refunded to ${result.refundedTo}`);
   * }
   */
  async refund(depositId: string, reason: RefundReason = 'user_requested'): Promise<RefundResult> {
    if (!this.refundService) {
      throw new ConfigurationError('RefundService not initialized. Enable refund in config.');
    }

    const deposit = this.pendingDeposits.get(depositId);
    if (!deposit) {
      throw new ConfigurationError(`Deposit ${depositId} not found in pending deposits`);
    }

    this.emit('refund:started', deposit, reason);
    this.emit('refund:processing', deposit, 1);

    try {
      const result = await this.refundService.refund(deposit, reason);

      if (result.status === 'success') {
        this.pendingDeposits.delete(depositId);
        this.refundAttempts.delete(depositId);

        if (this.balanceWatcher) {
          const key = `${deposit.token.toLowerCase()}:${deposit.chainId}`;
          this.balanceWatcher.clearProcessingKey(key);
        }

        this.emit('refund:complete', result);
      } else {
        this.emit('refund:failed', deposit, new RefundError(result.error || 'Refund failed', depositId, deposit.chainId), true);
      }

      return result;
    } catch (error) {
      const refundError = error instanceof RefundError
        ? error
        : new RefundError(error instanceof Error ? error.message : 'Unknown error', depositId, deposit.chainId);

      this.emit('refund:failed', deposit, refundError, true);
      throw refundError;
    }
  }

  /**
   * Refund all pending deposits to their source chains
   *
   * @param reason - Reason for the refunds (default: 'user_requested')
   * @returns Array of RefundResults
   *
   * @example
   * const results = await client.refundAll();
   * const successful = results.filter(r => r.status === 'success');
   * console.log(`Refunded ${successful.length} deposits`);
   */
  async refundAll(reason: RefundReason = 'user_requested'): Promise<RefundResult[]> {
    if (!this.refundService) {
      throw new ConfigurationError('RefundService not initialized. Enable refund in config.');
    }

    const results: RefundResult[] = [];
    const deposits = Array.from(this.pendingDeposits.values());

    for (const deposit of deposits) {
      try {
        const result = await this.refund(deposit.id, reason);
        results.push(result);
      } catch (error) {
        results.push({
          depositId: deposit.id,
          token: deposit.token,
          sourceChainId: deposit.chainId,
          amount: deposit.amount,
          amountUSD: deposit.amountUSD,
          status: 'failed',
          reason,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  /**
   * Get the current refund configuration
   */
  getRefundConfig(): Readonly<Required<RefundConfig>> {
    return this.config.refund;
  }

  /**
   * Check if a deposit can be refunded
   */
  async canRefund(depositId: string): Promise<{ eligible: boolean; reason?: string }> {
    if (!this.refundService) {
      return { eligible: false, reason: 'RefundService not initialized' };
    }

    const deposit = this.pendingDeposits.get(depositId);
    if (!deposit) {
      return { eligible: false, reason: 'Deposit not found' };
    }

    return this.refundService.checkRefundEligibility(deposit);
  }

  // ============================================
  // Internal Helpers
  // ============================================

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

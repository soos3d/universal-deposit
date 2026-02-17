/**
 * Core types for the Deposit SDK
 */

// ============================================
// Token & Chain Types
// ============================================

export type TokenType = 'ETH' | 'USDC' | 'USDT' | 'BTC' | 'SOL' | 'BNB';

export type AddressType = 'evm' | 'solana';

// ============================================
// Configuration
// ============================================

/**
 * Auth Core provider interface for signing UA transactions
 * This is the intermediary wallet's provider from Particle Auth Core
 */
export interface AuthCoreProvider {
  signMessage: (message: string) => Promise<string>;
}

/**
 * Configuration for the sweep destination (where funds are sent after deposit)
 *
 * @example
 * // Default: sweep to owner's EOA on Arbitrum
 * destination: undefined
 *
 * @example
 * // Sweep to owner's EOA on Base
 * destination: { chainId: CHAIN.BASE }
 *
 * @example
 * // Sweep to a custom treasury address on Arbitrum
 * destination: { address: '0xTreasury...' }
 *
 * @example
 * // Sweep to a custom address on Ethereum mainnet
 * destination: {
 *   chainId: CHAIN.ETHEREUM,
 *   address: '0xTreasury...'
 * }
 */
export interface DestinationConfig {
  /**
   * The address to receive swept funds.
   *
   * - If not specified, defaults to the user's connected EOA (ownerAddress)
   * - For EVM chains: must be a valid 0x-prefixed address (42 characters)
   * - For Solana: must be a valid base58 address (32-44 characters)
   *
   * ⚠️ Warning: If set to a different address than ownerAddress, ensure the
   * recipient has access to this address. Funds sent to an inaccessible
   * address cannot be recovered.
   */
  address?: string;

  /**
   * The chain ID to sweep funds to.
   *
   * - If not specified, defaults to Arbitrum (42161)
   * - Must be a supported chain from the CHAIN constant
   * - The chain's address type (EVM/Solana) must match the address format
   *
   * @see CHAIN constant for available chain IDs
   * @default 42161 (Arbitrum)
   */
  chainId?: number;
}

export interface DepositClientConfig {
  // User's connected wallet address (EOA from Privy, RainbowKit, etc.)
  // This is where swept funds will be sent
  ownerAddress: string;

  // Intermediary address from Particle Auth Core (useEthereum().address)
  // This is the EOA that owns the Universal Account
  // Required for sweep operations
  intermediaryAddress: string;

  // Auth Core provider for signing UA transactions
  // This comes from useEthereum().provider in @particle-network/auth-core-modal
  // Required for sweep operations
  authCoreProvider?: AuthCoreProvider;

  /**
   * Configuration for where swept funds are sent.
   *
   * Defaults to sweeping to the owner's EOA on Arbitrum if not specified.
   *
   * @see DestinationConfig for full documentation and examples
   */
  destination?: DestinationConfig;

  // Token filtering
  supportedTokens?: TokenType[];
  supportedChains?: number[];

  // Behavior options
  autoSweep?: boolean;
  minValueUSD?: number;
  pollingIntervalMs?: number;

  // Recovery options (manual recovery via RecoveryWidget)
  recovery?: RecoveryConfig;

  /**
   * Auto-refund configuration.
   *
   * When enabled, if a sweep to the destination fails after all retry strategies,
   * the SDK will automatically attempt to return funds to the source chain.
   *
   * The refund will be sent to:
   * 1. The original sender's address (if `refundToSender: true` and sender is known)
   * 2. Otherwise, the owner's address on the source chain
   *
   * @default { enabled: false }
   */
  refund?: RefundConfig;

  // Advanced options (internal use)
  jwtServiceUrl?: string;
}

// ============================================
// Deposit Addresses
// ============================================

export interface DepositAddresses {
  evm: string;
  solana: string;
}

// ============================================
// Detected Deposits
// ============================================

export interface DetectedDeposit {
  id: string;
  token: TokenType;
  chainId: number;
  amount: string;
  amountUSD: number;
  rawAmount: bigint;
  detectedAt: number;
  /**
   * Information about the original sender, if known.
   * Populated from transaction history when available.
   */
  origin?: DepositOrigin;
}

// ============================================
// Sweep Results
// ============================================

export type SweepStatus = 'success' | 'failed' | 'pending';

export interface SweepResult {
  depositId: string;
  transactionId: string;
  explorerUrl: string;
  status: SweepStatus;
  error?: string;
}

// ============================================
// Recovery Types
// ============================================

export type RecoveryStatus = 'success' | 'failed' | 'skipped';

export interface RecoveryResult {
  token: TokenType;
  chainId: number;
  amount: string;
  amountUSD: number;
  status: RecoveryStatus;
  error?: string;
  txHash?: string;
}

export interface RecoveryConfig {
  /** Enable automatic retry of failed sweeps. Default: true */
  autoRetry?: boolean;
  /** Maximum number of retry attempts. Default: 3 */
  maxRetries?: number;
  /** Initial delay between retries in ms. Default: 60000 (1 minute) */
  retryDelayMs?: number;
  /** Backoff multiplier for subsequent retries. Default: 2 */
  backoffMultiplier?: number;
  /** Callback when recovery ultimately fails after all retries */
  onRecoveryFailed?: (deposit: DetectedDeposit, error: Error) => void;
}

// ============================================
// Refund Types
// ============================================

/**
 * Configuration for automatic refunds when sweep fails.
 *
 * When enabled, if a sweep to the destination fails (after all retry strategies),
 * the SDK will automatically attempt to send funds back to the source.
 *
 * @example
 * // Enable auto-refund with defaults
 * refund: { enabled: true }
 *
 * @example
 * // Custom refund configuration
 * refund: {
 *   enabled: true,
 *   delayMs: 10000,        // Wait 10s before refunding
 *   maxAttempts: 3,        // Try up to 3 times
 *   refundToSender: true,  // Refund to original sender (if known)
 * }
 */
export interface RefundConfig {
  /**
   * Enable automatic refund when sweep fails.
   * Note: This feature is experimental and disabled by default.
   * @default false
   */
  enabled?: boolean;

  /**
   * Delay in milliseconds before attempting refund after sweep failure.
   * Allows time for transient issues to resolve.
   * @default 5000
   */
  delayMs?: number;

  /**
   * Maximum number of refund attempts before giving up.
   * After exhausting attempts, manual recovery via RecoveryWidget is required.
   * @default 2
   */
  maxAttempts?: number;

  /**
   * If true, attempt to refund to the original sender address (detected from
   * transaction history). If false or sender unknown, refunds to owner's
   * address on the source chain.
   * @default true
   */
  refundToSender?: boolean;
}

export type RefundStatus = 'pending' | 'processing' | 'success' | 'failed' | 'skipped';

/**
 * Result of a refund operation.
 */
export interface RefundResult {
  /** The deposit ID that was refunded */
  depositId: string;
  /** Token type that was refunded */
  token: TokenType;
  /** Source chain where the deposit originated */
  sourceChainId: number;
  /** Amount refunded (human-readable) */
  amount: string;
  /** Amount in USD */
  amountUSD: number;
  /** Current status of the refund */
  status: RefundStatus;
  /** Transaction hash if refund was submitted */
  txHash?: string;
  /** Error message if refund failed */
  error?: string;
  /** Reason for the refund (e.g., "sweep_failed") */
  reason: RefundReason;
  /** Address where funds were refunded to */
  refundedTo?: string;
  /** Whether refund went to original sender or owner */
  refundedToSender?: boolean;
}

/**
 * Reason why a refund was triggered.
 */
export type RefundReason =
  | 'sweep_failed'           // Primary sweep to destination failed
  | 'user_requested'         // User manually requested refund
  | 'address_type_mismatch'  // Cannot sweep due to EVM/Solana mismatch
  | 'below_minimum';         // Deposit below minimum value threshold

/**
 * Information about the original sender of a deposit.
 * Populated from transaction history when available.
 */
export interface DepositOrigin {
  /** Original sender's address */
  senderAddress: string;
  /** Chain ID where the deposit was sent from */
  chainId: number;
  /** Transaction ID of the original deposit */
  transactionId?: string;
}

// ============================================
// EOA Balances
// ============================================

export interface EOABalance {
  token: TokenType;
  chainId: number;
  address: string;
  amount: string;
  amountUSD: number;
  rawAmount: bigint;
}

// ============================================
// Client Status
// ============================================

export type ClientStatus =
  | 'idle'
  | 'initializing'
  | 'ready'
  | 'watching'
  | 'sweeping'
  | 'error';

// ============================================
// Events
// ============================================

export type DepositEvents = {
  'deposit:detected': (deposit: DetectedDeposit) => void;
  'deposit:below_threshold': (deposit: DetectedDeposit) => void;
  'deposit:processing': (deposit: DetectedDeposit) => void;
  'deposit:complete': (result: SweepResult) => void;
  'deposit:error': (error: Error, deposit?: DetectedDeposit) => void;
  'recovery:started': () => void;
  'recovery:complete': (results: RecoveryResult[]) => void;
  'recovery:failed': (deposit: DetectedDeposit, error: Error) => void;
  'refund:started': (deposit: DetectedDeposit, reason: RefundReason) => void;
  'refund:processing': (deposit: DetectedDeposit, attempt: number) => void;
  'refund:complete': (result: RefundResult) => void;
  'refund:failed': (deposit: DetectedDeposit, error: Error, exhausted: boolean) => void;
  'eoa:balances': (balances: EOABalance[]) => void;
  'status:change': (status: ClientStatus) => void;
  [key: string]: (...args: any[]) => void;
}

// ============================================
// Internal Types
// ============================================

export interface JwtResponse {
  jwt: string;
  expiresAt: number;
  expiresIn: number;
  sub: string;
}

export interface IntermediarySession {
  jwt: string;
  expiresAt: number;
  intermediaryAddress: string;
}

// ============================================
// Transaction History Types
// ============================================

/**
 * Transaction record from Universal Account history
 * Retrieved via universalAccount.getTransactions()
 */
export interface UATransaction {
  transactionId: string;
  tag: string;
  createdAt: string;
  updatedAt: string;
  targetToken: {
    name: string;
    type: string;
    image: string;
    price: number;
    symbol: string;
    address: string;
    assetId: string;
    chainId: number;
    decimals: number;
    realDecimals: number;
    isPrimaryToken: boolean;
    isSmartRouterSupported: boolean;
  };
  change: {
    amount: string;
    amountInUSD: string;
    from: string;
    to: string;
  };
  detail: {
    redPacketCount: number;
  };
  status: number;
  fromChains: number[];
  toChains: number[];
  exchangeRateUSD: Array<{
    type: string;
    exchangeRate: {
      type: string;
      price: number;
    };
  }>;
}

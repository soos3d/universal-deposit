/**
 * @particle-network/deposit-sdk
 * 
 * Deposit SDK for Universal Accounts - solve the empty smart account problem
 */

// Core exports
export { DepositClient } from './core/DepositClient';
export type { ResolvedConfig } from './core/DepositClient';

// Types
export type {
  TokenType,
  AddressType,
  Signer,
  DestinationConfig,
  DepositClientConfig,
  DepositAddresses,
  DetectedDeposit,
  SweepStatus,
  SweepResult,
  EOABalance,
  ClientStatus,
  DepositEvents,
  JwtResponse,
  IntermediarySession,
  // Recovery types
  RecoveryStatus,
  RecoveryResult,
  RecoveryConfig,
  // Refund types
  RefundConfig,
  RefundStatus,
  RefundResult,
  RefundReason,
  DepositOrigin,
} from './core/types';

// Errors
export {
  DepositSDKError,
  ConfigurationError,
  AuthenticationError,
  JwtError,
  UniversalAccountError,
  SweepError,
  NetworkError,
  RefundError,
} from './core/errors';

// Constants
export {
  CHAIN,
  CHAIN_META,
  DEFAULT_SUPPORTED_CHAINS,
  PRIMARY_ASSETS_BY_CHAIN,
  TOKEN_ADDRESSES,
  TOKEN_DECIMALS,
  CHAIN_TOKEN_DECIMALS,
  getTokenDecimals,
  DEFAULT_SUPPORTED_TOKENS,
  DEFAULT_JWT_SERVICE_URL,
  DEFAULT_DESTINATION_CHAIN_ID,
  DEFAULT_MIN_VALUE_USD,
  DEFAULT_POLLING_INTERVAL_MS,
  // Chain validation utilities
  getChainName,
  isValidDestinationChain,
  getAddressType,
  isValidEvmAddress,
  isValidSolanaAddress,
  validateAddressForChain,
} from './constants';
export type { ChainId } from './constants/chains';

// UAManager (for advanced use)
export { UAManager } from './universal-account';
export type { UAManagerConfig, SmartAccountOptions, PrimaryAsset, PrimaryAssetsResponse } from './universal-account';

// Sweep (for advanced use)
export { BalanceWatcher, Sweeper } from './sweep';
export type { BalanceWatcherConfig, BalanceSnapshot, SweeperConfig, SweepAttempt } from './sweep';

// Refund (for advanced use)
export { RefundService, DEFAULT_REFUND_CONFIG } from './refund';
export type { RefundServiceConfig, RefundEligibility } from './refund';

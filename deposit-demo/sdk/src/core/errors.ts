/**
 * Custom error classes for the Deposit SDK
 */

export class DepositSDKError extends Error {
  constructor(
    message: string,
    public code: string,
    public cause?: unknown
  ) {
    super(message);
    this.name = 'DepositSDKError';
    Object.setPrototypeOf(this, DepositSDKError.prototype);
  }
}

export class ConfigurationError extends DepositSDKError {
  constructor(message: string, cause?: unknown) {
    super(message, 'CONFIGURATION_ERROR', cause);
    this.name = 'ConfigurationError';
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }
}

export class AuthenticationError extends DepositSDKError {
  constructor(message: string, cause?: unknown) {
    super(message, 'AUTHENTICATION_ERROR', cause);
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

export class JwtError extends DepositSDKError {
  constructor(message: string, cause?: unknown) {
    super(message, 'JWT_ERROR', cause);
    this.name = 'JwtError';
    Object.setPrototypeOf(this, JwtError.prototype);
  }
}

export class UniversalAccountError extends DepositSDKError {
  constructor(message: string, cause?: unknown) {
    super(message, 'UNIVERSAL_ACCOUNT_ERROR', cause);
    this.name = 'UniversalAccountError';
    Object.setPrototypeOf(this, UniversalAccountError.prototype);
  }
}

export class SweepError extends DepositSDKError {
  constructor(
    message: string,
    public depositId?: string,
    cause?: unknown
  ) {
    super(message, 'SWEEP_ERROR', cause);
    this.name = 'SweepError';
    Object.setPrototypeOf(this, SweepError.prototype);
  }
}

export class NetworkError extends DepositSDKError {
  constructor(
    message: string,
    public chainId?: number,
    cause?: unknown
  ) {
    super(message, 'NETWORK_ERROR', cause);
    this.name = 'NetworkError';
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

export class RefundError extends DepositSDKError {
  constructor(
    message: string,
    public depositId?: string,
    public sourceChainId?: number,
    public attempt?: number,
    cause?: unknown
  ) {
    super(message, 'REFUND_ERROR', cause);
    this.name = 'RefundError';
    Object.setPrototypeOf(this, RefundError.prototype);
  }
}

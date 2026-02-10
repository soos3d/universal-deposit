/**
 * Token address configuration per chain
 */

import { CHAIN } from './chains';

export const TOKEN_ADDRESSES: Record<number, Record<string, string>> = {
  [CHAIN.ETHEREUM]: {
    usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    usdt: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  },
  [CHAIN.OPTIMISM]: {
    usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', // Native
    usdc_e: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607', // Bridged
    usdt: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
  },
  [CHAIN.BNB]: {
    usdc: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    usdt: '0x55d398326f99059fF775485246999027B3197955',
  },
  [CHAIN.POLYGON]: {
    usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    usdt: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
  },
  [CHAIN.BASE]: {
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    usdt: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
  },
  [CHAIN.ARBITRUM]: {
    usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // Native
    usdc_e: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', // Bridged
    usdt: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
  },
  [CHAIN.AVALANCHE]: {
    usdc: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', // Native
    usdc_e: '0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664', // Bridged
    usdt: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
  },
  [CHAIN.LINEA]: {
    usdc: '0x176211869cA2b568f2A7D4EE941E073a821EE1ff',
    usdt: '0xA219439258ca9da29E9Cc4cE5596924745e12B93',
  },
  [CHAIN.HYPERVM]: {
    usdt: '0x0000000000000000000000000000000000000000', // Placeholder - needs actual address
  },
  [CHAIN.MANTLE]: {
    usdt: '0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE',
  },
  [CHAIN.XLAYER]: {
    usdc: '0x74b7F16337b8972027F6196A17a631aC6dE26d22',
    usdt: '0x1E4a5963aBFD975d8c9021ce480b42188849D41d',
  },
  [CHAIN.MONAD]: {
    usdc: '0x0000000000000000000000000000000000000000', // Placeholder - needs actual address
  },
  [CHAIN.SONIC]: {
    usdc: '0x0000000000000000000000000000000000000000', // Placeholder - needs actual address
  },
  [CHAIN.PLASMA]: {
    usdt: '0x0000000000000000000000000000000000000000', // Placeholder - needs actual address
  },
  [CHAIN.BERACHAIN]: {
    usdc: '0x0000000000000000000000000000000000000000', // Placeholder - needs actual address
  },
  [CHAIN.SOLANA]: {
    usdc: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    usdt: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    sol: '11111111111111111111111111111111',
  },
};

export const TOKEN_DECIMALS: Record<string, number> = {
  ETH: 18,
  USDC: 6,
  USDT: 6,
  BTC: 8,
  SOL: 9,
  BNB: 18,
};

/**
 * Chain-specific token decimal overrides.
 * Some chains use different decimal places for standard tokens.
 * For example, BNB Chain uses 18 decimals for USDC/USDT instead of 6.
 */
export const CHAIN_TOKEN_DECIMALS: Record<number, Record<string, number>> = {
  [CHAIN.BNB]: {
    USDC: 18,
    USDT: 18,
  },
};

/**
 * Get the number of decimals for a token on a specific chain.
 * Checks chain-specific overrides first, then falls back to global defaults.
 *
 * @param token - Token symbol (e.g., 'USDC', 'ETH')
 * @param chainId - Optional chain ID for chain-specific decimal lookup
 * @returns Number of decimals for the token
 *
 * @example
 * getTokenDecimals('USDC')        // 6 (default)
 * getTokenDecimals('USDC', 56)    // 18 (BNB chain override)
 * getTokenDecimals('ETH', 56)     // 18 (global default, no override)
 */
export function getTokenDecimals(token: string, chainId?: number): number {
  const upperToken = token.toUpperCase();

  // Check chain-specific override first
  if (chainId !== undefined && CHAIN_TOKEN_DECIMALS[chainId]?.[upperToken] !== undefined) {
    return CHAIN_TOKEN_DECIMALS[chainId][upperToken];
  }

  // Fall back to global defaults
  return TOKEN_DECIMALS[upperToken] ?? 6;
}

export const DEFAULT_SUPPORTED_TOKENS = ['ETH', 'USDC', 'USDT', 'BTC', 'SOL', 'BNB'] as const;

/**
 * Per-token minimum deposit amounts in native units.
 * These replace the USD-based threshold to avoid reliance on API price data.
 */
export const MIN_DEPOSIT_AMOUNTS: Record<string, number> = {
  USDC: 0.2,
  USDT: 0.2,
  ETH: 0.0004,
  BNB: 0.0003,
  SOL: 0.006,
  BTC: 0.000005,
};

/**
 * Get the minimum deposit amount for a token in native units.
 *
 * @param token - Token symbol (e.g., 'USDC', 'ETH')
 * @returns Minimum amount in native units, or 0 if unknown
 */
export function getMinDepositAmount(token: string): number {
  return MIN_DEPOSIT_AMOUNTS[token.toUpperCase()] ?? 0;
}

/**
 * Check whether a raw on-chain amount meets the minimum deposit threshold.
 *
 * @param rawAmount - On-chain amount as bigint (smallest unit)
 * @param token - Token symbol (e.g., 'USDC', 'ETH')
 * @param chainId - Optional chain ID for chain-specific decimal lookup
 * @returns true if the amount meets or exceeds the minimum
 */
export function meetsMinimumDeposit(rawAmount: bigint, token: string, chainId?: number): boolean {
  const min = getMinDepositAmount(token);
  if (min === 0) return rawAmount > 0n;

  const decimals = getTokenDecimals(token, chainId);
  const amount = Number(rawAmount) / 10 ** decimals;
  return amount >= min;
}

/**
 * Chain configuration constants
 */

export const CHAIN = {
  ETHEREUM: 1,
  OPTIMISM: 10,
  BNB: 56,
  POLYGON: 137,
  BASE: 8453,
  ARBITRUM: 42161,
  AVALANCHE: 43114,
  LINEA: 59144,
  HYPERVM: 999,
  MANTLE: 5000,
  MERLIN: 4200,
  XLAYER: 196,
  MONAD: 143,
  SONIC: 146,
  PLASMA: 9745,
  BERACHAIN: 80094,
  SOLANA: 101,
} as const;

export type ChainId = (typeof CHAIN)[keyof typeof CHAIN];

interface ChainMeta {
  name: string;
  addressType: 'evm' | 'solana';
  color: string;
}

export const CHAIN_META: Record<number, ChainMeta> = {
  [CHAIN.SOLANA]: { name: 'Solana', addressType: 'solana', color: '#9945ff' },
  [CHAIN.ETHEREUM]: { name: 'Ethereum', addressType: 'evm', color: '#627eea' },
  [CHAIN.OPTIMISM]: { name: 'OP (Optimism)', addressType: 'evm', color: '#ff0420' },
  [CHAIN.BNB]: { name: 'BNB Chain', addressType: 'evm', color: '#f3ba2f' },
  [CHAIN.POLYGON]: { name: 'Polygon', addressType: 'evm', color: '#8247e5' },
  [CHAIN.BASE]: { name: 'Base', addressType: 'evm', color: '#0052ff' },
  [CHAIN.ARBITRUM]: { name: 'Arbitrum', addressType: 'evm', color: '#12aaeb' },
  [CHAIN.AVALANCHE]: { name: 'Avalanche', addressType: 'evm', color: '#e84142' },
  [CHAIN.LINEA]: { name: 'Linea', addressType: 'evm', color: '#121212' },
  [CHAIN.HYPERVM]: { name: 'HyperEVM', addressType: 'evm', color: '#00d4ff' },
  [CHAIN.MANTLE]: { name: 'Mantle', addressType: 'evm', color: '#000000' },
  [CHAIN.MERLIN]: { name: 'Merlin', addressType: 'evm', color: '#f7931a' },
  [CHAIN.XLAYER]: { name: 'X Layer', addressType: 'evm', color: '#000000' },
  [CHAIN.MONAD]: { name: 'Monad', addressType: 'evm', color: '#6366f1' },
  [CHAIN.SONIC]: { name: 'Sonic', addressType: 'evm', color: '#1969ff' },
  [CHAIN.PLASMA]: { name: 'Plasma', addressType: 'evm', color: '#8b5cf6' },
  [CHAIN.BERACHAIN]: { name: 'Berachain', addressType: 'evm', color: '#f5841f' },
};

export const DEFAULT_SUPPORTED_CHAINS = [
    CHAIN.SOLANA,
  CHAIN.ETHEREUM,
  CHAIN.OPTIMISM,
  CHAIN.BNB,
  CHAIN.POLYGON,
  CHAIN.BASE,
  CHAIN.ARBITRUM,
  CHAIN.AVALANCHE,
  CHAIN.LINEA,
  CHAIN.HYPERVM,
  CHAIN.MANTLE,
  CHAIN.MERLIN,
  CHAIN.XLAYER,
  CHAIN.MONAD,
  CHAIN.SONIC,
  CHAIN.PLASMA,
  CHAIN.BERACHAIN,

];

/**
 * Get the human-readable name for a chain ID
 * @param chainId - The chain ID to look up
 * @returns The chain name, or "Unknown Chain" if not found
 * @example
 * getChainName(42161) // "Arbitrum"
 * getChainName(8453)  // "Base"
 */
export function getChainName(chainId: number): string {
  return CHAIN_META[chainId]?.name ?? `Unknown Chain (${chainId})`;
}

/**
 * Check if a chain ID is a valid destination for sweeps
 * @param chainId - The chain ID to validate
 * @returns true if the chain is supported as a destination
 */
export function isValidDestinationChain(chainId: number): boolean {
  return chainId in CHAIN_META;
}

/**
 * Get the address type (evm or solana) for a chain
 * @param chainId - The chain ID to check
 * @returns 'evm' | 'solana' | null if chain not found
 */
export function getAddressType(chainId: number): 'evm' | 'solana' | null {
  return CHAIN_META[chainId]?.addressType ?? null;
}

/**
 * Validate an EVM address format (0x + 40 hex characters)
 *
 * Note: Checksum validation (EIP-55) is not performed to keep dependencies minimal.
 * The address format is validated but mixed-case addresses are accepted without
 * verifying the checksum encoding.
 *
 * @param address - The address to validate
 * @returns true if valid EVM address format
 */
export function isValidEvmAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validate a Solana address format (base58, 32-44 characters)
 * @param address - The address to validate
 * @returns true if valid Solana address format
 */
export function isValidSolanaAddress(address: string): boolean {
  // Solana addresses are base58 encoded, typically 32-44 characters
  // Base58 alphabet (no 0, O, I, l)
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return base58Regex.test(address);
}

/**
 * Validate an address for a specific chain
 * @param address - The address to validate
 * @param chainId - The chain ID to validate against
 * @returns Object with isValid boolean and optional error message
 */
export function validateAddressForChain(
  address: string,
  chainId: number
): { isValid: boolean; error?: string } {
  const addressType = getAddressType(chainId);

  if (!addressType) {
    return { isValid: false, error: `Unknown chain ID: ${chainId}` };
  }

  if (addressType === 'solana') {
    if (!isValidSolanaAddress(address)) {
      return { isValid: false, error: 'Invalid Solana address format' };
    }
  } else {
    if (!isValidEvmAddress(address)) {
      return { isValid: false, error: 'Invalid EVM address format' };
    }
  }

  return { isValid: true };
}

export const PRIMARY_ASSETS_BY_CHAIN: Record<number, string[]> = {
  [CHAIN.SOLANA]: ['USDC', 'USDT', 'SOL'],
  [CHAIN.ETHEREUM]: ['USDC', 'USDT', 'ETH', 'BTC'],
  [CHAIN.OPTIMISM]: ['USDC', 'USDT', 'ETH', 'BTC'],
  [CHAIN.BNB]: ['USDC', 'USDT', 'ETH', 'BTC', 'BNB'],
  [CHAIN.POLYGON]: ['USDC', 'USDT', 'ETH', 'BTC'],
  [CHAIN.BASE]: ['USDC', 'ETH', 'BTC'],
  [CHAIN.ARBITRUM]: ['USDC', 'USDT', 'ETH', 'BTC'],
  [CHAIN.AVALANCHE]: ['USDC', 'USDT', 'ETH', 'BTC'],
  [CHAIN.LINEA]: ['USDC', 'USDT', 'ETH', 'BTC'],
  [CHAIN.HYPERVM]: ['USDT'],
  [CHAIN.MANTLE]: ['USDT'],
  [CHAIN.XLAYER]: ['USDC', 'USDT'],
  [CHAIN.MONAD]: ['USDC'],
  [CHAIN.SONIC]: ['USDC'],
  [CHAIN.PLASMA]: ['USDT'],
  [CHAIN.BERACHAIN]: ['USDC'],
};

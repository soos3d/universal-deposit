import type { TokenType } from "../../core/types";
import { CHAIN, CHAIN_META, PRIMARY_ASSETS_BY_CHAIN, DEFAULT_SUPPORTED_CHAINS } from "../../constants/chains";

export const LOGO_URLS: Record<string, string> = {
  // Chains
  [CHAIN.ETHEREUM]:
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
  [CHAIN.ARBITRUM]:
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png",
  [CHAIN.BASE]:
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png",
  [CHAIN.POLYGON]:
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png",
  [CHAIN.BNB]:
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/binance/info/logo.png",
  [CHAIN.SOLANA]:
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png",
  [CHAIN.OPTIMISM]:
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/info/logo.png",
  [CHAIN.AVALANCHE]:
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanchec/info/logo.png",
  [CHAIN.LINEA]:
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/linea/info/logo.png",
  [CHAIN.MANTLE]:
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/mantle/info/logo.png",
  [CHAIN.HYPERVM]:
    "https://universalx.app/_next/image?url=https%3A%2F%2Fstatic.particle.network%2Fchains%2Fevm%2Ficons%2F999.png&w=32&q=75",
  [CHAIN.MERLIN]:
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/merlin/info/logo.png",
  [CHAIN.XLAYER]:
    "https://universalx.app/_next/image?url=https%3A%2F%2Fstatic.particle.network%2Fchains%2Fevm%2Ficons%2F196.png&w=32&q=75",
  [CHAIN.MONAD]:
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/monad/info/logo.png",
  [CHAIN.SONIC]:
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/sonic/info/logo.png",
  [CHAIN.PLASMA]:
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/plasma/info/logo.png",
  [CHAIN.BERACHAIN]:
    "https://universalx.app/_next/image?url=https%3A%2F%2Fstatic.particle.network%2Fchains%2Fevm%2Ficons%2F80094.png&w=32&q=75",
  // Tokens
  ETH: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
  USDC: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png",
  USDT: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png",
  BTC: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/bitcoin/info/logo.png",
  SOL: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png",
  BNB: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/binance/info/logo.png",
};

export interface ChainOption {
  id: number;
  name: string;
  color: string;
  addressType: "evm" | "solana";
}

/** Derived from CHAIN_META — single source of truth in constants/chains.ts */
export const CHAIN_OPTIONS: ChainOption[] = DEFAULT_SUPPORTED_CHAINS.map(
  (chainId) => {
    const meta = CHAIN_META[chainId];
    return { id: chainId, name: meta.name, color: meta.color, addressType: meta.addressType };
  },
);

/** Derived from PRIMARY_ASSETS_BY_CHAIN — single source of truth in constants/chains.ts */
export const CHAIN_SUPPORTED_TOKENS: Record<number, TokenType[]> =
  Object.fromEntries(
    Object.entries(PRIMARY_ASSETS_BY_CHAIN).map(([chainId, tokens]) => [
      Number(chainId),
      tokens as TokenType[],
    ]),
  );

export const TOKEN_SUPPORTED_CHAINS: Record<TokenType, number[]> =
  Object.entries(CHAIN_SUPPORTED_TOKENS).reduce(
    (acc, [chainIdStr, tokens]) => {
      const chainId = Number(chainIdStr);
      return tokens.reduce(
        (innerAcc, token) => ({
          ...innerAcc,
          [token]: [...(innerAcc[token as TokenType] || []), chainId],
        }),
        acc,
      );
    },
    {} as Record<TokenType, number[]>,
  );

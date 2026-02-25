import { describe, it, expect } from 'vitest';
import {
  TOKEN_DECIMALS,
  CHAIN_TOKEN_DECIMALS,
  getTokenDecimals,
} from '../constants/tokens';
import { CHAIN } from '../constants/chains';

describe('Token Decimals', () => {
  describe('TOKEN_DECIMALS', () => {
    it('should have correct default decimals for each token', () => {
      expect(TOKEN_DECIMALS.ETH).toBe(18);
      expect(TOKEN_DECIMALS.USDC).toBe(6);
      expect(TOKEN_DECIMALS.USDT).toBe(6);
      expect(TOKEN_DECIMALS.BTC).toBe(8);
      expect(TOKEN_DECIMALS.SOL).toBe(9);
      expect(TOKEN_DECIMALS.BNB).toBe(18);
    });
  });

  describe('CHAIN_TOKEN_DECIMALS', () => {
    it('should have BNB chain overrides for USDC and USDT', () => {
      expect(CHAIN_TOKEN_DECIMALS[CHAIN.BNB]).toBeDefined();
      expect(CHAIN_TOKEN_DECIMALS[CHAIN.BNB].USDC).toBe(18);
      expect(CHAIN_TOKEN_DECIMALS[CHAIN.BNB].USDT).toBe(18);
    });
  });

  describe('getTokenDecimals', () => {
    it('should return default decimals when chainId is not provided', () => {
      expect(getTokenDecimals('USDC')).toBe(6);
      expect(getTokenDecimals('USDT')).toBe(6);
      expect(getTokenDecimals('ETH')).toBe(18);
      expect(getTokenDecimals('BTC')).toBe(8);
      expect(getTokenDecimals('SOL')).toBe(9);
    });

    it('should handle case-insensitive token symbols', () => {
      expect(getTokenDecimals('usdc')).toBe(6);
      expect(getTokenDecimals('Usdc')).toBe(6);
      expect(getTokenDecimals('USDC')).toBe(6);
    });

    it('should return chain-specific decimals for BNB chain', () => {
      expect(getTokenDecimals('USDC', CHAIN.BNB)).toBe(18);
      expect(getTokenDecimals('USDT', CHAIN.BNB)).toBe(18);
      expect(getTokenDecimals('usdc', CHAIN.BNB)).toBe(18);
      expect(getTokenDecimals('usdt', CHAIN.BNB)).toBe(18);
    });

    it('should return default decimals for BNB chain tokens without overrides', () => {
      expect(getTokenDecimals('ETH', CHAIN.BNB)).toBe(18);
      expect(getTokenDecimals('BTC', CHAIN.BNB)).toBe(8);
    });

    it('should return default decimals for non-BNB chains', () => {
      expect(getTokenDecimals('USDC', CHAIN.ETHEREUM)).toBe(6);
      expect(getTokenDecimals('USDT', CHAIN.ETHEREUM)).toBe(6);
      expect(getTokenDecimals('USDC', CHAIN.ARBITRUM)).toBe(6);
      expect(getTokenDecimals('USDT', CHAIN.BASE)).toBe(6);
    });

    it('should return 6 as fallback for unknown tokens', () => {
      expect(getTokenDecimals('UNKNOWN')).toBe(6);
      expect(getTokenDecimals('RANDOM', CHAIN.BNB)).toBe(6);
    });

    it('should handle undefined chainId correctly', () => {
      expect(getTokenDecimals('USDC', undefined)).toBe(6);
    });
  });

  describe('BNB Chain USDC/USDT decimal fix', () => {
    it('should correctly format 0.4 USDC on BNB chain', () => {
      const rawAmount = '400000000000000000'; // 0.4 * 10^18 (BNB chain decimals)
      const decimals = getTokenDecimals('USDC', CHAIN.BNB);
      const value = Number(rawAmount) / Math.pow(10, decimals);
      expect(value).toBe(0.4);
    });

    it('should correctly format 0.4 USDC on Ethereum', () => {
      const rawAmount = '400000'; // 0.4 * 10^6 (standard decimals)
      const decimals = getTokenDecimals('USDC', CHAIN.ETHEREUM);
      const value = Number(rawAmount) / Math.pow(10, decimals);
      expect(value).toBe(0.4);
    });

    it('should correctly format 100 USDT on BNB chain', () => {
      const rawAmount = '100000000000000000000'; // 100 * 10^18
      const decimals = getTokenDecimals('USDT', CHAIN.BNB);
      const value = Number(rawAmount) / Math.pow(10, decimals);
      expect(value).toBe(100);
    });
  });
});

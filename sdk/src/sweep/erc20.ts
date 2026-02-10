/**
 * Lightweight ERC20 transfer encoding utilities.
 * Avoids adding ethers/viem as a dependency.
 */

/** ERC20 transfer(address,uint256) function selector */
const TRANSFER_SELECTOR = 'a9059cbb';

/**
 * Encode an ERC20 `transfer(address, uint256)` call as hex calldata.
 *
 * @param to - Recipient address (0x-prefixed, 40 hex chars)
 * @param amount - Amount in smallest unit (e.g. 6-decimal for USDC)
 * @returns 0x-prefixed hex string ready for `EVMTransaction.data`
 */
export function encodeERC20Transfer(to: string, amount: bigint): string {
  const addressHex = to.toLowerCase().replace('0x', '').padStart(64, '0');
  const amountHex = amount.toString(16).padStart(64, '0');
  return '0x' + TRANSFER_SELECTOR + addressHex + amountHex;
}

/**
 * Convert a human-readable decimal string to the smallest-unit bigint.
 *
 * @example toSmallestUnit('10.5', 6) => 10_500_000n
 */
export function toSmallestUnit(amount: string, decimals: number): bigint {
  const [whole = '0', frac = ''] = amount.split('.');
  const paddedFrac = frac.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole + paddedFrac);
}

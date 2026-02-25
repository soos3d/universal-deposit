'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useDepositContext } from '../context/DepositContext';
import type { DepositContextValue } from '../context/DepositContext';
import type { DestinationConfig } from '../../core/types';

export interface UseDepositOptions {
  /**
   * The user's wallet address (from any wallet provider like Privy, RainbowKit, etc.)
   * When provided, the SDK will automatically connect and initialize.
   */
  ownerAddress?: string;
  /**
   * Destination configuration for where swept funds are sent.
   * When provided, the SDK destination is updated whenever this value changes.
   * This ensures auto-sweep uses the correct destination regardless of widget state.
   */
  destination?: DestinationConfig;
}

export interface UseDepositReturn extends DepositContextValue {}

/**
 * Hook to access the Deposit SDK functionality.
 *
 * @example
 * ```tsx
 * function DepositPage() {
 *   const { wallets } = useWallets(); // from Privy, RainbowKit, etc.
 *   const { isReady, depositAddresses, error } = useDeposit({
 *     ownerAddress: wallets[0]?.address
 *   });
 *
 *   if (!isReady) return <Loading />;
 *   return <DepositWidget />;
 * }
 * ```
 */
export function useDeposit(options: UseDepositOptions = {}): UseDepositReturn {
  const { ownerAddress, destination } = options;
  const context = useDepositContext();
  const { isConnected, isConnecting, isReady, connect, disconnect, setDestination, logger } = context;
  const operationRef = useRef<Promise<void> | null>(null);
  const lastAddressRef = useRef<string | undefined>(undefined);
  const pendingAddressRef = useRef<string | undefined>(undefined);
  // Keep destination in a ref so the connect effect always reads the latest
  // value without needing it in the dependency array (which would re-trigger connect)
  const destinationRef = useRef(destination);
  destinationRef.current = destination;

  // Normalize address for comparison
  const normalizeAddress = useCallback((addr: string | undefined): string | undefined => {
    return addr?.toLowerCase().trim();
  }, []);

  // Handle address changes with proper serialization
  useEffect(() => {
    const normalizedOwner = normalizeAddress(ownerAddress);
    const normalizedLast = normalizeAddress(lastAddressRef.current);

    // No address provided - nothing to do
    if (!normalizedOwner) {
      lastAddressRef.current = undefined;
      pendingAddressRef.current = undefined;
      return;
    }

    // Same address - nothing to do
    if (normalizedOwner === normalizedLast) {
      return;
    }

    // Address changed - handle transition
    const handleAddressChange = async () => {
      // If there's a pending operation, wait for it
      if (operationRef.current) {
        await operationRef.current;
      }

      // Store the pending address we want to connect to
      pendingAddressRef.current = ownerAddress;

      // If currently connected to a different address, disconnect first
      if (isConnected && normalizedLast && normalizedLast !== normalizedOwner) {

        const disconnectPromise = disconnect();
        operationRef.current = disconnectPromise;

        await disconnectPromise;
        operationRef.current = null;

        // Clear the last address after disconnect
        lastAddressRef.current = undefined;
      }

      // Verify this is still the address we want (no newer change)
      if (pendingAddressRef.current !== ownerAddress) return;

      // Connect to new address (verify it's still defined)
      if (!isConnected && !isConnecting && ownerAddress) {
        lastAddressRef.current = ownerAddress;

        // Pass destination so the client is created with the correct
        // destination from the start, avoiding the race where the first
        // poll detects existing balances and sweeps to the wrong chain.
        const connectPromise = connect(ownerAddress, destinationRef.current);
        operationRef.current = connectPromise;

        await connectPromise;
        operationRef.current = null;
      }
    };

    handleAddressChange().catch((err) => {
      logger.error('[useDeposit] Address change failed:', err);
      operationRef.current = null;
    });
  }, [ownerAddress, isConnected, isConnecting, connect, disconnect, normalizeAddress, logger]);

  // Sync destination to SDK when it changes
  useEffect(() => {
    if (!isReady || !destination) return;
    try {
      setDestination(destination);
    } catch (e) {
      logger.warn('[useDeposit] setDestination failed:', e);
    }
  }, [destination?.chainId, destination?.address, isReady, setDestination, logger]);

  return context;
}

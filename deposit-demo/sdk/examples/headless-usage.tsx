"use client";

/**
 * Example: Headless SDK Usage
 *
 * This example demonstrates using the Deposit SDK without the pre-built React widgets.
 * You control the UI entirely - the SDK handles JWT auth, Universal Account creation,
 * balance watching, and sweeping.
 *
 * Use case: Build your own custom deposit UI or integrate deposits into existing flows.
 */

import { useState, useEffect, useCallback } from "react";
import {
  DepositClient,
  CHAIN,
  type DetectedDeposit,
  type SweepResult,
  type DepositAddresses,
} from "@particle-network/deposit-sdk";

// =============================================================================
// PSEUDOCODE: Your auth provider (Privy, RainbowKit, etc.)
// =============================================================================
// import { useAuth } from "your-auth-provider";
// const { address: ownerAddress, isConnected } = useAuth();

// For this example, we'll simulate the auth state:
const useAuth = () => ({
  ownerAddress: "0x1234567890abcdef1234567890abcdef12345678",
  isConnected: true,
});

// =============================================================================
// PSEUDOCODE: Particle Auth Core for intermediary wallet
// =============================================================================
// The SDK's DepositProvider handles this automatically, but for headless usage
// you need to manage the Auth Core connection yourself.
//
// import { useConnect, useEthereum } from "@particle-network/auth-core-modal";
// const { connect } = useConnect();
// const { address: intermediaryAddress, provider } = useEthereum();
//
// // Connect with JWT from your backend
// await connect({ jwt: "your-jwt-token", ... });

// For this example, we'll simulate:
const useParticleAuth = () => ({
  intermediaryAddress: "0xabcdef1234567890abcdef1234567890abcdef12",
  provider: { signMessage: async (msg: string) => "0xsignature..." },
  isConnected: true,
});

// =============================================================================
// HEADLESS DEPOSIT COMPONENT
// =============================================================================

export default function HeadlessDepositExample() {
  const { ownerAddress, isConnected } = useAuth();
  const { intermediaryAddress, provider, isConnected: particleConnected } = useParticleAuth();

  // SDK state
  const [client, setClient] = useState<DepositClient | null>(null);
  const [depositAddresses, setDepositAddresses] = useState<DepositAddresses | null>(null);
  const [deposits, setDeposits] = useState<DetectedDeposit[]>([]);
  const [isWatching, setIsWatching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize the DepositClient
  useEffect(() => {
    if (!isConnected || !particleConnected || !ownerAddress || !intermediaryAddress) {
      return;
    }

    const depositClient = new DepositClient({
      ownerAddress,
      intermediaryAddress,
      authCoreProvider: provider,
      // Configure destination - sweep to Base instead of default Arbitrum
      destination: {
        chainId: CHAIN.BASE,
        // address defaults to ownerAddress if not specified
      },
    });

    // Set up event listeners
    depositClient.on("deposit:detected", (deposit: DetectedDeposit) => {
      setDeposits((prev) => [...prev, deposit]);
    });

    depositClient.on("deposit:complete", (result: SweepResult) => {
      setDeposits((prev) =>
        prev.map((d) =>
          d.id === result.depositId ? { ...d, status: "swept" as const } : d
        )
      );
    });

    depositClient.on("deposit:error", (err: Error) => {
      setError(err.message);
    });

    setClient(depositClient);

    // Cleanup on unmount
    return () => {
      depositClient.stopWatching();
      depositClient.removeAllListeners();
    };
  }, [isConnected, particleConnected, ownerAddress, intermediaryAddress, provider]);

  // Fetch deposit addresses
  const fetchAddresses = useCallback(async () => {
    if (!client) return;

    try {
      const addresses = await client.getDepositAddresses();
      setDepositAddresses(addresses);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get addresses");
    }
  }, [client]);

  // Start watching for deposits
  const startWatching = useCallback(() => {
    if (!client) return;
    client.startWatching();
    setIsWatching(true);
  }, [client]);

  // Stop watching
  const stopWatching = useCallback(() => {
    if (!client) return;
    client.stopWatching();
    setIsWatching(false);
  }, [client]);

  // Manual sweep trigger
  const triggerSweep = useCallback(async () => {
    if (!client) return;

    try {
      const results = await client.sweep();
      return results;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sweep failed");
    }
  }, [client]);

  // Change destination at runtime
  const changeDestination = useCallback(
    (chainId: number, address?: string) => {
      if (!client) return;

      client.setDestination({
        chainId,
        ...(address ? { address } : {}),
      });
    },
    [client]
  );

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Headless Deposit SDK Example</h1>

      {/* Connection Status */}
      <div className="mb-6 p-4 bg-gray-100 rounded-lg">
        <h2 className="font-semibold mb-2">Connection Status</h2>
        <p>Wallet Connected: {isConnected ? "Yes" : "No"}</p>
        <p>Particle Connected: {particleConnected ? "Yes" : "No"}</p>
        <p>SDK Ready: {client ? "Yes" : "No"}</p>
      </div>

      {/* Deposit Addresses */}
      <div className="mb-6 p-4 bg-gray-100 rounded-lg">
        <h2 className="font-semibold mb-2">Deposit Addresses</h2>
        {depositAddresses ? (
          <>
            <p className="font-mono text-sm break-all">
              EVM: {depositAddresses.evm}
            </p>
            <p className="font-mono text-sm break-all">
              Solana: {depositAddresses.solana}
            </p>
          </>
        ) : (
          <button
            onClick={fetchAddresses}
            className="px-4 py-2 bg-blue-600 text-white rounded"
            disabled={!client}
          >
            Fetch Addresses
          </button>
        )}
      </div>

      {/* Watching Controls */}
      <div className="mb-6 p-4 bg-gray-100 rounded-lg">
        <h2 className="font-semibold mb-2">Balance Watching</h2>
        <p className="mb-2">Status: {isWatching ? "Watching" : "Stopped"}</p>
        <div className="flex gap-2">
          <button
            onClick={startWatching}
            disabled={!client || isWatching}
            className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
          >
            Start Watching
          </button>
          <button
            onClick={stopWatching}
            disabled={!client || !isWatching}
            className="px-4 py-2 bg-red-600 text-white rounded disabled:opacity-50"
          >
            Stop Watching
          </button>
          <button
            onClick={triggerSweep}
            disabled={!client}
            className="px-4 py-2 bg-purple-600 text-white rounded disabled:opacity-50"
          >
            Manual Sweep
          </button>
        </div>
      </div>

      {/* Destination Controls */}
      <div className="mb-6 p-4 bg-gray-100 rounded-lg">
        <h2 className="font-semibold mb-2">Change Destination</h2>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => changeDestination(CHAIN.ARBITRUM)}
            className="px-3 py-1 bg-gray-600 text-white rounded text-sm"
          >
            Arbitrum
          </button>
          <button
            onClick={() => changeDestination(CHAIN.BASE)}
            className="px-3 py-1 bg-gray-600 text-white rounded text-sm"
          >
            Base
          </button>
          <button
            onClick={() => changeDestination(CHAIN.ETHEREUM)}
            className="px-3 py-1 bg-gray-600 text-white rounded text-sm"
          >
            Ethereum
          </button>
          <button
            onClick={() => changeDestination(CHAIN.POLYGON, "0xTreasuryAddress...")}
            className="px-3 py-1 bg-gray-600 text-white rounded text-sm"
          >
            Polygon (Custom Addr)
          </button>
        </div>
      </div>

      {/* Detected Deposits */}
      <div className="mb-6 p-4 bg-gray-100 rounded-lg">
        <h2 className="font-semibold mb-2">Detected Deposits ({deposits.length})</h2>
        {deposits.length === 0 ? (
          <p className="text-gray-500">No deposits detected yet</p>
        ) : (
          <ul className="space-y-2">
            {deposits.map((deposit) => (
              <li key={deposit.id} className="p-2 bg-white rounded">
                <p>
                  {deposit.amount} {deposit.token} on Chain {deposit.chainId}
                </p>
                <p className="text-sm text-gray-500">ID: {deposit.id}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-100 text-red-700 rounded-lg">
          Error: {error}
        </div>
      )}
    </div>
  );
}

"use client";

/**
 * Example: React Widget with Custom Destination Address
 *
 * This example demonstrates using the DepositWidget/DepositModal with a
 * specific destination chain AND a custom address (e.g., a treasury wallet).
 *
 * Use case: Sweep deposited funds to a team treasury, hot wallet, or any
 * address other than the user's connected wallet.
 *
 * Architecture:
 * - DepositProvider: Wraps app, provides context, configures destination
 * - useDeposit: Initializes SDK when ownerAddress is provided
 * - DepositModal/Widget: UI components that use the initialized SDK
 */

import { useState } from "react";
import {
  DepositProvider,
  DepositModal,
  DepositWidget,
  useDeposit,
  CHAIN,
} from "@particle-network/deposit-sdk/react";

// =============================================================================
// PSEUDOCODE: Your auth provider
// =============================================================================
// In a real app, get ownerAddress from your auth provider (Privy, RainbowKit, etc.)
//
// import { usePrivy, useWallets, getEmbeddedConnectedWallet } from "@privy-io/react-auth";
// const { wallets } = useWallets();
// const embeddedWallet = getEmbeddedConnectedWallet(wallets);
// const ownerAddress = embeddedWallet?.address;

// For this example, we simulate a connected wallet:
const useAuth = () => ({
  ownerAddress: "0x1234567890abcdef1234567890abcdef12345678",
  isConnected: true,
});

// =============================================================================
// CONSTANTS
// =============================================================================

// Your treasury or destination wallet address
const TREASURY_ADDRESS = "0x742d35Cc6634C0532925a3b844Bc9e7595f8dE42";

// =============================================================================
// INNER COMPONENT: Uses the SDK after initialization
// =============================================================================

function DepositPageContent() {
  const [showModal, setShowModal] = useState(false);
  const [showInlineWidget, setShowInlineWidget] = useState(false);

  // Get owner address from your auth provider
  const { ownerAddress, isConnected } = useAuth();

  // REQUIRED: Initialize SDK with ownerAddress
  // This triggers Particle Auth Core connection and creates the DepositClient
  const { isConnecting, isReady, error } = useDeposit({
    ownerAddress: isConnected ? ownerAddress : undefined,
  });

  // Loading state
  if (isConnecting) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">Initializing SDK...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-500">Error: {error.message}</p>
      </div>
    );
  }

  // Not ready state
  if (!isReady) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">Connect your wallet to continue</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">
        Widget with Custom Destination Address
      </h1>
      <p className="text-gray-600 mb-8">
        All deposits are swept to a treasury wallet on Base, not the user&apos;s EOA.
      </p>

      {/* Current Configuration Display */}
      <div className="mb-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h2 className="font-semibold text-blue-900 mb-2">Configuration</h2>
        <div className="space-y-1 text-sm">
          <p>
            <span className="text-blue-700">Destination Chain:</span> Base (8453)
          </p>
          <p>
            <span className="text-blue-700">Destination Address:</span>{" "}
            <code className="bg-blue-100 px-1 rounded">{TREASURY_ADDRESS}</code>
          </p>
          <p>
            <span className="text-blue-700">User EOA:</span>{" "}
            <code className="bg-blue-100 px-1 rounded">{ownerAddress}</code>
          </p>
        </div>
        <p className="mt-3 text-xs text-blue-600">
          Note: Funds are NOT sent to the user&apos;s wallet - they go to the treasury!
        </p>
      </div>

      {/* Option 1: Modal Usage */}
      <div className="mb-6">
        <h2 className="font-semibold mb-2">Option 1: Modal</h2>
        <button
          onClick={() => setShowModal(true)}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Open Deposit Modal
        </button>

        <DepositModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          theme="dark"
          destination={{
            chainId: CHAIN.BASE,
            address: TREASURY_ADDRESS,
          }}
        />
      </div>

      {/* Option 2: Inline Widget */}
      <div className="mb-6">
        <h2 className="font-semibold mb-2">Option 2: Inline Widget</h2>
        <button
          onClick={() => setShowInlineWidget(!showInlineWidget)}
          className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors mb-4"
        >
          {showInlineWidget ? "Hide" : "Show"} Inline Widget
        </button>

        {showInlineWidget && (
          <div className="flex justify-center">
            <DepositWidget
              theme="dark"
              destination={{
                chainId: CHAIN.BASE,
                address: TREASURY_ADDRESS,
              }}
            />
          </div>
        )}
      </div>

      {/* Code Example */}
      <div className="mt-8 p-4 bg-gray-900 rounded-lg">
        <h2 className="font-semibold text-white mb-2">Full Code</h2>
        <pre className="text-sm text-green-400 overflow-x-auto">
{`import {
  DepositProvider,
  DepositModal,
  useDeposit,
  CHAIN,
} from '@particle-network/deposit-sdk/react';

const TREASURY = "0x742d35Cc...";

function App() {
  const { address } = useYourAuthProvider();

  // REQUIRED: Initialize SDK
  const { isReady } = useDeposit({ ownerAddress: address });

  if (!isReady) return <Loading />;

  return (
    <DepositModal
      isOpen={showModal}
      onClose={() => setShowModal(false)}
      destination={{
        chainId: CHAIN.BASE,
        address: TREASURY,
      }}
    />
  );
}

// Wrap with DepositProvider at app root
<DepositProvider>
  <App />
</DepositProvider>`}
        </pre>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN EXPORT: Wrapped with DepositProvider
// =============================================================================

export default function WidgetCustomAddressExample() {
  return (
    <DepositProvider
      config={{
        // Default destination at provider level (can be overridden by widget props)
        destination: {
          chainId: CHAIN.BASE,
          address: TREASURY_ADDRESS,
        },
      }}
    >
      <DepositPageContent />
    </DepositProvider>
  );
}

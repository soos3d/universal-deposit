"use client";

/**
 * Example: React Widget with Specific Chain (EOA Address)
 *
 * This example demonstrates using the DepositWidget/DepositModal with a
 * specific destination chain while keeping the user's connected EOA as
 * the destination address.
 *
 * Use case: Let users receive swept funds on their preferred chain
 * (e.g., Base for lower fees) while still using their own wallet.
 *
 * Architecture:
 * - DepositProvider: Wraps app, provides context
 * - useDeposit: Initializes SDK when ownerAddress is provided (REQUIRED)
 * - DepositModal/Widget: UI components with destination prop
 */

import { useState } from "react";
import {
  DepositProvider,
  DepositModal,
  DepositWidget,
  useDeposit,
  useDepositContext,
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

// Available chains for the user to choose from
const AVAILABLE_CHAINS = [
  { id: CHAIN.ARBITRUM, name: "Arbitrum", description: "Fast & cheap" },
  { id: CHAIN.BASE, name: "Base", description: "Coinbase L2" },
  { id: CHAIN.ETHEREUM, name: "Ethereum", description: "Mainnet" },
  { id: CHAIN.POLYGON, name: "Polygon", description: "Low fees" },
  { id: CHAIN.OPTIMISM, name: "Optimism", description: "Optimistic rollup" },
];

// =============================================================================
// INNER COMPONENT: Uses the SDK after initialization
// =============================================================================

function DepositPageContent() {
  const [showModal, setShowModal] = useState(false);
  const [selectedChainId, setSelectedChainId] = useState<number>(CHAIN.ARBITRUM);

  // Get owner address from your auth provider
  const { ownerAddress, isConnected } = useAuth();

  // REQUIRED: Initialize SDK with ownerAddress
  // This triggers Particle Auth Core connection and creates the DepositClient
  const { isConnecting, isReady, error } = useDeposit({
    ownerAddress: isConnected ? ownerAddress : undefined,
  });

  // Access context for current destination (after SDK is ready)
  const { currentDestination, setDestination } = useDepositContext();

  // Handle chain selection
  const handleChainSelect = (chainId: number) => {
    setSelectedChainId(chainId);
    // Update the SDK's destination (address stays as ownerAddress)
    if (isReady) {
      setDestination({ chainId });
    }
  };

  const selectedChain = AVAILABLE_CHAINS.find((c) => c.id === selectedChainId);

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
        Widget with Chain Selection
      </h1>
      <p className="text-gray-600 mb-8">
        User selects their preferred chain. Funds are swept to their own wallet
        on that chain.
      </p>

      {/* Current Destination Display */}
      {currentDestination && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <h2 className="font-semibold text-green-900 mb-2">
            Current Sweep Destination
          </h2>
          <p className="text-sm">
            <span className="text-green-700">Chain:</span>{" "}
            {selectedChain?.name} ({currentDestination.chainId})
          </p>
          <p className="text-sm">
            <span className="text-green-700">Address:</span>{" "}
            <code className="bg-green-100 px-1 rounded text-xs">
              {currentDestination.address}
            </code>
          </p>
        </div>
      )}

      {/* Chain Selector */}
      <div className="mb-8">
        <h2 className="font-semibold mb-3">Select Destination Chain</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {AVAILABLE_CHAINS.map((chain) => (
            <button
              key={chain.id}
              onClick={() => handleChainSelect(chain.id)}
              className={`p-4 rounded-lg border-2 transition-all text-left ${
                selectedChainId === chain.id
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <p className="font-medium">{chain.name}</p>
              <p className="text-xs text-gray-500">{chain.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Open Modal Button */}
      <div className="mb-6">
        <button
          onClick={() => setShowModal(true)}
          className="w-full px-6 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-lg font-medium"
        >
          Open Deposit Modal
        </button>
        <p className="text-center text-gray-500 text-sm mt-2">
          Funds will be swept to your wallet on {selectedChain?.name}
        </p>
      </div>

      {/* Modal - destination from props */}
      <DepositModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        theme="dark"
        destination={{
          chainId: selectedChainId,
          // No address specified = uses ownerAddress (user's EOA)
        }}
      />

      {/* Inline Widget Preview */}
      <div className="mt-8">
        <h2 className="font-semibold mb-3">Inline Widget Preview</h2>
        <div className="flex justify-center">
          <DepositWidget
            theme="light"
            destination={{
              chainId: selectedChainId,
              // No address = user's EOA
            }}
          />
        </div>
      </div>

      {/* Code Examples */}
      <div className="mt-8 space-y-4">
        <div className="p-4 bg-gray-900 rounded-lg">
          <h3 className="font-semibold text-white mb-2">
            Full Example
          </h3>
          <pre className="text-sm text-green-400 overflow-x-auto">
{`import {
  DepositProvider,
  DepositModal,
  useDeposit,
  CHAIN,
} from '@particle-network/deposit-sdk/react';

function App() {
  const { address } = useYourAuthProvider();
  const [chainId, setChainId] = useState(CHAIN.ARBITRUM);

  // REQUIRED: Initialize SDK with ownerAddress
  const { isReady } = useDeposit({ ownerAddress: address });

  if (!isReady) return <Loading />;

  return (
    <>
      {/* Chain selector */}
      <button onClick={() => setChainId(CHAIN.BASE)}>Base</button>
      <button onClick={() => setChainId(CHAIN.POLYGON)}>Polygon</button>

      {/* Widget uses selected chain, sweeps to user's EOA */}
      <DepositModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        destination={{ chainId }}
      />
    </>
  );
}

// Wrap with DepositProvider at app root
<DepositProvider>
  <App />
</DepositProvider>`}
          </pre>
        </div>

        <div className="p-4 bg-gray-900 rounded-lg">
          <h3 className="font-semibold text-white mb-2">
            Via Context: Runtime Updates
          </h3>
          <pre className="text-sm text-green-400 overflow-x-auto">
{`import { useDepositContext } from '@particle-network/deposit-sdk/react';

function ChainSelector() {
  // Access context (requires useDeposit to be called first)
  const { setDestination, currentDestination } = useDepositContext();

  return (
    <button onClick={() => setDestination({ chainId: CHAIN.BASE })}>
      Switch to Base
    </button>
  );
}`}
          </pre>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN EXPORT: Wrapped with DepositProvider
// =============================================================================

export default function WidgetChainOnlyExample() {
  return (
    <DepositProvider
      config={{
        // Default destination - can be overridden by widget props or setDestination
        destination: { chainId: CHAIN.ARBITRUM },
      }}
    >
      <DepositPageContent />
    </DepositProvider>
  );
}

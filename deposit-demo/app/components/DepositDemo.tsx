"use client";

import { useState, useEffect } from "react";
import {
  usePrivy,
  useWallets,
  getEmbeddedConnectedWallet,
} from "@privy-io/react-auth";
import {
  useDeposit,
  DepositModal,
  RecoveryModal,
  CHAIN,
  type DestinationConfig,
} from "@particle-network/deposit-sdk/react";

// Available destination chains for the demo
const DESTINATION_CHAINS = [
  { id: CHAIN.ARBITRUM, name: "Arbitrum", color: "#12aaeb" },
  { id: CHAIN.BASE, name: "Base", color: "#0052ff" },
  { id: CHAIN.ETHEREUM, name: "Ethereum", color: "#627eea" },
  { id: CHAIN.POLYGON, name: "Polygon", color: "#8247e5" },
  { id: CHAIN.OPTIMISM, name: "Optimism", color: "#ff0420" },
  { id: CHAIN.BNB, name: "BNB Chain", color: "#f3ba2f" },
];

const WALLET_CREATION_TIMEOUT_MS = 30000;

/**
 * Simplified Deposit Demo using the new SDK API.
 *
 * The SDK now handles:
 * - JWT fetching from the worker
 * - Auth Core connection
 * - DepositClient initialization
 * - Auto-watching for deposits
 *
 * All you need to provide is the user's wallet address!
 */
export function DepositDemo() {
  const { login, ready, authenticated, logout } = usePrivy();
  const { wallets } = useWallets();
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);

  // Destination configuration state
  const [destinationChainId, setDestinationChainId] = useState<number>(CHAIN.ARBITRUM);
  const [useCustomAddress, setUseCustomAddress] = useState(false);
  const [customAddress, setCustomAddress] = useState("");

  // Build destination config based on user selections
  const destinationConfig: DestinationConfig = {
    chainId: destinationChainId,
    ...(useCustomAddress && customAddress ? { address: customAddress } : {}),
  };

  // Use Privy's embedded wallet, not external wallets like MetaMask
  // For new users, this will be undefined until Privy creates the wallet
  const embeddedWallet = getEmbeddedConnectedWallet(wallets);
  const ownerAddress = embeddedWallet?.address;

  // Track wallet readiness - new users need wallet creation after login
  const isWalletReady = authenticated && !!ownerAddress;
  const isWalletPending = authenticated && !ownerAddress;

  // Track if wallet creation has timed out (stuck state)
  const [isWalletTimedOut, setIsWalletTimedOut] = useState(false);

  useEffect(() => {
    if (!isWalletPending) {
      setIsWalletTimedOut(false);
      return;
    }

    const timer = setTimeout(() => {
      setIsWalletTimedOut(true);
    }, WALLET_CREATION_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [isWalletPending]);

  // Only pass ownerAddress when wallet is actually ready
  // This prevents SDK initialization before Privy finishes wallet creation
  const { isConnecting, isReady, error, disconnect } = useDeposit({
    ownerAddress: isWalletReady ? ownerAddress : undefined,
  });

  const handleDisconnect = async () => {
    await disconnect();
    logout();
  };

  // Reset auth when stuck in wallet creation (SDK not initialized yet)
  const handleResetAuth = () => {
    logout();
  };

  return (
    <div className="min-h-screen bg-black p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Deposit SDK Demo</h1>
            <p className="text-zinc-400 text-sm mt-1">
              Login with Privy → Deposit to UA → Auto-sweep to EOA
            </p>
          </div>
          {authenticated && ownerAddress && (
            <div className="flex items-center gap-4">
              <div className="text-sm text-zinc-400">
                <span className="text-zinc-500">EOA:</span>{" "}
                <span className="text-white font-mono">
                  {ownerAddress.slice(0, 6)}...{ownerAddress.slice(-4)}
                </span>
              </div>
              <button
                onClick={handleDisconnect}
                className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition-colors text-sm"
              >
                Disconnect
              </button>
            </div>
          )}
        </div>

        {/* Loading State */}
        {!ready && (
          <div className="mb-8 p-6 bg-zinc-900 rounded-xl border border-zinc-800 text-center">
            <div className="flex items-center justify-center gap-3">
              <div className="animate-spin w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full" />
              <p className="text-zinc-400">Loading...</p>
            </div>
          </div>
        )}

        {/* Login Button */}
        {ready && !authenticated && (
          <div className="mb-8 p-6 bg-zinc-900 rounded-xl border border-zinc-800 text-center">
            <h2 className="text-lg font-semibold text-white mb-4">
              Connect Your Wallet
            </h2>
            <p className="text-zinc-400 text-sm mb-6">
              Login with Privy to start using the Deposit SDK. Your deposits
              will be automatically swept to your connected wallet.
            </p>
            <button
              onClick={login}
              className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Login with Privy
            </button>
          </div>
        )}

        {/* Wallet Creation State - for new users */}
        {isWalletPending && !isWalletTimedOut && (
          <div className="mb-6 p-4 bg-yellow-900/30 border border-yellow-500/30 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="animate-spin w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full" />
              <p className="text-yellow-400">Creating your wallet...</p>
            </div>
            <button
              onClick={handleResetAuth}
              className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Stuck State - wallet creation timed out */}
        {isWalletPending && isWalletTimedOut && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-500/30 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-red-400 font-medium">
                  Wallet creation appears stuck
                </p>
                <p className="text-red-400/70 text-sm mt-1">
                  This is taking longer than expected. Try resetting and logging
                  in again.
                </p>
              </div>
              <button
                onClick={handleResetAuth}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
              >
                Reset & Try Again
              </button>
            </div>
          </div>
        )}

        {/* Connecting State */}
        {isWalletReady && isConnecting && (
          <div className="mb-6 p-4 bg-blue-900/30 border border-blue-500/30 rounded-lg flex items-center gap-3">
            <div className="animate-spin w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full" />
            <p className="text-blue-400">Initializing Deposit SDK...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-500/30 rounded-lg">
            <p className="text-red-400">Error: {error.message}</p>
          </div>
        )}

        {/* Demo Options - Show when ready AND authenticated */}
        {isReady && authenticated && (
          <div className="max-w-md mx-auto space-y-4">
            {/* Destination Configuration */}
            <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
              <h2 className="text-lg font-semibold text-white mb-4">
                Sweep Destination
              </h2>
              <p className="text-zinc-400 text-sm mb-4">
                Configure where your deposited funds will be swept to.
              </p>

              {/* Chain Selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Destination Chain
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {DESTINATION_CHAINS.map((chain) => (
                    <button
                      key={chain.id}
                      onClick={() => setDestinationChainId(chain.id)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        destinationChainId === chain.id
                          ? "bg-blue-600 text-white ring-2 ring-blue-400"
                          : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                      }`}
                    >
                      {chain.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Address Toggle */}
              <div className="mb-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useCustomAddress}
                    onChange={(e) => setUseCustomAddress(e.target.checked)}
                    className="w-4 h-4 rounded bg-zinc-800 border-zinc-600 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-zinc-300">
                    Use custom destination address
                  </span>
                </label>
              </div>

              {/* Custom Address Input */}
              {useCustomAddress && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Destination Address
                  </label>
                  <input
                    type="text"
                    value={customAddress}
                    onChange={(e) => setCustomAddress(e.target.value)}
                    placeholder="0x..."
                    className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  />
                  <p className="text-zinc-500 text-xs mt-1">
                    Leave empty to use your connected wallet address
                  </p>
                </div>
              )}

              {/* Current Config Display */}
              <div className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
                <p className="text-xs text-zinc-500 mb-1">Current destination:</p>
                <p className="text-sm text-white font-medium">
                  {DESTINATION_CHAINS.find((c) => c.id === destinationChainId)?.name}
                  {" → "}
                  <span className="font-mono text-zinc-400">
                    {useCustomAddress && customAddress
                      ? `${customAddress.slice(0, 6)}...${customAddress.slice(-4)}`
                      : "Your wallet"}
                  </span>
                </p>
              </div>
            </div>

            {/* SDK Widgets */}
            <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
              <h2 className="text-lg font-semibold text-white mb-4">
                SDK Widgets Demo
              </h2>
              <p className="text-zinc-400 text-sm mb-6">
                The SDK provides pre-built widgets for deposit and recovery
                flows. Click the buttons below to try them out.
              </p>

              {/* Deposit Widget Button */}
              <div className="mb-4">
                <button
                  onClick={() => setShowDepositModal(true)}
                  className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Open Deposit Modal
                </button>
                <p className="text-zinc-500 text-xs mt-2 text-center">
                  Get deposit addresses and view activity
                </p>
              </div>

              {/* Recovery Widget Button */}
              <div className="mb-6">
                <button
                  onClick={() => setShowRecoveryModal(true)}
                  className="w-full px-6 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium"
                >
                  Open Recovery Modal
                </button>
                <p className="text-zinc-500 text-xs mt-2 text-center">
                  Scan and recover stuck funds
                </p>
              </div>

              {/* Info */}
              <div className="p-4 bg-green-900/20 border border-green-500/30 rounded-lg">
                <p className="text-green-400 text-sm">
                  ✅ Auto-sweep enabled. Send assets to the deposit address and
                  they will be automatically swept to{" "}
                  {DESTINATION_CHAINS.find((c) => c.id === destinationChainId)?.name}.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Modals */}
        <DepositModal
          isOpen={showDepositModal}
          onClose={() => setShowDepositModal(false)}
          theme="dark"
          destination={destinationConfig}
        />

        <RecoveryModal
          isOpen={showRecoveryModal}
          onClose={() => setShowRecoveryModal(false)}
          theme="dark"
        />
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { usePrivy, useWallets, getEmbeddedConnectedWallet } from "@privy-io/react-auth";
import { useDeposit, DepositModal } from "@particle-network/deposit-sdk/react";

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
  const [showModal, setShowModal] = useState(false);

  // Use Privy's embedded wallet, not external wallets like MetaMask
  const embeddedWallet = getEmbeddedConnectedWallet(wallets);
  const ownerAddress = embeddedWallet?.address;

  // This is all you need! The SDK handles JWT + Auth Core internally
  const { isConnecting, isReady, error, disconnect } = useDeposit({
    ownerAddress: authenticated ? ownerAddress : undefined,
  });

  const handleDisconnect = async () => {
    await disconnect();
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

        {/* Connecting State */}
        {authenticated && isConnecting && (
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
          <div className="max-w-md mx-auto">
            <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
              <h2 className="text-lg font-semibold text-white mb-4">
                Deposit Widget
              </h2>
              <p className="text-zinc-400 text-sm mb-4">
                Click the button below to open the deposit widget and get your
                deposit address.
              </p>
              <button
                onClick={() => setShowModal(true)}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Open Deposit Modal
              </button>

              {/* Info */}
              <div className="mt-6 p-4 bg-green-900/20 border border-green-500/30 rounded-lg">
                <p className="text-green-400 text-sm">
                  ✅ Auto-sweep enabled. Send assets to the deposit address and
                  they will be automatically swept to your wallet on Arbitrum.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Modal */}
        <DepositModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          theme="dark"
        />
      </div>
    </div>
  );
}

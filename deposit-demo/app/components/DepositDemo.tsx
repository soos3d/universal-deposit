"use client";

/**
 * Deposit SDK Demo
 *
 * A comprehensive developer demo showcasing the Particle Network Deposit SDK.
 * Demonstrates three integration modes:
 * - Modal: Pop-up widget triggered by button
 * - Inline: Embedded widget in page layout
 * - Headless: Programmatic API with custom UI
 */

import { useState, useEffect } from "react";
import {
  usePrivy,
  useWallets,
  getEmbeddedConnectedWallet,
} from "@privy-io/react-auth";
import {
  useDeposit,
  DepositModal,
  DepositWidget,
  RecoveryModal,
  CHAIN,
} from "@particle-network/deposit-sdk/react";
import { UniversalBalance } from "./UniversalBalance";
import { HeadlessDemo } from "./HeadlessDemo";
import { CodePanel, CODE_EXAMPLES } from "./CodePanel";

type DisplayMode = "modal" | "inline" | "headless";

export function DepositDemo() {
  const { login, ready, authenticated, logout } = usePrivy();
  const { wallets } = useWallets();

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);

  // Display mode
  const [displayMode, setDisplayMode] = useState<DisplayMode>("modal");

  // Get user's embedded wallet from Privy
  const embeddedWallet = getEmbeddedConnectedWallet(wallets);
  const ownerAddress = embeddedWallet?.address;

  // Wallet readiness states
  const isWalletReady = authenticated && !!ownerAddress;
  const isWalletPending = authenticated && !ownerAddress;

  // Initialize SDK with owner address — destination is fixed to Polygon
  const { isConnecting, isReady, error, disconnect } = useDeposit({
    ownerAddress: isWalletReady ? ownerAddress : undefined,
    destination: { chainId: CHAIN.POLYGON },
  });

  // Wallet creation timeout handling
  const [walletTimeout, setWalletTimeout] = useState(false);
  useEffect(() => {
    if (!isWalletPending) {
      setWalletTimeout(false);
      return;
    }
    const timer = setTimeout(() => setWalletTimeout(true), 30000);
    return () => clearTimeout(timer);
  }, [isWalletPending]);

  const handleLogout = async () => {
    await disconnect();
    logout();
  };

  // Get appropriate code examples based on mode
  const getCodeExamples = () => {
    const examples = [CODE_EXAMPLES.setup];
    if (displayMode === "modal") {
      examples.push(CODE_EXAMPLES.modal);
    } else if (displayMode === "inline") {
      examples.push(CODE_EXAMPLES.inline);
    } else {
      examples.push(CODE_EXAMPLES.headless, CODE_EXAMPLES.events);
    }
    return examples;
  };

  // Not authenticated - show login
  if (!ready || !authenticated) {
    return (
      <div className="min-h-screen bg-black p-8">
        <div className="max-w-4xl mx-auto">
          <Header />

          {!ready ? (
            <div className="p-12 bg-zinc-900 rounded-xl border border-zinc-800 text-center">
              <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-zinc-400">Loading...</p>
            </div>
          ) : (
            <div className="p-12 bg-zinc-900 rounded-xl border border-zinc-800 text-center">
              <h2 className="text-xl font-semibold text-white mb-3">
                Get Started
              </h2>
              <p className="text-zinc-400 mb-6 max-w-md mx-auto">
                Connect your wallet to explore the Deposit SDK demo. See how
                easy it is to accept deposits from any chain.
              </p>
              <button
                onClick={login}
                className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Connect Wallet
              </button>
            </div>
          )}

          {/* Show code examples even when not logged in */}
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-white mb-4">
              Quick Start
            </h2>
            <div className="h-96">
              <CodePanel
                examples={[
                  CODE_EXAMPLES.setup,
                  CODE_EXAMPLES.modal,
                  CODE_EXAMPLES.headless,
                ]}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <Header />

        {/* Wallet Status Bar */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 p-4 bg-zinc-900 rounded-xl border border-zinc-800">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${isReady ? "bg-green-500" : isConnecting ? "bg-yellow-500 animate-pulse" : "bg-zinc-500"}`}
              />
              <span className="text-sm text-zinc-400">
                {isReady
                  ? "SDK Ready"
                  : isConnecting
                    ? "Connecting..."
                    : "Disconnected"}
              </span>
            </div>
            <div className="h-4 w-px bg-zinc-700" />
            <span className="text-sm font-mono text-zinc-300">
              {ownerAddress?.slice(0, 6)}...{ownerAddress?.slice(-4)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowRecoveryModal(true)}
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Recovery
            </button>
            <button
              onClick={handleLogout}
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Disconnect
            </button>
          </div>
        </div>

        {/* Loading/Error States */}
        {isWalletPending && !walletTimeout && (
          <div className="mb-6 p-4 bg-yellow-900/20 border border-yellow-500/30 rounded-lg flex items-center gap-3">
            <div className="animate-spin w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full" />
            <span className="text-yellow-400 text-sm">Creating wallet...</span>
          </div>
        )}

        {isWalletPending && walletTimeout && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-500/30 rounded-lg">
            <p className="text-red-400 text-sm mb-2">Wallet creation stuck</p>
            <button
              onClick={logout}
              className="text-sm text-red-400 underline hover:text-red-300"
            >
              Reset and try again
            </button>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-500/30 rounded-lg">
            <p className="text-red-400 text-sm">{error.message}</p>
          </div>
        )}

        {/* Main Content Grid */}
        {isReady && ownerAddress && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column - Controls */}
            <div className="lg:col-span-3 space-y-4">
              {/* Universal Balance */}
              <UniversalBalance ownerAddress={ownerAddress} />

              {/* Destination Chain */}
              <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                <h3 className="text-sm font-semibold text-white mb-1">
                  Destination Chain
                </h3>
                <p className="text-zinc-500 text-xs mb-3">
                  Where deposits are sent
                </p>
                <div className="p-3 rounded-lg bg-blue-600 text-white">
                  <span className="font-medium block text-sm">Polygon</span>
                  <span className="text-xs text-blue-200">Chain ID 137</span>
                </div>

                <div className="mt-3 p-3 bg-zinc-800/60 rounded-lg border border-zinc-700/50">
                  <p className="text-zinc-400 text-xs leading-relaxed">
                    <span className="text-blue-400 font-medium">Dev note:</span>{" "}
                    Set any supported chain via the{" "}
                    <code className="text-zinc-300 bg-zinc-700/50 px-1 rounded">
                      destination
                    </code>{" "}
                    prop:
                  </p>
                  <pre className="mt-2 text-[11px] text-zinc-400 bg-zinc-900/80 rounded p-2 overflow-x-auto">
                    {`destination={{ chainId: CHAIN.BASE }}
// CHAIN.ARBITRUM, CHAIN.OPTIMISM,
// CHAIN.ETHEREUM, CHAIN.BNB, ...`}
                  </pre>
                </div>
              </div>

              {/* Info Box */}
              <div className="p-4 bg-zinc-900 rounded-xl border border-zinc-800">
                <p className="text-zinc-400 text-sm">
                  <span className="text-green-400">●</span> Auto-bridge enabled.
                  Deposits are automatically sent to{" "}
                  <span className="text-white font-medium">Polygon</span>.
                </p>
              </div>
            </div>

            {/* Center Column - Preview */}
            <div className="lg:col-span-5">
              {/* Mode Tabs */}
              <div className="flex border-b border-zinc-800 mb-4">
                {(["modal", "inline", "headless"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setDisplayMode(mode)}
                    className={`px-4 py-2 text-sm font-medium transition-colors capitalize ${
                      displayMode === mode
                        ? "text-white border-b-2 border-blue-500"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>

              {/* Mode Descriptions */}
              <div className="mb-4 text-sm text-zinc-500">
                {displayMode === "modal" &&
                  "Pre-built modal component triggered by button click."}
                {displayMode === "inline" &&
                  "Embeddable widget for direct page integration."}
                {displayMode === "headless" &&
                  "Programmatic API with full control over UI."}
              </div>

              {/* Mode Preview */}
              <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-6 min-h-[400px]">
                {displayMode === "modal" && (
                  <div className="flex flex-col items-center justify-center h-full gap-4">
                    <p className="text-zinc-400 text-sm text-center mb-4">
                      Click the button to open the deposit modal
                    </p>
                    <button
                      onClick={() => setShowModal(true)}
                      className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-semibold"
                    >
                      Open Deposit Widget
                    </button>
                  </div>
                )}

                {displayMode === "inline" && (
                  <div className="flex justify-center">
                    <DepositWidget
                      theme="dark"
                      destination={{ chainId: CHAIN.POLYGON }}
                    />
                  </div>
                )}

                {displayMode === "headless" && (
                  <HeadlessDemo
                    ownerAddress={ownerAddress}
                    selectedChainId={CHAIN.POLYGON}
                  />
                )}
              </div>
            </div>

            {/* Right Column - Code Examples */}
            <div className="lg:col-span-4">
              <h3 className="text-sm font-semibold text-white mb-3">
                Code Example
              </h3>
              <div className="h-[500px]">
                <CodePanel
                  examples={getCodeExamples()}
                  activeTab={
                    displayMode === "modal"
                      ? "Modal"
                      : displayMode === "inline"
                        ? "Inline"
                        : "Headless"
                  }
                />
              </div>
            </div>
          </div>
        )}

        {/* Modals */}
        <DepositModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          theme="dark"
          destination={{ chainId: CHAIN.POLYGON }}
        />

        <RecoveryModal
          isOpen={showRecoveryModal}
          onClose={() => setShowRecoveryModal(false)}
          theme="dark"
          showModeSelector={true}
          defaultMode="recover"
        />
      </div>
    </div>
  );
}

function Header() {
  return (
    <header className="mb-8">
      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-2xl font-bold text-white">Deposit SDK</h1>
        <span className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded-full font-medium">
          Demo
        </span>
      </div>
      <p className="text-zinc-500 max-w-2xl">
        Accept deposits from any chain, automatically bridge to your preferred
        network. Explore the three integration modes: Modal, Inline, and
        Headless.
      </p>
    </header>
  );
}

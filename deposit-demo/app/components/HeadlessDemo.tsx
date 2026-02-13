"use client";

import {
  useDeposit,
  CHAIN,
  getChainName,
} from "@particle-network/deposit-sdk/react";

interface HeadlessDemoProps {
  ownerAddress: string;
  selectedChainId: number;
}

export function HeadlessDemo({
  ownerAddress,
  selectedChainId,
}: HeadlessDemoProps) {
  const {
    isReady,
    isConnecting,
    depositAddresses,
    pendingDeposits,
    recentActivity,
    status,
    sweep,
    setDestination,
    currentDestination,
  } = useDeposit({ ownerAddress });

  const handleSweepAll = async () => {
    try {
      await sweep();
    } catch (error) {
      console.error("Sweep failed:", error);
    }
  };

  // Update destination when chain changes
  const handleDestinationChange = () => {
    if (currentDestination?.chainId !== selectedChainId) {
      setDestination({ chainId: selectedChainId });
    }
  };

  if (isConnecting) {
    return (
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
        <div className="flex items-center gap-3">
          <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full" />
          <span className="text-zinc-400">Initializing SDK...</span>
        </div>
      </div>
    );
  }

  if (!isReady) {
    return (
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
        <p className="text-zinc-500">Waiting for SDK to be ready...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status Bar */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-2 h-2 rounded-full ${
                status === "watching"
                  ? "bg-green-500 animate-pulse"
                  : status === "sweeping"
                    ? "bg-yellow-500 animate-pulse"
                    : status === "ready"
                      ? "bg-blue-500"
                      : "bg-zinc-500"
              }`}
            />
            <span className="text-sm font-medium text-white capitalize">
              {status}
            </span>
          </div>
          <div className="text-xs text-zinc-500">
            Destination:{" "}
            {getChainName(currentDestination?.chainId || CHAIN.ARBITRUM)}
          </div>
        </div>
      </div>

      {/* Deposit Addresses */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
        <h3 className="text-sm font-semibold text-white mb-3">
          Deposit Addresses
        </h3>
        <div className="space-y-3">
          <AddressRow label="EVM" address={depositAddresses?.evm} />
          <AddressRow label="Solana" address={depositAddresses?.solana} />
        </div>
      </div>

      {/* Pending Deposits */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">Pending Deposits</h3>
          {pendingDeposits.length > 0 && (
            <button
              onClick={handleSweepAll}
              className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Sweep All
            </button>
          )}
        </div>
        {pendingDeposits.length === 0 ? (
          <p className="text-zinc-500 text-sm">No pending deposits</p>
        ) : (
          <div className="space-y-2">
            {pendingDeposits.map((deposit) => (
              <div
                key={deposit.id}
                className="flex items-center justify-between p-3 bg-zinc-800 rounded-lg"
              >
                <div>
                  <span className="text-white font-medium">
                    {deposit.token}
                  </span>
                  <span className="text-zinc-400 text-sm ml-2">
                    on {getChainName(deposit.chainId)}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-white font-medium">
                    ${deposit.amountUSD.toFixed(2)}
                  </p>
                  <button
                    onClick={() => sweep(deposit.id)}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    Sweep
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
        <h3 className="text-sm font-semibold text-white mb-3">
          Recent Activity
        </h3>
        {recentActivity.length === 0 ? (
          <p className="text-zinc-500 text-sm">No recent activity</p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {recentActivity.slice(0, 10).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-2 bg-zinc-800/50 rounded text-sm"
              >
                <div className="flex items-center gap-2">
                  <ActivityIcon type={item.type} />
                  <span className="text-zinc-300">
                    {item.token} - ${item.amountUSD.toFixed(2)}
                  </span>
                </div>
                <span className="text-xs text-zinc-500 capitalize">
                  {item.type}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Update Destination Button */}
      {currentDestination?.chainId !== selectedChainId && (
        <button
          onClick={handleDestinationChange}
          className="w-full py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition-colors text-sm"
        >
          Update destination to {getChainName(selectedChainId)}
        </button>
      )}
    </div>
  );
}

function AddressRow({ label, address }: { label: string; address?: string }) {
  const handleCopy = async () => {
    if (address) {
      await navigator.clipboard.writeText(address);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-500 text-sm">{label}</span>
      {address ? (
        <button
          onClick={handleCopy}
          className="font-mono text-sm text-zinc-300 hover:text-white transition-colors"
          title="Click to copy"
        >
          {address.slice(0, 8)}...{address.slice(-6)}
        </button>
      ) : (
        <span className="text-zinc-600 text-sm">Loading...</span>
      )}
    </div>
  );
}

function ActivityIcon({ type }: { type: string }) {
  const colors = {
    detected: "bg-blue-500",
    processing: "bg-yellow-500",
    complete: "bg-green-500",
    error: "bg-red-500",
  };

  return (
    <div
      className={`w-2 h-2 rounded-full ${colors[type as keyof typeof colors] || "bg-zinc-500"}`}
    />
  );
}

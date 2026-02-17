"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X,
  Check,
  AlertCircle,
  RefreshCw,
  Wallet,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { cn } from "../utils/cn";
import type { DepositClient } from "../../core/DepositClient";
import type { DetectedDeposit, RecoveryResult, RefundResult, TokenType } from "../../core/types";
import { CHAIN, CHAIN_META } from "../../constants/chains";
import { getTokenDecimals } from "../../constants/tokens";
import { useDepositContext } from "../context/DepositContext";

type RecoveryMode = "recover" | "refund";

export interface RecoveryWidgetProps {
  /**
   * The DepositClient instance. Optional if using within DepositProvider.
   */
  client?: DepositClient;
  onClose?: () => void;
  className?: string;
  theme?: "dark" | "light";
  /**
   * Auto-scan for recoverable funds on mount. Default: true
   */
  autoScan?: boolean;
  /**
   * Whether the widget should expand to fill its container width.
   * When false (default), widget has a fixed width of 380px.
   * Use true for inline/embedded layouts.
   * @default false
   */
  fullWidth?: boolean;
  /**
   * Whether to show the header section with title and close button.
   * Use false for minimal embedded layouts where header is not needed.
   * @default true
   */
  showHeader?: boolean;
  /**
   * Whether to show the mode selector (Recover vs Refund).
   * When true, users can choose between sweeping to destination or refunding to source.
   * Note: Refund feature is experimental, so this is hidden by default.
   * @default false
   */
  showModeSelector?: boolean;
  /**
   * Default recovery mode.
   * - "recover": Sweep funds to the configured destination (default)
   * - "refund": Return funds to the source chain
   * @default "recover"
   */
  defaultMode?: RecoveryMode;
}

type ItemStatus = "pending" | "processing" | "success" | "error";

const LOGO_URLS: Record<string | number, string> = {
  // Chains
  [CHAIN.ETHEREUM]:
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
  [CHAIN.ARBITRUM]:
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png",
  [CHAIN.BASE]:
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png",
  [CHAIN.POLYGON]:
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png",
  [CHAIN.BNB]:
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/binance/info/logo.png",
  [CHAIN.SOLANA]:
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png",
  [CHAIN.OPTIMISM]:
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/info/logo.png",
  [CHAIN.AVALANCHE]:
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanchec/info/logo.png",
  [CHAIN.LINEA]:
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/linea/info/logo.png",
  [CHAIN.MANTLE]:
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/mantle/info/logo.png",
  [CHAIN.HYPERVM]:
    "https://universalx.app/_next/image?url=https%3A%2F%2Fstatic.particle.network%2Fchains%2Fevm%2Ficons%2F999.png&w=32&q=75",
  [CHAIN.MERLIN]:
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/merlin/info/logo.png",
  [CHAIN.XLAYER]:
    "https://universalx.app/_next/image?url=https%3A%2F%2Fstatic.particle.network%2Fchains%2Fevm%2Ficons%2F196.png&w=32&q=75",
  [CHAIN.MONAD]:
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/monad/info/logo.png",
  [CHAIN.SONIC]:
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/sonic/info/logo.png",
  [CHAIN.PLASMA]:
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/plasma/info/logo.png",
  [CHAIN.BERACHAIN]:
    "https://universalx.app/_next/image?url=https%3A%2F%2Fstatic.particle.network%2Fchains%2Fevm%2Ficons%2F80094.png&w=32&q=75",
  // Tokens
  ETH: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
  USDC: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png",
  USDT: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png",
  BTC: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/bitcoin/info/logo.png",
  SOL: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png",
  BNB: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/binance/info/logo.png",
};

function useOptionalDepositContext(): {
  client: DepositClient | null;
  stuckFunds: DetectedDeposit[];
  isRecovering: boolean;
  isRefunding: boolean;
  getStuckFunds: () => Promise<DetectedDeposit[]>;
  recoverFunds: () => Promise<RecoveryResult[]>;
  refundAll: () => Promise<RefundResult[]>;
} | null {
  try {
    return useDepositContext();
  } catch {
    return null;
  }
}

export function RecoveryWidget({
  client: clientProp,
  onClose,
  className,
  theme = "dark",
  autoScan = true,
  fullWidth = false,
  showHeader = true,
  showModeSelector = false,
  defaultMode = "recover",
}: RecoveryWidgetProps) {
  // Try to get client/methods from context if not provided as prop
  const context = useOptionalDepositContext();
  const client = clientProp || context?.client || null;

  const [stuckFunds, setStuckFunds] = useState<DetectedDeposit[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryResults, setRecoveryResults] = useState<RecoveryResult[]>([]);
  const [refundResults, setRefundResults] = useState<RefundResult[]>([]);
  const [itemStatuses, setItemStatuses] = useState<Map<string, ItemStatus>>(
    new Map()
  );
  const [error, setError] = useState<string | null>(null);
  const [hasScanned, setHasScanned] = useState(false);
  const [mode, setMode] = useState<RecoveryMode>(defaultMode);

  // Scan for stuck funds
  const scanForFunds = useCallback(async () => {
    if (!client) return;

    setIsScanning(true);
    setError(null);
    setRecoveryResults([]);

    try {
      const funds = await client.getStuckFunds();
      setStuckFunds(funds);
      // Initialize all items as pending
      const statuses = new Map<string, ItemStatus>();
      funds.forEach((fund) => statuses.set(fund.id, "pending"));
      setItemStatuses(statuses);
      setHasScanned(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to scan for funds");
    } finally {
      setIsScanning(false);
    }
  }, [client]);

  // Auto-scan on mount
  useEffect(() => {
    if (autoScan && client && !hasScanned) {
      scanForFunds();
    }
  }, [autoScan, client, hasScanned, scanForFunds]);

  // Listen to recovery events
  useEffect(() => {
    if (!client) return;

    const handleRecoveryStarted = () => {
      // Mark all items as pending (will be updated individually)
      setItemStatuses((prev) => {
        const next = new Map(prev);
        stuckFunds.forEach((fund) => next.set(fund.id, "pending"));
        return next;
      });
    };

    const handleRecoveryFailed = (deposit: DetectedDeposit) => {
      setItemStatuses((prev) => {
        const next = new Map(prev);
        next.set(deposit.id, "error");
        return next;
      });
    };

    client.on("recovery:started", handleRecoveryStarted);
    client.on("recovery:failed", handleRecoveryFailed);

    return () => {
      client.off("recovery:started", handleRecoveryStarted);
      client.off("recovery:failed", handleRecoveryFailed);
    };
  }, [client, stuckFunds]);

  // Recover all funds (sweep to destination)
  const handleRecoverAll = useCallback(async () => {
    if (!client || stuckFunds.length === 0) return;

    setIsRecovering(true);
    setError(null);
    setRecoveryResults([]);
    setRefundResults([]);

    // Mark all as processing
    setItemStatuses((prev) => {
      const next = new Map(prev);
      stuckFunds.forEach((fund) => next.set(fund.id, "processing"));
      return next;
    });

    try {
      const results = await client.recoverAllFunds();
      setRecoveryResults(results);

      // Update statuses based on results
      setItemStatuses((prev) => {
        const next = new Map(prev);
        results.forEach((result) => {
          // Find matching fund by token + chainId
          const fund = stuckFunds.find(
            (f) => f.token === result.token && f.chainId === result.chainId
          );
          if (fund) {
            next.set(fund.id, result.status === "success" ? "success" : "error");
          }
        });
        return next;
      });

      // Refresh stuck funds to see remaining
      const remaining = await client.getStuckFunds();
      setStuckFunds(remaining);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recovery failed");
      // Mark all as error on total failure
      setItemStatuses((prev) => {
        const next = new Map(prev);
        stuckFunds.forEach((fund) => next.set(fund.id, "error"));
        return next;
      });
    } finally {
      setIsRecovering(false);
    }
  }, [client, stuckFunds]);

  // Refund all funds (return to source chain)
  const handleRefundAll = useCallback(async () => {
    if (!client || stuckFunds.length === 0) return;

    setIsRecovering(true);
    setError(null);
    setRecoveryResults([]);
    setRefundResults([]);

    // Mark all as processing
    setItemStatuses((prev) => {
      const next = new Map(prev);
      stuckFunds.forEach((fund) => next.set(fund.id, "processing"));
      return next;
    });

    try {
      const results = await client.refundAll("user_requested");
      setRefundResults(results);

      // Update statuses based on results
      setItemStatuses((prev) => {
        const next = new Map(prev);
        results.forEach((result) => {
          // Find matching fund by depositId
          const fund = stuckFunds.find((f) => f.id === result.depositId);
          if (fund) {
            next.set(fund.id, result.status === "success" ? "success" : "error");
          }
        });
        return next;
      });

      // Refresh stuck funds to see remaining
      const remaining = await client.getStuckFunds();
      setStuckFunds(remaining);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refund failed");
      // Mark all as error on total failure
      setItemStatuses((prev) => {
        const next = new Map(prev);
        stuckFunds.forEach((fund) => next.set(fund.id, "error"));
        return next;
      });
    } finally {
      setIsRecovering(false);
    }
  }, [client, stuckFunds]);

  // Handle action based on mode
  const handleAction = useCallback(() => {
    if (mode === "recover") {
      handleRecoverAll();
    } else {
      handleRefundAll();
    }
  }, [mode, handleRecoverAll, handleRefundAll]);

  // Format helpers
  const formatAmount = (amount: string, token: TokenType, chainId: number) => {
    const decimals = getTokenDecimals(token, chainId);
    const value = Number(amount) / Math.pow(10, decimals);
    return value.toFixed(value < 1 ? 6 : value < 100 ? 4 : 2);
  };

  const formatUSD = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const totalUSD = stuckFunds.reduce((sum, fund) => sum + fund.amountUSD, 0);

  const allResults = mode === "recover" ? recoveryResults : refundResults;
  const successCount = allResults.filter(
    (r) => r.status === "success"
  ).length;
  const failedCount = allResults.filter(
    (r) => r.status === "failed"
  ).length;

  return (
    <>
      <style>{`
        .recovery-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .recovery-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .recovery-scrollbar::-webkit-scrollbar-thumb {
          background: ${theme === "dark" ? "#3f3f46" : "#d1d5db"};
          border-radius: 3px;
        }
        .recovery-scrollbar::-webkit-scrollbar-thumb:hover {
          background: ${theme === "dark" ? "#52525b" : "#9ca3af"};
        }
      `}</style>
      <div
        className={cn(
          "rounded-[20px] border overflow-hidden shadow-2xl",
          fullWidth ? "w-full" : "w-[380px]",
          theme === "dark"
            ? "bg-[#09090b] border-[#27272a] text-white"
            : "bg-white border-gray-200 text-gray-900",
          className
        )}
      >
        {/* Header */}
        {showHeader && (
          <div className="flex items-center justify-between px-6 pt-5 pb-4">
            <h2 className="text-[15px] font-semibold">Recover Funds</h2>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close recovery dialog"
                className={cn(
                  "p-1 rounded transition-colors",
                  theme === "dark"
                    ? "text-[#52525b] hover:text-white"
                    : "text-gray-500 hover:text-gray-900"
                )}
              >
                <X size={20} />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className={cn("px-6 pb-6", !showHeader && "pt-5")}>
          {/* Mode Selector */}
          {showModeSelector && (
            <div
              className={cn(
                "flex rounded-lg p-1 mb-4",
                theme === "dark" ? "bg-[#1a1a1a]" : "bg-gray-100"
              )}
            >
              <button
                type="button"
                onClick={() => setMode("recover")}
                disabled={isRecovering}
                className={cn(
                  "flex-1 py-2 px-3 rounded-md text-[12px] font-medium transition-all",
                  mode === "recover"
                    ? theme === "dark"
                      ? "bg-[#27272a] text-white"
                      : "bg-white text-gray-900 shadow-sm"
                    : theme === "dark"
                      ? "text-[#71717a] hover:text-[#a1a1aa]"
                      : "text-gray-500 hover:text-gray-700",
                  isRecovering && "cursor-not-allowed opacity-50"
                )}
              >
                Recover to Wallet
              </button>
              <button
                type="button"
                onClick={() => setMode("refund")}
                disabled={isRecovering}
                className={cn(
                  "flex-1 py-2 px-3 rounded-md text-[12px] font-medium transition-all",
                  mode === "refund"
                    ? theme === "dark"
                      ? "bg-[#27272a] text-white"
                      : "bg-white text-gray-900 shadow-sm"
                    : theme === "dark"
                      ? "text-[#71717a] hover:text-[#a1a1aa]"
                      : "text-gray-500 hover:text-gray-700",
                  isRecovering && "cursor-not-allowed opacity-50"
                )}
              >
                Refund to Source
              </button>
            </div>
          )}

          {/* Scanning State */}
          {isScanning && (
            <div
              aria-live="polite"
              className={cn(
                "rounded-xl border p-6 flex flex-col items-center justify-center gap-3",
                theme === "dark"
                  ? "bg-[#121212] border-[#27272a]"
                  : "bg-gray-50 border-gray-200"
              )}
            >
              <Loader2
                size={24}
                className={cn(
                  "animate-spin",
                  theme === "dark" ? "text-[#a1a1aa]" : "text-gray-500"
                )}
              />
              <span
                className={cn(
                  "text-[13px]",
                  theme === "dark" ? "text-[#a1a1aa]" : "text-gray-500"
                )}
              >
                Scanning for recoverable funds...
              </span>
            </div>
          )}

          {/* Error State */}
          {error && !isScanning && (
            <div
              role="alert"
              className={cn(
                "rounded-xl border p-4 flex items-start gap-3",
                theme === "dark"
                  ? "bg-red-500/10 border-red-500/20"
                  : "bg-red-50 border-red-200"
              )}
            >
              <AlertCircle
                size={16}
                className={cn(
                  "shrink-0 mt-0.5",
                  theme === "dark" ? "text-red-400" : "text-red-600"
                )}
              />
              <div className="flex-1">
                <span
                  className={cn(
                    "text-[13px]",
                    theme === "dark" ? "text-red-400" : "text-red-700"
                  )}
                >
                  {error}
                </span>
              </div>
            </div>
          )}

          {/* No Funds State */}
          {!isScanning && !error && hasScanned && stuckFunds.length === 0 && (
            <div
              className={cn(
                "rounded-xl border p-6 flex flex-col items-center justify-center gap-3",
                theme === "dark"
                  ? "bg-[#121212] border-[#27272a]"
                  : "bg-gray-50 border-gray-200"
              )}
            >
              <div
                className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center",
                  theme === "dark"
                    ? "bg-green-500/10 text-green-500"
                    : "bg-green-100 text-green-600"
                )}
              >
                <Check size={24} />
              </div>
              <div className="text-center">
                <p className="text-[14px] font-medium">No recoverable funds</p>
                <p
                  className={cn(
                    "text-[12px] mt-1",
                    theme === "dark" ? "text-[#a1a1aa]" : "text-gray-500"
                  )}
                >
                  All your funds have been successfully swept
                </p>
              </div>
            </div>
          )}

          {/* Funds List */}
          {!isScanning && stuckFunds.length > 0 && (
            <div
              className={cn(
                "rounded-xl border overflow-hidden",
                theme === "dark"
                  ? "bg-[#121212] border-[#27272a]"
                  : "bg-gray-50 border-gray-200"
              )}
            >
              {/* List Header */}
              <div
                className={cn(
                  "px-4 py-3 text-[11px] font-semibold uppercase tracking-wide border-b",
                  theme === "dark"
                    ? "text-[#a1a1aa] border-[#27272a]"
                    : "text-gray-500 border-gray-200"
                )}
              >
                Recoverable Assets ({stuckFunds.length})
              </div>

              {/* Scrollable List */}
              <div
                className="recovery-scrollbar max-h-[280px] overflow-y-auto"
                style={{
                  scrollbarWidth: "thin",
                  scrollbarColor:
                    theme === "dark"
                      ? "#3f3f46 transparent"
                      : "#d1d5db transparent",
                }}
              >
                {stuckFunds.map((fund) => {
                  const status = itemStatuses.get(fund.id) || "pending";
                  const chainMeta = CHAIN_META[fund.chainId];

                  return (
                    <div
                      key={fund.id}
                      className={cn(
                        "px-4 py-3 flex items-center justify-between border-b last:border-b-0",
                        theme === "dark"
                          ? "border-[#27272a]"
                          : "border-gray-200"
                      )}
                    >
                      {/* Left: Token + Chain */}
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <img
                            src={LOGO_URLS[fund.token]}
                            alt={fund.token}
                            className="w-8 h-8 rounded-full"
                          />
                          <img
                            src={LOGO_URLS[fund.chainId]}
                            alt={chainMeta?.name || "Chain"}
                            className="w-4 h-4 rounded-full absolute -bottom-0.5 -right-0.5 border-2 border-[#121212]"
                          />
                        </div>
                        <div>
                          <p className="text-[13px] font-medium">
                            {fund.token}
                          </p>
                          <p
                            className={cn(
                              "text-[11px]",
                              theme === "dark"
                                ? "text-[#a1a1aa]"
                                : "text-gray-500"
                            )}
                          >
                            {chainMeta?.name || `Chain ${fund.chainId}`}
                          </p>
                        </div>
                      </div>

                      {/* Right: Amount + Status */}
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-[13px] font-mono font-medium">
                            {formatAmount(fund.amount, fund.token, fund.chainId)}
                          </p>
                          <p
                            className={cn(
                              "text-[11px]",
                              theme === "dark"
                                ? "text-[#a1a1aa]"
                                : "text-gray-500"
                            )}
                          >
                            {formatUSD(fund.amountUSD)}
                          </p>
                        </div>
                        <div
                          className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center",
                            status === "pending" &&
                              (theme === "dark"
                                ? "bg-[#27272a] text-[#52525b]"
                                : "bg-gray-200 text-gray-400"),
                            status === "processing" &&
                              (theme === "dark"
                                ? "bg-blue-500/20 text-blue-400"
                                : "bg-blue-100 text-blue-600"),
                            status === "success" &&
                              (theme === "dark"
                                ? "bg-green-500/20 text-green-400"
                                : "bg-green-100 text-green-600"),
                            status === "error" &&
                              (theme === "dark"
                                ? "bg-red-500/20 text-red-400"
                                : "bg-red-100 text-red-600")
                          )}
                        >
                          {status === "pending" && (
                            <Wallet size={12} />
                          )}
                          {status === "processing" && (
                            <Loader2 size={12} className="animate-spin" />
                          )}
                          {status === "success" && <Check size={12} />}
                          {status === "error" && <X size={12} />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Total */}
              <div
                className={cn(
                  "px-4 py-3 flex items-center justify-between border-t",
                  theme === "dark"
                    ? "bg-[#09090b] border-[#27272a]"
                    : "bg-white border-gray-200"
                )}
              >
                <span
                  className={cn(
                    "text-[13px] font-medium",
                    theme === "dark" ? "text-[#a1a1aa]" : "text-gray-600"
                  )}
                >
                  Total
                </span>
                <span className="text-[14px] font-semibold">
                  {formatUSD(totalUSD)}
                </span>
              </div>
            </div>
          )}

          {/* Recovery/Refund Results */}
          {allResults.length > 0 && (
            <div
              className={cn(
                "mt-4 rounded-xl border p-4",
                theme === "dark"
                  ? "bg-[#121212] border-[#27272a]"
                  : "bg-gray-50 border-gray-200"
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "text-[13px] font-medium",
                    theme === "dark" ? "text-[#a1a1aa]" : "text-gray-600"
                  )}
                >
                  {mode === "recover" ? "Recovery" : "Refund"} Complete
                </span>
                <div className="flex items-center gap-3 text-[12px]">
                  {successCount > 0 && (
                    <span
                      className={cn(
                        "flex items-center gap-1",
                        theme === "dark" ? "text-green-400" : "text-green-600"
                      )}
                    >
                      <Check size={12} />
                      {successCount} succeeded
                    </span>
                  )}
                  {failedCount > 0 && (
                    <span
                      className={cn(
                        "flex items-center gap-1",
                        theme === "dark" ? "text-red-400" : "text-red-600"
                      )}
                    >
                      <X size={12} />
                      {failedCount} failed
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="mt-4 flex gap-3">
            {/* Scan Again Button */}
            <button
              type="button"
              onClick={scanForFunds}
              disabled={isScanning || isRecovering}
              className={cn(
                "flex-1 h-11 rounded-xl border text-[13px] font-medium transition-colors flex items-center justify-center gap-2",
                theme === "dark"
                  ? "border-[#27272a] hover:bg-[#27272a] disabled:opacity-50"
                  : "border-gray-300 hover:bg-gray-100 disabled:opacity-50",
                (isScanning || isRecovering) && "cursor-not-allowed"
              )}
            >
              <RefreshCw
                size={14}
                className={isScanning ? "animate-spin" : ""}
              />
              Scan
            </button>

            {/* Action Button */}
            <button
              type="button"
              onClick={handleAction}
              disabled={
                isScanning || isRecovering || stuckFunds.length === 0
              }
              className={cn(
                "flex-[2] h-11 rounded-xl text-[13px] font-semibold transition-colors flex items-center justify-center gap-2",
                mode === "recover"
                  ? theme === "dark"
                    ? "bg-amber-500 hover:bg-amber-600 text-black disabled:bg-[#27272a] disabled:text-[#52525b]"
                    : "bg-amber-500 hover:bg-amber-600 text-white disabled:bg-gray-200 disabled:text-gray-400"
                  : theme === "dark"
                    ? "bg-blue-500 hover:bg-blue-600 text-white disabled:bg-[#27272a] disabled:text-[#52525b]"
                    : "bg-blue-500 hover:bg-blue-600 text-white disabled:bg-gray-200 disabled:text-gray-400",
                (isScanning || isRecovering || stuckFunds.length === 0) &&
                  "cursor-not-allowed"
              )}
            >
              {isRecovering ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  {mode === "recover" ? "Recovering..." : "Refunding..."}
                </>
              ) : (
                <>
                  {mode === "recover" ? "Recover All" : "Refund All"}
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>

          {/* Info Box */}
          {!isScanning && stuckFunds.length > 0 && !isRecovering && (
            <div
              className={cn(
                "mt-4 rounded-lg p-2.5 flex gap-2.5 items-start",
                theme === "dark"
                  ? "bg-blue-500/10 border border-blue-500/15"
                  : "bg-blue-50 border border-blue-200"
              )}
            >
              <AlertCircle
                size={14}
                className={cn(
                  "shrink-0 mt-0.5",
                  theme === "dark" ? "text-blue-400" : "text-blue-600"
                )}
              />
              <span
                className={cn(
                  "text-[11px] leading-relaxed",
                  theme === "dark" ? "text-blue-400/90" : "text-blue-700"
                )}
              >
                {mode === "recover"
                  ? 'These funds were deposited but not automatically swept. Click "Recover All" to send them to your connected wallet.'
                  : 'Click "Refund All" to return funds to their original source chains. This is useful if the sweep to your wallet failed.'}
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

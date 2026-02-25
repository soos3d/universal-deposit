"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { X, Copy, QrCode, Check, Clock, AlertCircle, AlertTriangle, ArrowRight } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "../utils/cn";
import type { DepositClient } from "../../core/DepositClient";
import type {
  DetectedDeposit,
  SweepResult,
  RecoveryResult,
  TokenType,
  DestinationConfig,
} from "../../core/types";
import { CHAIN_META, getChainName } from "../../constants/chains";
import { getTokenDecimals, getMinDepositAmount } from "../../constants/tokens";
import { useDepositContext } from "../context/DepositContext";
import type { ActivityItem } from "../types";
import {
  LOGO_URLS,
  CHAIN_OPTIONS,
  CHAIN_SUPPORTED_TOKENS,
  TOKEN_SUPPORTED_CHAINS,
} from "../constants/widget-constants";

export interface DepositWidgetProps {
  /**
   * The DepositClient instance. Optional if using within DepositProvider.
   */
  client?: DepositClient;
  onClose?: () => void;
  className?: string;
  theme?: "dark" | "light";
  /**
   * Destination configuration for where swept funds are sent.
   * If provided, this takes precedence over the provider's destination config.
   * @see DestinationConfig
   */
  destination?: DestinationConfig;
  /**
   * Callback when destination is changed (via edit UI or programmatically).
   */
  onDestinationChange?: (destination: DestinationConfig) => void;
  /**
   * Whether to show the destination section in the widget.
   * @default true
   */
  showDestination?: boolean;
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
}

function useOptionalDepositContext() {
  try {
    return useDepositContext();
  } catch {
    return null;
  }
}

export function DepositWidget({
  client: clientProp,
  onClose,
  className,
  theme = "dark",
  destination: destinationProp,
  onDestinationChange,
  showDestination = true,
  fullWidth = false,
  showHeader = true,
}: DepositWidgetProps) {
  // Try to get client from context if not provided as prop
  const context = useOptionalDepositContext();
  const client = clientProp || context?.client || null;
  const hasContext = context !== null;
  const logger = context?.logger ?? { log: () => {}, warn: () => {}, error: () => {} };

  // Activity: use context state when available, fallback to local for direct client prop
  const [localActivity, setLocalActivity] = useState<ActivityItem[]>([]);
  const activity = hasContext ? (context.recentActivity ?? []) : localActivity;
  const recoveringIdsRef = useRef<Set<string>>(new Set());

  // Track current destination
  const [currentDestination, setCurrentDestination] = useState<{
    address: string;
    chainId: number;
  } | null>(null);

  const [selectedChain, setSelectedChain] = useState(CHAIN_OPTIONS[0]);
  const [selectedToken, setSelectedToken] = useState<TokenType>(
    CHAIN_SUPPORTED_TOKENS[CHAIN_OPTIONS[0].id][0],
  );
  const [showTokenDropdown, setShowTokenDropdown] = useState(false);
  const [showChainDropdown, setShowChainDropdown] = useState(false);

  const availableTokens = CHAIN_SUPPORTED_TOKENS[selectedChain.id] || [];

  const availableChains = useMemo(() => {
    const supportedChainIds = TOKEN_SUPPORTED_CHAINS[selectedToken] || [];
    return CHAIN_OPTIONS.filter((chain) => supportedChainIds.includes(chain.id));
  }, [selectedToken]);

  useEffect(() => {
    if (!availableTokens.includes(selectedToken)) {
      setSelectedToken(availableTokens[0]);
    }
  }, [selectedChain, selectedToken, availableTokens]);

  useEffect(() => {
    const supportedChainIds = TOKEN_SUPPORTED_CHAINS[selectedToken] || [];
    if (!supportedChainIds.includes(selectedChain.id)) {
      const firstAvailable = CHAIN_OPTIONS.find((c) => supportedChainIds.includes(c.id));
      if (firstAvailable) {
        setSelectedChain(firstAvailable);
      }
    }
  }, [selectedToken, selectedChain.id]);
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);
  const [depositAddress, setDepositAddress] = useState<string>("");
  const autoSweep = client?.getConfig().autoSweep ?? true;
  const minValueUSD = client?.getConfig().minValueUSD;

  // Get deposit address based on selected chain
  useEffect(() => {
    if (!client) return;

    const getAddress = async () => {
      try {
        const addresses = await client.getDepositAddresses();
        const addr =
          selectedChain.addressType === "solana"
            ? addresses.solana
            : addresses.evm;
        setDepositAddress(addr);
      } catch (error) {
        logger.error("Failed to get deposit address:", error);
      }
    };
    getAddress();
  }, [client, selectedChain]);

  // Use ref for callback to prevent infinite loops when consumer doesn't memoize
  const onDestinationChangeRef = useRef(onDestinationChange);
  onDestinationChangeRef.current = onDestinationChange;

  // Sync destination prop to client and track current destination
  useEffect(() => {
    if (!client) {
      setCurrentDestination(null);
      return;
    }

    // If destination prop provided, apply it to the client
    if (destinationProp) {
      try {
        client.setDestination(destinationProp);
      } catch (e) {
        logger.warn('[DepositWidget] setDestination failed:', e);
      }
    }

    // Get current destination from client
    try {
      const dest = client.getDestination();
      setCurrentDestination(dest);
      // Notify consumer of current destination
      onDestinationChangeRef.current?.(dest);
    } catch {
      // Client may not be fully initialized
      setCurrentDestination(null);
    }
  }, [client, destinationProp]);

  const handleRecover = useCallback(
    async (item: ActivityItem) => {
      if (hasContext) {
        return context.recoverActivityItem(item.id);
      }
      // Fallback for direct client prop mode
      if (!client || recoveringIdsRef.current.has(item.id)) return;

      recoveringIdsRef.current.add(item.id);
      setLocalActivity((prev) =>
        prev.map((a) =>
          a.id === item.id ? { ...a, type: "processing" as const } : a,
        ),
      );

      try {
        const deposit: DetectedDeposit = {
          id: item.id,
          token: item.token as DetectedDeposit["token"],
          chainId: item.chainId,
          amount: item.amount,
          amountUSD: item.amountUSD,
          rawAmount: BigInt(item.amount),
          detectedAt: item.timestamp,
        };
        const result = await client.recoverSingleDeposit(deposit);
        if (result.status === "success") {
          setLocalActivity((prev) =>
            prev.map((a) =>
              a.id === item.id
                ? { ...a, type: "complete" as const, message: "Recovered successfully" }
                : a,
            ),
          );
        } else {
          setLocalActivity((prev) =>
            prev.map((a) =>
              a.id === item.id
                ? { ...a, type: "error" as const, message: result.error || "Recovery failed" }
                : a,
            ),
          );
        }
      } catch (error) {
        setLocalActivity((prev) =>
          prev.map((a) =>
            a.id === item.id
              ? {
                  ...a,
                  type: "error" as const,
                  message: error instanceof Error ? error.message : "Recovery failed",
                }
              : a,
          ),
        );
      } finally {
        recoveringIdsRef.current.delete(item.id);
      }
    },
    [client, hasContext, context],
  );

  const handleBridge = useCallback(
    async (item: ActivityItem) => {
      if (hasContext) {
        return context.bridgeActivityItem(item.id);
      }
      // Fallback for direct client prop mode
      if (!client || recoveringIdsRef.current.has(item.id)) return;

      recoveringIdsRef.current.add(item.id);
      setLocalActivity((prev) =>
        prev.map((a) =>
          a.id === item.id ? { ...a, type: "processing" as const } : a,
        ),
      );

      try {
        const results = await client.sweep(item.id);
        const result = results[0];
        if (result?.status === "success") {
          setLocalActivity((prev) =>
            prev.map((a) =>
              a.id === item.id
                ? { ...a, type: "complete" as const, message: "Bridged successfully" }
                : a,
            ),
          );
        } else {
          setLocalActivity((prev) =>
            prev.map((a) =>
              a.id === item.id
                ? { ...a, type: "error" as const, message: result?.error || "Bridge failed" }
                : a,
            ),
          );
        }
      } catch (error) {
        setLocalActivity((prev) =>
          prev.map((a) =>
            a.id === item.id
              ? {
                  ...a,
                  type: "error" as const,
                  message: error instanceof Error ? error.message : "Bridge failed",
                }
              : a,
          ),
        );
      } finally {
        recoveringIdsRef.current.delete(item.id);
      }
    },
    [client, hasContext, context],
  );

  // Listen for deposit events (only when using direct client prop without context)
  useEffect(() => {
    if (!client || hasContext) return;

    const handleDetected = (deposit: DetectedDeposit) => {
      setLocalActivity((prev) => {
        const newItem = {
          id: deposit.id,
          type: "detected" as const,
          token: deposit.token,
          chainId: deposit.chainId,
          amount: deposit.amount,
          amountUSD: deposit.amountUSD,
          timestamp: Date.now(),
          deposit,
        };

        // Skip if there's already an in-flight or recently completed item
        // for the same token+chain — prevents stale re-detection duplicates
        const hasActiveItem = prev.some(
          (item) =>
            item.token === deposit.token &&
            item.chainId === deposit.chainId &&
            (item.type === "processing" ||
              (item.type === "complete" &&
                Date.now() - item.timestamp < 5 * 60 * 1000)),
        );
        if (hasActiveItem) return prev;

        // Replace existing "detected" or "error" items for same token+chain
        const existingIdx = prev.findIndex(
          (item) =>
            item.token === deposit.token &&
            item.chainId === deposit.chainId &&
            (item.type === "detected" || item.type === "error"),
        );

        if (existingIdx !== -1) {
          return prev.map((item, i) => (i === existingIdx ? newItem : item));
        }

        return [newItem, ...prev].slice(0, 50);
      });
    };

    const handleBelowThreshold = (deposit: DetectedDeposit) => {
      setLocalActivity((prev) => {
        const exists = prev.some(
          (item) =>
            item.type === "below_threshold" &&
            item.token === deposit.token &&
            item.chainId === deposit.chainId,
        );
        if (exists) return prev;
        return [
          {
            id: deposit.id,
            type: "below_threshold" as const,
            token: deposit.token,
            chainId: deposit.chainId,
            amount: deposit.amount,
            amountUSD: deposit.amountUSD,
            timestamp: Date.now(),
            message: "Too small to auto-bridge",
            deposit,
          },
          ...prev,
        ];
      });
    };

    const handleProcessing = (deposit: DetectedDeposit) => {
      setLocalActivity((prev) =>
        prev.map((item) =>
          item.id === deposit.id ? { ...item, type: "processing" as const } : item,
        ),
      );
    };

    const handleComplete = (result: SweepResult) => {
      setLocalActivity((prev) => {
        const updated = prev.map((item) =>
          item.id === result.depositId
            ? { ...item, type: "complete" as const, result, message: "Bridged successfully" }
            : item,
        );
        // Remove stale error items for the same token+chain (only older ones)
        const completedItem = updated.find((item) => item.id === result.depositId);
        if (completedItem) {
          return updated.filter(
            (item) =>
              item.id === result.depositId ||
              !(item.token === completedItem.token &&
                item.chainId === completedItem.chainId &&
                item.type === "error" &&
                item.timestamp <= completedItem.timestamp),
          );
        }
        return updated;
      });
    };

    const handleError = (error: Error, deposit?: DetectedDeposit) => {
      if (deposit) {
        setLocalActivity((prev) =>
          prev.map((item) =>
            item.id === deposit.id
              ? { ...item, type: "error" as const, message: error.message }
              : item,
          ),
        );
      }
    };

    const handleRecoveryComplete = (results: RecoveryResult[]) => {
      const consumedIndices = new Set<number>();
      setLocalActivity((prev) =>
        prev.map((item) => {
          if (item.type !== "error" && item.type !== "below_threshold")
            return item;

          const idx = results.findIndex(
            (r, i) =>
              !consumedIndices.has(i) &&
              r.status === "success" &&
              r.token === item.token &&
              r.chainId === item.chainId,
          );
          if (idx !== -1) {
            consumedIndices.add(idx);
            return {
              ...item,
              type: "complete" as const,
              message: "Recovered successfully",
            };
          }
          return item;
        }),
      );
    };

    client.on("deposit:detected", handleDetected);
    client.on("deposit:below_threshold", handleBelowThreshold);
    client.on("deposit:processing", handleProcessing);
    client.on("deposit:complete", handleComplete);
    client.on("deposit:error", handleError);
    client.on("recovery:complete", handleRecoveryComplete);

    return () => {
      client.off("deposit:detected", handleDetected);
      client.off("deposit:below_threshold", handleBelowThreshold);
      client.off("deposit:processing", handleProcessing);
      client.off("deposit:complete", handleComplete);
      client.off("deposit:error", handleError);
      client.off("recovery:complete", handleRecoveryComplete);
    };
  }, [client, hasContext]);

  const copyAddress = useCallback(async () => {
    if (!depositAddress) return;
    await navigator.clipboard.writeText(depositAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [depositAddress]);

  const formatAddress = (addr: string) => {
    if (!addr) return "...";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const formatAmount = (amount: string, token: string, chainId: number) => {
    const decimals = getTokenDecimals(token, chainId);
    const value = Number(amount) / Math.pow(10, decimals);
    return value.toFixed(value < 1 ? 4 : 2);
  };

  const formatTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: ${theme === "dark" ? "#3f3f46" : "#d1d5db"};
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
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
          className,
        )}
        onClick={() => {
          setShowTokenDropdown(false);
          setShowChainDropdown(false);
        }}
      >
        {/* Header */}
        {showHeader && (
          <div className="flex items-center justify-between px-6 pt-5 pb-4">
            <h2 className="text-[15px] font-semibold">Deposit Assets</h2>
            {onClose && (
              <button
                onClick={onClose}
                className={cn(
                  "p-1 rounded transition-colors",
                  theme === "dark"
                    ? "text-[#52525b] hover:text-white"
                    : "text-gray-500 hover:text-gray-900",
                )}
              >
                <X size={20} />
              </button>
            )}
          </div>
        )}

        {/* Token/Chain Selector */}
        <div className={cn("px-6 mb-4", !showHeader && "pt-5")}>
          <div
            className={cn(
              "flex h-11 rounded-xl border relative",
              theme === "dark"
                ? "bg-[#18181b] border-[#27272a]"
                : "bg-white border-gray-300",
            )}
          >
            {/* Token Selector */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowTokenDropdown(!showTokenDropdown);
                setShowChainDropdown(false);
              }}
              className={cn(
                "flex-1 flex items-center justify-center gap-2.5 text-[13px] font-medium rounded-l-xl transition-colors",
                theme === "dark" ? "hover:bg-[#27272a]" : "hover:bg-gray-100",
              )}
            >
              <img
                src={LOGO_URLS[selectedToken]}
                alt={selectedToken}
                className="w-[18px] h-[18px] rounded-full"
              />
              <span>{selectedToken}</span>
              <svg
                className="w-2.5 h-1.5 opacity-40"
                viewBox="0 0 10 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M1 1L5 5L9 1" />
              </svg>
            </button>

            {/* Divider */}
            <div
              className={cn(
                "w-px h-5 self-center",
                theme === "dark" ? "bg-[#27272a]" : "bg-gray-200",
              )}
            />

            {/* Chain Selector */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowChainDropdown(!showChainDropdown);
                setShowTokenDropdown(false);
              }}
              className={cn(
                "flex-1 flex items-center justify-center gap-2.5 text-[13px] font-medium rounded-r-xl transition-colors",
                theme === "dark" ? "hover:bg-[#27272a]" : "hover:bg-gray-100",
              )}
            >
              <img
                src={LOGO_URLS[selectedChain.id]}
                alt={selectedChain.name}
                className="w-[18px] h-[18px] rounded-full"
              />
              <span>{selectedChain.name}</span>
              <svg
                className="w-2.5 h-1.5 opacity-40"
                viewBox="0 0 10 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M1 1L5 5L9 1" />
              </svg>
            </button>

            {/* Token Dropdown */}
            {showTokenDropdown && (
              <div
                className={cn(
                  "custom-scrollbar absolute top-full left-0 w-[52%] mt-1.5 p-1 rounded-xl border shadow-lg z-50 max-h-[240px] overflow-y-auto",
                  theme === "dark"
                    ? "bg-[#09090b] border-[#3f3f46]"
                    : "bg-white border-gray-300",
                )}
                style={{
                  scrollbarWidth: "thin",
                  scrollbarColor:
                    theme === "dark"
                      ? "#3f3f46 transparent"
                      : "#d1d5db transparent",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {availableTokens.map((token) => (
                  <button
                    key={token}
                    onClick={() => {
                      setSelectedToken(token);
                      setShowTokenDropdown(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[13px] transition-colors",
                      theme === "dark"
                        ? "hover:bg-[#27272a] text-[#a1a1aa] hover:text-white"
                        : "hover:bg-gray-100 text-gray-700 hover:text-gray-900",
                      selectedToken === token &&
                        (theme === "dark"
                          ? "bg-[#27272a] text-white"
                          : "bg-gray-100 text-gray-900"),
                    )}
                  >
                    <img
                      src={LOGO_URLS[token]}
                      alt={token}
                      className="w-[18px] h-[18px] rounded-full"
                    />
                    {token}
                  </button>
                ))}
              </div>
            )}

            {/* Chain Dropdown */}
            {showChainDropdown && (
              <div
                className={cn(
                  "custom-scrollbar absolute top-full right-0 w-[52%] mt-1.5 p-1 rounded-xl border shadow-lg z-50 max-h-[280px] overflow-y-auto",
                  theme === "dark"
                    ? "bg-[#09090b] border-[#3f3f46]"
                    : "bg-white border-gray-300",
                )}
                style={{
                  scrollbarWidth: "thin",
                  scrollbarColor:
                    theme === "dark"
                      ? "#3f3f46 transparent"
                      : "#d1d5db transparent",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {availableChains.map((chain) => (
                  <button
                    key={chain.id}
                    onClick={() => {
                      setSelectedChain(chain);
                      setShowChainDropdown(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[13px] transition-colors",
                      theme === "dark"
                        ? "hover:bg-[#27272a] text-[#a1a1aa] hover:text-white"
                        : "hover:bg-gray-100 text-gray-700 hover:text-gray-900",
                      selectedChain.id === chain.id &&
                        (theme === "dark"
                          ? "bg-[#27272a] text-white"
                          : "bg-gray-100 text-gray-900"),
                    )}
                  >
                    <img
                      src={LOGO_URLS[chain.id]}
                      alt={chain.name}
                      className="w-[18px] h-[18px] rounded-full"
                    />
                    {chain.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Address Panel */}
        <div className="mx-6 mb-6">
          <div
            className={cn(
              "rounded-xl border p-1 relative",
              theme === "dark"
                ? "bg-[#121212] border-[#27272a]"
                : "bg-gray-50 border-gray-300",
            )}
          >
            {/* Address Row */}
            <div className="flex items-center gap-2.5 p-3">
              <div className="flex-1">
                <span
                  className={cn(
                    "text-[11px] font-medium uppercase tracking-wide",
                    theme === "dark" ? "text-[#a1a1aa]" : "text-gray-600",
                  )}
                >
                  Deposit Address
                </span>
                <p className="font-mono text-[13px] mt-1">
                  {formatAddress(depositAddress)}
                </p>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={copyAddress}
                  className={cn(
                    "w-8 h-8 flex items-center justify-center rounded-md border transition-all",
                    theme === "dark"
                      ? "border-transparent hover:border-[#27272a] hover:bg-[#27272a] text-[#a1a1aa] hover:text-white"
                      : "border-transparent hover:border-gray-200 hover:bg-gray-100 text-gray-500 hover:text-gray-900",
                    copied && "text-green-500",
                  )}
                  title="Copy address"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
                <button
                  onClick={() => setShowQR(!showQR)}
                  className={cn(
                    "w-8 h-8 flex items-center justify-center rounded-md border transition-all",
                    theme === "dark"
                      ? "border-transparent hover:border-[#27272a] hover:bg-[#27272a] text-[#a1a1aa] hover:text-white"
                      : "border-transparent hover:border-gray-200 hover:bg-gray-100 text-gray-500 hover:text-gray-900",
                  )}
                  title="Show QR code"
                >
                  <QrCode size={16} />
                </button>
              </div>
            </div>

            {/* QR Overlay */}
            {showQR && (
              <div className="absolute inset-0 bg-white rounded-xl flex items-center justify-center z-10">
                <button
                  onClick={() => setShowQR(false)}
                  className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center bg-gray-100 rounded text-gray-600 hover:bg-gray-200"
                >
                  <X size={14} />
                </button>
                <QRCodeSVG value={depositAddress || ""} size={100} />
              </div>
            )}

            {/* Warning Box */}
            <div
              className={cn(
                "mt-1 rounded-lg p-2.5 flex gap-2.5 items-start",
                theme === "dark"
                  ? "bg-amber-500/10 border border-amber-500/15"
                  : "bg-amber-50 border border-amber-200",
              )}
            >
              <AlertCircle
                size={14}
                className={cn(
                  "shrink-0 mt-0.5",
                  theme === "dark" ? "text-amber-400" : "text-amber-600",
                )}
              />
              <div
                className={cn(
                  "text-[11px] leading-relaxed",
                  theme === "dark" ? "text-amber-400/90" : "text-amber-700",
                )}
              >
                <p>
                  Only deposit <strong>{selectedToken}</strong> on{" "}
                  <strong>{selectedChain.name}</strong>. Sending other assets may
                  result in permanent loss.
                </p>
                <p className="mt-1">
                  Minimum deposit: <strong>{minValueUSD != null ? `$${minValueUSD}` : `${getMinDepositAmount(selectedToken)} ${selectedToken}`}</strong>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Destination Section */}
        {showDestination && currentDestination && (
          <div className="mx-6 mb-4">
            <div
              className={cn(
                "rounded-xl border p-3 flex items-center justify-between",
                theme === "dark"
                  ? "bg-[#18181b] border-[#27272a]"
                  : "bg-gray-50 border-gray-200",
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center",
                    theme === "dark" ? "bg-[#27272a]" : "bg-gray-200",
                  )}
                >
                  {LOGO_URLS[currentDestination.chainId] ? (
                    <img
                      src={LOGO_URLS[currentDestination.chainId]}
                      alt={getChainName(currentDestination.chainId)}
                      className="w-5 h-5 rounded-full"
                    />
                  ) : (
                    <div
                      className={cn(
                        "w-5 h-5 rounded-full",
                        theme === "dark" ? "bg-[#3f3f46]" : "bg-gray-300",
                      )}
                    />
                  )}
                </div>
                <div>
                  <span
                    className={cn(
                      "text-[10px] font-medium uppercase tracking-wide block",
                      theme === "dark" ? "text-[#71717a]" : "text-gray-500",
                    )}
                  >
                    You will receive
                  </span>
                  <div className="flex items-center gap-1.5">
                    <img
                      src={LOGO_URLS["USDC"]}
                      alt="USDC"
                      className="w-[14px] h-[14px] rounded-full"
                    />
                    <span className="text-[13px] font-medium">
                      USDC on{" "}
                      {getChainName(currentDestination.chainId) ||
                        `Chain ${currentDestination.chainId}`}
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <span
                  className={cn(
                    "font-mono text-[12px]",
                    theme === "dark" ? "text-[#a1a1aa]" : "text-gray-600",
                  )}
                >
                  {formatAddress(currentDestination.address)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Activity Section */}
        <div
          className={cn(
            "border-t",
            theme === "dark"
              ? "bg-[#121212] border-[#27272a]"
              : "bg-gray-50 border-gray-200",
          )}
        >
          <div
            className={cn(
              "px-6 pt-4 pb-2 text-[11px] font-semibold uppercase tracking-wide",
              theme === "dark" ? "text-[#a1a1aa]" : "text-gray-500",
            )}
          >
            Recent Activity
          </div>
          <div className="max-h-[200px] overflow-y-auto">
            {activity.length === 0 ? (
              <div
                className={cn(
                  "px-6 py-8 text-center text-[13px]",
                  theme === "dark" ? "text-[#52525b]" : "text-gray-400",
                )}
              >
                No deposits yet
              </div>
            ) : (
              activity.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "px-6 py-3 flex items-center justify-between border-b last:border-b-0 transition-colors",
                    theme === "dark"
                      ? "border-[#27272a] hover:bg-[#18181b]"
                      : "border-gray-200 hover:bg-gray-100",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center border",
                        item.type === "complete" &&
                          "bg-green-500/10 border-green-500/20 text-green-500",
                        item.type === "processing" &&
                          (theme === "dark"
                            ? "bg-transparent border-[#333] text-[#a1a1aa]"
                            : "bg-gray-100 border-gray-200 text-gray-400"),
                        item.type === "detected" &&
                          "bg-blue-500/10 border-blue-500/20 text-blue-500",
                        item.type === "error" &&
                          "bg-red-500/10 border-red-500/20 text-red-500",
                        item.type === "below_threshold" &&
                          "bg-amber-500/10 border-amber-500/20 text-amber-500",
                      )}
                    >
                      {item.type === "complete" && <Check size={14} />}
                      {item.type === "processing" && (
                        <Clock size={14} className="animate-pulse" />
                      )}
                      {item.type === "detected" && <Check size={14} />}
                      {item.type === "error" && <X size={14} />}
                      {item.type === "below_threshold" && (
                        <AlertTriangle size={14} />
                      )}
                    </div>
                    <div>
                      <h4
                        className={cn(
                          "text-[13px] font-medium",
                          item.type === "processing" &&
                            (theme === "dark"
                              ? "text-[#a1a1aa]"
                              : "text-gray-500"),
                          item.type === "below_threshold" &&
                            (theme === "dark"
                              ? "text-amber-400"
                              : "text-amber-600"),
                        )}
                      >
                        {item.type === "complete" && `Received ${item.token}`}
                        {item.type === "processing" && "Processing..."}
                        {item.type === "detected" && `Detected ${item.token}`}
                        {item.type === "error" && "Failed"}
                        {item.type === "below_threshold" &&
                          `Below minimum`}
                      </h4>
                      <p
                        className={cn(
                          "text-[11px]",
                          theme === "dark" ? "text-[#a1a1aa]" : "text-gray-500",
                        )}
                      >
                        {item.type === "below_threshold"
                          ? `${item.token} on ${CHAIN_META[item.chainId]?.name || `Chain ${item.chainId}`} • Too small to auto-bridge`
                          : `${CHAIN_META[item.chainId]?.name || `Chain ${item.chainId}`} • ${formatTime(item.timestamp)}`}
                      </p>
                    </div>
                  </div>
                  {item.type === "below_threshold" ? (
                    <button
                      onClick={() => handleRecover(item)}
                      className={cn(
                        "text-[12px] font-medium px-3 py-1 rounded-lg transition-colors",
                        theme === "dark"
                          ? "bg-amber-500/15 text-amber-400 hover:bg-amber-500/25"
                          : "bg-amber-100 text-amber-700 hover:bg-amber-200",
                      )}
                    >
                      Recover
                    </button>
                  ) : item.type === "detected" && !autoSweep ? (
                    <button
                      onClick={() => handleBridge(item)}
                      className={cn(
                        "flex items-center gap-1.5 text-[12px] font-medium px-3 py-1 rounded-lg transition-colors",
                        theme === "dark"
                          ? "bg-blue-500/15 text-blue-400 hover:bg-blue-500/25"
                          : "bg-blue-100 text-blue-700 hover:bg-blue-200",
                      )}
                    >
                      Bridge
                      <ArrowRight size={12} />
                    </button>
                  ) : (
                    <span
                      className={cn(
                        "font-mono text-[13px] font-medium",
                        item.type === "processing" &&
                          (theme === "dark"
                            ? "text-[#a1a1aa]"
                            : "text-gray-500"),
                      )}
                    >
                      +{formatAmount(item.amount, item.token, item.chainId)}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}

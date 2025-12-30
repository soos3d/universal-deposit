"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Copy, QrCode, Check, Clock, AlertCircle } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "../utils/cn";
import type { DepositClient } from "../../core/DepositClient";
import type { DetectedDeposit, SweepResult, TokenType } from "../../core/types";
import { CHAIN, CHAIN_META } from "../../constants/chains";
import { useDepositContext } from "../context/DepositContext";

export interface DepositWidgetProps {
  /**
   * The DepositClient instance. Optional if using within DepositProvider.
   */
  client?: DepositClient;
  onClose?: () => void;
  className?: string;
  theme?: "dark" | "light";
}

interface ActivityItem {
  id: string;
  type: "detected" | "processing" | "complete" | "error";
  token: string;
  chainId: number;
  amount: string;
  timestamp: number;
  message?: string;
}

const LOGO_URLS: Record<string, string> = {
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

const CHAIN_OPTIONS = [
  {
    id: CHAIN.ETHEREUM,
    name: "Ethereum",
    color: "#627eea",
    addressType: "evm" as const,
  },
  {
    id: CHAIN.BNB,
    name: "BNB Chain",
    color: "#f3ba2f",
    addressType: "evm" as const,
  },
  {
    id: CHAIN.MANTLE,
    name: "Mantle",
    color: "#000000",
    addressType: "evm" as const,
  },
  {
    id: CHAIN.MONAD,
    name: "Monad",
    color: "#6366f1",
    addressType: "evm" as const,
  },
  {
    id: CHAIN.PLASMA,
    name: "Plasma",
    color: "#8b5cf6",
    addressType: "evm" as const,
  },
  {
    id: CHAIN.XLAYER,
    name: "X Layer",
    color: "#000000",
    addressType: "evm" as const,
  },
  {
    id: CHAIN.BASE,
    name: "Base",
    color: "#0052ff",
    addressType: "evm" as const,
  },
  {
    id: CHAIN.ARBITRUM,
    name: "Arbitrum",
    color: "#12aaeb",
    addressType: "evm" as const,
  },
  {
    id: CHAIN.AVALANCHE,
    name: "Avalanche",
    color: "#e84142",
    addressType: "evm" as const,
  },
  {
    id: CHAIN.OPTIMISM,
    name: "OP (Optimism)",
    color: "#ff0420",
    addressType: "evm" as const,
  },
  {
    id: CHAIN.POLYGON,
    name: "Polygon",
    color: "#8247e5",
    addressType: "evm" as const,
  },
  {
    id: CHAIN.HYPERVM,
    name: "HyperEVM",
    color: "#00d4ff",
    addressType: "evm" as const,
  },
  {
    id: CHAIN.BERACHAIN,
    name: "Berachain",
    color: "#f5841f",
    addressType: "evm" as const,
  },
  {
    id: CHAIN.LINEA,
    name: "Linea",
    color: "#121212",
    addressType: "evm" as const,
  },
  {
    id: CHAIN.SONIC,
    name: "Sonic",
    color: "#1969ff",
    addressType: "evm" as const,
  },
  {
    id: CHAIN.MERLIN,
    name: "Merlin",
    color: "#f7931a",
    addressType: "evm" as const,
  },
  {
    id: CHAIN.SOLANA,
    name: "Solana",
    color: "#9945ff",
    addressType: "solana" as const,
  },
];

const CHAIN_SUPPORTED_TOKENS: Record<number, TokenType[]> = {
  [CHAIN.SOLANA]: ["USDC", "USDT", "SOL"],
  [CHAIN.ETHEREUM]: ["USDC", "USDT", "ETH", "BTC"],
  [CHAIN.BASE]: ["USDC", "ETH", "BTC"],
  [CHAIN.BNB]: ["USDC", "USDT", "ETH", "BTC", "BNB"],
  [CHAIN.MANTLE]: ["USDT"],
  [CHAIN.MONAD]: ["USDC"],
  [CHAIN.PLASMA]: ["USDT"],
  [CHAIN.XLAYER]: ["USDC", "USDT"],
  [CHAIN.HYPERVM]: ["USDT"],
  [CHAIN.SONIC]: ["USDC"],
  [CHAIN.BERACHAIN]: ["USDC"],
  [CHAIN.AVALANCHE]: ["USDC", "USDT", "ETH", "BTC"],
  [CHAIN.ARBITRUM]: ["USDC", "USDT", "ETH", "BTC"],
  [CHAIN.OPTIMISM]: ["USDC", "USDT", "ETH", "BTC"],
  [CHAIN.LINEA]: ["USDC", "USDT", "ETH", "BTC"],
  [CHAIN.POLYGON]: ["USDC", "USDT", "ETH", "BTC"],
  [CHAIN.MERLIN]: ["BTC"],
};

function useOptionalDepositContext(): { client: DepositClient | null } | null {
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
}: DepositWidgetProps) {
  // Try to get client from context if not provided as prop
  const context = useOptionalDepositContext();
  const client = clientProp || context?.client || null;

  const [selectedChain, setSelectedChain] = useState(CHAIN_OPTIONS[0]);
  const [selectedToken, setSelectedToken] = useState<TokenType>(
    CHAIN_SUPPORTED_TOKENS[CHAIN_OPTIONS[0].id][0]
  );
  const [showTokenDropdown, setShowTokenDropdown] = useState(false);
  const [showChainDropdown, setShowChainDropdown] = useState(false);

  const availableTokens = CHAIN_SUPPORTED_TOKENS[selectedChain.id] || [];

  useEffect(() => {
    if (!availableTokens.includes(selectedToken)) {
      setSelectedToken(availableTokens[0]);
    }
  }, [selectedChain, selectedToken, availableTokens]);
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [depositAddress, setDepositAddress] = useState<string>("");

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
        console.error("Failed to get deposit address:", error);
      }
    };
    getAddress();
  }, [client, selectedChain]);

  // Listen for deposit events
  useEffect(() => {
    if (!client) return;

    const handleDetected = (deposit: DetectedDeposit) => {
      setActivity((prev) => [
        {
          id: deposit.id,
          type: "detected",
          token: deposit.token,
          chainId: deposit.chainId,
          amount: deposit.amount,
          timestamp: Date.now(),
        },
        ...prev,
      ]);
    };

    const handleProcessing = (deposit: DetectedDeposit) => {
      setActivity((prev) =>
        prev.map((item) =>
          item.id === deposit.id ? { ...item, type: "processing" } : item
        )
      );
    };

    const handleComplete = (result: SweepResult) => {
      setActivity((prev) =>
        prev.map((item) =>
          item.id === result.depositId
            ? { ...item, type: "complete", message: "Swept successfully" }
            : item
        )
      );
    };

    const handleError = (error: Error, deposit?: DetectedDeposit) => {
      if (deposit) {
        setActivity((prev) =>
          prev.map((item) =>
            item.id === deposit.id
              ? { ...item, type: "error", message: error.message }
              : item
          )
        );
      }
    };

    client.on("deposit:detected", handleDetected);
    client.on("deposit:processing", handleProcessing);
    client.on("deposit:complete", handleComplete);
    client.on("deposit:error", handleError);

    return () => {
      client.off("deposit:detected", handleDetected);
      client.off("deposit:processing", handleProcessing);
      client.off("deposit:complete", handleComplete);
      client.off("deposit:error", handleError);
    };
  }, [client]);

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

  const formatAmount = (amount: string, token: string) => {
    const decimals = ["ETH", "BNB"].includes(token)
      ? 18
      : token === "SOL"
      ? 9
      : 6;
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
          "w-[380px] rounded-[20px] border overflow-hidden shadow-2xl",
          theme === "dark"
            ? "bg-[#09090b] border-[#27272a] text-white"
            : "bg-white border-gray-200 text-gray-900",
          className
        )}
        onClick={() => {
          setShowTokenDropdown(false);
          setShowChainDropdown(false);
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <h2 className="text-[15px] font-semibold">Deposit Assets</h2>
          {onClose && (
            <button
              onClick={onClose}
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

        {/* Token/Chain Selector */}
        <div className="px-6 mb-4">
          <div
            className={cn(
              "flex h-11 rounded-xl border relative",
              theme === "dark"
                ? "bg-[#18181b] border-[#27272a]"
                : "bg-white border-gray-300"
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
                theme === "dark" ? "hover:bg-[#27272a]" : "hover:bg-gray-100"
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
                theme === "dark" ? "bg-[#27272a]" : "bg-gray-200"
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
                theme === "dark" ? "hover:bg-[#27272a]" : "hover:bg-gray-100"
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
                    : "bg-white border-gray-300"
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
                          : "bg-gray-100 text-gray-900")
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
                    : "bg-white border-gray-300"
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
                {CHAIN_OPTIONS.map((chain) => (
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
                          : "bg-gray-100 text-gray-900")
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
                : "bg-gray-50 border-gray-300"
            )}
          >
            {/* Address Row */}
            <div className="flex items-center gap-2.5 p-3">
              <div className="flex-1">
                <span
                  className={cn(
                    "text-[11px] font-medium uppercase tracking-wide",
                    theme === "dark" ? "text-[#a1a1aa]" : "text-gray-600"
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
                    copied && "text-green-500"
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
                      : "border-transparent hover:border-gray-200 hover:bg-gray-100 text-gray-500 hover:text-gray-900"
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
                  : "bg-amber-50 border border-amber-200"
              )}
            >
              <AlertCircle
                size={14}
                className={cn(
                  "shrink-0 mt-0.5",
                  theme === "dark" ? "text-amber-400" : "text-amber-600"
                )}
              />
              <span
                className={cn(
                  "text-[11px] leading-relaxed",
                  theme === "dark" ? "text-amber-400/90" : "text-amber-700"
                )}
              >
                Only deposit <strong>{selectedToken}</strong> on{" "}
                <strong>{selectedChain.name}</strong>. Sending other assets may
                result in permanent loss.
              </span>
            </div>
          </div>
        </div>

        {/* Activity Section */}
        <div
          className={cn(
            "border-t",
            theme === "dark"
              ? "bg-[#121212] border-[#27272a]"
              : "bg-gray-50 border-gray-200"
          )}
        >
          <div
            className={cn(
              "px-6 pt-4 pb-2 text-[11px] font-semibold uppercase tracking-wide",
              theme === "dark" ? "text-[#a1a1aa]" : "text-gray-500"
            )}
          >
            Recent Activity
          </div>
          <div className="max-h-[200px] overflow-y-auto">
            {activity.length === 0 ? (
              <div
                className={cn(
                  "px-6 py-8 text-center text-[13px]",
                  theme === "dark" ? "text-[#52525b]" : "text-gray-400"
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
                      : "border-gray-200 hover:bg-gray-100"
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
                          "bg-red-500/10 border-red-500/20 text-red-500"
                      )}
                    >
                      {item.type === "complete" && <Check size={14} />}
                      {item.type === "processing" && (
                        <Clock size={14} className="animate-pulse" />
                      )}
                      {item.type === "detected" && <Check size={14} />}
                      {item.type === "error" && <X size={14} />}
                    </div>
                    <div>
                      <h4
                        className={cn(
                          "text-[13px] font-medium",
                          item.type === "processing" &&
                            (theme === "dark"
                              ? "text-[#a1a1aa]"
                              : "text-gray-500")
                        )}
                      >
                        {item.type === "complete" && `Received ${item.token}`}
                        {item.type === "processing" && "Processing..."}
                        {item.type === "detected" && `Detected ${item.token}`}
                        {item.type === "error" && "Failed"}
                      </h4>
                      <p
                        className={cn(
                          "text-[11px]",
                          theme === "dark" ? "text-[#a1a1aa]" : "text-gray-500"
                        )}
                      >
                        {CHAIN_META[item.chainId]?.name ||
                          `Chain ${item.chainId}`}{" "}
                        • {formatTime(item.timestamp)}
                      </p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "font-mono text-[13px] font-medium",
                      item.type === "processing" &&
                        (theme === "dark" ? "text-[#a1a1aa]" : "text-gray-500")
                    )}
                  >
                    +{formatAmount(item.amount, item.token)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}

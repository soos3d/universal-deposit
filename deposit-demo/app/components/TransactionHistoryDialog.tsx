"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  DepositClient,
  UATransaction,
} from "@particle-network/deposit-sdk";
import { getChainName } from "@particle-network/deposit-sdk/react";

interface TransactionHistoryDialogProps {
  client: DepositClient | null;
  isOpen: boolean;
  onClose: () => void;
}

const PAGE_SIZE = 10;

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatUSD(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "$0.00";
  const sign = num >= 0 ? "+" : "";
  return `${sign}$${Math.abs(num).toFixed(2)}`;
}

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function getStatusInfo(status: number): { label: string; color: string } {
  switch (status) {
    case 1:
      return { label: "success", color: "text-green-400" };
    case 0:
      return { label: "pending", color: "text-yellow-400" };
    case -1:
      return { label: "failed", color: "text-red-400" };
    default:
      return { label: `status:${status}`, color: "text-zinc-400" };
  }
}

export function TransactionHistoryDialog({
  client,
  isOpen,
  onClose,
}: TransactionHistoryDialogProps) {
  const [transactions, setTransactions] = useState<UATransaction[]>([]);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const fetchPage = useCallback(
    async (pageNum: number) => {
      if (!client) return;

      setIsLoading(true);
      setError(null);

      try {
        const result = await client.getTransactions(pageNum, PAGE_SIZE);
        setTransactions(result.transactions);
        setPage(result.page);
        setHasMore(result.transactions.length >= PAGE_SIZE);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to fetch transactions";
        setError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [client],
  );

  useEffect(() => {
    if (isOpen && client) {
      setPage(1);
      fetchPage(1);
    }
    if (!isOpen) {
      setTransactions([]);
      setError(null);
      setHasMore(true);
    }
  }, [isOpen, client, fetchPage]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 rounded-xl border border-zinc-800 w-full max-w-lg max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h3 className="text-white font-semibold text-lg">
            Transaction History
          </h3>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-red-400 text-sm mb-3">{error}</p>
              <button
                onClick={() => fetchPage(page)}
                className="text-xs px-3 py-1 bg-zinc-800 text-zinc-300 rounded hover:bg-zinc-700 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : transactions.length === 0 ? (
            <p className="text-zinc-500 text-center py-8">
              No transactions found
            </p>
          ) : (
            <div className="space-y-2">
              {transactions.map((tx) => (
                <TransactionRow key={tx.transactionId} tx={tx} />
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {!isLoading && !error && transactions.length > 0 && (
          <div className="flex items-center justify-between p-4 border-t border-zinc-800">
            <button
              onClick={() => fetchPage(page - 1)}
              disabled={page <= 1}
              className="text-sm px-3 py-1.5 bg-zinc-800 text-zinc-300 rounded hover:bg-zinc-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-zinc-500 text-sm">Page {page}</span>
            <button
              onClick={() => fetchPage(page + 1)}
              disabled={!hasMore}
              className="text-sm px-3 py-1.5 bg-zinc-800 text-zinc-300 rounded hover:bg-zinc-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TransactionRow({ tx }: { tx: UATransaction }) {
  const statusInfo = getStatusInfo(tx.status);
  const chainId = tx.targetToken.chainId;
  const chainName = getChainName(chainId);
  const amountUSD = formatUSD(tx.change.amountInUSD);
  const date = formatDate(tx.createdAt);
  const from = tx.change.from ? truncateAddress(tx.change.from) : "—";

  return (
    <div className="flex items-start justify-between p-3 bg-zinc-800/50 rounded-lg gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-white font-medium text-sm">
            {tx.targetToken.symbol}
          </span>
          <span className="text-zinc-500 text-xs">{chainName}</span>
        </div>
        <div className="text-zinc-500 text-xs mt-1">
          from: {from}
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-white font-medium text-sm">{amountUSD}</p>
        <div className="flex items-center justify-end gap-1.5 mt-1">
          <span className="text-zinc-500 text-xs">{date}</span>
          <span className={`text-xs ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
        </div>
      </div>
    </div>
  );
}

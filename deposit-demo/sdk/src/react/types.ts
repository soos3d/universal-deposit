import type { DetectedDeposit, SweepResult } from "../core/types";

/**
 * Unified activity item type used across the widget, context, and hooks.
 *
 * Flat fields (token, chainId, amount, amountUSD) allow the widget to render
 * without needing the full DetectedDeposit object, while optional `deposit`
 * and `result` references are available for advanced consumers.
 */
export interface ActivityItem {
  id: string;
  type: "detected" | "processing" | "complete" | "error" | "below_threshold";
  token: string;
  chainId: number;
  amount: string;
  amountUSD: number;
  timestamp: number;
  message?: string;
  /** Full deposit object, when available */
  deposit?: DetectedDeposit;
  /** Sweep result, populated on completion */
  result?: SweepResult;
}

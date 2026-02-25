"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import {
  AuthCoreContextProvider,
  useConnect,
  useEthereum,
  useAuthCore,
} from "@particle-network/auth-core-modal";
import { AuthType } from "@particle-network/auth-core";
import { DepositClient } from "../../core/DepositClient";
import { IntermediaryService } from "../../intermediary";
import type {
  DepositAddresses,
  DetectedDeposit,
  SweepResult,
  ClientStatus,
  TokenType,
  RecoveryResult,
  RefundResult,
  RefundConfig,
  RefundReason,
  DestinationConfig,
  Logger,
} from "../../core/types";

const NOOP_LOGGER: Logger = {
  log: () => {},
  warn: () => {},
  error: () => {},
};
import type { ActivityItem } from "../types";
import {
  DEFAULT_PROJECT_ID,
  DEFAULT_CLIENT_KEY,
  DEFAULT_APP_ID,
  DEFAULT_JWT_SERVICE_URL,
} from "../../constants";

/**
 * Configuration for the DepositProvider
 *
 * @example
 * // Sweep to owner's EOA on Arbitrum
 * <DepositProvider config={{ destination: { chainId: CHAIN.ARBITRUM } }}>
 *   <App />
 * </DepositProvider>
 *
 * @example
 * // Sweep to owner's EOA on Base
 * <DepositProvider config={{ destination: { chainId: CHAIN.BASE } }}>
 *   <App />
 * </DepositProvider>
 *
 * @example
 * // Sweep to a custom address on Ethereum
 * <DepositProvider config={{
 *   destination: {
 *     chainId: CHAIN.ETHEREUM,
 *     address: '0xTreasury...'
 *   }
 * }}>
 *   <App />
 * </DepositProvider>
 */
export interface DepositConfig {
  /**
   * Destination configuration for where swept funds are sent. Required.
   * Must include at least `chainId`.
   * @see DestinationConfig for full documentation
   */
  destination: DestinationConfig;
  supportedTokens?: TokenType[];
  supportedChains?: number[];
  autoSweep?: boolean;
  minValueUSD?: number;
  pollingIntervalMs?: number;
  /**
   * Auto-refund configuration.
   * When enabled, if a sweep fails, funds are automatically returned to the source chain.
   * @see RefundConfig for full documentation
   */
  refund?: RefundConfig;
  /**
   * Optional Particle project ID for Universal Account operations.
   * When omitted, the SDK uses its built-in shared project ID.
   * Note: This only affects UA operations — intermediary auth always uses SDK built-in credentials.
   */
  uaProjectId?: string;

  /**
   * Custom logger. Defaults to silent (no output).
   * Pass `console` to restore the original logging behaviour.
   */
  logger?: Logger;
}

export interface DepositContextValue {
  // Connection state
  isConnecting: boolean;
  isConnected: boolean;
  isReady: boolean;
  error: Error | null;

  // Addresses
  ownerAddress: string | null;
  intermediaryAddress: string | null;

  // Actions
  connect: (ownerAddress: string, destination?: DestinationConfig) => Promise<void>;
  disconnect: () => Promise<void>;

  // Client state
  client: DepositClient | null;
  status: ClientStatus;
  depositAddresses: DepositAddresses | null;
  pendingDeposits: DetectedDeposit[];
  recentActivity: ActivityItem[];

  // Activity actions (persist across widget mount/unmount)
  recoverActivityItem: (itemId: string) => Promise<void>;
  bridgeActivityItem: (itemId: string) => Promise<void>;
  clearActivity: () => void;

  // Client actions
  startWatching: () => void;
  stopWatching: () => void;
  sweep: (depositId?: string) => Promise<SweepResult[]>;
  setDestination: (destination: DestinationConfig) => void;
  currentDestination: { address: string; chainId: number } | null;

  // Recovery actions
  stuckFunds: DetectedDeposit[];
  isRecovering: boolean;
  getStuckFunds: () => Promise<DetectedDeposit[]>;
  recoverFunds: () => Promise<RecoveryResult[]>;

  // Refund actions
  isRefunding: boolean;
  refundDeposit: (depositId: string, reason?: RefundReason) => Promise<RefundResult>;
  refundAll: (reason?: RefundReason) => Promise<RefundResult[]>;
  canRefund: (depositId: string) => Promise<{ eligible: boolean; reason?: string }>;
  refundConfig: RefundConfig | null;

  // Logger (for internal use by child components/hooks)
  logger: Logger;
}

const DepositContext = createContext<DepositContextValue | null>(null);

export function useDepositContext(): DepositContextValue {
  const context = useContext(DepositContext);
  if (!context) {
    throw new Error("useDepositContext must be used within a DepositProvider");
  }
  return context;
}

interface DepositProviderInnerProps {
  config: DepositConfig;
  children: React.ReactNode;
}

function DepositProviderInner({ config, children }: DepositProviderInnerProps) {
  const clientRef = useRef<DepositClient | null>(null);
  const ownerAddressRef = useRef<string | null>(null);
  const connectingRef = useRef(false);
  const disconnectingRef = useRef(false);
  // Prevents concurrent initClient executions during async initialization.
  // Without this, effect re-fires (from dep changes) can create orphaned
  // DepositClient instances that keep polling with stale destinations.
  const clientInitializingRef = useRef(false);
  const connectionLockRef = useRef<Promise<void> | null>(null);
  // Destination set by useDeposit BEFORE connect(), so initClient picks it up
  const pendingDestinationRef = useRef<DestinationConfig | undefined>(undefined);
  // Stable ref for config so initClient doesn't re-fire on every render
  // when the parent passes a new object literal (e.g. config={{}}).
  const configRef = useRef(config);
  configRef.current = config;
  // Logger ref — stable identity, reads latest value from config on each call
  const loggerRef = useRef<Logger>(config.logger ?? NOOP_LOGGER);
  loggerRef.current = config.logger ?? NOOP_LOGGER;
  // IntermediaryService always uses hardcoded default credentials — never user-supplied.
  const intermediaryServiceRef = useRef<IntermediaryService>(
    new IntermediaryService({
      projectId: DEFAULT_PROJECT_ID,
      clientKey: DEFAULT_CLIENT_KEY,
      appId: DEFAULT_APP_ID,
      jwtServiceUrl: DEFAULT_JWT_SERVICE_URL,
    })
  );

  // Auth Core hooks
  const {
    connect: authCoreConnect,
    disconnect: authCoreDisconnect,
    connected: authCoreConnected,
  } = useConnect();
  const { address: authCoreAddress, provider: authCoreProvider } =
    useEthereum();
  const { userInfo } = useAuthCore();

  // State
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [status, setStatus] = useState<ClientStatus>("idle");
  const [depositAddresses, setDepositAddresses] =
    useState<DepositAddresses | null>(null);
  const [pendingDeposits, setPendingDeposits] = useState<DetectedDeposit[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);

  // Recovery state
  const [stuckFunds, setStuckFunds] = useState<DetectedDeposit[]>([]);
  const [isRecovering, setIsRecovering] = useState(false);

  // Refund state
  const [isRefunding, setIsRefunding] = useState(false);

  // Bumped when setDestination is called to force context consumers to
  // re-render and pick up the fresh currentDestination value.
  const [, setDestinationVersion] = useState(0);

  // Ref to track in-flight recover/bridge operations
  const recoveringIdsRef = useRef<Set<string>>(new Set());

  // Setup client event listeners
  const setupClientListeners = useCallback((client: DepositClient) => {
    const handleStatusChange = (newStatus: ClientStatus) => {
      setStatus(newStatus);
    };

    const handleDetected = (deposit: DetectedDeposit) => {
      setPendingDeposits((prev) => {
        // Replace existing pending deposit for same token+chain instead of duplicating
        const existingIdx = prev.findIndex(
          (d) => d.token === deposit.token && d.chainId === deposit.chainId,
        );
        if (existingIdx !== -1) {
          return prev.map((d, i) => (i === existingIdx ? deposit : d));
        }
        return [...prev, deposit];
      });

      setRecentActivity((prev) => {
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
      setRecentActivity((prev) => {
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
        ].slice(0, 50);
      });
    };

    const handleProcessing = (deposit: DetectedDeposit) => {
      setRecentActivity((prev) =>
        prev.map((item) =>
          item.id === deposit.id
            ? { ...item, type: "processing" as const }
            : item
        )
      );
    };

    const handleComplete = (result: SweepResult) => {
      setPendingDeposits((prev) =>
        prev.filter((d) => d.id !== result.depositId)
      );
      setRecentActivity((prev) => {
        // Update the matching item to complete
        const updated = prev.map((item) =>
          item.id === result.depositId
            ? { ...item, type: "complete" as const, result, message: "Bridged successfully" }
            : item
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

    const handleError = (err: Error, deposit?: DetectedDeposit) => {
      if (deposit) {
        setRecentActivity((prev) =>
          prev.map((item) =>
            item.id === deposit.id
              ? { ...item, type: "error" as const, message: err.message }
              : item
          )
        );
      } else {
        setError(err);
      }
    };

    const handleRecoveryComplete = (results: RecoveryResult[]) => {
      const consumedIndices = new Set<number>();
      setRecentActivity((prev) =>
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

    const handleRefundStarted = (deposit: DetectedDeposit) => {
      setRecentActivity((prev) =>
        prev.map((item) =>
          item.id === deposit.id
            ? { ...item, type: "processing" as const }
            : item
        )
      );
    };

    const handleRefundComplete = (result: RefundResult) => {
      setPendingDeposits((prev) =>
        prev.filter((d) => d.id !== result.depositId)
      );
      setRecentActivity((prev) =>
        prev.map((item) =>
          item.id === result.depositId
            ? { ...item, type: "complete" as const, message: "Refunded successfully" }
            : item
        )
      );
    };

    const handleRefundFailed = (deposit: DetectedDeposit, err: Error) => {
      setRecentActivity((prev) =>
        prev.map((item) =>
          item.id === deposit.id
            ? { ...item, type: "error" as const, message: err.message }
            : item
        )
      );
    };

    client.on("status:change", handleStatusChange);
    client.on("deposit:detected", handleDetected);
    client.on("deposit:below_threshold", handleBelowThreshold);
    client.on("deposit:processing", handleProcessing);
    client.on("deposit:complete", handleComplete);
    client.on("deposit:error", handleError);
    client.on("recovery:complete", handleRecoveryComplete);
    client.on("refund:started", handleRefundStarted);
    client.on("refund:complete", handleRefundComplete);
    client.on("refund:failed", handleRefundFailed);

    return () => {
      client.off("status:change", handleStatusChange);
      client.off("deposit:detected", handleDetected);
      client.off("deposit:below_threshold", handleBelowThreshold);
      client.off("deposit:processing", handleProcessing);
      client.off("deposit:complete", handleComplete);
      client.off("deposit:error", handleError);
      client.off("recovery:complete", handleRecoveryComplete);
      client.off("refund:started", handleRefundStarted);
      client.off("refund:complete", handleRefundComplete);
      client.off("refund:failed", handleRefundFailed);
    };
  }, []);

  // Handle Auth Core already being connected (persisted session)
  useEffect(() => {
    if (authCoreConnected && authCoreAddress && authCoreProvider) {
      loggerRef.current.log("[DepositSDK] Auth Core already connected (persisted session)");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Set isConnected when Auth Core connects
  useEffect(() => {
    if (
      authCoreConnected &&
      authCoreAddress &&
      authCoreProvider &&
      ownerAddressRef.current
    ) {
      if (!isConnected) {
        loggerRef.current.log("[DepositSDK] Auth Core connected:", authCoreAddress);
        setIsConnected(true);
        setIsConnecting(false);
        connectingRef.current = false;
      }
    }
  }, [
    authCoreConnected,
    authCoreAddress,
    authCoreProvider,
    isConnected,
    isConnecting,
  ]);

  // Initialize client after Auth Core connection.
  // Uses configRef (stable ref) instead of config (unstable object) to
  // prevent the effect from re-firing on every parent render. The
  // clientInitializingRef guard prevents concurrent async executions from
  // creating orphaned DepositClient instances with stale destinations.
  useEffect(() => {
    let aborted = false;

    const initClient = async () => {
      const currentOwner = ownerAddressRef.current;

      // Skip if disconnecting
      if (disconnectingRef.current) return;

      if (
        !authCoreConnected ||
        !authCoreAddress ||
        !authCoreProvider ||
        !currentOwner
      ) {
        return;
      }

      // Already have a live client - verify it's for the same owner
      if (clientRef.current) {
        if (clientRef.current.isDestroyed()) {
          // Previous client was destroyed (e.g. unmount) — clear ref and fall through
          clientRef.current = null;
        } else {
          const existingConfig = clientRef.current.getConfig();
          if (existingConfig.ownerAddress.toLowerCase() === currentOwner.toLowerCase()) {
            return;
          }
          // Different owner - destroy old client first
          clientRef.current.destroy();
          clientRef.current = null;
        }
      }

      // Prevent concurrent initialization — without this guard, effect
      // re-fires during the async gap (before clientRef.current is set)
      // would create multiple DepositClient instances.
      if (clientInitializingRef.current) {
        return;
      }
      clientInitializingRef.current = true;

      try {
        // Validate blind signing eligibility before proceeding
        // Particle Auth Core requires: JWT auth + no payment password + promptPaymentPasswordSettingWhenSign=false
        // If passwords were set previously (even from another app), signing popups will appear
        const securityAccount = userInfo?.security_account;
        if (securityAccount) {
          if (securityAccount.has_set_payment_password) {
            loggerRef.current.warn(
              "[DepositSDK] Intermediary account has a payment password set. " +
              "Blind signing is NOT available - signing confirmation popups will appear."
            );
          }
          if (securityAccount.has_set_master_password) {
            loggerRef.current.warn(
              "[DepositSDK] Intermediary account has a master password set. " +
              "Blind signing requires the master password to have been entered during this session."
            );
          }
        }

        // Use pending destination from useDeposit hook if available,
        // falling back to provider config, then SDK default.
        // Read from configRef (stable) to avoid stale closure issues.
        const cfg = configRef.current;
        const pendingDest = pendingDestinationRef.current;
        const client = new DepositClient({
          ownerAddress: currentOwner,
          intermediaryAddress: authCoreAddress,
          authCoreProvider: {
            signMessage: (message: string) =>
              authCoreProvider.signMessage(message),
          },
          destination: {
            chainId: pendingDest?.chainId ?? cfg.destination.chainId,
            address: pendingDest?.address ?? cfg.destination.address,
          },
          supportedTokens: cfg.supportedTokens,
          supportedChains: cfg.supportedChains,
          autoSweep: cfg.autoSweep ?? true,
          minValueUSD: cfg.minValueUSD,
          pollingIntervalMs: cfg.pollingIntervalMs,
          refund: cfg.refund,
          uaProjectId: cfg.uaProjectId,
          logger: loggerRef.current,
        });

        setupClientListeners(client);

        loggerRef.current.log("[DepositSDK] Initializing client for", currentOwner.slice(0, 8) + "...");
        await client.initialize();

        // Effect was cleaned up while we were awaiting — destroy the orphan
        if (aborted) {
          loggerRef.current.warn("[DepositSDK] Effect aborted during init, destroying orphaned client");
          client.destroy();
          return;
        }

        // Verify owner hasn't changed or disconnect started during async init
        if (
          disconnectingRef.current ||
          ownerAddressRef.current?.toLowerCase() !== currentOwner.toLowerCase()
        ) {
          loggerRef.current.warn("[DepositSDK] Owner changed during initialization, destroying client");
          client.destroy();
          return;
        }

        const addresses = await client.getDepositAddresses();

        // Check abort again after second await
        if (aborted) {
          loggerRef.current.warn("[DepositSDK] Effect aborted after getDepositAddresses, destroying orphaned client");
          client.destroy();
          return;
        }

        setDepositAddresses(addresses);

        client.startWatching();

        clientRef.current = client;
        setIsReady(true);
        setIsConnecting(false);

        loggerRef.current.log("[DepositSDK] Ready. EVM:", addresses.evm.slice(0, 10) + "...");
      } catch (err) {
        loggerRef.current.error("[DepositSDK] Failed to initialize client:", err);
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsConnecting(false);
      } finally {
        clientInitializingRef.current = false;
      }
    };

    initClient();

    // Cleanup: mark aborted so any in-flight init destroys its client
    return () => {
      aborted = true;
    };
    // NOTE: `config` and `isConnected` are intentionally excluded from deps.
    // - `config` is read via configRef to avoid re-firing on every parent
    //   render (object literals create new references each time).
    // - `isConnected` is derived from auth core state already in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authCoreConnected,
    authCoreAddress,
    authCoreProvider,
    setupClientListeners,
  ]);

  const connect = useCallback(
    async (ownerAddress: string, destination?: DestinationConfig) => {
      // Store destination so initClient picks it up when creating DepositClient
      if (destination) {
        pendingDestinationRef.current = destination;
      }
      loggerRef.current.log("[DepositSDK] Connecting:", ownerAddress.slice(0, 10) + "...");

      // Wait for any pending connection/disconnection to complete
      if (connectionLockRef.current) {
        await connectionLockRef.current;
      }

      // Use ref to prevent multiple simultaneous calls
      if (connectingRef.current || isConnecting) return;

      // If already connected with same address, skip
      if (isConnected && ownerAddressRef.current?.toLowerCase() === ownerAddress.toLowerCase()) return;

      // If connected with different address, disconnect first
      if (isConnected && ownerAddressRef.current && ownerAddressRef.current.toLowerCase() !== ownerAddress.toLowerCase()) {
        // Recursive call will happen after disconnect completes via useDeposit hook
        return;
      }

      // If already connected to Auth Core, verify the persisted session
      // belongs to this ownerAddress before reusing it
      if (authCoreConnected && authCoreAddress && authCoreProvider && !ownerAddressRef.current) {
        // Fetch the expected intermediary for this owner to validate
        try {
          const session = await intermediaryServiceRef.current.getSession(ownerAddress);
          if (session.intermediaryAddress.toLowerCase() === authCoreAddress.toLowerCase()) {
            loggerRef.current.log("[DepositSDK] Reusing existing Auth Core session");
            ownerAddressRef.current = ownerAddress;
            setIsConnected(true);
            return;
          }
          loggerRef.current.warn("[DepositSDK] Session mismatch, reconnecting...");
          await authCoreDisconnect();
        } catch (err) {
          loggerRef.current.warn("[DepositSDK] Session validation failed, reconnecting:", err);
          await authCoreDisconnect();
        }
      }

      connectingRef.current = true;
      setIsConnecting(true);
      setError(null);
      ownerAddressRef.current = ownerAddress;

      // Create connection lock promise
      let resolveLock: () => void;
      connectionLockRef.current = new Promise((resolve) => {
        resolveLock = resolve;
      });

      try {
        // Fetch JWT from worker (per-user cached)
        const session = await intermediaryServiceRef.current.getSession(
          ownerAddress
        );

        // Verify we're still connecting the same address (no race condition)
        if (ownerAddressRef.current?.toLowerCase() !== ownerAddress.toLowerCase()) {
          loggerRef.current.warn("[DepositSDK] Address changed during connection, aborting");
          return;
        }

        loggerRef.current.log("[DepositSDK] JWT received, connecting Auth Core...");

        // Connect to Auth Core with JWT
        // The useEffect will handle client initialization when authCoreConnected becomes true
        await authCoreConnect({
          provider: AuthType.jwt,
          thirdpartyCode: session.jwt,
        });

        // Set a timeout to reset isConnecting if Auth Core hooks don't update
        setTimeout(() => {
          if (connectingRef.current && !authCoreConnected) {
            loggerRef.current.warn("[DepositSDK] Auth Core hooks didn't update after 10s, resetting state");
            setIsConnecting(false);
            connectingRef.current = false;
          }
        }, 10000);

        // Don't set isConnected here - let the useEffect handle it when authCoreConnected changes
      } catch (err) {
        loggerRef.current.error("[DepositSDK] Connection failed:", err);
        // Clear session for this user on error to allow retry
        intermediaryServiceRef.current.clearSessionForUser(ownerAddress);
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsConnecting(false);
        connectingRef.current = false;
        ownerAddressRef.current = null;
      } finally {
        resolveLock!();
        connectionLockRef.current = null;
      }
    },
    [
      isConnecting,
      isConnected,
      authCoreConnect,
      authCoreDisconnect,
      authCoreConnected,
      authCoreAddress,
      authCoreProvider,
    ]
  );

  // Activity actions - persist across widget mount/unmount
  const recoverActivityItem = useCallback(async (itemId: string) => {
    const client = clientRef.current;
    if (!client || recoveringIdsRef.current.has(itemId)) return;

    const item = recentActivity.find((a) => a.id === itemId);
    if (!item) return;

    recoveringIdsRef.current.add(itemId);
    setRecentActivity((prev) =>
      prev.map((a) =>
        a.id === itemId ? { ...a, type: "processing" as const } : a,
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
        setRecentActivity((prev) =>
          prev.map((a) =>
            a.id === itemId
              ? { ...a, type: "complete" as const, message: "Recovered successfully" }
              : a,
          ),
        );
      } else {
        setRecentActivity((prev) =>
          prev.map((a) =>
            a.id === itemId
              ? { ...a, type: "error" as const, message: result.error || "Recovery failed" }
              : a,
          ),
        );
      }
    } catch (err) {
      setRecentActivity((prev) =>
        prev.map((a) =>
          a.id === itemId
            ? {
                ...a,
                type: "error" as const,
                message: err instanceof Error ? err.message : "Recovery failed",
              }
            : a,
        ),
      );
    } finally {
      recoveringIdsRef.current.delete(itemId);
    }
  }, [recentActivity]);

  const bridgeActivityItem = useCallback(async (itemId: string) => {
    const client = clientRef.current;
    if (!client || recoveringIdsRef.current.has(itemId)) return;

    recoveringIdsRef.current.add(itemId);
    setRecentActivity((prev) =>
      prev.map((a) =>
        a.id === itemId ? { ...a, type: "processing" as const } : a,
      ),
    );

    try {
      const results = await client.sweep(itemId);
      const result = results[0];
      if (result?.status === "success") {
        setRecentActivity((prev) =>
          prev.map((a) =>
            a.id === itemId
              ? { ...a, type: "complete" as const, result, message: "Bridged successfully" }
              : a,
          ),
        );
      } else {
        setRecentActivity((prev) =>
          prev.map((a) =>
            a.id === itemId
              ? { ...a, type: "error" as const, message: result?.error || "Bridge failed" }
              : a,
          ),
        );
      }
    } catch (err) {
      setRecentActivity((prev) =>
        prev.map((a) =>
          a.id === itemId
            ? {
                ...a,
                type: "error" as const,
                message: err instanceof Error ? err.message : "Bridge failed",
              }
            : a,
        ),
      );
    } finally {
      recoveringIdsRef.current.delete(itemId);
    }
  }, []);

  const clearActivity = useCallback(() => {
    setRecentActivity([]);
  }, []);

  const disconnect = useCallback(async () => {
    // Prevent concurrent disconnect calls
    if (disconnectingRef.current) return;

    // Wait for any pending connection to complete first
    if (connectionLockRef.current) {
      await connectionLockRef.current;
    }

    disconnectingRef.current = true;

    // Create disconnect lock promise
    let resolveLock: () => void;
    connectionLockRef.current = new Promise((resolve) => {
      resolveLock = resolve;
    });

    try {
      const previousOwner = ownerAddressRef.current;
      loggerRef.current.log("[DepositSDK] Disconnecting");

      // Allow any in-flight initClient to detect disconnect and self-destruct
      clientInitializingRef.current = false;

      if (clientRef.current) {
        clientRef.current.destroy();
        clientRef.current = null;
      }

      // Disconnect from Auth Core
      if (authCoreConnected) {
        await authCoreDisconnect();
      }

      // Clear session for the specific user (not all users)
      if (previousOwner) {
        intermediaryServiceRef.current.clearSessionForUser(previousOwner);
      }

      ownerAddressRef.current = null;
      setIsConnected(false);
      setIsReady(false);
      setDepositAddresses(null);
      setPendingDeposits([]);
      setRecentActivity([]);
      setStatus("idle");
      setError(null);
      connectingRef.current = false;

      loggerRef.current.log("[DepositSDK] Disconnected");
    } finally {
      disconnectingRef.current = false;
      resolveLock!();
      connectionLockRef.current = null;
    }
  }, [authCoreConnected, authCoreDisconnect]);

  const startWatching = useCallback(() => {
    if (clientRef.current && isReady) {
      clientRef.current.startWatching();
    }
  }, [isReady]);

  const stopWatching = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.stopWatching();
    }
  }, []);

  const sweep = useCallback(async (depositId?: string) => {
    if (!clientRef.current) {
      throw new Error("Client not initialized");
    }
    return clientRef.current.sweep(depositId);
  }, []);

  const setDestination = useCallback((destination: DestinationConfig) => {
    // Always keep the ref in sync so future reconnections use the latest destination
    pendingDestinationRef.current = destination;
    if (!clientRef.current) {
      throw new Error("Client not initialized");
    }
    clientRef.current.setDestination(destination);
    // Force context consumers to re-render with fresh currentDestination
    setDestinationVersion((v) => v + 1);
  }, []);

  const getCurrentDestination = useCallback((): { address: string; chainId: number } | null => {
    if (!clientRef.current) {
      return null;
    }
    return clientRef.current.getDestination();
  }, []);

  // Recovery methods
  const getStuckFunds = useCallback(async () => {
    if (!clientRef.current) {
      throw new Error("Client not initialized");
    }
    const funds = await clientRef.current.getStuckFunds();
    setStuckFunds(funds);
    return funds;
  }, []);

  const recoverFunds = useCallback(async () => {
    if (!clientRef.current) {
      throw new Error("Client not initialized");
    }
    setIsRecovering(true);
    try {
      const results = await clientRef.current.recoverAllFunds();
      // Refresh stuck funds after recovery
      const remainingFunds = await clientRef.current.getStuckFunds();
      setStuckFunds(remainingFunds);
      return results;
    } finally {
      setIsRecovering(false);
    }
  }, []);

  // Refund methods
  const refundDeposit = useCallback(async (depositId: string, reason?: RefundReason) => {
    if (!clientRef.current) {
      throw new Error("Client not initialized");
    }
    setIsRefunding(true);
    try {
      const result = await clientRef.current.refund(depositId, reason);
      // Refresh stuck funds after refund
      const remainingFunds = await clientRef.current.getStuckFunds();
      setStuckFunds(remainingFunds);
      return result;
    } finally {
      setIsRefunding(false);
    }
  }, []);

  const refundAll = useCallback(async (reason?: RefundReason) => {
    if (!clientRef.current) {
      throw new Error("Client not initialized");
    }
    setIsRefunding(true);
    try {
      const results = await clientRef.current.refundAll(reason);
      // Refresh stuck funds after refund
      const remainingFunds = await clientRef.current.getStuckFunds();
      setStuckFunds(remainingFunds);
      return results;
    } finally {
      setIsRefunding(false);
    }
  }, []);

  const canRefund = useCallback(async (depositId: string) => {
    if (!clientRef.current) {
      return { eligible: false, reason: "Client not initialized" };
    }
    return clientRef.current.canRefund(depositId);
  }, []);

  const getRefundConfig = useCallback((): RefundConfig | null => {
    if (!clientRef.current) {
      return null;
    }
    return clientRef.current.getRefundConfig();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clientRef.current) {
        clientRef.current.destroy();
        clientRef.current = null;
      }
    };
  }, []);

  const value: DepositContextValue = {
    isConnecting,
    isConnected,
    isReady,
    error,
    ownerAddress: ownerAddressRef.current,
    intermediaryAddress: authCoreAddress ?? null,
    connect,
    disconnect,
    client: clientRef.current,
    status,
    depositAddresses,
    pendingDeposits,
    recentActivity,
    recoverActivityItem,
    bridgeActivityItem,
    clearActivity,
    startWatching,
    stopWatching,
    sweep,
    setDestination,
    currentDestination: getCurrentDestination(),
    // Recovery
    stuckFunds,
    isRecovering,
    getStuckFunds,
    recoverFunds,
    // Refund
    isRefunding,
    refundDeposit,
    refundAll,
    canRefund,
    refundConfig: getRefundConfig(),
    // Logger
    logger: loggerRef.current,
  };

  return (
    <DepositContext.Provider value={value}>{children}</DepositContext.Provider>
  );
}

export interface DepositProviderProps {
  config: DepositConfig;
  children: React.ReactNode;
}

export function DepositProvider({
  config,
  children,
}: DepositProviderProps) {
  return (
    <AuthCoreContextProvider
      options={{
        projectId: DEFAULT_PROJECT_ID,
        clientKey: DEFAULT_CLIENT_KEY,
        appId: DEFAULT_APP_ID,
        customStyle: {
          zIndex: 2000,
        },
        wallet: {
          visible: false,
        },
        promptSettingConfig: {
          promptPaymentPasswordSettingWhenSign: false,
          promptMasterPasswordSettingWhenLogin: false,
        },
      }}
    >
      <DepositProviderInner config={config}>{children}</DepositProviderInner>
    </AuthCoreContextProvider>
  );
}

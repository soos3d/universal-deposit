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
} from "../../core/types";
import {
  DEFAULT_PROJECT_ID,
  DEFAULT_CLIENT_KEY,
  DEFAULT_APP_ID,
  DEFAULT_DESTINATION_CHAIN_ID,
  DEFAULT_JWT_SERVICE_URL,
} from "../../constants";

export interface DepositConfig {
  destination?: {
    chainId?: number;
  };
  supportedTokens?: TokenType[];
  supportedChains?: number[];
  autoSweep?: boolean;
  minValueUSD?: number;
  pollingIntervalMs?: number;
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
  connect: (ownerAddress: string) => Promise<void>;
  disconnect: () => Promise<void>;

  // Client state
  client: DepositClient | null;
  status: ClientStatus;
  depositAddresses: DepositAddresses | null;
  pendingDeposits: DetectedDeposit[];
  recentActivity: ActivityItem[];

  // Client actions
  startWatching: () => void;
  stopWatching: () => void;
  sweep: (depositId?: string) => Promise<SweepResult[]>;
}

interface ActivityItem {
  id: string;
  type: "detected" | "processing" | "complete" | "error";
  deposit: DetectedDeposit;
  result?: SweepResult;
  error?: Error;
  timestamp: number;
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
  const connectionLockRef = useRef<Promise<void> | null>(null);
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

  // Setup client event listeners
  const setupClientListeners = useCallback((client: DepositClient) => {
    const handleStatusChange = (newStatus: ClientStatus) => {
      setStatus(newStatus);
    };

    const handleDetected = (deposit: DetectedDeposit) => {
      setPendingDeposits((prev) => [...prev, deposit]);
      setRecentActivity((prev) =>
        [
          {
            id: deposit.id,
            type: "detected" as const,
            deposit,
            timestamp: Date.now(),
          },
          ...prev,
        ].slice(0, 50)
      );
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
      setRecentActivity((prev) =>
        prev.map((item) =>
          item.id === result.depositId
            ? { ...item, type: "complete" as const, result }
            : item
        )
      );
    };

    const handleError = (err: Error, deposit?: DetectedDeposit) => {
      if (deposit) {
        setRecentActivity((prev) =>
          prev.map((item) =>
            item.id === deposit.id
              ? { ...item, type: "error" as const, error: err }
              : item
          )
        );
      } else {
        setError(err);
      }
    };

    client.on("status:change", handleStatusChange);
    client.on("deposit:detected", handleDetected);
    client.on("deposit:processing", handleProcessing);
    client.on("deposit:complete", handleComplete);
    client.on("deposit:error", handleError);

    return () => {
      client.off("status:change", handleStatusChange);
      client.off("deposit:detected", handleDetected);
      client.off("deposit:processing", handleProcessing);
      client.off("deposit:complete", handleComplete);
      client.off("deposit:error", handleError);
    };
  }, []);

  // Handle Auth Core already being connected (persisted session)
  useEffect(() => {
    console.log("[DepositSDK] 👀 Auth Core state check on mount:", {
      authCoreConnected,
      authCoreAddress,
      hasProvider: !!authCoreProvider,
    });

    // If Auth Core is already connected (persisted session), we need to handle it
    if (authCoreConnected && authCoreAddress && authCoreProvider) {
      console.log(
        "[DepositSDK] 🔄 Auth Core already connected (persisted session):",
        authCoreAddress
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Set isConnected when Auth Core connects
  useEffect(() => {
    console.log("[DepositSDK] 👀 Auth Core state changed:", {
      authCoreConnected,
      authCoreAddress,
      hasProvider: !!authCoreProvider,
      ownerAddress: ownerAddressRef.current,
      isConnected,
      isConnecting,
    });

    if (
      authCoreConnected &&
      authCoreAddress &&
      authCoreProvider &&
      ownerAddressRef.current
    ) {
      if (!isConnected) {
        console.log(
          "[DepositSDK] ✅ Step 3: Auth Core connected! Address:",
          authCoreAddress
        );
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

  // Initialize client after Auth Core connection
  useEffect(() => {
    const initClient = async () => {
      const currentOwner = ownerAddressRef.current;

      console.log("[DepositSDK] 🔄 initClient check:", {
        authCoreConnected,
        authCoreAddress,
        hasProvider: !!authCoreProvider,
        ownerAddress: currentOwner,
        hasClient: !!clientRef.current,
        isDisconnecting: disconnectingRef.current,
      });

      // Skip if disconnecting
      if (disconnectingRef.current) {
        console.log("[DepositSDK] ⏭️ initClient skipped - disconnecting");
        return;
      }

      if (
        !authCoreConnected ||
        !authCoreAddress ||
        !authCoreProvider ||
        !currentOwner
      ) {
        console.log(
          "[DepositSDK] ⏭️ initClient skipped - missing requirements"
        );
        return;
      }

      // Already have a client - verify it's for the same owner
      if (clientRef.current) {
        const existingConfig = clientRef.current.getConfig();
        if (existingConfig.ownerAddress.toLowerCase() === currentOwner.toLowerCase()) {
          console.log(
            "[DepositSDK] ⏭️ initClient skipped - client already exists for this owner"
          );
          return;
        }
        // Different owner - destroy old client first
        console.log("[DepositSDK] 🔄 Owner changed, destroying old client");
        clientRef.current.destroy();
        clientRef.current = null;
      }

      try {
        console.log("[DepositSDK] 🏗️ Step 4: Creating DepositClient...");
        console.log("[DepositSDK] Config:", {
          ownerAddress: currentOwner,
          intermediaryAddress: authCoreAddress,
          destinationChainId:
            config.destination?.chainId ?? DEFAULT_DESTINATION_CHAIN_ID,
          autoSweep: config.autoSweep ?? true,
        });

        const client = new DepositClient({
          ownerAddress: currentOwner,
          intermediaryAddress: authCoreAddress,
          authCoreProvider: {
            signMessage: (message: string) =>
              authCoreProvider.signMessage(message),
          },
          destination: {
            chainId:
              config.destination?.chainId ?? DEFAULT_DESTINATION_CHAIN_ID,
          },
          supportedTokens: config.supportedTokens,
          supportedChains: config.supportedChains,
          autoSweep: config.autoSweep ?? true,
          minValueUSD: config.minValueUSD,
          pollingIntervalMs: config.pollingIntervalMs,
        });

        setupClientListeners(client);

        console.log(
          "[DepositSDK] 🔄 Step 5: Initializing client (UA setup)..."
        );
        await client.initialize();

        // Verify owner hasn't changed during async initialization
        if (ownerAddressRef.current?.toLowerCase() !== currentOwner.toLowerCase()) {
          console.warn("[DepositSDK] ⚠️ Owner changed during initialization, destroying client");
          client.destroy();
          return;
        }

        console.log("[DepositSDK] 📍 Step 6: Getting deposit addresses...");
        const addresses = await client.getDepositAddresses();
        console.log("[DepositSDK] Deposit addresses:", addresses);
        setDepositAddresses(addresses);

        // Auto-start watching
        console.log("[DepositSDK] 👁️ Step 7: Starting balance watcher...");
        client.startWatching();

        clientRef.current = client;
        setIsReady(true);
        setIsConnecting(false);

        console.log("[DepositSDK] ✅ All steps complete! SDK is ready.");
      } catch (err) {
        console.error("[DepositSDK] ❌ Failed to initialize client:", err);
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsConnecting(false);
      }
    };

    initClient();
  }, [
    authCoreConnected,
    authCoreAddress,
    authCoreProvider,
    isConnected,
    config,
    setupClientListeners,
  ]);

  const connect = useCallback(
    async (ownerAddress: string) => {
      console.log("[DepositSDK] 🔌 connect() called with:", ownerAddress);
      console.log("[DepositSDK] Current state:", {
        connectingRef: connectingRef.current,
        disconnectingRef: disconnectingRef.current,
        isConnecting,
        isConnected,
        authCoreConnected,
        authCoreAddress,
        hasProvider: !!authCoreProvider,
        currentOwner: ownerAddressRef.current,
      });

      // Wait for any pending connection/disconnection to complete
      if (connectionLockRef.current) {
        console.log("[DepositSDK] ⏳ Waiting for pending operation to complete...");
        await connectionLockRef.current;
      }

      // Use ref to prevent multiple simultaneous calls
      if (connectingRef.current || isConnecting) {
        console.log(
          "[DepositSDK] ⏭️ Connect skipped - already connecting"
        );
        return;
      }

      // If already connected with same address, skip
      if (isConnected && ownerAddressRef.current?.toLowerCase() === ownerAddress.toLowerCase()) {
        console.log(
          "[DepositSDK] ⏭️ Connect skipped - already connected with same address"
        );
        return;
      }

      // If connected with different address, disconnect first
      if (isConnected && ownerAddressRef.current && ownerAddressRef.current.toLowerCase() !== ownerAddress.toLowerCase()) {
        console.log(
          "[DepositSDK] 🔄 Different address detected, disconnecting first..."
        );
        // Recursive call will happen after disconnect completes via useDeposit hook
        return;
      }

      // If already connected to Auth Core with matching intermediary, just set the owner address
      if (authCoreConnected && authCoreAddress && authCoreProvider && !ownerAddressRef.current) {
        console.log(
          "[DepositSDK] ✅ Auth Core already connected, reusing connection"
        );
        ownerAddressRef.current = ownerAddress;
        setIsConnected(true);
        return;
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
        console.log("[DepositSDK] 📡 Step 1: Fetching JWT from worker...");
        console.log("[DepositSDK] JWT URL:", DEFAULT_JWT_SERVICE_URL);

        // Fetch JWT from worker (per-user cached)
        const session = await intermediaryServiceRef.current.getSession(
          ownerAddress
        );

        // Verify we're still connecting the same address (no race condition)
        if (ownerAddressRef.current?.toLowerCase() !== ownerAddress.toLowerCase()) {
          console.warn("[DepositSDK] ⚠️ Address changed during connection, aborting");
          return;
        }

        console.log("[DepositSDK] ✅ Step 1 Complete: JWT received");
        console.log(
          "[DepositSDK] Intermediary address:",
          session.intermediaryAddress
        );

        console.log(
          "[DepositSDK] 🔐 Step 2: Connecting to Auth Core with JWT..."
        );

        // Connect to Auth Core with JWT
        // The useEffect will handle client initialization when authCoreConnected becomes true
        const result = await authCoreConnect({
          provider: AuthType.jwt,
          thirdpartyCode: session.jwt,
        });

        console.log(
          "[DepositSDK] ✅ Step 2 Complete: authCoreConnect returned:",
          result
        );
        console.log("[DepositSDK] Waiting for Auth Core hooks to update...");

        // Set a timeout to reset isConnecting if Auth Core hooks don't update
        setTimeout(() => {
          if (connectingRef.current && !authCoreConnected) {
            console.warn(
              "[DepositSDK] ⚠️ Auth Core hooks didn't update after 10s, resetting state"
            );
            setIsConnecting(false);
            connectingRef.current = false;
          }
        }, 10000);

        // Don't set isConnected here - let the useEffect handle it when authCoreConnected changes
      } catch (err) {
        console.error("[DepositSDK] ❌ Connection failed:", err);
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
      authCoreConnected,
      authCoreAddress,
      authCoreProvider,
    ]
  );

  const disconnect = useCallback(async () => {
    // Prevent concurrent disconnect calls
    if (disconnectingRef.current) {
      console.log("[DepositSDK] ⏭️ Disconnect skipped - already disconnecting");
      return;
    }

    // Wait for any pending connection to complete first
    if (connectionLockRef.current) {
      console.log("[DepositSDK] ⏳ Waiting for pending connection to complete before disconnect...");
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
      console.log("[DepositSDK] 🔌 Disconnecting user:", previousOwner);

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

      console.log("[DepositSDK] ✅ Disconnect complete");
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clientRef.current) {
        clientRef.current.destroy();
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
    startWatching,
    stopWatching,
    sweep,
  };

  return (
    <DepositContext.Provider value={value}>{children}</DepositContext.Provider>
  );
}

export interface DepositProviderProps {
  config?: DepositConfig;
  children: React.ReactNode;
}

export function DepositProvider({
  config = {},
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

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { DepositClient } from '../../core/DepositClient';
import type {
  DepositClientConfig,
  DepositAddresses,
  DetectedDeposit,
  SweepResult,
  ClientStatus
} from '../../core/types';
import type { ActivityItem } from '../types';

export interface UseDepositClientOptions extends DepositClientConfig {
  autoInitialize?: boolean;
  autoWatch?: boolean;
}

export interface UseDepositClientReturn {
  client: DepositClient | null;
  status: ClientStatus;
  depositAddresses: DepositAddresses | null;
  pendingDeposits: DetectedDeposit[];
  recentActivity: ActivityItem[];
  isInitialized: boolean;
  isWatching: boolean;
  error: Error | null;
  initialize: () => Promise<void>;
  startWatching: () => void;
  stopWatching: () => void;
  sweep: (depositId?: string) => Promise<SweepResult[]>;
}

export function useDepositClient(options: UseDepositClientOptions): UseDepositClientReturn {
  const { autoInitialize = true, autoWatch = false, ...config } = options;
  
  const clientRef = useRef<DepositClient | null>(null);
  const [status, setStatus] = useState<ClientStatus>('idle');
  const [depositAddresses, setDepositAddresses] = useState<DepositAddresses | null>(null);
  const [pendingDeposits, setPendingDeposits] = useState<DetectedDeposit[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isWatching, setIsWatching] = useState(false);

  // Create client on mount
  useEffect(() => {
    const client = new DepositClient(config);
    clientRef.current = client;

    // Subscribe to events
    const handleStatusChange = (newStatus: ClientStatus) => {
      setStatus(newStatus);
      setIsWatching(newStatus === 'watching');
    };

    const handleDetected = (deposit: DetectedDeposit) => {
      setPendingDeposits(prev => [...prev, deposit]);
      setRecentActivity(prev => [{
        id: deposit.id,
        type: 'detected' as const,
        token: deposit.token,
        chainId: deposit.chainId,
        amount: deposit.amount,
        amountUSD: deposit.amountUSD,
        timestamp: Date.now(),
        deposit,
      }, ...prev].slice(0, 50));
    };

    const handleProcessing = (deposit: DetectedDeposit) => {
      setRecentActivity(prev => prev.map(item =>
        item.id === deposit.id ? { ...item, type: 'processing' as const } : item
      ));
    };

    const handleComplete = (result: SweepResult) => {
      setPendingDeposits(prev => prev.filter(d => d.id !== result.depositId));
      setRecentActivity(prev => prev.map(item =>
        item.id === result.depositId
          ? { ...item, type: 'complete' as const, result, message: 'Bridged successfully' }
          : item
      ));
    };

    const handleError = (err: Error, deposit?: DetectedDeposit) => {
      if (deposit) {
        setRecentActivity(prev => prev.map(item =>
          item.id === deposit.id
            ? { ...item, type: 'error' as const, message: err.message }
            : item
        ));
      } else {
        setError(err);
      }
    };

    client.on('status:change', handleStatusChange);
    client.on('deposit:detected', handleDetected);
    client.on('deposit:processing', handleProcessing);
    client.on('deposit:complete', handleComplete);
    client.on('deposit:error', handleError);

    return () => {
      client.destroy();
      clientRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Auto-initialize
  useEffect(() => {
    if (autoInitialize && clientRef.current && !isInitialized) {
      clientRef.current.initialize()
        .then(async () => {
          setIsInitialized(true);
          const addresses = await clientRef.current!.getDepositAddresses();
          setDepositAddresses(addresses);
          
          if (autoWatch) {
            clientRef.current!.startWatching();
          }
        })
        .catch(setError);
    }
  }, [autoInitialize, autoWatch, isInitialized]);

  const initialize = useCallback(async () => {
    if (!clientRef.current) return;
    
    try {
      await clientRef.current.initialize();
      setIsInitialized(true);
      const addresses = await clientRef.current.getDepositAddresses();
      setDepositAddresses(addresses);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }, []);

  const startWatching = useCallback(() => {
    if (clientRef.current && isInitialized) {
      clientRef.current.startWatching();
    }
  }, [isInitialized]);

  const stopWatching = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.stopWatching();
    }
  }, []);

  const sweep = useCallback(async (depositId?: string) => {
    if (!clientRef.current) {
      throw new Error('Client not initialized');
    }
    return clientRef.current.sweep(depositId);
  }, []);

  return {
    client: clientRef.current,
    status,
    depositAddresses,
    pendingDeposits,
    recentActivity,
    isInitialized,
    isWatching,
    error,
    initialize,
    startWatching,
    stopWatching,
    sweep,
  };
}

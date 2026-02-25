// Context & Provider
export {
  DepositProvider,
  useDepositContext,
  type DepositProviderProps,
  type DepositConfig,
  type DepositContextValue,
} from './context';

// Components
export { DepositWidget, type DepositWidgetProps } from './components/DepositWidget';
export { DepositModal, type DepositModalProps } from './components/DepositModal';
export { RecoveryWidget, type RecoveryWidgetProps } from './components/RecoveryWidget';
export { RecoveryModal, type RecoveryModalProps } from './components/RecoveryModal';

// Inline aliases for discoverability
// Use these when embedding widgets directly in your page layout (no modal)
export { DepositWidget as DepositInline } from './components/DepositWidget';
export { RecoveryWidget as RecoveryInline } from './components/RecoveryWidget';

// Hooks
export { useDeposit, type UseDepositOptions, type UseDepositReturn } from './hooks/useDeposit';
export { useDepositClient, type UseDepositClientOptions, type UseDepositClientReturn } from './hooks/useDepositClient';

// Types
export type { ActivityItem } from './types';

// Re-export commonly used types and constants for convenience
export type { DestinationConfig } from '../core/types';
export { CHAIN, getChainName } from '../constants/chains';

// Utils
export { cn } from './utils/cn';

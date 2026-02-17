# Deposit SDK Reference

Complete API reference for the `@particle-network/deposit-sdk` package.

## Table of Contents

- [Installation](#installation)
- [Core Classes](#core-classes)
  - [DepositClient](#depositclient)
- [React Integration](#react-integration)
  - [DepositProvider](#depositprovider)
  - [useDeposit](#usedeposit)
  - [useDepositContext](#usedepositcontext)
  - [Components](#components)
- [Types](#types)
- [Events](#events)
- [Errors](#errors)
- [Constants](#constants)

---

## Installation

```bash
npm install @particle-network/deposit-sdk
```

---

## Core Classes

### DepositClient

Main entry point for the SDK. Manages the complete deposit lifecycle.

#### Constructor

```typescript
import { DepositClient } from '@particle-network/deposit-sdk';

const client = new DepositClient(config: DepositClientConfig);
```

#### DepositClientConfig

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `ownerAddress` | `string` | Yes | — | User's wallet address (sweep destination) |
| `intermediaryAddress` | `string` | Yes | — | JWT wallet address from Auth Core |
| `authCoreProvider` | `AuthCoreProvider` | No* | — | Provider for signing sweep transactions |
| `destination.address` | `string` | No | `ownerAddress` | Custom sweep destination |
| `destination.chainId` | `number` | No | `42161` | Destination chain (default: Arbitrum) |
| `supportedTokens` | `TokenType[]` | No | All tokens | Filter which tokens to watch |
| `supportedChains` | `number[]` | No | All 17 chains | Filter which chains to watch |
| `autoSweep` | `boolean` | No | `true` | Auto-sweep detected deposits |
| `minValueUSD` | `number` | No | `0.50` | Minimum USD value to trigger sweep |
| `pollingIntervalMs` | `number` | No | `3000` | Balance check interval |
| `recovery` | `RecoveryConfig` | No | — | Recovery behavior options |
| `refund` | `RefundConfig` | No | `{ enabled: false }` | Auto-refund when sweep fails (experimental) |

*Required for bridge operations

#### Methods

##### `initialize(): Promise<void>`

Initialize the client. Must be called before other methods.

```typescript
await client.initialize();
```

##### `destroy(): void`

Cleanup and release resources.

```typescript
client.destroy();
```

##### `getDepositAddresses(): Promise<DepositAddresses>`

Get EVM and Solana deposit addresses.

```typescript
const addresses = await client.getDepositAddresses();
// { evm: '0x...', solana: '...' }
```

##### `startWatching(): void`

Start polling for balance changes.

```typescript
client.startWatching();
```

##### `stopWatching(): void`

Stop balance polling.

```typescript
client.stopWatching();
```

##### `checkBalances(): Promise<DetectedDeposit[]>`

Get current balances (respects `minValueUSD` threshold).

```typescript
const deposits = await client.checkBalances();
```

##### `sweep(depositId?: string): Promise<SweepResult[]>`

Manually trigger sweep for specific or all pending deposits.

```typescript
// Sweep all pending
const results = await client.sweep();

// Sweep specific deposit
const result = await client.sweep('deposit-id');
```

##### `getStuckFunds(): Promise<DetectedDeposit[]>`

Get ALL non-zero balances (no minimum threshold). Use for recovery.

```typescript
const stuckFunds = await client.getStuckFunds();
```

##### `recoverAllFunds(): Promise<RecoveryResult[]>`

Attempt to sweep all stuck funds to destination.

```typescript
const results = await client.recoverAllFunds();
for (const r of results) {
  console.log(`${r.token}: ${r.status}`);
}
```

##### `getStatus(): ClientStatus`

Get current client status.

```typescript
const status = client.getStatus();
// 'idle' | 'initializing' | 'ready' | 'watching' | 'sweeping' | 'error'
```

##### `getPendingDeposits(): DetectedDeposit[]`

Get list of detected but not yet swept deposits.

```typescript
const pending = client.getPendingDeposits();
```

##### `getConfig(): ResolvedConfig`

Get resolved configuration.

```typescript
const config = client.getConfig();
```

##### `setDestination(destination): void`

Change the sweep destination at runtime. Takes effect immediately for subsequent sweeps.

```typescript
import { CHAIN } from '@particle-network/deposit-sdk';

// Change destination chain
client.setDestination({ chainId: CHAIN.BASE });

// Change destination address
client.setDestination({ address: '0xTreasury...' });

// Change both
client.setDestination({
  chainId: CHAIN.ETHEREUM,
  address: '0xTreasury...',
});
```

**Parameters:**

| Property | Type | Description |
|----------|------|-------------|
| `chainId` | `number` | New destination chain (optional, keeps current if not specified) |
| `address` | `string` | New destination address (optional, keeps current if not specified) |

**Throws:** `ConfigurationError` if chain ID or address is invalid.

##### `getDestination(): { address: string; chainId: number }`

Get current destination configuration.

```typescript
const dest = client.getDestination();
console.log(`Sweeping to ${dest.address} on chain ${dest.chainId}`);
```

##### `refund(depositId: string, reason?: RefundReason): Promise<RefundResult>`

Manually refund a specific deposit to its source chain.

```typescript
const result = await client.refund('deposit-id', 'user_requested');
if (result.status === 'success') {
  console.log(`Refunded to ${result.refundedTo}`);
}
```

**Parameters:**

| Property | Type | Description |
|----------|------|-------------|
| `depositId` | `string` | ID of the deposit to refund |
| `reason` | `RefundReason` | Reason for refund (default: `'user_requested'`) |

**Returns:** `RefundResult` with status, txHash, refundedTo address, etc.

##### `refundAll(reason?: RefundReason): Promise<RefundResult[]>`

Refund all pending deposits to their source chains.

```typescript
const results = await client.refundAll();
const successful = results.filter(r => r.status === 'success');
console.log(`Refunded ${successful.length} deposits`);
```

##### `canRefund(depositId: string): Promise<{ eligible: boolean; reason?: string }>`

Check if a deposit can be refunded.

```typescript
const { eligible, reason } = await client.canRefund('deposit-id');
if (!eligible) {
  console.log(`Cannot refund: ${reason}`);
}
```

##### `getRefundConfig(): RefundConfig`

Get current refund configuration.

```typescript
const config = client.getRefundConfig();
console.log(`Auto-refund enabled: ${config.enabled}`);
```

---

## React Integration

### DepositProvider

Context provider that wraps your app and manages Auth Core internally.

```tsx
import { DepositProvider } from '@particle-network/deposit-sdk/react';

function App() {
  return (
    <DepositProvider config={config}>
      <YourApp />
    </DepositProvider>
  );
}
```

#### DepositConfig

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `destination.chainId` | `number` | `42161` | Sweep destination chain |
| `destination.address` | `string` | Owner's EOA | Custom sweep destination address |
| `supportedTokens` | `TokenType[]` | All | Tokens to support |
| `supportedChains` | `number[]` | All | Chains to support |
| `autoSweep` | `boolean` | `true` | Enable auto-sweep |
| `minValueUSD` | `number` | `0.50` | Minimum USD threshold |
| `pollingIntervalMs` | `number` | `3000` | Polling interval |
| `refund` | `RefundConfig` | `{ enabled: false }` | Auto-refund configuration (experimental) |

**Destination Examples:**

```tsx
import { DepositProvider, CHAIN } from '@particle-network/deposit-sdk/react';

// Default: sweep to user's EOA on Arbitrum
<DepositProvider>
  <App />
</DepositProvider>

// Sweep to user's EOA on Base
<DepositProvider config={{ destination: { chainId: CHAIN.BASE } }}>
  <App />
</DepositProvider>

// Sweep to a treasury address
<DepositProvider config={{
  destination: {
    chainId: CHAIN.ETHEREUM,
    address: '0xTreasury...',
  }
}}>
  <App />
</DepositProvider>
```

### useDeposit

Hook that auto-connects when `ownerAddress` is provided.

```tsx
import { useDeposit } from '@particle-network/deposit-sdk/react';

function Component() {
  const deposit = useDeposit({
    ownerAddress: '0x...', // Pass to auto-connect
  });

  return <div>{deposit.isReady ? 'Ready' : 'Loading'}</div>;
}
```

#### useDeposit Options

| Property | Type | Description |
|----------|------|-------------|
| `ownerAddress` | `string \| undefined` | User's wallet address. Pass to trigger connection. |

#### useDeposit Return Value

| Property | Type | Description |
|----------|------|-------------|
| `isConnecting` | `boolean` | SDK is initializing |
| `isConnected` | `boolean` | Auth Core connected |
| `isReady` | `boolean` | Client ready for operations |
| `error` | `Error \| null` | Last error |
| `disconnect` | `() => Promise<void>` | Disconnect and cleanup |

### useDepositContext

Access the full context including recovery methods.

```tsx
import { useDepositContext } from '@particle-network/deposit-sdk/react';

function Component() {
  const ctx = useDepositContext();
  // Access all properties including recovery
}
```

#### useDepositContext Return Value

| Property | Type | Description |
|----------|------|-------------|
| `isConnecting` | `boolean` | SDK is initializing |
| `isConnected` | `boolean` | Auth Core connected |
| `isReady` | `boolean` | Client ready |
| `error` | `Error \| null` | Last error |
| `ownerAddress` | `string \| null` | User's wallet |
| `intermediaryAddress` | `string \| null` | JWT wallet |
| `connect` | `(address: string) => Promise<void>` | Connect with address |
| `disconnect` | `() => Promise<void>` | Disconnect |
| `client` | `DepositClient \| null` | Underlying client |
| `status` | `ClientStatus` | Client status |
| `depositAddresses` | `DepositAddresses \| null` | Deposit addresses |
| `pendingDeposits` | `DetectedDeposit[]` | Pending deposits |
| `recentActivity` | `ActivityItem[]` | Activity history |
| `startWatching` | `() => void` | Start watching |
| `stopWatching` | `() => void` | Stop watching |
| `sweep` | `(id?: string) => Promise<SweepResult[]>` | Trigger sweep |
| `setDestination` | `(dest: DestinationConfig) => void` | Change destination at runtime |
| `currentDestination` | `{ address: string; chainId: number } \| null` | Current destination |
| `stuckFunds` | `DetectedDeposit[]` | Stuck funds list |
| `isRecovering` | `boolean` | Recovery in progress |
| `getStuckFunds` | `() => Promise<DetectedDeposit[]>` | Refresh stuck funds |
| `recoverFunds` | `() => Promise<RecoveryResult[]>` | Recover all funds |
| `isRefunding` | `boolean` | Refund in progress |
| `refundDeposit` | `(id: string) => Promise<RefundResult>` | Refund specific deposit |
| `refundAll` | `() => Promise<RefundResult[]>` | Refund all pending deposits |
| `canRefund` | `(id: string) => Promise<{ eligible: boolean; reason?: string }>` | Check refund eligibility |
| `refundConfig` | `RefundConfig` | Current refund configuration |

### Components

#### DepositWidget

Complete deposit UI with token selection, QR code, and activity.

```tsx
import { DepositWidget } from '@particle-network/deposit-sdk/react';

<DepositWidget
  theme="dark"        // 'dark' | 'light'
  className="..."     // Custom CSS class
/>
```

#### DepositModal

Modal wrapper for DepositWidget.

```tsx
import { DepositModal } from '@particle-network/deposit-sdk/react';

<DepositModal
  isOpen={true}
  onClose={() => {}}
  theme="dark"
/>
```

#### RecoveryWidget

Complete recovery UI for scanning and recovering stuck funds. Supports two modes:
- **Recover to Wallet**: Sweep funds to your destination wallet (default behavior)
- **Refund to Source**: Send funds back to the original sender

```tsx
import { RecoveryWidget } from '@particle-network/deposit-sdk/react';

<RecoveryWidget
  theme="dark"           // 'dark' | 'light'
  className="..."        // Custom CSS class
  autoScan={true}        // Auto-scan on mount (default: true)
  showModeSelector={true} // Show mode toggle (default: true)
  defaultMode="recover"  // 'recover' | 'refund' (default: 'recover')
/>
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `client` | `DepositClient` | — | Optional client (uses context if not provided) |
| `onClose` | `() => void` | — | Close handler |
| `className` | `string` | — | Custom CSS class |
| `theme` | `'dark' \| 'light'` | `'dark'` | Color theme |
| `autoScan` | `boolean` | `true` | Auto-scan for funds on mount |
| `showModeSelector` | `boolean` | `true` | Show recover/refund mode toggle |
| `defaultMode` | `'recover' \| 'refund'` | `'recover'` | Initial mode |

**Features:**
- Auto-scans for recoverable funds on mount
- Displays all stuck funds with token icons, chain badges, amounts, and USD values
- Per-item status tracking (pending → processing → success/error)
- Mode toggle between "Recover to Wallet" and "Refund to Source"
- "Recover All" or "Refund All" button depending on mode
- "Scan" button to refresh the list
- Shows results summary after completion

**Example - Refund-only mode:**

```tsx
// Show only refund option (hide mode selector, default to refund)
<RecoveryWidget
  showModeSelector={false}
  defaultMode="refund"
/>
```

#### RecoveryModal

Modal wrapper for RecoveryWidget.

```tsx
import { RecoveryModal } from '@particle-network/deposit-sdk/react';

<RecoveryModal
  isOpen={true}
  onClose={() => {}}
  theme="dark"
  autoScan={true}
  showModeSelector={true}
  defaultMode="recover"
/>
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `isOpen` | `boolean` | — | Modal visibility |
| `onClose` | `() => void` | — | Close handler |
| `client` | `DepositClient` | — | Optional client |
| `className` | `string` | — | Custom CSS class for modal content |
| `overlayClassName` | `string` | — | Custom CSS class for overlay |
| `theme` | `'dark' \| 'light'` | `'dark'` | Color theme |
| `autoScan` | `boolean` | `true` | Auto-scan for funds on mount |
| `showModeSelector` | `boolean` | `true` | Show recover/refund mode toggle |
| `defaultMode` | `'recover' \| 'refund'` | `'recover'` | Initial mode |

---

## Types

### TokenType

```typescript
type TokenType = 'ETH' | 'USDC' | 'USDT' | 'BTC' | 'SOL' | 'BNB';
```

### DestinationConfig

Configuration for where swept funds are sent.

```typescript
interface DestinationConfig {
  /**
   * The address to receive swept funds.
   * Defaults to ownerAddress if not specified.
   * For EVM chains: 0x-prefixed address (42 characters)
   * For Solana: base58 address (32-44 characters)
   */
  address?: string;

  /**
   * The chain ID to sweep funds to.
   * Defaults to Arbitrum (42161) if not specified.
   * Must be a supported chain from the CHAIN constant.
   */
  chainId?: number;
}
```

**Examples:**

```typescript
import { CHAIN } from '@particle-network/deposit-sdk';

// Default: sweep to owner's EOA on Arbitrum
destination: undefined

// Sweep to owner's EOA on Base
destination: { chainId: CHAIN.BASE }

// Sweep to a custom treasury on Arbitrum
destination: { address: '0xTreasury...' }

// Sweep to a custom address on Ethereum mainnet
destination: {
  chainId: CHAIN.ETHEREUM,
  address: '0xTreasury...',
}
```

### DepositAddresses

```typescript
interface DepositAddresses {
  evm: string;      // EVM smart account address
  solana: string;   // Solana smart account address
}
```

### DetectedDeposit

```typescript
interface DetectedDeposit {
  id: string;           // Unique identifier
  token: TokenType;     // Token type
  chainId: number;      // Source chain
  amount: string;       // Raw amount (string)
  amountUSD: number;    // USD value
  rawAmount: bigint;    // Raw amount (bigint)
  detectedAt: number;   // Timestamp
}
```

### SweepResult

```typescript
interface SweepResult {
  depositId: string;      // Deposit ID
  transactionId: string;  // Transaction hash
  explorerUrl: string;    // Block explorer URL
  status: SweepStatus;    // 'success' | 'failed' | 'pending'
  error?: string;         // Error message if failed
}
```

### RecoveryResult

```typescript
interface RecoveryResult {
  token: TokenType;         // Token type
  chainId: number;          // Source chain
  amount: string;           // Raw amount
  amountUSD: number;        // USD value
  status: RecoveryStatus;   // 'success' | 'failed' | 'skipped'
  error?: string;           // Error message if failed
  txHash?: string;          // Transaction hash if success
}
```

### RecoveryConfig

```typescript
interface RecoveryConfig {
  autoRetry?: boolean;           // Enable auto-retry (default: true)
  maxRetries?: number;           // Max retry attempts (default: 3)
  retryDelayMs?: number;         // Initial retry delay (default: 60000)
  backoffMultiplier?: number;    // Backoff multiplier (default: 2)
  onRecoveryFailed?: (deposit: DetectedDeposit, error: Error) => void;
}
```

### RefundConfig

Configuration for automatic refunds when sweeps fail.

```typescript
interface RefundConfig {
  /**
   * Enable automatic refunds when sweep fails.
   * @default true
   */
  enabled?: boolean;

  /**
   * Delay in milliseconds before attempting refund after sweep failure.
   * @default 5000
   */
  delayMs?: number;

  /**
   * Maximum number of refund attempts per deposit.
   * @default 2
   */
  maxAttempts?: number;

  /**
   * Try to refund to the original sender address (if detectable).
   * Falls back to owner address if sender cannot be determined.
   * @default true
   */
  refundToSender?: boolean;
}
```

**Examples:**

```typescript
// Default: auto-refund disabled (experimental)
const client = new DepositClient({ ownerAddress, intermediaryAddress });

// Disable auto-refund
const client = new DepositClient({
  ownerAddress,
  intermediaryAddress,
  refund: { enabled: false },
});

// Custom refund settings
const client = new DepositClient({
  ownerAddress,
  intermediaryAddress,
  refund: {
    enabled: true,
    delayMs: 10000,      // Wait 10s before refund
    maxAttempts: 3,      // Try up to 3 times
    refundToSender: true, // Send back to original sender
  },
});
```

### RefundResult

Result of a refund operation.

```typescript
interface RefundResult {
  depositId: string;         // Deposit ID
  token: TokenType;          // Token type
  sourceChainId: number;     // Chain where funds originated
  amount: string;            // Amount refunded
  amountUSD: number;         // USD value at time of refund
  status: RefundStatus;      // 'success' | 'failed' | 'skipped'
  reason: RefundReason;      // Why refund was triggered
  txHash?: string;           // Transaction hash if success
  error?: string;            // Error message if failed
  refundedTo?: string;       // Address funds were sent to
  refundedToSender?: boolean; // True if sent to original sender
  timestamp: number;         // When refund was processed
}
```

### RefundReason

Why a refund was triggered.

```typescript
type RefundReason =
  | 'sweep_failed'           // Auto-refund after sweep failure
  | 'user_requested'         // Manual refund via refund() method
  | 'address_type_mismatch'  // Incompatible address types (e.g., EVM vs Solana)
  | 'below_minimum';         // Amount below minimum threshold
```

### RefundStatus

```typescript
type RefundStatus = 'success' | 'failed' | 'skipped';
```

### DepositOrigin

Information about where a deposit originated (for refund targeting).

```typescript
interface DepositOrigin {
  senderAddress: string;  // Original sender's address
  chainId: number;        // Chain deposit came from
  transactionId?: string; // Original transaction ID
}
```

### ClientStatus

```typescript
type ClientStatus =
  | 'idle'          // Not initialized
  | 'initializing'  // Setting up
  | 'ready'         // Ready for operations
  | 'watching'      // Actively polling
  | 'sweeping'      // Sweep in progress
  | 'error';        // Error state
```

### AuthCoreProvider

```typescript
interface AuthCoreProvider {
  signMessage: (message: string) => Promise<string>;
}
```

---

## Events

Subscribe to client events:

```typescript
client.on('event-name', handler);
client.off('event-name', handler);
client.removeAllListeners();
```

### Deposit Events

| Event | Payload | Description |
|-------|---------|-------------|
| `deposit:detected` | `DetectedDeposit` | New deposit found |
| `deposit:processing` | `DetectedDeposit` | Sweep started |
| `deposit:complete` | `SweepResult` | Sweep finished |
| `deposit:error` | `Error, DetectedDeposit?` | Sweep failed |

### Recovery Events

| Event | Payload | Description |
|-------|---------|-------------|
| `recovery:started` | — | Recovery process started |
| `recovery:complete` | `RecoveryResult[]` | Recovery finished |
| `recovery:failed` | `DetectedDeposit, Error` | Single recovery failed |

### Refund Events

| Event | Payload | Description |
|-------|---------|-------------|
| `refund:started` | `DetectedDeposit, RefundReason` | Refund initiated |
| `refund:processing` | `DetectedDeposit, attempt: number` | Refund attempt in progress |
| `refund:complete` | `RefundResult` | Refund succeeded |
| `refund:failed` | `DetectedDeposit, Error, attemptsExhausted: boolean` | Refund attempt failed |

**Example:**

```typescript
// Listen for refund events
client.on('refund:started', (deposit, reason) => {
  console.log(`Refunding ${deposit.token}: ${reason}`);
});

client.on('refund:complete', (result) => {
  console.log(`Refunded to ${result.refundedTo}`);
  console.log(`Tx: ${result.txHash}`);
});

client.on('refund:failed', (deposit, error, exhausted) => {
  console.error(`Refund failed: ${error.message}`);
  if (exhausted) {
    console.error('All refund attempts exhausted');
  }
});
```

### Status Events

| Event | Payload | Description |
|-------|---------|-------------|
| `status:change` | `ClientStatus` | Status changed |

---

## Errors

```typescript
import {
  DepositSDKError,       // Base class
  ConfigurationError,    // Invalid config
  AuthenticationError,   // Auth failed
  JwtError,              // JWT service error
  UniversalAccountError, // UA operations failed
  SweepError,            // Sweep failed
  RefundError,           // Refund failed
  NetworkError,          // Network issues
} from '@particle-network/deposit-sdk';
```

### Error Handling

```typescript
try {
  await client.initialize();
} catch (error) {
  if (error instanceof ConfigurationError) {
    // Invalid configuration
  } else if (error instanceof JwtError) {
    // JWT service unreachable
  } else if (error instanceof UniversalAccountError) {
    // UA initialization failed
  }
}
```

---

## Constants

### Supported Chains

```typescript
import { CHAIN, DEFAULT_SUPPORTED_CHAINS } from '@particle-network/deposit-sdk';

CHAIN.ETHEREUM    // 1
CHAIN.OPTIMISM    // 10
CHAIN.BNB         // 56
CHAIN.POLYGON     // 137
CHAIN.BASE        // 8453
CHAIN.ARBITRUM    // 42161
CHAIN.AVALANCHE   // 43114
CHAIN.LINEA       // 59144
CHAIN.HYPERVM     // 999
CHAIN.MANTLE      // 5000
CHAIN.MERLIN      // 4200
CHAIN.XLAYER      // 196
CHAIN.MONAD       // 143
CHAIN.SONIC       // 146
CHAIN.PLASMA      // 9745
CHAIN.BERACHAIN   // 80094
CHAIN.SOLANA      // 101
```

### Supported Tokens

```typescript
import { DEFAULT_SUPPORTED_TOKENS } from '@particle-network/deposit-sdk';

// ['ETH', 'USDC', 'USDT', 'BTC', 'SOL', 'BNB']
```

### Default Values

```typescript
import {
  DEFAULT_DESTINATION_CHAIN_ID,  // 42161 (Arbitrum)
  DEFAULT_MIN_VALUE_USD,         // 0.20
  DEFAULT_POLLING_INTERVAL_MS,   // 3000
} from '@particle-network/deposit-sdk';
```

### Chain Validation Utilities

Helper functions for validating chains and addresses.

```typescript
import {
  getChainName,
  isValidDestinationChain,
  getAddressType,
  isValidEvmAddress,
  isValidSolanaAddress,
  validateAddressForChain,
} from '@particle-network/deposit-sdk';

// Get chain name
getChainName(42161);  // "Arbitrum"
getChainName(8453);   // "Base"
getChainName(101);    // "Solana"
getChainName(99999);  // "Unknown Chain (99999)"

// Check if chain is valid destination
isValidDestinationChain(42161);  // true
isValidDestinationChain(99999);  // false

// Get address type for chain
getAddressType(42161);  // 'evm'
getAddressType(101);    // 'solana'
getAddressType(99999);  // null

// Validate EVM address format
isValidEvmAddress('0x1234567890123456789012345678901234567890');  // true
isValidEvmAddress('invalid');  // false

// Validate Solana address format
isValidSolanaAddress('7qSo38so1uwrPqTGpcXe94Z9LpBtZghQncLvVfreYCyX');  // true
isValidSolanaAddress('invalid');  // false

// Validate address for specific chain
validateAddressForChain('0x123...', 42161);  // { isValid: true }
validateAddressForChain('0x123...', 101);    // { isValid: false, error: 'Invalid Solana address format' }
```

---

## Full Example

```tsx
import {
  DepositProvider,
  useDeposit,
  useDepositContext,
  DepositModal,
  RecoveryModal,
  CHAIN,
} from '@particle-network/deposit-sdk/react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useState } from 'react';

function App() {
  return (
    <DepositProvider config={{
      autoSweep: true,
      destination: {
        chainId: CHAIN.BASE,  // Sweep to Base instead of Arbitrum
      },
    }}>
      <DepositPage />
    </DepositProvider>
  );
}

function DepositPage() {
  const { login, authenticated, logout } = usePrivy();
  const { wallets } = useWallets();
  const ownerAddress = wallets[0]?.address;

  const { isReady, isConnecting, error, disconnect } = useDeposit({
    ownerAddress: authenticated ? ownerAddress : undefined,
  });

  // Access setDestination and currentDestination from context
  const { setDestination, currentDestination } = useDepositContext();

  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);

  if (!authenticated) {
    return <button onClick={login}>Login</button>;
  }

  if (isConnecting) {
    return <p>Initializing SDK...</p>;
  }

  if (error) {
    return <p>Error: {error.message}</p>;
  }

  if (!isReady) {
    return <p>Loading...</p>;
  }

  return (
    <div>
      {/* Show current destination */}
      {currentDestination && (
        <p>
          Sweeping to chain {currentDestination.chainId}
        </p>
      )}

      {/* Runtime destination change */}
      <select onChange={(e) => setDestination({ chainId: Number(e.target.value) })}>
        <option value={CHAIN.BASE}>Base</option>
        <option value={CHAIN.ARBITRUM}>Arbitrum</option>
        <option value={CHAIN.ETHEREUM}>Ethereum</option>
      </select>

      <button onClick={() => setShowDepositModal(true)}>
        Open Deposit
      </button>
      <button onClick={() => setShowRecoveryModal(true)}>
        Recover Funds
      </button>
      <button onClick={() => disconnect().then(logout)}>
        Logout
      </button>

      <DepositModal
        isOpen={showDepositModal}
        onClose={() => setShowDepositModal(false)}
        theme="dark"
      />

      <RecoveryModal
        isOpen={showRecoveryModal}
        onClose={() => setShowRecoveryModal(false)}
        theme="dark"
        showModeSelector={true}  // Allow user to choose recover vs refund
      />
    </div>
  );
}
```

### Auto-Refund Example

```tsx
import {
  DepositProvider,
  useDeposit,
  useDepositContext,
  CHAIN,
} from '@particle-network/deposit-sdk/react';

function App() {
  return (
    // Enable auto-refund when sweeps fail
    <DepositProvider config={{
      autoSweep: true,
      refund: {
        enabled: true,
        delayMs: 5000,        // Wait 5s before refund
        maxAttempts: 2,       // Try up to 2 times
        refundToSender: true, // Return to original sender
      },
    }}>
      <DepositPage />
    </DepositProvider>
  );
}

function DepositPage() {
  const { address } = useYourWallet();
  const { isReady } = useDeposit({ ownerAddress: address });
  const {
    client,
    isRefunding,
    refundDeposit,
    refundAll,
    canRefund,
    refundConfig,
  } = useDepositContext();

  // Listen for refund events
  useEffect(() => {
    if (!client) return;

    const handleRefundComplete = (result) => {
      console.log(`Refund complete: ${result.txHash}`);
      console.log(`Sent to: ${result.refundedTo}`);
    };

    const handleRefundFailed = (deposit, error, exhausted) => {
      if (exhausted) {
        console.error('All refund attempts failed, manual intervention needed');
      }
    };

    client.on('refund:complete', handleRefundComplete);
    client.on('refund:failed', handleRefundFailed);

    return () => {
      client.off('refund:complete', handleRefundComplete);
      client.off('refund:failed', handleRefundFailed);
    };
  }, [client]);

  // Manual refund trigger
  const handleManualRefund = async (depositId) => {
    const { eligible, reason } = await canRefund(depositId);
    if (!eligible) {
      alert(`Cannot refund: ${reason}`);
      return;
    }

    const result = await refundDeposit(depositId);
    if (result.status === 'success') {
      alert(`Refunded to ${result.refundedTo}`);
    }
  };

  return (
    <div>
      <p>Auto-refund: {refundConfig?.enabled ? 'ON' : 'OFF'}</p>
      <p>Refunding: {isRefunding ? 'Yes' : 'No'}</p>

      <button
        onClick={() => refundAll()}
        disabled={isRefunding}
      >
        Refund All Pending
      </button>
    </div>
  );
}
```

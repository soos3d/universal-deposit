# Universal Deposit SDK — API Reference

Accept deposits from any chain. Funds are automatically detected and swept to your configured destination.

## Quickstart

### Install

```bash
npm install @particle-network/universal-deposit
```

### Setup

Wrap your app with `DepositProvider`:

```tsx
import { DepositProvider, CHAIN } from '@particle-network/universal-deposit/react';

function App() {
  return (
    <YourAuthProvider>
      <DepositProvider config={{
        destination: { chainId: CHAIN.POLYGON },
        autoSweep: true,
        minValueUSD: 1,
      }}>
        <YourApp />
      </DepositProvider>
    </YourAuthProvider>
  );
}
```

### Modal

```tsx
import { useDeposit, DepositModal, CHAIN } from '@particle-network/universal-deposit/react';

function Page() {
  const { address } = useYourWallet();
  const [open, setOpen] = useState(false);
  const { isReady } = useDeposit({ ownerAddress: address });

  return (
    <>
      <button onClick={() => setOpen(true)} disabled={!isReady}>Deposit</button>
      <DepositModal isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}
```

### Inline

```tsx
import { useDeposit, DepositWidget } from '@particle-network/universal-deposit/react';

function Page() {
  const { address } = useYourWallet();
  const { isReady } = useDeposit({ ownerAddress: address });

  if (!isReady) return <Loading />;
  return <DepositWidget fullWidth />;
}
```

### Headless

Use `useDeposit` directly for full control over the UI:

```tsx
import { useDeposit, getChainName } from '@particle-network/universal-deposit/react';

function Page() {
  const { address } = useYourWallet();
  const {
    isReady, depositAddresses, pendingDeposits,
    recentActivity, status, sweep, currentDestination,
  } = useDeposit({ ownerAddress: address });

  if (!isReady) return <Loading />;

  return (
    <div>
      <p>EVM: {depositAddresses?.evm}</p>
      <p>Solana: {depositAddresses?.solana}</p>
      <p>Status: {status}</p>
      <p>Destination: {getChainName(currentDestination?.chainId)}</p>

      {pendingDeposits.map(d => (
        <div key={d.id}>
          {d.token} — ${d.amountUSD.toFixed(2)}
          <button onClick={() => sweep(d.id)}>Sweep</button>
        </div>
      ))}
    </div>
  );
}
```

---

## React API

### DepositProvider

Wraps your app. Manages Auth Core context internally.

```tsx
<DepositProvider config={config}>
  <App />
</DepositProvider>
```

| Config Property | Type | Default | Description |
|-----------------|------|---------|-------------|
| `destination.chainId` | `number` | — | **Required.** Destination chain (use `CHAIN` constant) |
| `destination.address` | `string` | Owner's EOA | Custom sweep destination address |
| `supportedTokens` | `TokenType[]` | All | Tokens to watch |
| `supportedChains` | `number[]` | All 17 chains | Chains to watch |
| `autoSweep` | `boolean` | `true` | Auto-sweep detected deposits |
| `minValueUSD` | `number` | `0.50` | Minimum USD value to trigger sweep |
| `pollingIntervalMs` | `number` | `3000` | Balance check interval (ms) |
| `refund` | `RefundConfig` | `{ enabled: false }` | Auto-refund config (experimental) |
| `uaProjectId` | `string` | SDK default | Particle project ID for UA operations only (see [Custom Credentials](#custom-particle-credentials)) |

### useDeposit

Primary hook. Pass `ownerAddress` to trigger auto-connection.

```tsx
const result = useDeposit({ ownerAddress: '0x...' });
```

**Options:**

| Property | Type | Description |
|----------|------|-------------|
| `ownerAddress` | `string \| undefined` | User's wallet address. Pass to trigger connection. |

**Return value:**

| Property | Type | Description |
|----------|------|-------------|
| `isConnecting` | `boolean` | SDK is initializing |
| `isConnected` | `boolean` | Auth Core connected |
| `isReady` | `boolean` | Client ready for operations |
| `error` | `Error \| null` | Last error |
| `disconnect` | `() => Promise<void>` | Disconnect and cleanup |
| `status` | `ClientStatus` | Current client status |
| `depositAddresses` | `DepositAddresses \| null` | EVM and Solana deposit addresses |
| `pendingDeposits` | `DetectedDeposit[]` | Detected but unsent deposits |
| `recentActivity` | `ActivityItem[]` | Activity history |
| `sweep` | `(id?: string) => Promise<SweepResult[]>` | Trigger sweep (all or by ID) |
| `setDestination` | `(dest: DestinationConfig) => void` | Change destination at runtime |
| `currentDestination` | `{ address: string; chainId: number } \| null` | Current destination |

### useDepositContext

Access the full context including recovery and refund methods.

| Property | Type | Description |
|----------|------|-------------|
| *All `useDeposit` properties* | | |
| `client` | `DepositClient \| null` | Underlying client instance |
| `ownerAddress` | `string \| null` | User's wallet |
| `intermediaryAddress` | `string \| null` | JWT wallet |
| `connect` | `(address: string) => Promise<void>` | Manual connect |
| `startWatching` / `stopWatching` | `() => void` | Control balance polling |
| `stuckFunds` | `DetectedDeposit[]` | Stuck funds list |
| `isRecovering` | `boolean` | Recovery in progress |
| `getStuckFunds` | `() => Promise<DetectedDeposit[]>` | Refresh stuck funds |
| `recoverFunds` | `() => Promise<RecoveryResult[]>` | Recover all funds |
| `isRefunding` | `boolean` | Refund in progress |
| `refundDeposit` | `(id: string) => Promise<RefundResult>` | Refund specific deposit |
| `refundAll` | `() => Promise<RefundResult[]>` | Refund all pending |
| `canRefund` | `(id: string) => Promise<{ eligible: boolean; reason?: string }>` | Check eligibility |
| `refundConfig` | `RefundConfig` | Current refund config |

### Components

#### DepositWidget

Inline deposit UI with token selection, QR code, and activity feed.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `client` | `DepositClient` | Context | Optional client (uses context if omitted) |
| `theme` | `'dark' \| 'light'` | `'dark'` | Color theme |
| `destination` | `DestinationConfig` | Provider config | Override destination |
| `onDestinationChange` | `(dest) => void` | — | Destination change callback |
| `showDestination` | `boolean` | `true` | Show destination section |
| `fullWidth` | `boolean` | `false` | Expand to container (default: 380px) |
| `showHeader` | `boolean` | `true` | Show header with title |
| `className` | `string` | — | Custom CSS class |
| `onClose` | `() => void` | — | Close handler |

#### DepositModal

Modal wrapper around `DepositWidget`. Accepts all `DepositWidgetProps` plus:

| Prop | Type | Description |
|------|------|-------------|
| `isOpen` | `boolean` | Modal visibility |
| `onClose` | `() => void` | Close handler (required) |
| `overlayClassName` | `string` | Custom overlay CSS class |

#### RecoveryWidget

UI for scanning and recovering stuck funds.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `client` | `DepositClient` | Context | Optional client |
| `theme` | `'dark' \| 'light'` | `'dark'` | Color theme |
| `autoScan` | `boolean` | `true` | Auto-scan on mount |
| `showModeSelector` | `boolean` | `true` | Show recover/refund toggle |
| `defaultMode` | `'recover' \| 'refund'` | `'recover'` | Initial mode |
| `className` | `string` | — | Custom CSS class |
| `onClose` | `() => void` | — | Close handler |

#### RecoveryModal

Modal wrapper around `RecoveryWidget`. Accepts all `RecoveryWidgetProps` plus:

| Prop | Type | Description |
|------|------|-------------|
| `isOpen` | `boolean` | Modal visibility |
| `onClose` | `() => void` | Close handler (required) |
| `overlayClassName` | `string` | Custom overlay CSS class |

---

## Core API (DepositClient)

For headless / non-React usage.

```typescript
import { DepositClient, CHAIN } from '@particle-network/universal-deposit';

const client = new DepositClient({
  ownerAddress: '0x...',
  intermediaryAddress: '0x...',
  authCoreProvider: provider,
  destination: { chainId: CHAIN.BASE },
});
```

### Constructor Config

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `ownerAddress` | `string` | Yes | — | User's wallet address |
| `intermediaryAddress` | `string` | Yes | — | JWT wallet from Auth Core |
| `authCoreProvider` | `AuthCoreProvider` | No* | — | Provider for signing (*required for sweeps) |
| `destination` | `DestinationConfig` | Yes | — | Where swept funds go (`chainId` required) |
| `supportedTokens` | `TokenType[]` | No | All | Tokens to watch |
| `supportedChains` | `number[]` | No | All 17 | Chains to watch |
| `autoSweep` | `boolean` | No | `true` | Auto-sweep on detection |
| `minValueUSD` | `number` | No | `0.50` | Minimum USD threshold |
| `pollingIntervalMs` | `number` | No | `3000` | Polling interval (ms) |
| `recovery` | `RecoveryConfig` | No | — | Recovery behavior |
| `refund` | `RefundConfig` | No | `{ enabled: false }` | Auto-refund (experimental) |
| `uaProjectId` | `string` | No | SDK default | Particle project ID for UA operations only (see [Custom Credentials](#custom-particle-credentials)) |

### Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `initialize()` | — | `Promise<void>` | Initialize client (call first) |
| `destroy()` | — | `void` | Cleanup resources |
| `getDepositAddresses()` | — | `Promise<DepositAddresses>` | Get EVM + Solana addresses |
| `startWatching()` | — | `void` | Start balance polling |
| `stopWatching()` | — | `void` | Stop balance polling |
| `checkBalances()` | — | `Promise<DetectedDeposit[]>` | Get current balances (above threshold) |
| `sweep(depositId?)` | `string?` | `Promise<SweepResult[]>` | Sweep specific or all deposits |
| `getStatus()` | — | `ClientStatus` | Current status |
| `getPendingDeposits()` | — | `DetectedDeposit[]` | Unsent deposits |
| `getConfig()` | — | `ResolvedConfig` | Resolved config |
| `setDestination(dest)` | `Partial<DestinationConfig>` | `void` | Change destination at runtime |
| `getDestination()` | — | `{ address, chainId }` | Current destination |
| `getStuckFunds()` | — | `Promise<DetectedDeposit[]>` | All non-zero balances (no threshold) |
| `recoverAllFunds()` | — | `Promise<RecoveryResult[]>` | Sweep all stuck funds |
| `refund(id, reason?)` | `string, RefundReason?` | `Promise<RefundResult>` | Refund specific deposit |
| `refundAll(reason?)` | `RefundReason?` | `Promise<RefundResult[]>` | Refund all pending |
| `canRefund(id)` | `string` | `Promise<{ eligible, reason? }>` | Check refund eligibility |
| `getRefundConfig()` | — | `RefundConfig` | Current refund config |

### Events

```typescript
client.on('deposit:detected', (deposit: DetectedDeposit) => { ... });
client.off('deposit:detected', handler);
```

| Event | Payload | Description |
|-------|---------|-------------|
| `deposit:detected` | `DetectedDeposit` | New deposit found |
| `deposit:processing` | `DetectedDeposit` | Sweep started |
| `deposit:complete` | `SweepResult` | Sweep succeeded |
| `deposit:error` | `Error, DetectedDeposit?` | Sweep failed |
| `recovery:started` | — | Recovery started |
| `recovery:complete` | `RecoveryResult[]` | Recovery finished |
| `recovery:failed` | `DetectedDeposit, Error` | Single recovery failed |
| `refund:started` | `DetectedDeposit, RefundReason` | Refund initiated |
| `refund:processing` | `DetectedDeposit, attempt` | Refund attempt |
| `refund:complete` | `RefundResult` | Refund succeeded |
| `refund:failed` | `DetectedDeposit, Error, exhausted` | Refund failed |
| `status:change` | `ClientStatus` | Status changed |

---

## Types

### DestinationConfig

```typescript
interface DestinationConfig {
  address?: string;   // Defaults to ownerAddress
  chainId: number;    // Required — use CHAIN constant
}
```

### DetectedDeposit

```typescript
interface DetectedDeposit {
  id: string;
  token: TokenType;
  chainId: number;
  amount: string;
  amountUSD: number;
  rawAmount: bigint;
  detectedAt: number;
}
```

### SweepResult

```typescript
interface SweepResult {
  depositId: string;
  transactionId: string;
  explorerUrl: string;
  status: 'success' | 'failed' | 'pending';
  error?: string;
}
```

### RecoveryResult

```typescript
interface RecoveryResult {
  token: TokenType;
  chainId: number;
  amount: string;
  amountUSD: number;
  status: 'success' | 'failed' | 'skipped';
  error?: string;
  txHash?: string;
}
```

### RefundResult

```typescript
interface RefundResult {
  depositId: string;
  token: TokenType;
  sourceChainId: number;
  amount: string;
  amountUSD: number;
  status: 'pending' | 'processing' | 'success' | 'failed' | 'skipped';
  reason: RefundReason;
  txHash?: string;
  error?: string;
  refundedTo?: string;
  refundedToSender?: boolean;
}
```

### Other Types

```typescript
type TokenType = 'ETH' | 'USDC' | 'USDT' | 'BTC' | 'SOL' | 'BNB';

type ClientStatus = 'idle' | 'initializing' | 'ready' | 'watching' | 'sweeping' | 'error';

type RefundReason = 'sweep_failed' | 'user_requested' | 'address_type_mismatch' | 'below_minimum';

interface DepositAddresses { evm: string; solana: string; }
```

---

## Constants

### CHAIN

```typescript
import { CHAIN } from '@particle-network/universal-deposit';

CHAIN.ETHEREUM   // 1       CHAIN.MANTLE     // 5000
CHAIN.OPTIMISM   // 10      CHAIN.MERLIN     // 4200
CHAIN.BNB        // 56      CHAIN.XLAYER     // 196
CHAIN.POLYGON    // 137     CHAIN.MONAD      // 143
CHAIN.BASE       // 8453    CHAIN.SONIC      // 146
CHAIN.ARBITRUM   // 42161   CHAIN.PLASMA     // 9745
CHAIN.AVALANCHE  // 43114   CHAIN.BERACHAIN  // 80094
CHAIN.LINEA      // 59144   CHAIN.SOLANA     // 101
CHAIN.HYPERVM    // 999
```

### Defaults

```typescript
import {
  DEFAULT_SUPPORTED_TOKENS,       // ['ETH', 'USDC', 'USDT', 'BTC', 'SOL', 'BNB']
  DEFAULT_MIN_VALUE_USD,           // 0.50
  DEFAULT_POLLING_INTERVAL_MS,     // 3000
} from '@particle-network/universal-deposit';
```

### Chain Utilities

```typescript
import {
  getChainName,              // getChainName(42161) → "Arbitrum"
  isValidDestinationChain,   // isValidDestinationChain(42161) → true
  getAddressType,            // getAddressType(101) → 'solana'
  isValidEvmAddress,         // Validates 0x + 40 hex chars
  isValidSolanaAddress,      // Validates base58 format
  validateAddressForChain,   // Validates address format for chain type
} from '@particle-network/universal-deposit';
```

---

## Advanced

### Custom Particle Credentials

By default the SDK uses built-in shared Particle credentials. You can supply your own project ID to scope **Universal Account operations** to your Particle project:

> [!IMPORTANT]
> `uaProjectId` only affects Universal Account operations (smart account initialization and asset queries). The intermediary wallet authentication (JWT + Auth Core session) always uses the SDK's built-in credentials — this is by design and cannot be overridden.

> This is useful if you want to handle your own app fees. If you use your own project ID, deposits will be subject to a 1% fee going to Particle. Reach out to us to configure a custom rate and establish a revenue sharing model.

> [!NOTE]
> You can reach out to us at [https://t.me/particle_developer_bot](https://t.me/particle_developer_bot)

```tsx
// React
<DepositProvider config={{
  destination: { chainId: CHAIN.BASE },
  uaProjectId: 'your-project-id',
}}>
```

```typescript
// Headless
const client = new DepositClient({
  ownerAddress: '0x...',
  intermediaryAddress: '0x...',
  destination: { chainId: CHAIN.BASE },
  uaProjectId: 'your-project-id',
});
```

When omitted, the SDK falls back to its shared project ID which works out of the box.

### Destination Configuration

Change destination at runtime (React):

```tsx
const { setDestination, currentDestination } = useDepositContext();
setDestination({ chainId: CHAIN.ETHEREUM });
```

Change destination at runtime (headless):

```typescript
client.setDestination({ chainId: CHAIN.BASE, address: '0xTreasury...' });
const dest = client.getDestination(); // { address, chainId }
```

Throws `ConfigurationError` if chain ID or address is invalid.

### Recovery

Recover stuck funds (below threshold or failed sweeps):

```tsx
const { stuckFunds, recoverFunds, isRecovering } = useDepositContext();

// Or use RecoveryModal
<RecoveryModal isOpen={open} onClose={() => setOpen(false)} />
```

### Refund (Experimental)

Auto-refund is **disabled by default**. Enable it to automatically return funds to the source chain when sweeps fail.

```tsx
<DepositProvider config={{
  refund: {
    enabled: true,
    delayMs: 5000,
    maxAttempts: 2,
    refundToSender: true,
  },
}}>
```

| RefundConfig Property | Type | Default | Description |
|-----------------------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable auto-refund |
| `delayMs` | `number` | `5000` | Delay before refund attempt |
| `maxAttempts` | `number` | `2` | Max refund attempts |
| `refundToSender` | `boolean` | `true` | Refund to original sender if detectable |

Manual refund is always available regardless of auto-refund setting:

```typescript
const result = await client.refund('deposit-id', 'user_requested');
const { eligible, reason } = await client.canRefund('deposit-id');
```

### Error Hierarchy

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
} from '@particle-network/universal-deposit';
```

```typescript
try {
  await client.initialize();
} catch (error) {
  if (error instanceof ConfigurationError) { /* invalid config */ }
  if (error instanceof JwtError) { /* JWT service unreachable */ }
  if (error instanceof UniversalAccountError) { /* UA init failed */ }
}
```

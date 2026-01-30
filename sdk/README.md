# Deposit SDK

> A cross-chain deposit solution that leverages Universal Accounts to provide multi-chain deposit addresses with automatic sweep functionality.

## Overview

The Deposit SDK uses Universal Accounts to enable seamless cross-chain deposits. By creating a Universal Account (via an intermediary JWT wallet), the SDK provides deposit addresses across 17 chains. When users deposit funds to these addresses, the SDK automatically detects and sweeps them to the user's connected wallet. The SDK provides:

- **Deposit addresses** — EVM + Solana smart account addresses for receiving funds
- **Auto-sweep** — Automatically move deposited funds to a configurable destination
- **Pre-built UI** — Modal/widget components for easy integration
- **Headless mode** — Full programmatic control for custom UIs
- **Multi-chain support** — 17 chains including Ethereum, Arbitrum, Base, Solana, and more
- **Wallet-agnostic** — Works with any wallet provider (Privy, RainbowKit, etc.)
- **Fund recovery** — Manual recovery of stuck funds when auto-sweep fails

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  User's EOA     │     │  Intermediary   │     │  Universal      │
│  (Privy, etc.)  │ ──▶ │  Wallet (JWT)   │ ──▶ │  Account        │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                        │
        │ sweep destination     │ owns & signs           │ deposit addresses
        ▼                       ▼                        ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Receives swept │     │  Auth Core      │     │  EVM + Solana   │
│  funds (Arb)    │     │  Provider       │     │  Smart Accounts │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Key Concepts

1. **Universal Account**: A smart account that provides deposit addresses across multiple chains (EVM + Solana). Created using an intermediary wallet's address.

2. **Intermediary Wallet**: A JWT-based embedded wallet (via Particle Auth Core) that owns the Universal Account. The SDK handles Auth Core connection internally.

3. **Cross-chain deposits**: Users can deposit funds on any of the 17 supported chains to their Universal Account addresses.

4. **Auto-sweep**: Deposits are detected via balance polling, then automatically swept to the user's connected wallet on their preferred chain (default: Arbitrum).

5. **Session Isolation**: Each user's session is cached independently, preventing wallet identity mixing when users connect and disconnect.

## Installation

```bash
npm install @particle-network/deposit-sdk
```

## Quick Start (React)

The simplest way to integrate the Deposit SDK is using the React provider and hook. **The SDK handles all the complexity internally** — JWT fetching, Auth Core connection, and client initialization.

```tsx
import { DepositProvider, useDeposit, DepositModal } from '@particle-network/deposit-sdk/react';

// 1. Wrap your app with DepositProvider
function App() {
  return (
    <DepositProvider>
      <YourApp />
    </DepositProvider>
  );
}

// 2. Use the hook with just the user's wallet address
function DepositButton() {
  const { login, authenticated } = usePrivy(); // or any wallet provider
  const { wallets } = useWallets();
  const ownerAddress = wallets[0]?.address;

  const { isReady, isConnecting, error } = useDeposit({
    ownerAddress: authenticated ? ownerAddress : undefined,
  });

  const [showModal, setShowModal] = useState(false);

  if (!authenticated) {
    return <button onClick={login}>Login</button>;
  }

  if (isConnecting) {
    return <p>Initializing...</p>;
  }

  if (!isReady) {
    return <p>Loading...</p>;
  }

  return (
    <>
      <button onClick={() => setShowModal(true)}>Deposit</button>
      <DepositModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        theme="dark"
      />
    </>
  );
}
```

That's it! The SDK automatically:
- Fetches a JWT from the hosted worker
- Connects to Particle Auth Core
- Initializes the Universal Account
- Starts watching for deposits
- Auto-sweeps to the user's wallet on Arbitrum

## Advanced Usage

### Direct DepositClient (Headless)

For custom UIs or non-React environments, use the DepositClient directly:

```typescript
import { DepositClient, CHAIN } from '@particle-network/deposit-sdk';

const client = new DepositClient({
  ownerAddress: '0x...',           // User's wallet (sweep destination)
  intermediaryAddress: '0x...',    // JWT wallet address
  authCoreProvider: {
    signMessage: (msg) => provider.signMessage(msg),
  },
  autoSweep: true,
});

await client.initialize();
client.startWatching();

client.on('deposit:detected', (deposit) => {
  console.log('Deposit detected:', deposit.token, deposit.chainId);
});

client.on('deposit:complete', (result) => {
  console.log('Swept successfully:', result.explorerUrl);
});

// Manual fund recovery
const stuckFunds = await client.getStuckFunds();
const results = await client.recoverAllFunds();

// Runtime destination change
client.setDestination({ chainId: CHAIN.BASE });
```

### Configuration Options

```typescript
import { DepositClient, CHAIN } from '@particle-network/deposit-sdk';

const client = new DepositClient({
  // Required
  ownerAddress: '0x...',           // User's wallet (sweep destination)
  intermediaryAddress: '0x...',    // JWT wallet from useEthereum().address

  // Required for sweep operations
  authCoreProvider: {
    signMessage: (msg) => authCoreProvider.signMessage(msg),
  },

  // Optional
  destination: {
    address: '0x...', // Defaults to ownerAddress
    chainId: 42161,   // Defaults to Arbitrum
  },
  supportedTokens: ['ETH', 'USDC', 'USDT'], // Defaults to all
  supportedChains: [1, 42161, 8453],        // Defaults to all 17 chains
  autoSweep: true,                          // Default: true
  minValueUSD: 0.5,                         // Default: 0.5
  pollingIntervalMs: 8000,                  // Default: 8000
});
```

### Destination Configuration

Configure where swept funds are sent. By default, funds are swept to the user's EOA on Arbitrum.

```typescript
import { DepositClient, CHAIN } from '@particle-network/deposit-sdk';

// Default: sweep to user's EOA on Arbitrum
const client = new DepositClient({
  ownerAddress: '0xUserWallet...',
  intermediaryAddress: '0x...',
  authCoreProvider: provider,
});

// Custom chain: sweep to user's EOA on Base
const client = new DepositClient({
  ownerAddress: '0xUserWallet...',
  intermediaryAddress: '0x...',
  authCoreProvider: provider,
  destination: { chainId: CHAIN.BASE },
});

// Custom address: sweep to treasury on Arbitrum
const client = new DepositClient({
  ownerAddress: '0xUserWallet...',
  intermediaryAddress: '0x...',
  authCoreProvider: provider,
  destination: { address: '0xTreasury...' },
});

// Both custom: sweep to treasury on Ethereum mainnet
const client = new DepositClient({
  ownerAddress: '0xUserWallet...',
  intermediaryAddress: '0x...',
  authCoreProvider: provider,
  destination: {
    chainId: CHAIN.ETHEREUM,
    address: '0xTreasury...',
  },
});
```

**Runtime Updates:**

You can change the destination at any time after initialization:

```typescript
// Change to a different chain
client.setDestination({ chainId: CHAIN.POLYGON });

// Change to a different address
client.setDestination({ address: '0xNewTreasury...' });

// Change both
client.setDestination({
  chainId: CHAIN.BASE,
  address: '0xNewTreasury...',
});

// Check current destination
const dest = client.getDestination();
console.log(`Sweeping to ${dest.address} on chain ${dest.chainId}`);
```

**Validation:**

- Chain ID must be a supported chain (see `CHAIN` constant)
- EVM addresses must be valid format (0x + 40 hex chars)
- Solana addresses must be valid base58 format (32-44 chars)
- A warning is logged if destination address differs from owner address

### Supported Chains

The SDK supports 17 chains:

| Chain | Chain ID | Assets |
|-------|----------|--------|
| Ethereum | 1 | USDC, USDT, ETH, BTC |
| Optimism | 10 | USDC, USDT, ETH, BTC |
| BNB Chain | 56 | USDC, USDT, ETH, BTC, BNB |
| Polygon | 137 | USDC, USDT, ETH, BTC |
| Base | 8453 | USDC, ETH, BTC |
| Arbitrum | 42161 | USDC, USDT, ETH, BTC |
| Avalanche | 43114 | USDC, USDT, ETH, BTC |
| Linea | 59144 | USDC, USDT, ETH, BTC |
| HyperEVM | 999 | USDT |
| Mantle | 5000 | USDT |
| Merlin | 4200 | — |
| X Layer | 196 | USDC, USDT |
| Monad | 143 | USDC |
| Sonic | 146 | USDC |
| Plasma | 9745 | USDT |
| Berachain | 80094 | USDC |
| Solana | 101 | USDC, USDT, SOL |

## React Components

The SDK includes pre-built React components for easy integration.

### DepositProvider

Wrap your app with `DepositProvider` to enable the SDK. It handles Auth Core initialization internally.

```tsx
import { DepositProvider } from '@particle-network/deposit-sdk/react';

function App() {
  return (
    <DepositProvider config={{ autoSweep: true }}>
      <YourApp />
    </DepositProvider>
  );
}
```

**Config Options:**
- `destination.chainId` — Sweep destination chain (default: Arbitrum 42161)
- `destination.address` — Custom sweep destination address (default: user's EOA)
- `supportedTokens` — Array of token types to support
- `supportedChains` — Array of chain IDs to support
- `autoSweep` — Enable auto-sweep (default: true)
- `minValueUSD` — Minimum deposit value in USD (default: 0.5)
- `pollingIntervalMs` — Balance polling interval (default: 8000)

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

// Sweep to a treasury address on Ethereum
<DepositProvider config={{
  destination: {
    chainId: CHAIN.ETHEREUM,
    address: '0xTreasury...',
  }
}}>
  <App />
</DepositProvider>
```

### useDeposit Hook

The main hook for interacting with the SDK. Automatically connects when `ownerAddress` is provided.

```tsx
import { useDeposit } from '@particle-network/deposit-sdk/react';

function MyComponent() {
  const {
    // Connection state
    isConnecting,
    isConnected,
    isReady,
    error,
    
    // Addresses
    ownerAddress,
    intermediaryAddress,
    
    // Actions
    connect,
    disconnect,
    
    // Client state
    client,
    status,
    depositAddresses,
    pendingDeposits,
    recentActivity,
    
    // Client actions
    startWatching,
    stopWatching,
    sweep,
    setDestination,      // Change destination at runtime
    currentDestination,  // Current { address, chainId }

    // Recovery
    stuckFunds,
    isRecovering,
    getStuckFunds,
    recoverFunds,
  } = useDeposit({
    ownerAddress: '0x...', // Pass user's wallet address to auto-connect
  });

  return (
    <div>
      <p>EVM Deposit Address: {depositAddresses?.evm}</p>
      <p>Solana Deposit Address: {depositAddresses?.solana}</p>
    </div>
  );
}
```

### DepositWidget

A complete deposit widget with token/chain selection, address display, QR code, and activity history.

```tsx
import { DepositWidget } from '@particle-network/deposit-sdk/react';

// When used inside DepositProvider, no client prop needed
function App() {
  return <DepositWidget theme="dark" />;
}

// Or pass a client directly for headless usage
function HeadlessApp() {
  const client = /* your DepositClient */;
  return <DepositWidget client={client} theme="dark" />;
}
```

### DepositModal

A modal wrapper for the DepositWidget with backdrop and escape key handling.

```tsx
import { useState } from 'react';
import { DepositModal } from '@particle-network/deposit-sdk/react';

function App() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button onClick={() => setIsOpen(true)}>Deposit</button>
      <DepositModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        theme="dark"
      />
    </>
  );
}
```

### Styling

The components use Tailwind CSS classes. Make sure Tailwind is configured in your project, or override styles using the `className` prop.

```tsx
<DepositWidget
  className="my-custom-class"
  theme="light" // or "dark"
/>
```

## Project Structure

```
sdk/
├── src/
│   ├── core/
│   │   ├── DepositClient.ts      # Main SDK entry point
│   │   ├── EventEmitter.ts       # Typed event system
│   │   ├── errors.ts             # Custom error classes
│   │   ├── types.ts              # TypeScript interfaces
│   │   └── index.ts
│   │
│   ├── intermediary/
│   │   ├── IntermediaryService.ts # JWT authentication & session management
│   │   └── index.ts
│   │
│   ├── universal-account/         # UA operations
│   │   ├── UAManager.ts          # Universal Account initialization & addresses
│   │   └── index.ts
│   │
│   ├── sweep/                     # Balance watching & sweeping
│   │   ├── BalanceWatcher.ts     # Polls for balance changes
│   │   ├── Sweeper.ts            # Multi-strategy sweep logic
│   │   └── index.ts
│   │
│   ├── types/
│   │   └── particle-sdk.d.ts     # Type declarations for UA SDK
│   │
│   ├── react/                      # React components & hooks
│   │   ├── components/
│   │   │   ├── DepositWidget.tsx  # Main deposit widget
│   │   │   └── DepositModal.tsx   # Modal wrapper
│   │   ├── hooks/
│   │   │   └── useDepositClient.ts # React hook for client
│   │   ├── utils/
│   │   │   └── cn.ts              # Class name utility
│   │   └── index.ts
│   │
│   ├── constants/
│   │   ├── chains.ts             # Chain configurations
│   │   ├── tokens.ts             # Token addresses
│   │   └── index.ts              # Default values & baked-in credentials
│   │
│   ├── __tests__/
│   │   ├── integration/          # Integration tests (real API calls)
│   │   │   ├── jwt-worker.integration.test.ts
│   │   │   └── ua-manager.integration.test.ts
│   │   ├── BalanceWatcher.test.ts
│   │   └── IntermediaryService.test.ts
│   │
│   └── index.ts                  # Public exports
│
├── dist/                         # Built output (ESM + CJS)
├── package.json
├── tsconfig.json
├── tsup.config.ts                # Build configuration
├── vitest.config.ts              # Test configuration
└── README.md
```

## Development

See [docs/CONTRIB.md](docs/CONTRIB.md) for the full contributing guide.

### Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `build` | `npm run build` | Build ESM + CJS + types to `dist/` |
| `dev` | `npm run dev` | Development mode with watch |
| `typecheck` | `npm run typecheck` | TypeScript type checking |
| `test` | `npm run test` | Run unit tests |
| `test:watch` | `npm run test:watch` | Run tests in watch mode |
| `test:integration` | `npm run test:integration` | Run integration tests (real API) |

### Build

```bash
npm run build
```

Outputs:
- `dist/index.js` - CommonJS
- `dist/index.mjs` - ES Module
- `dist/index.d.ts` - TypeScript declarations

### Testing

```bash
# Run unit tests (mocked)
npm run test

# Run integration tests (real JWT worker)
npm run test:integration

# Watch mode
npm run test:watch
```

### Type Checking

```bash
npm run typecheck
```

### Operations

See [docs/RUNBOOK.md](docs/RUNBOOK.md) for deployment, monitoring, and troubleshooting.

## Core Components

### DepositClient

Main entry point for the SDK. Manages lifecycle, configuration, and coordinates all services.

**Key Methods:**
- `initialize()` - Creates intermediary wallet and UA
- `getDepositAddresses()` - Returns EVM + Solana addresses
- `startWatching()` / `stopWatching()` - Control balance monitoring
- `sweep()` - Manual sweep trigger
- `setDestination({ chainId?, address? })` - Change destination at runtime
- `getDestination()` - Get current destination config
- `getStuckFunds()` - Get all non-zero balances (for recovery)
- `recoverAllFunds()` - Attempt to sweep all stuck funds
- `destroy()` - Cleanup

**Events:**
- `deposit:detected` - New deposit found
- `deposit:processing` - Sweep in progress
- `deposit:complete` - Sweep successful
- `deposit:error` - Error occurred
- `recovery:started` - Recovery process started
- `recovery:complete` - Recovery finished (with results)
- `recovery:failed` - Individual recovery failed
- `status:change` - Client status changed

### IntermediaryService

Manages JWT authentication with the hosted JWT service. Handles session caching, expiry, and refresh.

**Features:**
- Automatic JWT fetching from Cloudflare Worker
- **Per-user session isolation** - Each user gets their own cached session (prevents wallet mixing)
- Session caching with 60-second expiry buffer
- Concurrent request deduplication (per-user)
- Address normalization (case-insensitive)
- Proper error handling (JwtError, AuthenticationError)

**Internal Use Only** - Not exposed in public API.

### Constants

**JWT Service:**
- URL: `https://deposit-auth-worker.deposit-kit.workers.dev`
- Credentials: Baked into SDK (not configurable)

**Default Destination:**
- Arbitrum (42161)

**Tokens:**
- ETH, USDC, USDT, BTC, SOL, BNB

## Testing

### Unit Tests

Located in `src/__tests__/*.test.ts`. Use mocked fetch and dependencies.

Example:
```typescript
import { IntermediaryService } from '../intermediary';

describe('IntermediaryService', () => {
  it('should cache session', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ jwt: 'mock-jwt', ... }),
    });

    const service = new IntermediaryService(config);
    await service.getSession('0xtest');
    await service.getSession('0xtest');

    expect(fetch).toHaveBeenCalledTimes(1); // Cached
  });
});
```

### Integration Tests

Located in `src/__tests__/integration/*.integration.test.ts`. Call real APIs.

Example:
```typescript
describe('JWT Worker Integration', () => {
  it('should fetch JWT from deployed worker', async () => {
    const service = new IntermediaryService({
      projectId: TEST_PROJECT_ID,
      clientKey: TEST_CLIENT_KEY,
      appId: TEST_APP_ID,
      jwtServiceUrl: DEFAULT_JWT_SERVICE_URL,
    });

    const session = await service.getSession('0x...');
    
    expect(session.jwt).toBeTruthy();
    expect(session.expiresAt).toBeGreaterThan(Date.now() / 1000);
  });
});
```

## Fund Recovery

When auto-sweep fails (network issues, gas problems, threshold issues), funds may remain in the Universal Account. The SDK provides manual recovery methods.

### Check for Stuck Funds

```typescript
// Via DepositClient
const stuckFunds = await client.getStuckFunds();
console.log(`Found ${stuckFunds.length} stuck asset(s)`);

for (const fund of stuckFunds) {
  console.log(`${fund.token} on chain ${fund.chainId}: $${fund.amountUSD}`);
}
```

### Recover All Funds

```typescript
// Attempt to sweep all stuck funds to destination
const results = await client.recoverAllFunds();

for (const result of results) {
  if (result.status === 'success') {
    console.log(`Recovered ${result.token}: ${result.txHash}`);
  } else {
    console.log(`Failed ${result.token}: ${result.error}`);
  }
}
```

### React Hook

```tsx
import { useDepositContext } from '@particle-network/deposit-sdk/react';

function RecoveryPanel() {
  const { stuckFunds, isRecovering, getStuckFunds, recoverFunds } = useDepositContext();

  return (
    <div>
      <button onClick={getStuckFunds}>Check Stuck Funds</button>

      {stuckFunds.length > 0 && (
        <>
          <p>Found {stuckFunds.length} stuck asset(s)</p>
          <button onClick={recoverFunds} disabled={isRecovering}>
            {isRecovering ? 'Recovering...' : 'Recover All'}
          </button>
        </>
      )}
    </div>
  );
}
```

### Recovery Events

```typescript
client.on('recovery:started', () => {
  console.log('Recovery started');
});

client.on('recovery:complete', (results) => {
  const succeeded = results.filter(r => r.status === 'success').length;
  console.log(`Recovery complete: ${succeeded}/${results.length} succeeded`);
});

client.on('recovery:failed', (deposit, error) => {
  console.log(`Recovery failed for ${deposit.token}: ${error.message}`);
});
```

### RecoveryResult Type

```typescript
interface RecoveryResult {
  token: TokenType;        // 'ETH' | 'USDC' | etc.
  chainId: number;         // Source chain ID
  amount: string;          // Raw amount
  amountUSD: number;       // USD value
  status: 'success' | 'failed' | 'skipped';
  error?: string;          // Error message if failed
  txHash?: string;         // Transaction hash if success
}
```

## Error Handling

The SDK provides typed error classes:

```typescript
import {
  DepositSDKError,
  ConfigurationError,
  AuthenticationError,
  JwtError,
  UniversalAccountError,
  SweepError,
  NetworkError,
} from '@particle-network/deposit-sdk';

try {
  await client.initialize();
} catch (error) {
  if (error instanceof ConfigurationError) {
    console.error('Invalid config:', error.message);
  } else if (error instanceof JwtError) {
    console.error('JWT service error:', error.message);
  } else if (error instanceof AuthenticationError) {
    console.error('Auth failed:', error.message);
  }
}
```

## Event System

The SDK uses a typed event emitter:

```typescript
// Type-safe event listeners
client.on('deposit:detected', (deposit: DetectedDeposit) => {
  console.log(`${deposit.token} detected on chain ${deposit.chainId}`);
});

client.on('deposit:complete', (result: SweepResult) => {
  console.log(`Swept: ${result.transactionId}`);
});

client.on('status:change', (status: ClientStatus) => {
  console.log(`Status: ${status}`);
});

// Remove listeners
client.off('deposit:detected', handler);
client.removeAllListeners();
```

## Roadmap

- [x] **Phase 1**: Core architecture, types, events
- [x] **Phase 2**: JWT service integration
- [x] **Phase 3**: Universal Account management
- [x] **Phase 4**: Balance watching & auto-sweep
- [ ] **Phase 5**: EOA detection & deposit
- [x] **Phase 6**: UI components (React)
- [x] **Phase 7**: Testing & documentation
- [ ] **Phase 8**: npm publishing

## Documentation

- **[SDK Reference](docs/SDK-REFERENCE.md)** — Complete API reference
- **[Contributing Guide](docs/CONTRIB.md)** — Development workflow
- **[Runbook](docs/RUNBOOK.md)** — Deployment & operations

## Contributing

See [docs/CONTRIB.md](docs/CONTRIB.md) for the development workflow, available scripts, and contribution guidelines.

## License

MIT

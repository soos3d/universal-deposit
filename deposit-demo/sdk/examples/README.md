# Deposit SDK Examples

This directory contains example implementations demonstrating different ways to use the Deposit SDK.

## Architecture Overview

The React SDK has three main pieces:

```
┌─────────────────────────────────────────────────────────────┐
│  DepositProvider                                            │
│  - Wraps your app                                           │
│  - Sets up Particle Auth Core context                       │
│  - Configures default destination (optional)                │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  useDeposit({ ownerAddress })                         │  │
│  │  - REQUIRED to initialize SDK                         │  │
│  │  - Pass user's wallet address from your auth provider │  │
│  │  - Returns: isConnecting, isReady, error, disconnect  │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  DepositModal / DepositWidget                         │  │
│  │  - Pre-built UI components                            │  │
│  │  - Use destination prop to configure sweep target     │  │
│  │  - Only work after useDeposit initializes SDK         │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Key Point:** `useDeposit({ ownerAddress })` is **required** to initialize the SDK. The widgets won't work without it.

---

## Examples

### 1. `headless-usage.tsx`
**Headless SDK Usage (No Pre-built UI)**

Use the core SDK without React widgets. You control the entire UI.

**When to use:**
- Building a custom deposit UI
- Integrating deposits into an existing flow
- Need full control over the UX

```tsx
import { DepositClient, CHAIN } from '@particle-network/deposit-sdk';

const client = new DepositClient({
  ownerAddress,
  intermediaryAddress,
  authCoreProvider: provider,
  destination: { chainId: CHAIN.BASE },
});

client.on('deposit:detected', (deposit) => { /* ... */ });
client.startWatching();
```

---

### 2. `widget-custom-address.tsx`
**Widget with Custom Destination Address**

Sweep funds to a specific address (e.g., treasury wallet) instead of the user's EOA.

**When to use:**
- Collecting funds to a team treasury
- Sending to a hot wallet for processing
- Any scenario where funds shouldn't go to the user

```tsx
import {
  DepositProvider,
  DepositModal,
  useDeposit,
  CHAIN,
} from '@particle-network/deposit-sdk/react';

const TREASURY = "0x742d35Cc6634C0532925a3b844Bc9e7595f8dE42";

function App() {
  const { address } = useYourAuthProvider();

  // REQUIRED: Initialize SDK
  const { isReady } = useDeposit({ ownerAddress: address });

  if (!isReady) return <Loading />;

  return (
    <DepositModal
      isOpen={showModal}
      onClose={() => setShowModal(false)}
      destination={{
        chainId: CHAIN.BASE,
        address: TREASURY,  // Custom address
      }}
    />
  );
}

// Wrap at app root
<DepositProvider>
  <App />
</DepositProvider>
```

---

### 3. `widget-chain-only.tsx`
**Widget with Chain Selection (User's EOA)**

Let users choose their preferred destination chain while keeping their own wallet as the destination.

**When to use:**
- Giving users chain preference (lower fees, faster, etc.)
- Default behavior with chain customization
- User-centric UX

```tsx
import {
  DepositProvider,
  DepositModal,
  useDeposit,
  CHAIN,
} from '@particle-network/deposit-sdk/react';

function App() {
  const { address } = useYourAuthProvider();
  const [chainId, setChainId] = useState(CHAIN.ARBITRUM);

  // REQUIRED: Initialize SDK
  const { isReady } = useDeposit({ ownerAddress: address });

  if (!isReady) return <Loading />;

  return (
    <>
      <button onClick={() => setChainId(CHAIN.BASE)}>Base</button>
      <button onClick={() => setChainId(CHAIN.POLYGON)}>Polygon</button>

      <DepositModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        destination={{ chainId }}  // No address = user's EOA
      />
    </>
  );
}

// Wrap at app root
<DepositProvider>
  <App />
</DepositProvider>
```

---

## Quick Reference

| Scenario | Destination Config |
|----------|-------------------|
| Default (Arbitrum, user EOA) | `{}` or omit |
| User EOA on Base | `{ chainId: CHAIN.BASE }` |
| User EOA on Polygon | `{ chainId: CHAIN.POLYGON }` |
| Treasury on Arbitrum | `{ address: "0x..." }` |
| Treasury on Base | `{ chainId: CHAIN.BASE, address: "0x..." }` |

---

## Minimal Integration

```tsx
// 1. Wrap app with DepositProvider
import { DepositProvider } from '@particle-network/deposit-sdk/react';

function Root() {
  return (
    <YourAuthProvider>
      <DepositProvider>
        <App />
      </DepositProvider>
    </YourAuthProvider>
  );
}

// 2. Initialize SDK and show widget
import { useDeposit, DepositModal, CHAIN } from '@particle-network/deposit-sdk/react';

function App() {
  const { address } = useYourAuth();
  const [showModal, setShowModal] = useState(false);

  // Initialize SDK (required)
  const { isReady } = useDeposit({ ownerAddress: address });

  return (
    <>
      <button onClick={() => setShowModal(true)} disabled={!isReady}>
        Deposit
      </button>

      <DepositModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        destination={{ chainId: CHAIN.BASE }}
      />
    </>
  );
}
```

---

## Notes

- Auth provider code (Privy, RainbowKit, etc.) is pseudocode in these examples
- Deposit SDK code is production-ready
- `useDeposit` must be called to initialize the SDK before widgets work
- See `CLAUDE.md` in the SDK root for full documentation

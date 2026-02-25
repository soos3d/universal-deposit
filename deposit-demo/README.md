# Universal Deposit SDK — Demo

Next.js 15 demo app for the [Universal Deposit SDK](../sdk/README.md) with Privy authentication.

> Dev deployed version.

## Quick Start

```bash
# Build the SDK first
cd ../sdk && npm run build

# Configure environment
cd ../deposit-demo
cp .env.sample .env
# Fill in your credentials (see below)

# Run
npm install && npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

Copy `.env.sample` to `.env`:

| Variable | Description | Dashboard |
|----------|-------------|-----------|
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy application ID | [dashboard.privy.io](https://dashboard.privy.io) |

## How It Works

1. User logs in via Privy (email or social)
2. SDK auto-initializes (JWT fetch, Auth Core connection, Universal Account setup)
3. Widget displays deposit addresses across supported chains
4. Incoming deposits are detected and automatically bridged to the configured destination

## Integration

```tsx
// providers.tsx — wrap your app
<PrivyProvider>
  <DepositProvider config={{ destination: { chainId: CHAIN.BASE } }}>
    <App />
  </DepositProvider>
</PrivyProvider>
```

```tsx
// DepositDemo.tsx — use the hook + modal
const { isReady } = useDeposit({ ownerAddress: walletAddress });

<DepositModal isOpen={open} onClose={() => setOpen(false)} />
```

Toggle between **Modal** and **Inline** display modes in the demo UI.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Cannot convert a BigInt value` | Use Next.js 14, not 15+ (Turbopack/WalletConnect issue) |
| Deposits not detected | Check deposit address matches UA, value above minimum, chain is supported |
| AA24 signature error | `intermediaryAddress` mismatch — ensure it matches Auth Core address |

See the [SDK Reference](../sdk/docs/SDK-REFERENCE.md) for full API details.

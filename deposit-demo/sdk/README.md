# Universal Deposit SDK

Cross-chain deposit infrastructure powered by [Particle Network](https://particle.network) Universal Accounts. Accept deposits on multiple chains with automatic detection and bridge to your configured destination.

## Installation

```bash
npm install @particle-network/universal-deposit
```

## Quick Start

### React (Modal)

```tsx
import { DepositProvider, useDeposit, DepositModal, CHAIN } from '@particle-network/universal-deposit/react';

function App() {
  return (
    <DepositProvider config={{ destination: { chainId: CHAIN.ARBITRUM } }}>
      <YourApp />
    </DepositProvider>
  );
}

function DepositButton() {
  const { address } = useYourWallet();
  const { isReady } = useDeposit({ ownerAddress: address });
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} disabled={!isReady}>Deposit</button>
      <DepositModal isOpen={open} onClose={() => setOpen(false)} theme="dark" />
    </>
  );
}
```

### React (Inline)

```tsx
import { useDeposit, DepositWidget } from '@particle-network/universal-deposit/react';

function Page() {
  const { address } = useYourWallet();
  const { isReady } = useDeposit({ ownerAddress: address });

  if (!isReady) return <Loading />;
  return <DepositWidget fullWidth theme="dark" />;
}
```

### Headless

```typescript
import { DepositClient, CHAIN } from '@particle-network/universal-deposit';

const client = new DepositClient({
  ownerAddress: '0x...',
  intermediaryAddress: '0x...',
  authCoreProvider: { signMessage: (msg) => provider.signMessage(msg) },
  destination: { chainId: CHAIN.ARBITRUM },
});

await client.initialize();
client.startWatching();

client.on('deposit:detected', (deposit) => {
  console.log(`${deposit.token} on chain ${deposit.chainId}: $${deposit.amountUSD}`);
});

client.on('deposit:complete', (result) => {
  console.log('Swept:', result.explorerUrl);
});
```

## How It Works

1. SDK creates a Universal Account (via an intermediary JWT wallet) that provides deposit addresses across multiple chains (EVM + Solana).
2. When funds arrive, the SDK detects them via balance polling and automatically bridges them to the configured destination.
3. Funds are consolidated on a single chain — no bridging required from the user.

## Supported Chains

| Chain | ID | Assets |
|-------|----|--------|
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

## Documentation

- **[SDK Reference](docs/SDK-REFERENCE.md)** — Complete API reference
- **[Contributing Guide](docs/CONTRIB.md)** — Development workflow
- **[Runbook](docs/RUNBOOK.md)** — Deployment & operations

## Development

```bash
npm run build          # Build ESM + CJS + types
npm run dev            # Watch mode
npm run typecheck      # Type checking
npm run test           # Unit tests
npm run test:integration  # Integration tests (real API)
```

## License

 Apache 2.0

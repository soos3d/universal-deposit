# Deposit Widget

> A complete deposit solution leveraging Universal Accounts with SDK and pre-built UI components.

## 📦 What's Inside

This monorepo contains:

- **[`/sdk`](./sdk)** — The Deposit SDK with full documentation
- **[`/deposit-demo`](./deposit-demo)** — Next.js demo application

## 🚀 Quick Overview

The Deposit SDK leverages Universal Accounts to enable cross-chain deposits:

- **Multi-chain deposit addresses** — Universal Account provides addresses for 17 chains (EVM + Solana)
- **Auto-sweep functionality** — Automatically sweeps deposited funds to user's connected wallet
- **Pre-built React components** — Drop-in modal and widget UI
- **Headless mode** — Full programmatic control for custom implementations
- **Chain-specific token filtering** — Only shows supported assets per chain

**How it works:** The SDK creates a Universal Account (via an intermediary JWT wallet) that provides deposit addresses across multiple chains. When users deposit funds to these addresses, the SDK detects the deposits and automatically sweeps them to the user's connected wallet on their preferred chain (default: Arbitrum).

## 📚 Documentation

For complete SDK documentation, API reference, and integration guides, see:

**[→ SDK Documentation](./sdk/README.md)**

The SDK docs include:
- Installation and setup
- React integration (Provider, hooks, components)
- Headless/programmatic usage
- Configuration options
- Event system
- Error handling
- Architecture details

## 🎮 Running the Demo

### Prerequisites

- Node.js 18+ and npm
- Privy account and API keys ([get them here](https://privy.io))

### Setup

1. **Navigate to the demo directory:**
   ```bash
   cd deposit-demo
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   
   Create a `.env.local` file in the `deposit-demo` directory:
   ```bash
   NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
   ```

4. **Run the development server:**
   ```bash
   npm run dev
   ```

5. **Open the demo:**
   
   Navigate to [http://localhost:3000](http://localhost:3000)

### What the Demo Shows

- Privy wallet authentication
- Deposit SDK initialization with user's wallet
- Deposit modal with token/chain selection
- Real-time deposit detection and auto-sweep
- Activity history display

## 🛠️ Development

### Building the SDK

```bash
cd sdk
npm install
npm run build
```

### Running Tests

```bash
cd sdk
npm run test              # Unit tests
npm run test:integration  # Integration tests
```

## 🌐 Supported Chains

The SDK supports **17 chains** with chain-specific token filtering:

| Chain | Chain ID | Supported Assets |
|-------|----------|------------------|
| Ethereum | 1 | USDC, USDT, ETH, BTC |
| BNB Chain | 56 | USDC, USDT, ETH, BTC, BNB |
| Polygon | 137 | USDC, USDT, ETH, BTC |
| Arbitrum | 42161 | USDC, USDT, ETH, BTC |
| Optimism | 10 | USDC, USDT, ETH, BTC |
| Base | 8453 | USDC, ETH, BTC |
| Avalanche | 43114 | USDC, USDT, ETH, BTC |
| Linea | 59144 | USDC, USDT, ETH, BTC |
| Mantle | 5000 | USDT |
| Monad | 143 | USDC |
| Plasma | 9745 | USDT |
| X Layer | 196 | USDC, USDT |
| HyperEVM | 999 | USDT |
| Sonic | 146 | USDC |
| Berachain | 80094 | USDC |
| Merlin | 4200 | BTC |
| Solana | 101 | USDC, USDT, SOL |

## 📄 License

MIT
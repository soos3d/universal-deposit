# Deposit SDK Development Plan

> **Goal**: Transform the current demo into a reusable SDK that allows developers to easily integrate deposit flows for Universal Accounts, with both headless and UI options.

---

## Executive Summary

The Deposit SDK solves a key UX problem with Universal Accounts: they're smart accounts that start empty. This SDK provides:

1. **Deposit addresses** — EVM + Solana smart account addresses for receiving funds
2. **Auto-sweep** — Automatically move deposited funds to a configurable destination
3. **EOA detection** — Detect tokens in user's connected wallet for one-click deposits
4. **Pre-built UI** — Optional modal/widget components
5. **Headless mode** — Full programmatic control for custom UIs

**Critical dependency**: The intermediary wallet (JWT-based embedded wallet) must be handled by Particle infrastructure to avoid developer setup burden.

---

## Phase 0: JWT Infrastructure

### Problem

Currently, developers must:
1. Generate RSA keypair (`scripts/generate-keys.mjs`)
2. Host a JWKS endpoint (`/.well-known/jwks.json`)
3. Run a JWT issuance server (`server/index.js`)
4. Configure Particle dashboard with their JWKS URL
5. Handle key rotation and security

This is too much friction for SDK adoption.

### Solution: Cloudflare Worker JWT Service

We'll build a lightweight, globally-distributed JWT service using Cloudflare Workers. This gives us:
- **Edge deployment** — Low latency worldwide
- **Managed infrastructure** — No servers to maintain
- **Built-in security** — Rate limiting, DDoS protection
- **Cost effective** — Free tier handles millions of requests

```
┌──────────────────┐     ┌─────────────────────────────┐     ┌──────────────────┐
│  Developer App   │     │  Cloudflare Worker          │     │  Particle Auth   │
│  (Deposit SDK)   │ ──▶ │  deposit-auth.particle.net  │ ──▶ │  Core            │
└──────────────────┘     └─────────────────────────────┘     └──────────────────┘
        │                              │
        │ 1. Request JWT               │ 2. Validate project
        │    (projectId + uid)         │ 3. Sign JWT with RSA key
        │                              │ 4. Return JWT
        │                              │
        └──────────────────────────────┘
                                       │
                              ┌────────┴────────┐
                              │  JWKS Endpoint  │
                              │  /.well-known/  │
                              │   jwks.json     │
                              └─────────────────┘
```

---

### Phase 0.1: Worker Architecture

#### Project Structure

```
deposit-auth-worker/
├── src/
│   ├── index.ts              # Main worker entry
│   ├── handlers/
│   │   ├── jwt.ts            # JWT issuance endpoint
│   │   └── jwks.ts           # JWKS public key endpoint
│   ├── services/
│   │   ├── jwt-signer.ts     # RSA signing logic
│   │   ├── project-validator.ts  # Validate Particle credentials
│   │   └── rate-limiter.ts   # Rate limiting logic
│   ├── types.ts              # TypeScript interfaces
│   └── utils/
│       └── crypto.ts         # Crypto helpers
├── wrangler.toml             # Cloudflare config
├── package.json
└── tsconfig.json
```

#### Worker Entry Point

```typescript
// src/index.ts
import { handleJwtRequest } from './handlers/jwt';
import { handleJwksRequest } from './handlers/jwks';

export interface Env {
  // Secrets (stored in Cloudflare)
  RSA_PRIVATE_KEY: string;      // PEM-encoded private key
  RSA_PUBLIC_KEY_JWK: string;   // JWK format for JWKS response
  
  // Optional: Particle API for project validation
  PARTICLE_API_URL: string;
  PARTICLE_INTERNAL_KEY: string;
  
  // KV namespace for rate limiting
  RATE_LIMIT_KV: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    
    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    try {
      // Route: JWKS endpoint
      if (url.pathname === '/.well-known/jwks.json') {
        return handleJwksRequest(env, corsHeaders);
      }
      
      // Route: JWT issuance
      if (url.pathname === '/v1/jwt' && request.method === 'POST') {
        return handleJwtRequest(request, env, corsHeaders);
      }
      
      // Health check
      if (url.pathname === '/health') {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      return new Response('Not Found', { status: 404, headers: corsHeaders });
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(
        JSON.stringify({ error: 'Internal Server Error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  },
};
```

---

### Phase 0.2: JWT Issuance Endpoint

#### API Specification

```
POST https://deposit-auth.particle.network/v1/jwt

Request Body:
{
  "projectId": "3e63e8c0-1df6-4efb-a96e-96836accebdc",
  "clientKey": "cx5kWWPJ0AmG80U6ePLJ3U3EpEknGBYeVlWdF4xv",
  "appId": "c98e6688-ffea-4a66-8282-f3c7b52c012a",
  "userId": "0x1234567890abcdef..."  // User's connected wallet or unique ID
}

Success Response (200):
{
  "jwt": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImRlcG9zaXQta2V5LTEifQ...",
  "expiresAt": 1702900000,
  "expiresIn": 600,  // seconds
  "sub": "ua:0x1234567890abcdef..."  // The JWT subject (prefixed)
}

Error Response (400/401/429):
{
  "error": "invalid_project",
  "message": "Project credentials do not match"
}
```

#### Handler Implementation

```typescript
// src/handlers/jwt.ts
import { Env } from '../index';
import { signJwt } from '../services/jwt-signer';
import { validateProject } from '../services/project-validator';
import { checkRateLimit } from '../services/rate-limiter';

interface JwtRequest {
  projectId: string;
  clientKey: string;
  appId: string;
  userId: string;
}

export async function handleJwtRequest(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const headers = { ...corsHeaders, 'Content-Type': 'application/json' };
  
  // Parse request body
  let body: JwtRequest;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'invalid_request', message: 'Invalid JSON body' }),
      { status: 400, headers }
    );
  }
  
  // Validate required fields
  const { projectId, clientKey, appId, userId } = body;
  if (!projectId || !clientKey || !appId || !userId) {
    return new Response(
      JSON.stringify({ error: 'missing_fields', message: 'Missing required fields' }),
      { status: 400, headers }
    );
  }
  
  // Rate limiting (by projectId + userId)
  const rateLimitKey = `${projectId}:${userId}`;
  const rateLimitResult = await checkRateLimit(env.RATE_LIMIT_KV, rateLimitKey, {
    maxRequests: 10,
    windowSeconds: 60,
  });
  
  if (!rateLimitResult.allowed) {
    return new Response(
      JSON.stringify({ error: 'rate_limited', message: 'Too many requests' }),
      { status: 429, headers: { ...headers, 'Retry-After': String(rateLimitResult.retryAfter) } }
    );
  }
  
  // Validate project credentials against Particle API
  const projectValid = await validateProject(env, { projectId, clientKey, appId });
  if (!projectValid) {
    return new Response(
      JSON.stringify({ error: 'invalid_project', message: 'Project credentials do not match' }),
      { status: 401, headers }
    );
  }
  
  // Generate JWT
  const expiresIn = 600; // 10 minutes
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
  
  // Prefix userId to avoid collision with actual wallet addresses in Particle Auth
  const sub = `ua:${userId.toLowerCase()}`;
  
  const jwt = await signJwt(env.RSA_PRIVATE_KEY, {
    sub,
    iss: 'particle-deposit-sdk',
    aud: projectId,
    iat: Math.floor(Date.now() / 1000),
    exp: expiresAt,
  });
  
  return new Response(
    JSON.stringify({ jwt, expiresAt, expiresIn, sub }),
    { status: 200, headers }
  );
}
```

---

### Phase 0.3: JWT Signing Service

```typescript
// src/services/jwt-signer.ts

interface JwtPayload {
  sub: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

const KEY_ID = 'deposit-key-1';

export async function signJwt(privateKeyPem: string, payload: JwtPayload): Promise<string> {
  // Import the private key
  const privateKey = await importPrivateKey(privateKeyPem);
  
  // Create JWT header
  const header = {
    alg: 'RS256',
    typ: 'JWT',
    kid: KEY_ID,
  };
  
  // Encode header and payload
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  
  // Sign
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    privateKey,
    new TextEncoder().encode(signingInput)
  );
  
  const encodedSignature = base64UrlEncode(signature);
  
  return `${signingInput}.${encodedSignature}`;
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  // Remove PEM headers and decode
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  
  return crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

function base64UrlEncode(input: string | ArrayBuffer): string {
  const bytes = typeof input === 'string' 
    ? new TextEncoder().encode(input) 
    : new Uint8Array(input);
  
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
```

---

### Phase 0.4: JWKS Endpoint

```typescript
// src/handlers/jwks.ts
import { Env } from '../index';

export function handleJwksRequest(
  env: Env,
  corsHeaders: Record<string, string>
): Response {
  // The public key JWK is stored as an environment variable
  // Format: { "kty": "RSA", "n": "...", "e": "AQAB", "alg": "RS256", "use": "sig", "kid": "deposit-key-1" }
  const publicKeyJwk = JSON.parse(env.RSA_PUBLIC_KEY_JWK);
  
  const jwks = {
    keys: [publicKeyJwk],
  };
  
  return new Response(JSON.stringify(jwks), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=86400',  // Cache for 24 hours
    },
  });
}
```

---

### Phase 0.5: Project Validation

```typescript
// src/services/project-validator.ts
import { Env } from '../index';

interface ProjectCredentials {
  projectId: string;
  clientKey: string;
  appId: string;
}

export async function validateProject(
  env: Env,
  credentials: ProjectCredentials
): Promise<boolean> {
  // Option 1: Call Particle's internal API to validate
  if (env.PARTICLE_API_URL && env.PARTICLE_INTERNAL_KEY) {
    try {
      const response = await fetch(`${env.PARTICLE_API_URL}/internal/validate-project`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.PARTICLE_INTERNAL_KEY}`,
        },
        body: JSON.stringify(credentials),
      });
      
      if (response.ok) {
        const data = await response.json() as { valid: boolean };
        return data.valid;
      }
    } catch (error) {
      console.error('Project validation error:', error);
    }
  }
  
  // Option 2: Fallback - basic format validation only
  // In production, we should always validate against Particle API
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const clientKeyRegex = /^[a-zA-Z0-9]{30,50}$/;
  
  return (
    uuidRegex.test(credentials.projectId) &&
    uuidRegex.test(credentials.appId) &&
    clientKeyRegex.test(credentials.clientKey)
  );
}
```

---

### Phase 0.6: Rate Limiting

```typescript
// src/services/rate-limiter.ts

interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
}

export async function checkRateLimit(
  kv: KVNamespace,
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const windowKey = `ratelimit:${key}:${Math.floor(now / config.windowSeconds)}`;
  
  // Get current count
  const currentStr = await kv.get(windowKey);
  const current = currentStr ? parseInt(currentStr, 10) : 0;
  
  if (current >= config.maxRequests) {
    const windowEnd = (Math.floor(now / config.windowSeconds) + 1) * config.windowSeconds;
    return {
      allowed: false,
      remaining: 0,
      retryAfter: windowEnd - now,
    };
  }
  
  // Increment counter
  await kv.put(windowKey, String(current + 1), {
    expirationTtl: config.windowSeconds * 2,  // TTL slightly longer than window
  });
  
  return {
    allowed: true,
    remaining: config.maxRequests - current - 1,
  };
}
```

---

### Phase 0.7: Cloudflare Configuration

```toml
# wrangler.toml
name = "deposit-auth-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"

# Production route
routes = [
  { pattern = "deposit-auth.particle.network/*", zone_name = "particle.network" }
]

# KV namespace for rate limiting
[[kv_namespaces]]
binding = "RATE_LIMIT_KV"
id = "<KV_NAMESPACE_ID>"

# Environment variables (non-secret)
[vars]
PARTICLE_API_URL = "https://api.particle.network"

# Secrets (set via `wrangler secret put`)
# RSA_PRIVATE_KEY - PEM-encoded private key
# RSA_PUBLIC_KEY_JWK - JWK format public key
# PARTICLE_INTERNAL_KEY - Internal API key for project validation
```

#### Key Generation Script

```typescript
// scripts/generate-worker-keys.ts
import { generateKeyPairSync } from 'crypto';
import * as jose from 'jose';

async function main() {
  // Generate RSA keypair
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  
  // Export private key as PEM
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  
  // Export public key as JWK
  const publicJwk = await jose.exportJWK(publicKey);
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';
  publicJwk.kid = 'deposit-key-1';
  
  console.log('=== PRIVATE KEY (for RSA_PRIVATE_KEY secret) ===');
  console.log(privatePem);
  console.log('');
  console.log('=== PUBLIC KEY JWK (for RSA_PUBLIC_KEY_JWK secret) ===');
  console.log(JSON.stringify(publicJwk));
  console.log('');
  console.log('Set these as Cloudflare Worker secrets:');
  console.log('  wrangler secret put RSA_PRIVATE_KEY');
  console.log('  wrangler secret put RSA_PUBLIC_KEY_JWK');
}

main();
```

---

### Phase 0.8: SDK Integration

Once the worker is deployed, the SDK will use it like this:

```typescript
// In the Deposit SDK
class IntermediaryService {
  private readonly apiUrl = 'https://deposit-auth.particle.network';
  
  async getJwt(userId: string): Promise<JwtResponse> {
    const response = await fetch(`${this.apiUrl}/v1/jwt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: this.config.projectId,
        clientKey: this.config.clientKey,
        appId: this.config.appId,
        userId,
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`JWT request failed: ${error.message}`);
    }
    
    return response.json();
  }
}
```

---

### Phase 0.9: Dashboard Configuration

For Particle Auth Core to accept JWTs from our worker, we need to:

1. **Register the JWKS URL** in Particle's system:
   - URL: `https://deposit-auth.particle.network/.well-known/jwks.json`
   - This should be a global configuration, not per-project

2. **Options for implementation**:
   - **Option A**: Hardcode this JWKS URL in Particle Auth Core for `iss: "particle-deposit-sdk"`
   - **Option B**: Add a "Deposit SDK" toggle in dashboard that auto-configures this
   - **Option C**: Use a special project that's pre-configured (less flexible)

**Recommendation**: Option A is cleanest — Particle Auth Core recognizes JWTs from the deposit SDK issuer automatically.

---

### Security Considerations

| Concern | Mitigation |
|---------|------------|
| **Key compromise** | Keys stored as Cloudflare secrets, rotatable without downtime |
| **Rate limiting** | 10 requests per minute per project+user, configurable |
| **Project spoofing** | Validate credentials against Particle API |
| **JWT replay** | Short expiry (10 min), `iat` claim for freshness |
| **CORS abuse** | Consider restricting origins in production |
| **DDoS** | Cloudflare's built-in protection + rate limiting |

### Key Rotation Strategy

1. Generate new keypair with new `kid` (e.g., `deposit-key-2`)
2. Add new public key to JWKS response (both keys active)
3. Update worker to sign with new private key
4. After 24 hours, remove old public key from JWKS

---

### Deliverables

- [ ] Worker project setup with TypeScript
- [ ] JWT issuance endpoint (`POST /v1/jwt`)
- [ ] JWKS endpoint (`GET /.well-known/jwks.json`)
- [ ] Rate limiting with KV
- [ ] Project validation (basic + Particle API)
- [ ] Key generation script
- [ ] Deployment to Cloudflare
- [ ] Dashboard/Auth Core integration for JWKS trust
- [ ] SDK client for calling the worker

---

## Phase 1: Core SDK Architecture

### Package Structure

```
@particle-network/deposit-sdk/
├── src/
│   ├── core/
│   │   ├── DepositClient.ts         # Main SDK entry point
│   │   ├── config.ts                # Configuration types and defaults
│   │   ├── types.ts                 # TypeScript interfaces
│   │   └── errors.ts                # Custom error classes
│   │
│   ├── intermediary/
│   │   ├── IntermediaryService.ts   # Manages JWT + embedded wallet
│   │   └── api.ts                   # Particle API client
│   │
│   ├── universal-account/
│   │   ├── UAManager.ts             # Wraps UA SDK operations
│   │   └── addresses.ts             # Address derivation helpers
│   │
│   ├── sweep/
│   │   ├── BalanceWatcher.ts        # Polls for incoming deposits
│   │   ├── Sweeper.ts               # Executes transfer transactions
│   │   └── strategies.ts            # Sweep strategies (token-specific)
│   │
│   ├── eoa/
│   │   ├── EOADetector.ts           # Detect balances in connected wallet
│   │   ├── EOADepositor.ts          # Transfer from EOA to UA
│   │   └── providers.ts             # Multi-chain RPC providers
│   │
│   ├── events/
│   │   └── EventEmitter.ts          # Typed event system
│   │
│   ├── constants/
│   │   ├── chains.ts                # Supported chains config
│   │   └── tokens.ts                # Token addresses per chain
│   │
│   └── index.ts                     # Public exports
│
├── package.json
├── tsconfig.json
├── rollup.config.js                 # Bundle for ESM/CJS
└── README.md
```

### Auth-Provider Agnostic Design

The SDK is designed to work with **any** wallet provider. It only requires two things from the auth layer:

1. **`ownerAddress`** — The user's EOA address (used to identify the user and derive their intermediary wallet)
2. **`signer`** — A function to sign messages (used to authorize UA transactions)

This abstraction means developers can use Privy, RainbowKit, Particle Connect, Dynamic, Web3Modal, Thirdweb, Magic, or any other provider.

#### Provider Integration Examples

```typescript
// ============================================
// Privy
// ============================================
import { useWallets } from '@privy-io/react-auth';

const { wallets } = useWallets();
const wallet = wallets[0];

const client = new DepositClient({
  projectId, clientKey, appId,
  ownerAddress: wallet.address,
  signer: {
    signMessage: async (msg) => {
      const provider = await wallet.getEthereumProvider();
      return provider.request({
        method: 'personal_sign',
        params: [msg, wallet.address],
      });
    },
  },
});

// ============================================
// RainbowKit / wagmi
// ============================================
import { useAccount, useSignMessage } from 'wagmi';

const { address } = useAccount();
const { signMessageAsync } = useSignMessage();

const client = new DepositClient({
  projectId, clientKey, appId,
  ownerAddress: address,
  signer: { signMessage: signMessageAsync },
});

// ============================================
// Particle Connect
// ============================================
import { useWallets, useAccount } from '@particle-network/connectkit';

const [primaryWallet] = useWallets();
const { address } = useAccount();
const walletClient = primaryWallet?.getWalletClient();

const client = new DepositClient({
  projectId, clientKey, appId,
  ownerAddress: address,
  signer: {
    signMessage: (msg) => walletClient.signMessage({
      account: address,
      message: { raw: msg },
    }),
  },
});

// ============================================
// ethers.js (Backend / Server-side)
// ============================================
import { Wallet } from 'ethers';

const wallet = new Wallet(process.env.PRIVATE_KEY);

const client = new DepositClient({
  projectId, clientKey, appId,
  ownerAddress: wallet.address,
  signer: { signMessage: (msg) => wallet.signMessage(msg) },
});

// ============================================
// viem (Direct)
// ============================================
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const account = privateKeyToAccount('0x...');
const walletClient = createWalletClient({ account, transport: http() });

const client = new DepositClient({
  projectId, clientKey, appId,
  ownerAddress: account.address,
  signer: {
    signMessage: (msg) => walletClient.signMessage({
      account,
      message: { raw: msg },
    }),
  },
});
```

---

### Core Types

```typescript
// config.ts
export interface DepositClientConfig {
  // Particle project credentials
  projectId: string;
  clientKey: string;
  appId: string;
  
  // User's connected wallet (provider-agnostic)
  ownerAddress: string;
  
  // Signer for UA transactions (works with any provider)
  signer: {
    signMessage: (message: string | Uint8Array) => Promise<string>;
  };
  
  // Destination configuration
  destination?: {
    address?: string;        // Defaults to ownerAddress
    chainId?: number;        // Defaults to 42161 (Arbitrum)
  };
  
  // Token filtering
  supportedTokens?: TokenType[];  // ['ETH', 'USDC', 'USDT', 'BTC', 'SOL', 'BNB']
  supportedChains?: number[];     // Source chains to monitor
  
  // Behavior options
  autoSweep?: boolean;            // Default: true
  minValueUSD?: number;           // Default: 0.50
  pollingIntervalMs?: number;     // Default: 8000
}

// types.ts
export type TokenType = 'ETH' | 'USDC' | 'USDT' | 'BTC' | 'SOL' | 'BNB';

export interface DepositAddresses {
  evm: string;
  solana: string;
}

export interface DetectedDeposit {
  id: string;
  token: TokenType;
  chainId: number;
  amount: string;
  amountUSD: number;
  rawAmount: bigint;
  detectedAt: number;
}

export interface SweepResult {
  depositId: string;
  transactionId: string;
  explorerUrl: string;
  status: 'success' | 'failed';
  error?: string;
}

export interface EOABalance {
  token: TokenType;
  chainId: number;
  address: string;        // Token contract address
  amount: string;         // Human-readable
  amountUSD: number;
  rawAmount: bigint;
}

// Events
export interface DepositEvents {
  'deposit:detected': (deposit: DetectedDeposit) => void;
  'deposit:processing': (deposit: DetectedDeposit) => void;
  'deposit:complete': (result: SweepResult) => void;
  'deposit:error': (error: DepositError) => void;
  'eoa:balances': (balances: EOABalance[]) => void;
  'status:change': (status: ClientStatus) => void;
}

export type ClientStatus = 'idle' | 'initializing' | 'watching' | 'sweeping' | 'error';
```

### DepositClient API

```typescript
export class DepositClient extends EventEmitter<DepositEvents> {
  constructor(config: DepositClientConfig);
  
  // Lifecycle
  async initialize(): Promise<void>;
  destroy(): void;
  
  // Deposit addresses
  async getDepositAddresses(): Promise<DepositAddresses>;
  
  // Balance watching
  startWatching(): void;
  stopWatching(): void;
  async checkBalances(): Promise<DetectedDeposit[]>;
  
  // Manual sweep
  async sweep(depositId?: string): Promise<SweepResult[]>;
  
  // EOA operations
  async detectEOABalances(): Promise<EOABalance[]>;
  async depositFromEOA(params: {
    token: TokenType;
    chainId: number;
    amount: string;
  }): Promise<SweepResult>;
  
  // State
  getStatus(): ClientStatus;
  getPendingDeposits(): DetectedDeposit[];
}
```

### Deliverables

- [ ] TypeScript types and interfaces
- [ ] DepositClient class skeleton
- [ ] Event emitter implementation
- [ ] Configuration validation
- [ ] Error classes

---

## Phase 2: Intermediary Integration

### IntermediaryService

Manages the JWT-based embedded wallet that acts as the intermediary between deposits and the Universal Account.

```typescript
class IntermediaryService {
  constructor(
    projectConfig: ProjectConfig,
    userId: string
  );
  
  // Get or create session
  async getSession(): Promise<IntermediarySession>;
  
  // Refresh if expired
  async refreshSession(): Promise<IntermediarySession>;
  
  // Get the intermediary EOA address
  getAddress(): string;
  
  // Connect to Particle Auth Core
  async connect(): Promise<void>;
  
  // Get provider for signing
  getProvider(): AuthCoreProvider;
}

interface IntermediarySession {
  jwt: string;
  expiresAt: number;
  intermediaryAddress: string;
}
```

### Integration with Particle Auth Core

```typescript
// Current flow (from demo)
const jwt = await getJwtForUser(connectkitEoa);  // Local server
await jwtConnect({
  provider: AuthType.jwt,
  thirdpartyCode: jwt,
});

// New flow (with hosted service)
const session = await intermediaryService.getSession();  // Particle API
await jwtConnect({
  provider: AuthType.jwt,
  thirdpartyCode: session.jwt,
});
```

### Deliverables

- [ ] IntermediaryService class
- [ ] Particle API client
- [ ] Session caching and refresh logic
- [ ] Integration with AuthCoreContextProvider

---

## Phase 3: Universal Account Management

### UAManager

Wraps the `@particle-network/universal-account-sdk` with deposit-specific logic.

```typescript
class UAManager {
  constructor(
    intermediaryAddress: string,
    projectConfig: ProjectConfig
  );
  
  // Get smart account addresses
  async getAddresses(): Promise<DepositAddresses>;
  
  // Get current balances
  async getPrimaryAssets(): Promise<PrimaryAssets>;
  
  // Create transfer to destination
  async createSweepTransaction(params: {
    token: TokenType;
    chainId: number;
    amount: string;
    destination: DestinationConfig;
  }): Promise<UATransaction>;
  
  // Execute transaction
  async sendTransaction(
    tx: UATransaction,
    signature: string
  ): Promise<TransactionResult>;
}
```

### Deliverables

- [ ] UAManager class
- [ ] Address caching
- [ ] Transaction building for different token types
- [ ] Error handling for failed sweeps

---

## Phase 4: Balance Watching & Sweeping

### BalanceWatcher

Polls the Universal Account for incoming deposits.

```typescript
class BalanceWatcher {
  constructor(
    uaManager: UAManager,
    config: WatcherConfig
  );
  
  start(): void;
  stop(): void;
  
  // Manual check
  async poll(): Promise<DetectedDeposit[]>;
  
  // Events
  on(event: 'deposit', handler: (deposit: DetectedDeposit) => void): void;
}

interface WatcherConfig {
  intervalMs: number;
  minValueUSD: number;
  supportedTokens: TokenType[];
  supportedChains: number[];
}
```

### Sweeper

Executes transfers from UA to destination.

```typescript
class Sweeper {
  constructor(
    uaManager: UAManager,
    signer: Signer,
    destination: DestinationConfig
  );
  
  async sweep(deposit: DetectedDeposit): Promise<SweepResult>;
  
  // Retry logic with fallback strategies
  async sweepWithFallback(deposit: DetectedDeposit): Promise<SweepResult>;
}
```

### Sweep Strategies

The current demo has multi-path fallback logic. We should formalize this:

1. **Primary**: Transfer to destination chain native token (e.g., USDC on Arbitrum)
2. **Bridged**: Transfer to bridged variant (e.g., USDC.e on Arbitrum)
3. **Source fallback**: Keep on source chain if cross-chain fails
4. **Amount reduction**: Try 95%, 50% if full amount fails (for gas)

### Deliverables

- [ ] BalanceWatcher class
- [ ] Sweeper class with retry logic
- [ ] Sweep strategy configuration
- [ ] Concurrent sweep handling (lock mechanism)

---

## Phase 5: EOA Detection & Deposit

### EOADetector

Detects token balances in the user's connected wallet across multiple chains.

```typescript
class EOADetector {
  constructor(
    ownerAddress: string,
    supportedChains: number[],
    supportedTokens: TokenType[]
  );
  
  async detect(): Promise<EOABalance[]>;
  
  // Per-chain detection
  async detectOnChain(chainId: number): Promise<EOABalance[]>;
}
```

### Implementation Options

| Approach | Pros | Cons |
|----------|------|------|
| **Direct RPC multicall** | No external deps, accurate | Multiple RPC calls, slower |
| **Particle Token API** | Single call, fast | Requires API availability |
| **Alchemy/Moralis** | Rich data, fast | External dependency, API keys |

**Recommendation**: Start with direct RPC multicall for reliability, add Particle API when available.

### EOADepositor

Transfers tokens from user's EOA to the Universal Account deposit address.

```typescript
class EOADepositor {
  constructor(
    ownerAddress: string,
    depositAddresses: DepositAddresses,
    walletClient: WalletClient  // From wagmi/viem
  );
  
  async deposit(params: {
    token: TokenType;
    chainId: number;
    amount: string;
  }): Promise<TransactionHash>;
  
  // Estimate gas
  async estimateDeposit(params: DepositParams): Promise<GasEstimate>;
}
```

### Deliverables

- [ ] EOADetector with multicall
- [ ] EOADepositor for ERC20 and native transfers
- [ ] Chain switching logic (if needed)
- [ ] Gas estimation

---

## Phase 6: UI Components

### Package Structure

```
@particle-network/deposit-sdk/
├── src/
│   └── ui/
│       ├── DepositModal.tsx         # Full-featured modal
│       ├── DepositWidget.tsx        # Compact embeddable widget
│       ├── components/
│       │   ├── ChainSelector.tsx
│       │   ├── AddressDisplay.tsx
│       │   ├── TokenList.tsx
│       │   ├── ActivityFeed.tsx
│       │   ├── EOABalances.tsx
│       │   └── StatusBadge.tsx
│       ├── hooks/
│       │   ├── useDepositClient.ts
│       │   └── useEOABalances.ts
│       ├── styles/
│       │   └── theme.ts
│       └── index.ts
```

### DepositModal API

```tsx
interface DepositModalProps {
  client: DepositClient;
  open: boolean;
  onClose: () => void;
  
  // Theming
  theme?: 'light' | 'dark';
  accentColor?: string;
  logo?: string;
  
  // Features
  showEOADeposit?: boolean;      // Show one-click deposit from EOA
  showActivityFeed?: boolean;    // Show recent deposits
  defaultChain?: number;         // Pre-selected chain
  
  // Callbacks
  onDepositComplete?: (result: SweepResult) => void;
  onError?: (error: DepositError) => void;
}
```

### Headless Hooks

```tsx
// For developers building custom UI
import { useDepositClient, useEOABalances } from '@particle-network/deposit-sdk/ui';

function CustomDepositUI() {
  const { 
    addresses, 
    status, 
    pendingDeposits,
    sweep 
  } = useDepositClient(config);
  
  const { balances, refresh } = useEOABalances(client);
  
  // Build custom UI...
}
```

### Design Improvements

Current demo UI issues to address:
- [ ] Better loading states
- [ ] Clearer deposit flow visualization
- [ ] Mobile responsiveness
- [ ] Accessibility (ARIA labels, keyboard nav)
- [ ] Animation polish
- [ ] Error state handling

### Deliverables

- [ ] DepositModal component
- [ ] DepositWidget component
- [ ] Reusable sub-components
- [ ] React hooks for headless usage
- [ ] Theming system
- [ ] Storybook documentation

---

## Phase 7: Testing & Documentation

### Testing Strategy

| Layer | Tool | Coverage |
|-------|------|----------|
| Unit tests | Vitest | Core logic, utilities |
| Integration tests | Vitest + mocks | API interactions |
| E2E tests | Playwright | Full deposit flow |
| Component tests | Testing Library | UI components |

### Documentation

- [ ] README with quick start
- [ ] API reference (TypeDoc)
- [ ] Integration guides
  - [ ] With Privy
  - [ ] With RainbowKit
  - [ ] With Particle Connect
  - [ ] Headless usage
- [ ] Example apps
- [ ] Migration guide from demo

### Deliverables

- [ ] Test suite with >80% coverage
- [ ] API documentation
- [ ] Example applications
- [ ] Changelog

---

## Phase 8: Publishing & Maintenance

### Package Publishing

```json
{
  "name": "@particle-network/deposit-sdk",
  "version": "0.1.0",
  "main": "dist/cjs/index.js",
  "module": "dist/esm/index.js",
  "types": "dist/types/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/esm/index.js",
      "require": "./dist/cjs/index.js",
      "types": "./dist/types/index.d.ts"
    },
    "./ui": {
      "import": "./dist/esm/ui/index.js",
      "require": "./dist/cjs/ui/index.js",
      "types": "./dist/types/ui/index.d.ts"
    }
  },
  "peerDependencies": {
    "react": ">=17.0.0",
    "react-dom": ">=17.0.0",
    "@particle-network/universal-account-sdk": "^1.0.0"
  }
}
```

### CI/CD

- [ ] GitHub Actions for testing
- [ ] Automated npm publishing
- [ ] Semantic versioning
- [ ] Changelog generation

---

## Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 0: JWT Infrastructure | 1-2 weeks | Particle backend team |
| Phase 1: Core Architecture | 1 week | None |
| Phase 2: Intermediary Integration | 3-4 days | Phase 0, 1 |
| Phase 3: UA Management | 2-3 days | Phase 1 |
| Phase 4: Balance Watching | 3-4 days | Phase 2, 3 |
| Phase 5: EOA Detection | 1 week | Phase 1 |
| Phase 6: UI Components | 1-2 weeks | Phase 4, 5 |
| Phase 7: Testing & Docs | 1 week | All phases |
| Phase 8: Publishing | 2-3 days | Phase 7 |

**Total: 6-8 weeks** (assuming Phase 0 is handled in parallel by backend team)

---

## Open Questions

### For Particle Team

1. **JWT Service**: Can we build the hosted JWT endpoint? What's the timeline?
2. **Token API**: Is there an existing API for multi-chain balance fetching?
3. **Dashboard**: Do we need any dashboard changes for this SDK?
4. **Naming**: Is `@particle-network/deposit-sdk` the right package name?

### Technical Decisions

1. **React version**: Support React 17+ or 18+ only?
2. **Styling**: CSS-in-JS (current) vs CSS modules vs Tailwind?
3. **State management**: Internal state vs external store integration?
4. **Bundle size**: Target size for core vs UI packages?

---

## Next Steps

1. **Immediate**: Get alignment on Phase 0 (JWT infrastructure) with Particle backend team
2. **Parallel**: Start Phase 1 (core architecture) while Phase 0 is being built
3. **Milestone**: Have headless SDK working by end of Phase 4
4. **Milestone**: Full SDK with UI by end of Phase 6

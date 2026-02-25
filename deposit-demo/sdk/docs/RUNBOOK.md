# Operations Runbook

## Architecture Overview

```
User EOA (Privy, etc.) → Intermediary Wallet (JWT) → Universal Account
       │                          │                           │
       │ sweep destination        │ owns & signs             │ deposit addresses
       ▼                          ▼                           ▼
  Receives funds             Auth Core Provider         EVM + Solana
  (configurable)                                       Smart Accounts
```

## Deployment

### Building for Production
```bash
npm run build
```

Output is generated in `dist/`:
- `dist/index.js` / `dist/index.mjs` - Core SDK
- `dist/react.js` / `dist/react.mjs` - React integration
- `dist/*.d.ts` - TypeScript definitions

### Publishing
```bash
npm publish --access public
```

## Monitoring

### Key Events to Monitor

| Event | Description | Action |
|-------|-------------|--------|
| `deposit:detected` | New deposit found | Log for analytics |
| `deposit:processing` | Sweep in progress | Monitor for stuck states |
| `deposit:complete` | Sweep successful | Verify destination received funds |
| `deposit:error` | Error occurred | Alert and investigate |
| `status:change` | Client status changed | Track state transitions |

### Health Indicators

1. **JWT Service**: Verify `https://deposit-auth-worker.deposit-kit.workers.dev/health` returns 200
2. **Balance Watcher**: Polling should occur every 3s (default)
3. **Sweep Success Rate**: Track `deposit:complete` vs `deposit:error` ratio

## Common Issues

### Issue: JWT Fetch Fails
**Symptoms**: `JwtError: Failed to connect to JWT service`
**Cause**: Network issues or JWT worker down
**Resolution**:
1. Check JWT worker health endpoint
2. Verify network connectivity
3. Check for rate limiting (429 errors)

### Issue: JWT Verification Fails
**Symptoms**: `JwtError: JWT verification failed: ...`
**Cause**: The token returned by the JWT worker failed client-side signature verification
**Resolution**:
1. Confirm the JWKS endpoint is reachable: `https://deposit-auth-worker.deposit-kit.workers.dev/.well-known/jwks.json`
2. If the worker recently rotated keys, the JWKS cache may be stale — the SDK refreshes it automatically on a `kid` miss; a hard client reload clears it
3. If you see `JWT has expired`, the token TTL is shorter than the round-trip to the signing endpoint — check for clock skew on the client device
4. `JWT signature verification failed` indicates a genuinely tampered token — treat as a security event

### Issue: Session Mixing Between Users
**Symptoms**: User A receives funds meant for User B
**Cause**: Session cache not cleared on disconnect
**Resolution**: Fixed in v0.1.0 with per-user session Maps
**Prevention**: Always call `disconnect()` before connecting new user

### Issue: Sweep Fails Repeatedly
**Symptoms**: `SweepError` with gas estimation failures
**Cause**: Insufficient gas or network congestion
**Resolution**:
1. SDK probes at $0.01 to extract gas fee, then calculates optimal amount
2. If optimal fails, it retries at 90% of optimal
3. If both fail, check destination chain for congestion
4. Look for `[Sweeper] Step 2: Fee extraction result:` in logs for fee details
5. If gas fee exceeds deposit value, the deposit is too small to sweep

### Issue: Deposits Not Detected
**Symptoms**: Funds visible on chain but no `deposit:detected` event
**Cause**: Token/chain not in supported list, or below `minValueUSD`
**Resolution**:
1. Verify token is in `supportedTokens`
2. Verify chain is in `supportedChains`
3. Check deposit value meets `minValueUSD` threshold

### Issue: Memory Growing Over Time
**Symptoms**: Increasing memory usage in long sessions
**Cause**: `processingKeys` accumulation (fixed in v0.1.0)
**Resolution**: SDK now auto-clears stale keys after 5 minutes

## Rollback Procedures

### Rolling Back SDK Version
1. Revert `package.json` dependency version
2. Run `npm install`
3. Rebuild and redeploy consuming application

### Emergency: Disable Auto-Sweep
```typescript
const client = new DepositClient({
  // ... config
  autoSweep: false, // Disable auto-sweep
});
```

Manual sweep when ready:
```typescript
await client.sweep();
```

## Configuration Reference

| Option | Default | Description |
|--------|---------|-------------|
| `destination.chainId` | — (required) | Target chain for sweeps (use `CHAIN` constant) |
| `autoSweep` | true | Auto-sweep on deposit detection |
| `minValueUSD` | 0.50 | Minimum USD value to trigger events |
| `pollingIntervalMs` | 3000 | Balance check interval |
| `supportedTokens` | ETH, USDC, USDT, BTC, SOL, BNB | Tokens to watch |
| `supportedChains` | [1, 10, 42161, ...] | Chains to monitor (17 chains) |
| `refund.enabled` | false | Auto-refund on sweep failure (experimental) |
| `projectId` | SDK built-in | Particle project ID (omit for shared credentials) |
| `clientKey` | SDK built-in | Particle client key |
| `appId` | SDK built-in | Particle app ID |

## Support Contacts

- GitHub Issues: https://github.com/particle-network/deposit-sdk/issues
- Particle Network Discord: #universal-accounts channel

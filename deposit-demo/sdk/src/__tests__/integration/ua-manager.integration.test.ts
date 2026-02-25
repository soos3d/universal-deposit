/**
 * Integration tests for UAManager
 * 
 * These tests call the actual deployed JWT Worker and UA SDK to verify
 * the full initialization flow works end-to-end.
 * 
 * Run with: npm run test:integration
 */

import { describe, it, expect } from 'vitest';
import { IntermediaryService } from '../../intermediary';
import { UAManager } from '../../universal-account';
import { DEFAULT_JWT_SERVICE_URL, DEFAULT_PROJECT_ID, DEFAULT_CLIENT_KEY, DEFAULT_APP_ID } from '../../constants';

// A sample EOA address for testing
const TEST_USER_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';

describe('UAManager Integration', () => {
  it('should initialize UA and get deposit addresses', async () => {
    // Step 1: Get JWT session
    const intermediaryService = new IntermediaryService({
      projectId: DEFAULT_PROJECT_ID,
      clientKey: DEFAULT_CLIENT_KEY,
      appId: DEFAULT_APP_ID,
      jwtServiceUrl: DEFAULT_JWT_SERVICE_URL,
    });

    const session = await intermediaryService.getSession(TEST_USER_ADDRESS);
    expect(session.jwt).toBeTruthy();
    expect(session.intermediaryAddress).toBeTruthy();

    console.log('✅ JWT session obtained');
    console.log('   Intermediary address:', session.intermediaryAddress);

    // Step 2: Initialize UAManager
    const uaManager = new UAManager({
      ownerAddress: TEST_USER_ADDRESS,
      session,
    });

    await uaManager.initialize();
    expect(uaManager.isInitialized()).toBe(true);

    console.log('✅ UAManager initialized');

    // Step 3: Get deposit addresses
    const addresses = uaManager.getDepositAddresses();

    expect(addresses).toHaveProperty('evm');
    expect(addresses).toHaveProperty('solana');
    expect(addresses.evm).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(addresses.solana).toBeTruthy();

    console.log('✅ Deposit addresses obtained');
    console.log('   EVM:', addresses.evm);
    console.log('   Solana:', addresses.solana);

    // Cleanup
    uaManager.destroy();
  }, 30000); // 30s timeout for network calls

  it('should get primary assets from UA', async () => {
    // Get session
    const intermediaryService = new IntermediaryService({
      projectId: DEFAULT_PROJECT_ID,
      clientKey: DEFAULT_CLIENT_KEY,
      appId: DEFAULT_APP_ID,
      jwtServiceUrl: DEFAULT_JWT_SERVICE_URL,
    });

    const session = await intermediaryService.getSession(TEST_USER_ADDRESS);

    // Initialize UA
    const uaManager = new UAManager({
      ownerAddress: TEST_USER_ADDRESS,
      session,
    });

    await uaManager.initialize();

    // Get primary assets
    const primaryAssets = await uaManager.getPrimaryAssets();

    expect(primaryAssets).toHaveProperty('assets');
    expect(Array.isArray(primaryAssets.assets)).toBe(true);

    console.log('✅ Primary assets retrieved');
    console.log('   Asset count:', primaryAssets.assets.length);

    // Cleanup
    uaManager.destroy();
  }, 30000);

  it('should throw error if not initialized', () => {
    const uaManager = new UAManager({
      ownerAddress: TEST_USER_ADDRESS,
      session: {
        jwt: 'fake-jwt',
        expiresAt: Math.floor(Date.now() / 1000) + 600,
        intermediaryAddress: TEST_USER_ADDRESS,
      },
    });

    expect(() => uaManager.getDepositAddresses()).toThrow('not initialized');
    expect(uaManager.isInitialized()).toBe(false);
  });
});

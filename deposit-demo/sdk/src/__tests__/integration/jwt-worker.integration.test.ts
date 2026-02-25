/**
 * Integration tests for the deployed JWT Worker
 * 
 * These tests call the actual deployed Cloudflare Worker to verify
 * the JWT flow works end-to-end.
 * 
 * Run with: npm run test:integration
 */

import { describe, it, expect } from 'vitest';
import { IntermediaryService } from '../../intermediary';
import { DEFAULT_JWT_SERVICE_URL } from '../../constants';

// These are the credentials used in the demo app
// The SDK will use these by default so devs don't need to configure anything
const TEST_PROJECT_ID = '2e1612a2-5757-4026-82b1-e0a7a3a69698';
const TEST_CLIENT_KEY = 'cQRTw7Eqag5yHpa3iKkvwQ8J7qThRy1ZAqfPJwdy';
const TEST_APP_ID = '30c594e4-5615-49c9-89d6-86227f5e423e';

// A sample EOA address for testing
const TEST_USER_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';

describe('JWT Worker Integration', () => {
  it('should successfully fetch JWT from deployed worker', async () => {
    const service = new IntermediaryService({
      projectId: TEST_PROJECT_ID,
      clientKey: TEST_CLIENT_KEY,
      appId: TEST_APP_ID,
      jwtServiceUrl: DEFAULT_JWT_SERVICE_URL,
    });

    const session = await service.getSession(TEST_USER_ADDRESS);

    // Verify session structure
    expect(session).toHaveProperty('jwt');
    expect(session).toHaveProperty('expiresAt');
    expect(session).toHaveProperty('intermediaryAddress');

    // JWT should be a non-empty string
    expect(typeof session.jwt).toBe('string');
    expect(session.jwt.length).toBeGreaterThan(0);

    // JWT should have 3 parts (header.payload.signature)
    const jwtParts = session.jwt.split('.');
    expect(jwtParts).toHaveLength(3);

    // ExpiresAt should be in the future
    const now = Math.floor(Date.now() / 1000);
    expect(session.expiresAt).toBeGreaterThan(now);

    // Intermediary address should match the user address (lowercased)
    expect(session.intermediaryAddress).toBe(TEST_USER_ADDRESS.toLowerCase());

    console.log('✅ JWT Worker Integration Test Passed');
    console.log('   JWT length:', session.jwt.length);
    console.log('   Expires at:', new Date(session.expiresAt * 1000).toISOString());
    console.log('   Intermediary:', session.intermediaryAddress);
  }, 30000);

  it('should cache session on subsequent calls', async () => {
    const service = new IntermediaryService({
      projectId: TEST_PROJECT_ID,
      clientKey: TEST_CLIENT_KEY,
      appId: TEST_APP_ID,
      jwtServiceUrl: DEFAULT_JWT_SERVICE_URL,
    });

    // First call - fetches from worker
    const session1 = await service.getSession(TEST_USER_ADDRESS);
    
    // Second call - should return cached session
    const session2 = await service.getSession(TEST_USER_ADDRESS);

    // Should be the exact same JWT (cached)
    expect(session1.jwt).toBe(session2.jwt);
    expect(session1.expiresAt).toBe(session2.expiresAt);

    console.log('✅ Session caching works correctly');
  }, 30000);

  it('should decode JWT payload correctly', async () => {
    const service = new IntermediaryService({
      projectId: TEST_PROJECT_ID,
      clientKey: TEST_CLIENT_KEY,
      appId: TEST_APP_ID,
      jwtServiceUrl: DEFAULT_JWT_SERVICE_URL,
    });

    const session = await service.getSession(TEST_USER_ADDRESS);

    // Decode JWT payload (middle part)
    const payloadBase64 = session.jwt.split('.')[1];
    const payloadJson = atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadJson);

    // Verify JWT claims
    expect(payload).toHaveProperty('sub');
    expect(payload).toHaveProperty('iss');
    expect(payload).toHaveProperty('aud');
    expect(payload).toHaveProperty('iat');
    expect(payload).toHaveProperty('exp');

    // Subject should be prefixed with 'ua:'
    expect(payload.sub).toBe(`ua:${TEST_USER_ADDRESS.toLowerCase()}`);

    // Issuer should be the deposit SDK
    expect(payload.iss).toBe('particle-deposit-sdk');

    // Audience should be the project ID
    expect(payload.aud).toBe(TEST_PROJECT_ID);

    console.log('✅ JWT payload structure is correct');
    console.log('   Subject:', payload.sub);
    console.log('   Issuer:', payload.iss);
    console.log('   Audience:', payload.aud);
  }, 30000);
});

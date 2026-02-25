/**
 * Tests for IntermediaryService
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntermediaryService } from '../intermediary';
import { JwtError, AuthenticationError } from '../core/errors';

// Mock JwtVerifier so unit tests don't attempt real JWKS fetches or
// signature verification against the dummy tokens returned by the mock fetch.
vi.mock('../intermediary/JwtVerifier', () => ({
  JwtVerifier: class {
    verify(_token: string) {
      return Promise.resolve({});
    }
  },
}));

describe('IntermediaryService', () => {
  const mockConfig = {
    projectId: 'test-project-id',
    clientKey: 'test-client-key',
    appId: 'test-app-id',
    jwtServiceUrl: 'https://test-jwt-service.example.com',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with provided config', () => {
      const service = new IntermediaryService(mockConfig);
      expect(service).toBeInstanceOf(IntermediaryService);
    });
  });

  describe('getSession', () => {
    it('should fetch JWT and return session', async () => {
      const mockJwtResponse = {
        jwt: 'mock-jwt-token',
        expiresAt: Math.floor(Date.now() / 1000) + 600,
        expiresIn: 600,
        sub: 'ua:0x1234567890abcdef1234567890abcdef12345678',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockJwtResponse),
      });

      const service = new IntermediaryService(mockConfig);
      const session = await service.getSession('0x1234567890abcdef1234567890abcdef12345678');

      expect(session).toEqual({
        jwt: 'mock-jwt-token',
        expiresAt: mockJwtResponse.expiresAt,
        intermediaryAddress: '0x1234567890abcdef1234567890abcdef12345678',
      });

      expect(fetch).toHaveBeenCalledWith(
        'https://test-jwt-service.example.com/v1/jwt',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('should cache session and return cached version on subsequent calls', async () => {
      const mockJwtResponse = {
        jwt: 'mock-jwt-token',
        expiresAt: Math.floor(Date.now() / 1000) + 600,
        expiresIn: 600,
        sub: 'ua:0xtest',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockJwtResponse),
      });

      const service = new IntermediaryService(mockConfig);
      
      await service.getSession('0xtest');
      await service.getSession('0xtest');
      await service.getSession('0xtest');

      // Should only call fetch once due to caching
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should throw JwtError on network failure', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const service = new IntermediaryService(mockConfig);

      await expect(service.getSession('0xtest')).rejects.toThrow(JwtError);
    });

    it('should throw AuthenticationError on 401 response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'invalid_project', message: 'Invalid credentials' }),
      });

      const service = new IntermediaryService(mockConfig);

      await expect(service.getSession('0xtest')).rejects.toThrow(AuthenticationError);
    });

    it('should throw JwtError on 429 rate limit response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ error: 'rate_limited', message: 'Too many requests' }),
      });

      const service = new IntermediaryService(mockConfig);

      await expect(service.getSession('0xtest')).rejects.toThrow(JwtError);
    });
  });

  describe('refreshSession', () => {
    it('should force fetch new session even if cached', async () => {
      const mockJwtResponse = {
        jwt: 'mock-jwt-token',
        expiresAt: Math.floor(Date.now() / 1000) + 600,
        expiresIn: 600,
        sub: 'ua:0xtest',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockJwtResponse),
      });

      const service = new IntermediaryService(mockConfig);
      
      await service.getSession('0xtest');
      await service.refreshSession('0xtest');

      // Should call fetch twice - once for initial, once for refresh
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('clearSession', () => {
    it('should clear cached session', async () => {
      const mockJwtResponse = {
        jwt: 'mock-jwt-token',
        expiresAt: Math.floor(Date.now() / 1000) + 600,
        expiresIn: 600,
        sub: 'ua:0xtest',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockJwtResponse),
      });

      const service = new IntermediaryService(mockConfig);

      await service.getSession('0xtest');
      service.clearSession();

      expect(service.getCurrentSession()).toBeNull();
    });
  });

  describe('multi-user session isolation', () => {
    it('should maintain separate sessions for different users', async () => {
      const userAAddress = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      const userBAddress = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        const address = callCount === 1 ? userAAddress : userBAddress;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            jwt: `jwt-for-${address}`,
            expiresAt: Math.floor(Date.now() / 1000) + 600,
            expiresIn: 600,
            sub: `ua:${address}`,
          }),
        });
      });

      const service = new IntermediaryService(mockConfig);

      // Get sessions for both users
      const sessionA = await service.getSession(userAAddress);
      const sessionB = await service.getSession(userBAddress);

      // Sessions should be different
      expect(sessionA.intermediaryAddress.toLowerCase()).toBe(userAAddress.toLowerCase());
      expect(sessionB.intermediaryAddress.toLowerCase()).toBe(userBAddress.toLowerCase());
      expect(sessionA.jwt).not.toBe(sessionB.jwt);

      // Both should have been fetched
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should return cached session for same user without refetching', async () => {
      const userAddress = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          jwt: 'mock-jwt-token',
          expiresAt: Math.floor(Date.now() / 1000) + 600,
          expiresIn: 600,
          sub: `ua:${userAddress}`,
        }),
      });

      const service = new IntermediaryService(mockConfig);

      // Get session multiple times for same user
      await service.getSession(userAddress);
      await service.getSession(userAddress);
      await service.getSession(userAddress);

      // Should only fetch once
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should not share cached session between different users', async () => {
      const userAAddress = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      const userBAddress = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

      global.fetch = vi.fn().mockImplementation((_, options) => {
        const body = JSON.parse(options.body);
        const address = body.userId;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            jwt: `jwt-for-${address}`,
            expiresAt: Math.floor(Date.now() / 1000) + 600,
            expiresIn: 600,
            sub: `ua:${address}`,
          }),
        });
      });

      const service = new IntermediaryService(mockConfig);

      // Get session for user A
      const sessionA = await service.getSession(userAAddress);
      expect(sessionA.intermediaryAddress.toLowerCase()).toBe(userAAddress.toLowerCase());

      // Get session for user B - should NOT return user A's session
      const sessionB = await service.getSession(userBAddress);
      expect(sessionB.intermediaryAddress.toLowerCase()).toBe(userBAddress.toLowerCase());
      expect(sessionB.intermediaryAddress.toLowerCase()).not.toBe(userAAddress.toLowerCase());

      // Verify both fetches happened
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should handle concurrent requests for different users independently', async () => {
      const userAAddress = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      const userBAddress = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

      global.fetch = vi.fn().mockImplementation((_, options) => {
        const body = JSON.parse(options.body);
        const address = body.userId;
        // Simulate network delay
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: () => Promise.resolve({
                jwt: `jwt-for-${address}`,
                expiresAt: Math.floor(Date.now() / 1000) + 600,
                expiresIn: 600,
                sub: `ua:${address}`,
              }),
            });
          }, 10);
        });
      });

      const service = new IntermediaryService(mockConfig);

      // Request sessions for both users simultaneously
      const [sessionA, sessionB] = await Promise.all([
        service.getSession(userAAddress),
        service.getSession(userBAddress),
      ]);

      // Each user should get their own session
      expect(sessionA.intermediaryAddress.toLowerCase()).toBe(userAAddress.toLowerCase());
      expect(sessionB.intermediaryAddress.toLowerCase()).toBe(userBAddress.toLowerCase());

      // Both should have been fetched independently
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should deduplicate concurrent requests for the SAME user', async () => {
      const userAddress = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

      global.fetch = vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: () => Promise.resolve({
                jwt: 'mock-jwt-token',
                expiresAt: Math.floor(Date.now() / 1000) + 600,
                expiresIn: 600,
                sub: `ua:${userAddress}`,
              }),
            });
          }, 10);
        });
      });

      const service = new IntermediaryService(mockConfig);

      // Request session for same user 3 times simultaneously
      const [session1, session2, session3] = await Promise.all([
        service.getSession(userAddress),
        service.getSession(userAddress),
        service.getSession(userAddress),
      ]);

      // All should return the same session
      expect(session1.jwt).toBe(session2.jwt);
      expect(session2.jwt).toBe(session3.jwt);

      // Should only fetch once (deduplication)
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('clearSessionForUser', () => {
    it('should clear only the specified user session', async () => {
      const userAAddress = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      const userBAddress = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

      global.fetch = vi.fn().mockImplementation((_, options) => {
        const body = JSON.parse(options.body);
        const address = body.userId;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            jwt: `jwt-for-${address}`,
            expiresAt: Math.floor(Date.now() / 1000) + 600,
            expiresIn: 600,
            sub: `ua:${address}`,
          }),
        });
      });

      const service = new IntermediaryService(mockConfig);

      // Get sessions for both users
      await service.getSession(userAAddress);
      await service.getSession(userBAddress);

      // Clear only user A's session
      service.clearSessionForUser(userAAddress);

      // User A's session should be null
      expect(service.getCurrentSession(userAAddress)).toBeNull();

      // User B's session should still exist
      expect(service.getCurrentSession(userBAddress)).not.toBeNull();
      expect(service.getCurrentSession(userBAddress)?.intermediaryAddress.toLowerCase()).toBe(userBAddress.toLowerCase());
    });

    it('should require refetch after clearing user session', async () => {
      const userAddress = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          jwt: 'mock-jwt-token',
          expiresAt: Math.floor(Date.now() / 1000) + 600,
          expiresIn: 600,
          sub: `ua:${userAddress}`,
        }),
      });

      const service = new IntermediaryService(mockConfig);

      // Get initial session
      await service.getSession(userAddress);
      expect(fetch).toHaveBeenCalledTimes(1);

      // Clear and get again
      service.clearSessionForUser(userAddress);
      await service.getSession(userAddress);

      // Should have fetched again
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('address normalization', () => {
    it('should treat addresses with different casing as the same user', async () => {
      const lowerAddress = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const upperAddress = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      const mixedAddress = '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa';

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          jwt: 'mock-jwt-token',
          expiresAt: Math.floor(Date.now() / 1000) + 600,
          expiresIn: 600,
          sub: `ua:${lowerAddress}`,
        }),
      });

      const service = new IntermediaryService(mockConfig);

      // Request with different casings
      await service.getSession(lowerAddress);
      await service.getSession(upperAddress);
      await service.getSession(mixedAddress);

      // Should only fetch once (all same user)
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });
});

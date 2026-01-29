/**
 * IntermediaryService - Manages JWT authentication and session with the intermediary wallet
 * 
 * This service handles:
 * 1. Fetching JWT from the Cloudflare Worker
 * 2. Connecting to Particle Auth Core with the JWT
 * 3. Providing the Auth Core provider for signing UA transactions
 */

import { JwtError, AuthenticationError } from '../core/errors';
import type { JwtResponse, IntermediarySession, AuthCoreProvider } from '../core/types';
import { DEFAULT_JWT_SERVICE_URL } from '../constants';

export interface IntermediaryConfig {
  projectId: string;
  clientKey: string;
  appId: string;
  jwtServiceUrl: string;
}

export interface AuthCoreConnection {
  address: string;
  provider: AuthCoreProvider;
}

export class IntermediaryService {
  private config: IntermediaryConfig;

  // Per-user session cache to prevent session mixing between different users
  private sessions: Map<string, IntermediarySession> = new Map();
  private sessionPromises: Map<string, Promise<IntermediarySession>> = new Map();

  constructor(config: IntermediaryConfig) {
    this.config = {
      ...config,
      jwtServiceUrl: config.jwtServiceUrl || DEFAULT_JWT_SERVICE_URL,
    };
  }

  /**
   * Normalize user ID to ensure consistent cache keys
   */
  private normalizeUserId(userId: string): string {
    return userId.toLowerCase().trim();
  }

  /**
   * Get or create a session for the given user ID (owner address)
   * Uses per-user caching to avoid redundant JWT requests and prevent session mixing
   */
  async getSession(userId: string): Promise<IntermediarySession> {
    const normalizedUserId = this.normalizeUserId(userId);

    // Return cached session if still valid for this specific user
    const cachedSession = this.sessions.get(normalizedUserId);
    if (cachedSession && this.isSessionValid(cachedSession)) {
      return cachedSession;
    }

    // If a request is already in flight for this user, wait for it
    const existingPromise = this.sessionPromises.get(normalizedUserId);
    if (existingPromise) {
      return existingPromise;
    }

    // Create new session for this user
    const sessionPromise = this.createSession(normalizedUserId);
    this.sessionPromises.set(normalizedUserId, sessionPromise);

    try {
      const session = await sessionPromise;
      this.sessions.set(normalizedUserId, session);
      return session;
    } finally {
      this.sessionPromises.delete(normalizedUserId);
    }
  }

  /**
   * Force refresh the session for a specific user even if current one is valid
   */
  async refreshSession(userId: string): Promise<IntermediarySession> {
    const normalizedUserId = this.normalizeUserId(userId);
    this.sessions.delete(normalizedUserId);
    this.sessionPromises.delete(normalizedUserId);
    return this.getSession(userId);
  }

  /**
   * Get the current session for a specific user without fetching a new one
   */
  getCurrentSession(userId?: string): IntermediarySession | null {
    if (!userId) {
      // Legacy behavior: return first valid session (for backward compatibility)
      for (const session of this.sessions.values()) {
        if (this.isSessionValid(session)) {
          return session;
        }
      }
      return null;
    }

    const normalizedUserId = this.normalizeUserId(userId);
    const session = this.sessions.get(normalizedUserId);
    if (session && this.isSessionValid(session)) {
      return session;
    }
    return null;
  }

  /**
   * Clear the session for a specific user
   */
  clearSessionForUser(userId: string): void {
    const normalizedUserId = this.normalizeUserId(userId);
    this.sessions.delete(normalizedUserId);
    this.sessionPromises.delete(normalizedUserId);
  }

  /**
   * Clear all sessions (all users)
   */
  clearSession(): void {
    this.sessions.clear();
    this.sessionPromises.clear();
  }

  /**
   * Check if a session is still valid (not expired)
   * Adds a 60-second buffer to account for clock skew and network latency
   */
  private isSessionValid(session: IntermediarySession): boolean {
    const now = Math.floor(Date.now() / 1000);
    const buffer = 60; // 60 second buffer
    return session.expiresAt > now + buffer;
  }

  /**
   * Create a new session by fetching JWT from the worker
   */
  private async createSession(userId: string): Promise<IntermediarySession> {
    const jwt = await this.fetchJwt(userId);

    return {
      jwt: jwt.jwt,
      expiresAt: jwt.expiresAt,
      intermediaryAddress: this.extractAddressFromSub(jwt.sub),
    };
  }

  /**
   * Fetch JWT from the Cloudflare Worker
   */
  private async fetchJwt(userId: string): Promise<JwtResponse> {
    const url = `${this.config.jwtServiceUrl}/v1/jwt`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: this.config.projectId,
          clientKey: this.config.clientKey,
          appId: this.config.appId,
          userId: userId.toLowerCase(),
        }),
      });
    } catch (error) {
      throw new JwtError(
        `Failed to connect to JWT service: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }

    if (!response.ok) {
      const errorData = await this.parseErrorResponse(response);
      
      if (response.status === 401) {
        throw new AuthenticationError(
          `Invalid project credentials: ${errorData.message || 'Authentication failed'}`,
          errorData
        );
      }
      
      if (response.status === 429) {
        throw new JwtError(
          `Rate limited: ${errorData.message || 'Too many requests'}`,
          errorData
        );
      }

      throw new JwtError(
        `JWT request failed (${response.status}): ${errorData.message || 'Unknown error'}`,
        errorData
      );
    }

    const data = await response.json() as JwtResponse;

    if (!data.jwt) {
      throw new JwtError('JWT service did not return a valid token');
    }

    return data;
  }

  /**
   * Parse error response from the JWT service
   */
  private async parseErrorResponse(response: Response): Promise<{ error?: string; message?: string }> {
    try {
      return await response.json() as { error?: string; message?: string };
    } catch {
      return { message: response.statusText };
    }
  }

  /**
   * Extract the address portion from the JWT subject
   * Subject format: "ua:0x1234..." -> "0x1234..."
   */
  private extractAddressFromSub(sub: string): string {
    if (sub.startsWith('ua:')) {
      return sub.slice(3);
    }
    return sub;
  }
}

/**
 * JwtVerifier - Verifies JWT signatures using a remote JWKS endpoint.
 *
 * Uses the Web Crypto API (no external dependencies).
 * Supports RS256 (RSA + SHA-256) and ES256 (ECDSA P-256 + SHA-256).
 *
 * JWKS responses are cached for JWKS_CACHE_TTL_MS (1 hour) to avoid
 * hammering the endpoint on every token fetch. If a key ID (kid) is not
 * found in the cache, the cache is invalidated and the JWKS is re-fetched
 * once to handle key rotation.
 */

const JWKS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface JwkKey {
  kty: string;
  use?: string;
  kid?: string;
  alg?: string;
  // RSA fields
  n?: string;
  e?: string;
  // EC fields
  x?: string;
  y?: string;
  crv?: string;
}

interface JwksResponse {
  keys: JwkKey[];
}

interface JwksCacheEntry {
  keys: JwkKey[];
  fetchedAt: number;
}

interface JwtHeader {
  alg: string;
  kid?: string;
  typ?: string;
}

interface JwtClaims {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  exp?: number;
  iat?: number;
  jti?: string;
  [key: string]: unknown;
}

function base64UrlDecode(str: string): ArrayBuffer {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (base64.length % 4)) % 4;
  const padded = base64 + '='.repeat(padding);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function decodeJsonPart<T>(base64url: string): T {
  const buffer = base64UrlDecode(base64url);
  const text = new TextDecoder().decode(buffer);
  return JSON.parse(text) as T;
}

async function importJwk(jwk: JwkKey): Promise<CryptoKey> {
  if (jwk.kty === 'RSA') {
    return crypto.subtle.importKey(
      'jwk',
      jwk as JsonWebKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
  }

  if (jwk.kty === 'EC') {
    return crypto.subtle.importKey(
      'jwk',
      jwk as JsonWebKey,
      { name: 'ECDSA', namedCurve: jwk.crv ?? 'P-256' },
      false,
      ['verify'],
    );
  }

  throw new Error(`Unsupported JWK key type: ${jwk.kty}`);
}

async function verifyWithKey(
  key: CryptoKey,
  alg: string,
  signature: ArrayBuffer,
  signingInput: string,
): Promise<boolean> {
  const data = new TextEncoder().encode(signingInput);

  if (alg === 'RS256') {
    return crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, signature, data);
  }

  if (alg === 'ES256') {
    return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, data);
  }

  throw new Error(`Unsupported JWT algorithm: ${alg}`);
}

export class JwtVerifier {
  private readonly jwksUrl: string;
  private cache: JwksCacheEntry | null = null;
  private fetchPromise: Promise<JwkKey[]> | null = null;

  constructor(jwksUrl: string) {
    this.jwksUrl = jwksUrl;
  }

  /**
   * Verify a JWT string and return its validated claims.
   *
   * @throws Error if the token is malformed, expired, or the signature is invalid.
   */
  async verify(token: string): Promise<JwtClaims> {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Malformed JWT: expected 3 dot-separated parts');
    }

    const [headerPart, payloadPart, signaturePart] = parts;
    const header = decodeJsonPart<JwtHeader>(headerPart);
    const payload = decodeJsonPart<JwtClaims>(payloadPart);

    // Validate expiry before the expensive crypto operations
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp !== undefined && payload.exp <= now) {
      throw new Error('JWT has expired');
    }

    // sub is required — it carries the intermediary address
    if (!payload.sub) {
      throw new Error('JWT missing required sub claim');
    }

    // Find the matching public key
    const jwk = await this.findKey(header.kid, header.alg);
    const cryptoKey = await importJwk(jwk);

    const signature = base64UrlDecode(signaturePart);
    const signingInput = `${headerPart}.${payloadPart}`;
    const valid = await verifyWithKey(cryptoKey, header.alg, signature, signingInput);

    if (!valid) {
      throw new Error('JWT signature verification failed');
    }

    return payload;
  }

  /**
   * Find a JWK by key ID, falling back to algorithm-type matching.
   * Refreshes the JWKS cache once on a kid miss to handle key rotation.
   */
  private async findKey(kid?: string, alg?: string): Promise<JwkKey> {
    let keys = await this.getKeys();

    if (kid) {
      const match = keys.find((k) => k.kid === kid);
      if (match) return match;

      // kid not in cache — could be a newly rotated key, refresh once
      this.cache = null;
      keys = await this.getKeys(true);
      const refreshedMatch = keys.find((k) => k.kid === kid);
      if (refreshedMatch) return refreshedMatch;
    }

    // Fall back to the first key whose type matches the algorithm
    if (alg) {
      const fallback = keys.find((k) => this.algMatchesKty(alg, k.kty));
      if (fallback) return fallback;
    }

    // Last resort: single-key JWKS without kid
    if (keys.length === 1 && !kid) return keys[0];

    throw new Error(
      `No matching JWK found in JWKS (kid=${kid ?? 'none'}, alg=${alg ?? 'none'})`,
    );
  }

  private algMatchesKty(alg: string, kty?: string): boolean {
    if (!kty) return false;
    if (alg.startsWith('RS') && kty === 'RSA') return true;
    if (alg.startsWith('ES') && kty === 'EC') return true;
    return false;
  }

  private async getKeys(forceRefresh = false): Promise<JwkKey[]> {
    if (!forceRefresh && this.cache) {
      if (Date.now() - this.cache.fetchedAt < JWKS_CACHE_TTL_MS) {
        return this.cache.keys;
      }
    }

    // Deduplicate concurrent fetches: reuse an in-flight request
    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    this.fetchPromise = this.fetchJwks().finally(() => {
      this.fetchPromise = null;
    });

    return this.fetchPromise;
  }

  private async fetchJwks(): Promise<JwkKey[]> {
    let response: Response;
    try {
      response = await fetch(this.jwksUrl);
    } catch (err) {
      throw new Error(
        `Failed to fetch JWKS from ${this.jwksUrl}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!response.ok) {
      throw new Error(`JWKS endpoint returned ${response.status}: ${response.statusText}`);
    }

    const jwks = (await response.json()) as JwksResponse;
    const keys = jwks.keys ?? [];

    if (keys.length === 0) {
      throw new Error('JWKS endpoint returned an empty key set');
    }

    this.cache = { keys, fetchedAt: Date.now() };
    return keys;
  }
}

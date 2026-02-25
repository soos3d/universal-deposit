/**
 * TransactionCache - Lightweight LRU cache with TTL for transaction data.
 *
 * Prevents redundant API calls when users paginate back-and-forth
 * or re-fetch recently viewed pages.
 */

interface CacheEntry<T> {
  readonly data: T;
  readonly expiresAt: number;
}

export interface TransactionCacheConfig {
  /** Time-to-live in milliseconds. Default: 30_000 (30s). */
  ttlMs?: number;
  /** Maximum number of cached entries. Default: 10. */
  maxEntries?: number;
}

const DEFAULT_TTL_MS = 30_000;
const DEFAULT_MAX_ENTRIES = 10;

export class TransactionCache<T = unknown> {
  private readonly cache = new Map<string, CacheEntry<T>>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(config?: TransactionCacheConfig) {
    this.ttlMs = config?.ttlMs ?? DEFAULT_TTL_MS;
    this.maxEntries = config?.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  /**
   * Retrieve a cached value if it exists and hasn't expired.
   * Accessing a key promotes it to most-recent (LRU behaviour).
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // Promote to most-recent by re-inserting
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.data;
  }

  /**
   * Store a value in the cache. Evicts the least-recently-used entry
   * when the cache exceeds `maxEntries`.
   */
  set(key: string, data: T): void {
    // Remove existing entry first (so re-insert goes to end)
    this.cache.delete(key);

    // Evict oldest entry if at capacity
    if (this.cache.size >= this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  /** Remove a specific key from the cache. */
  invalidateKey(key: string): void {
    this.cache.delete(key);
  }

  /** Clear the entire cache. */
  invalidate(): void {
    this.cache.clear();
  }

  /** Current number of entries (including potentially expired ones). */
  get size(): number {
    return this.cache.size;
  }
}

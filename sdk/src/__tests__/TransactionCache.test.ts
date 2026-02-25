/**
 * Unit tests for TransactionCache
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TransactionCache } from '../universal-account/TransactionCache';

describe('TransactionCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns undefined for missing keys', () => {
    const cache = new TransactionCache();
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('stores and retrieves values', () => {
    const cache = new TransactionCache<string>();
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('expires entries after TTL', () => {
    const cache = new TransactionCache<string>({ ttlMs: 1000 });
    cache.set('key1', 'value1');

    expect(cache.get('key1')).toBe('value1');

    vi.advanceTimersByTime(1001);

    expect(cache.get('key1')).toBeUndefined();
  });

  it('does not expire entries before TTL', () => {
    const cache = new TransactionCache<string>({ ttlMs: 5000 });
    cache.set('key1', 'value1');

    vi.advanceTimersByTime(4999);
    expect(cache.get('key1')).toBe('value1');
  });

  it('evicts LRU entry when exceeding maxEntries', () => {
    const cache = new TransactionCache<string>({ maxEntries: 2 });

    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3'); // should evict 'a'

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('2');
    expect(cache.get('c')).toBe('3');
  });

  it('promotes accessed entries (LRU behaviour)', () => {
    const cache = new TransactionCache<string>({ maxEntries: 2 });

    cache.set('a', '1');
    cache.set('b', '2');

    // Access 'a' to promote it
    cache.get('a');

    cache.set('c', '3'); // should evict 'b' (least recently used)

    expect(cache.get('a')).toBe('1');
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe('3');
  });

  it('invalidateKey removes a single entry', () => {
    const cache = new TransactionCache<string>();
    cache.set('a', '1');
    cache.set('b', '2');

    cache.invalidateKey('a');

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('2');
  });

  it('invalidate clears all entries', () => {
    const cache = new TransactionCache<string>();
    cache.set('a', '1');
    cache.set('b', '2');

    cache.invalidate();

    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
  });

  it('overwrites existing keys', () => {
    const cache = new TransactionCache<string>();
    cache.set('key', 'old');
    cache.set('key', 'new');

    expect(cache.get('key')).toBe('new');
    expect(cache.size).toBe(1);
  });

  it('uses default TTL of 30s and maxEntries of 10', () => {
    const cache = new TransactionCache<string>();

    // Fill to 10
    for (let i = 0; i < 10; i++) {
      cache.set(`k${i}`, `v${i}`);
    }
    expect(cache.size).toBe(10);

    // 11th evicts oldest
    cache.set('k10', 'v10');
    expect(cache.size).toBe(10);
    expect(cache.get('k0')).toBeUndefined();

    // Default TTL 30s
    vi.advanceTimersByTime(30_001);
    expect(cache.get('k1')).toBeUndefined();
  });
});

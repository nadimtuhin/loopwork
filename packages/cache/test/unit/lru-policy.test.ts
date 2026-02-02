import { describe, test, expect } from 'bun:test';
import { createLRUPolicy } from '../../src/factories/index.js';
import { MockCacheStore } from '../helpers/mock-store.js';
import type { TimeSource } from '../../src/interfaces/index.js';

describe('LRUPolicy', () => {
  const createMockTime = (initialTime = 1000) => {
    let currentTime = initialTime;
    return {
      now: () => currentTime,
      advance: (ms: number) => { currentTime += ms; }
    };
  };

  describe('Should Evict', () => {
    test('returns true when store size >= maxSize', async () => {
      const lru = createLRUPolicy();
      const store = new MockCacheStore<string>();

      // Fill store with 5 items
      for (let i = 0; i < 5; i++) {
        await store.set(`k${i}`, {
          key: `k${i}`,
          value: 'v',
          createdAt: 1000,
          expiresAt: 0,
          lastAccessedAt: 1000
        });
      }

      // maxSize 5, current 5 -> evict
      expect(await lru.shouldEvict(store, 5)).toBe(true);
      // maxSize 4, current 5 -> evict
      expect(await lru.shouldEvict(store, 4)).toBe(true);
    });

    test('returns false when store size < maxSize', async () => {
      const lru = createLRUPolicy();
      const store = new MockCacheStore<string>();

      await store.set('k1', {
        key: 'k1',
        value: 'v',
        createdAt: 1000,
        expiresAt: 0,
        lastAccessedAt: 1000
      });

      // maxSize 2, current 1 -> no evict
      expect(await lru.shouldEvict(store, 2)).toBe(false);
    });

    test('handles empty store', async () => {
      const lru = createLRUPolicy();
      const store = new MockCacheStore<string>();
      
      expect(await lru.shouldEvict(store, 10)).toBe(false);
    });
  });

  describe('Victim Selection', () => {
    test('selects entry with oldest lastAccessedAt', async () => {
      const lru = createLRUPolicy();
      const store = new MockCacheStore<string>();

      // Oldest
      await store.set('oldest', {
        key: 'oldest',
        value: 'v',
        createdAt: 1000,
        expiresAt: 0,
        lastAccessedAt: 1000
      });

      // Newest
      await store.set('newest', {
        key: 'newest',
        value: 'v',
        createdAt: 1000,
        expiresAt: 0,
        lastAccessedAt: 2000
      });

      // Middle
      await store.set('middle', {
        key: 'middle',
        value: 'v',
        createdAt: 1000,
        expiresAt: 0,
        lastAccessedAt: 1500
      });

      const victim = await lru.selectVictim(store);
      expect(victim).toBe('oldest');
    });

    test('returns null for empty store', async () => {
      const lru = createLRUPolicy();
      const store = new MockCacheStore<string>();
      
      expect(await lru.selectVictim(store)).toBeNull();
    });

    test('handles single entry', async () => {
      const lru = createLRUPolicy();
      const store = new MockCacheStore<string>();

      await store.set('only', {
        key: 'only',
        value: 'v',
        createdAt: 1000,
        expiresAt: 0,
        lastAccessedAt: 1000
      });

      expect(await lru.selectVictim(store)).toBe('only');
    });

    test('handles ties (deterministic behavior)', async () => {
      const lru = createLRUPolicy();
      const store = new MockCacheStore<string>();

      await store.set('tie1', {
        key: 'tie1',
        value: 'v',
        createdAt: 1000,
        expiresAt: 0,
        lastAccessedAt: 1000
      });

      await store.set('tie2', {
        key: 'tie2',
        value: 'v',
        createdAt: 1000,
        expiresAt: 0,
        lastAccessedAt: 1000
      });

      const victim = await lru.selectVictim(store);
      // It should be either tie1 or tie2, we just care it returns one of them
      expect(['tie1', 'tie2']).toContain(victim);
    });
  });

  describe('Eviction Execution', () => {
    test('evicts entries until size < maxSize', async () => {
      const lru = createLRUPolicy();
      const store = new MockCacheStore<string>();

      // Add 5 entries
      for (let i = 0; i < 5; i++) {
        await store.set(`k${i}`, {
          key: `k${i}`,
          value: 'v',
          createdAt: 1000,
          expiresAt: 0,
          lastAccessedAt: 1000 + i // k0 is oldest, k4 is newest
        });
      }

      // Evict down to 3
      const evictedCount = await lru.evict(store, 3);
      
      expect(evictedCount).toBe(3); // 5 -> 4 -> 3 (evicts k0, k1, k2? no Wait. 5 down to 3 requires removing 2 items? 
      // The logic is while (size >= maxSize).
      // 5 >= 3 -> evict (size 4)
      // 4 >= 3 -> evict (size 3)
      // 3 >= 3 -> evict (size 2)
      // 2 >= 3 -> false.
      // So it evicts until size < maxSize. 
      // Plan says "until size <= maxSize".
      // Wait, standard cache behavior: if maxSize is 3, and we have 4, we evict 1.
      // If we have 3, and we add 1, we have 4, then we evict 1.
      // If `shouldEvict` is `size >= maxSize`, then if size is 3 and max is 3, it returns true, and evicts one to become 2.
      // So the final size will be maxSize - 1. 
      // If implementation is "while (shouldEvict)", and "shouldEvict" is ">= maxSize", then it stops when size < maxSize.
      // Let's verify requirement.
      // "Returns true when store size >= maxSize".
      // "Evicts entries until size <= maxSize" -- wait, this is contradictory if shouldEvict is >=.
      // If shouldEvict is >=, then loop runs while size >= maxSize. It stops when size < maxSize.
      // So final size is maxSize - 1.
      // Usually caches trigger eviction when size > maxSize. Or before insertion if size == maxSize.
      // But let's follow the implementation provided in the prompt:
      // shouldEvict: size >= maxSize.
      // evict: while (shouldEvict) { delete; }
      // This means if size is 3, maxSize is 3 -> evict 1 -> size 2.
      // So strict capacity enforcement.
      
      // So if start with 5, maxSize 3:
      // 5 >= 3 -> evict k0 -> size 4
      // 4 >= 3 -> evict k1 -> size 3
      // 3 >= 3 -> evict k2 -> size 2
      // 2 >= 3 -> stop.
      // Total evicted: 3.
      // Remaining: 2 (k3, k4).
      
      expect(await store.size()).toBe(2);
      expect(await store.has('k3')).toBe(true);
      expect(await store.has('k4')).toBe(true);
    });

    test('evicts least recently used entries first', async () => {
      const lru = createLRUPolicy();
      const store = new MockCacheStore<string>();

      await store.set('old', { key: 'old', value: 'v', createdAt: 0, expiresAt: 0, lastAccessedAt: 100 });
      await store.set('med', { key: 'med', value: 'v', createdAt: 0, expiresAt: 0, lastAccessedAt: 200 });
      await store.set('new', { key: 'new', value: 'v', createdAt: 0, expiresAt: 0, lastAccessedAt: 300 });

      // Max size 2 -> should evict 'old' (because 3 >= 2)
      // Then size becomes 2.
      // 2 >= 2 -> evict 'med'.
      // Final size 1.
      
      await lru.evict(store, 2);
      
      expect(await store.has('old')).toBe(false);
      expect(await store.has('med')).toBe(false);
      expect(await store.has('new')).toBe(true);
    });

    test('handles maxSize = 0 (evict all)', async () => {
      const lru = createLRUPolicy();
      const store = new MockCacheStore<string>();
      
      await store.set('k1', { key: 'k1', value: 'v', createdAt: 0, expiresAt: 0, lastAccessedAt: 100 });
      
      await lru.evict(store, 0);
      expect(await store.size()).toBe(0);
    });
  });
});

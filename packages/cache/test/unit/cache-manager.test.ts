import { describe, test, expect, beforeEach, spyOn } from 'bun:test';
import { CacheManagerImpl } from '../../src/implementations/cache-manager';
import { MockCacheStore } from '../helpers/mock-store';
import type { CacheConfig, CacheKey, TTLManager, EvictionPolicy, TimeSource, CacheStore } from '../../src/interfaces';

class MockKeyGenerator implements CacheKey {
  generate(prompt: string): string {
    return prompt;
  }
  normalize(prompt: string): string {
    return prompt.trim();
  }
}

class MockTTLManager implements TTLManager {
  calculateExpiry(ttlMs: number): number {
    return Date.now() + ttlMs;
  }
  isExpired(entry: any): boolean {
    return Date.now() > entry.expiresAt;
  }
  async evictExpired(store: CacheStore<any>): Promise<number> {
    return 0;
  }
}

class MockEvictionPolicy implements EvictionPolicy {
  async shouldEvict(store: CacheStore<any>, maxSize: number): Promise<boolean> {
    return (await store.size()) >= maxSize;
  }
  async selectVictim(store: CacheStore<any>): Promise<string | null> {
    const keys = await store.keys();
    return keys.length > 0 ? keys[0] : null;
  }
  async evict(store: CacheStore<any>, count: number): Promise<number> {
    const keys = await store.keys();
    if (keys.length > 0) {
      await store.delete(keys[0]);
      return 1;
    }
    return 0;
  }
}

describe('CacheManager', () => {
  let cacheManager: CacheManagerImpl<string>;
  let l1Store: MockCacheStore<string>;
  let l2Store: MockCacheStore<string>;
  let keyGen: MockKeyGenerator;
  let ttlManager: MockTTLManager;
  let evictionPolicy: MockEvictionPolicy;
  let timeSource: TimeSource;
  let now: number;

  const config: CacheConfig = {
    maxSize: 3,
    ttlMs: 1000,
    enableL2: true
  };

  beforeEach(() => {
    now = 1000;
    timeSource = { now: () => now };
    l1Store = new MockCacheStore<string>();
    l2Store = new MockCacheStore<string>();
    keyGen = new MockKeyGenerator();
    ttlManager = new MockTTLManager();
    evictionPolicy = new MockEvictionPolicy();

    ttlManager.calculateExpiry = (ttl) => now + ttl;
    ttlManager.isExpired = (entry) => now > entry.expiresAt;

    cacheManager = new CacheManagerImpl(
      config,
      l1Store,
      keyGen,
      ttlManager,
      evictionPolicy,
      timeSource,
      l2Store
    );
  });

  describe('Basic Caching', () => {
    test('get() returns null for cache miss', async () => {
      const result = await cacheManager.get('unknown');
      expect(result).toBeNull();
    });

    test('set() and get() round-trip correctly', async () => {
      await cacheManager.set('foo', 'bar');
      const result = await cacheManager.get('foo');
      expect(result).toBe('bar');
    });

    test('get() updates lastAccessedAt for LRU', async () => {
      await cacheManager.set('foo', 'bar');
      const entryBefore = await l1Store.get('foo');
      expect(entryBefore?.lastAccessedAt).toBe(1000);

      now = 2000;
      await cacheManager.get('foo');
      
      const entryAfter = await l1Store.get('foo');
      expect(entryAfter?.lastAccessedAt).toBe(2000);
    });

    test('set() with custom TTL works', async () => {
      await cacheManager.set('foo', 'bar', 5000);
      const entry = await l1Store.get('foo');
      expect(entry?.expiresAt).toBe(now + 5000);
    });

    test('Expired entries return null on get()', async () => {
      await cacheManager.set('foo', 'bar', 100);
      
      now = 1200; 
      
      const result = await cacheManager.get('foo');
      expect(result).toBeNull();
      
      const entry = await l1Store.get('foo');
      expect(entry).toBeNull();
    });
  });

  describe('Invalidation', () => {
    beforeEach(async () => {
      await cacheManager.set('user:1', 'data1');
      await cacheManager.set('user:2', 'data2');
      await cacheManager.set('post:1', 'data3');
    });

    test('invalidate() removes matching entries', async () => {
      await cacheManager.invalidate('user:*');
      expect(await l1Store.get('user:1')).toBeNull();
      expect(await l1Store.get('user:2')).toBeNull();
      expect(await l1Store.get('post:1')).not.toBeNull();
    });

    test('invalidate() returns count of removed entries', async () => {
      const count = await cacheManager.invalidate('user:*');
      expect(count).toBe(2);
    });

    test('invalidate() with no matches returns 0', async () => {
      const count = await cacheManager.invalidate('admin:*');
      expect(count).toBe(0);
    });

    test('clear() removes all entries', async () => {
      await cacheManager.clear();
      expect(await l1Store.size()).toBe(0);
      expect(await l2Store.size()).toBe(0);
    });

    test('clear() resets stats', async () => {
      await cacheManager.get('miss');
      await cacheManager.clear();
      const stats = await cacheManager.getStats();
      expect(stats.misses).toBe(0);
      expect(stats.hits).toBe(0);
    });
  });

  describe('Statistics', () => {
    test('getStats() tracks hits and misses', async () => {
      await cacheManager.set('hit', 'value');
      await cacheManager.get('hit');
      await cacheManager.get('miss');
      
      const stats = await cacheManager.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    test('getStats() calculates hit rate correctly', async () => {
      await cacheManager.set('hit', 'value');
      await cacheManager.get('hit');
      await cacheManager.get('miss');
      
      const stats = await cacheManager.getStats();
      expect(stats.hitRate).toBe(50);
    });

    test('getStats() tracks size', async () => {
      await cacheManager.set('a', '1');
      await cacheManager.set('b', '2');
      const stats = await cacheManager.getStats();
      expect(stats.size).toBe(2);
    });

    test('getStats() tracks evictions', async () => {
      await cacheManager.set('1', '1');
      await cacheManager.set('2', '2');
      await cacheManager.set('3', '3');
      await cacheManager.set('4', '4');
      
      const stats = await cacheManager.getStats();
      expect(stats.evictions).toBeGreaterThan(0);
    });
  });

  describe('L1/L2 Integration', () => {
    test('Cache miss checks L1, then L2, then returns null', async () => {
      const l1Spy = spyOn(l1Store, 'get');
      const l2Spy = spyOn(l2Store, 'get');
      
      const result = await cacheManager.get('missing');
      
      expect(result).toBeNull();
      expect(l1Spy).toHaveBeenCalled();
      expect(l2Spy).toHaveBeenCalled();
    });

    test('L2 hit promotes entry to L1', async () => {
      const key = 'exists-in-l2';
      const entry = {
        key,
        value: 'promoted',
        createdAt: now,
        expiresAt: now + 10000,
        lastAccessedAt: now,
        metadata: { prompt: 'exists-in-l2' }
      };
      
      await l2Store.set(key, entry);
      
      expect(await l1Store.get(key)).toBeNull();
      
      const result = await cacheManager.get('exists-in-l2');
      
      expect(result).toBe('promoted');
      expect(await l1Store.get(key)).not.toBeNull();
    });

    test('set() writes to both L1 and L2', async () => {
      await cacheManager.set('dual', 'write');
      
      expect(await l1Store.get('dual')).not.toBeNull();
      expect(await l2Store.get('dual')).not.toBeNull();
    });
  });

  describe('Eviction', () => {
    test('Triggers LRU eviction when maxSize reached', async () => {
      const evictSpy = spyOn(evictionPolicy, 'evict');
      
      await cacheManager.set('1', '1');
      await cacheManager.set('2', '2');
      await cacheManager.set('3', '3');
      
      expect(evictSpy).not.toHaveBeenCalled();
      
      await cacheManager.set('4', '4');
      
      expect(evictSpy).toHaveBeenCalled();
    });

    test('Eviction updates stats', async () => {
      await cacheManager.set('1', '1');
      await cacheManager.set('2', '2');
      await cacheManager.set('3', '3');
      await cacheManager.set('4', '4');
      
      const stats = await cacheManager.getStats();
      expect(stats.evictions).toBe(1);
    });

    test('TTL eviction runs on get()', async () => {
      await cacheManager.set('expired', 'value', 100);
      now = 2000;
      
      const result = await cacheManager.get('expired');
      expect(result).toBeNull();
      
      const stats = await cacheManager.getStats();
      expect(stats.misses).toBe(1);
    });
  });
});

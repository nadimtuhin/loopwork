import { describe, test, expect } from 'bun:test';
import { createTTLManager } from '../../src/factories/index.js';
import { MockCacheStore } from '../helpers/mock-store.js';
import type { TimeSource } from '../../src/interfaces/index.js';

describe('TTLManager', () => {
  // Helper to create a controllable time source
  const createMockTime = (initialTime = 1000) => {
    let currentTime = initialTime;
    return {
      now: () => currentTime,
      advance: (ms: number) => { currentTime += ms; }
    };
  };

  describe('Expiry Calculation', () => {
    test('calculates correct expiry timestamp from TTL', () => {
      const mockTime = createMockTime(1000);
      const ttlManager = createTTLManager(mockTime);
      
      const expiry = ttlManager.calculateExpiry(5000); // 5 seconds TTL
      expect(expiry).toBe(6000); // 1000 + 5000
    });

    test('returns 0 for zero TTL (never expires)', () => {
      const ttlManager = createTTLManager();
      expect(ttlManager.calculateExpiry(0)).toBe(0);
    });

    test('uses injected TimeSource for calculation', () => {
      const mockTime = createMockTime(2000);
      const ttlManager = createTTLManager(mockTime);
      
      expect(ttlManager.calculateExpiry(1000)).toBe(3000);
    });
  });

  describe('Expiration Checking', () => {
    test('returns true for expired entries (now > expiresAt)', () => {
      const mockTime = createMockTime(2000);
      const ttlManager = createTTLManager(mockTime);
      
      const entry = {
        key: 'test',
        value: 'data',
        createdAt: 1000,
        expiresAt: 1500, // Expired
        lastAccessedAt: 1000
      };

      expect(ttlManager.isExpired(entry)).toBe(true);
    });

    test('returns false for valid entries (now < expiresAt)', () => {
      const mockTime = createMockTime(1000);
      const ttlManager = createTTLManager(mockTime);
      
      const entry = {
        key: 'test',
        value: 'data',
        createdAt: 1000,
        expiresAt: 2000, // Valid
        lastAccessedAt: 1000
      };

      expect(ttlManager.isExpired(entry)).toBe(false);
    });

    test('never expires entries with expiresAt = 0', () => {
      const mockTime = createMockTime(5000);
      const ttlManager = createTTLManager(mockTime);
      
      const entry = {
        key: 'test',
        value: 'data',
        createdAt: 1000,
        expiresAt: 0, // Never expires
        lastAccessedAt: 1000
      };

      expect(ttlManager.isExpired(entry)).toBe(false);
    });

    test('handles edge case: now === expiresAt (should be expired)', () => {
      const mockTime = createMockTime(2000);
      const ttlManager = createTTLManager(mockTime);
      
      const entry = {
        key: 'test',
        value: 'data',
        createdAt: 1000,
        expiresAt: 2000, // Exactly now
        lastAccessedAt: 1000
      };

      expect(ttlManager.isExpired(entry)).toBe(true);
    });
  });

  describe('Evict Expired Entries', () => {
    test('removes all expired entries from store', async () => {
      const mockTime = createMockTime(2000);
      const ttlManager = createTTLManager(mockTime);
      const store = new MockCacheStore<string>();

      // Add one expired and one valid entry
      await store.set('expired', {
        key: 'expired',
        value: 'val1',
        createdAt: 1000,
        expiresAt: 1500,
        lastAccessedAt: 1000
      });

      await store.set('valid', {
        key: 'valid',
        value: 'val2',
        createdAt: 1000,
        expiresAt: 2500,
        lastAccessedAt: 1000
      });

      await ttlManager.evictExpired(store);

      expect(await store.has('expired')).toBe(false);
      expect(await store.has('valid')).toBe(true);
    });

    test('returns count of evicted entries', async () => {
      const mockTime = createMockTime(2000);
      const ttlManager = createTTLManager(mockTime);
      const store = new MockCacheStore<string>();

      await store.set('expired1', {
        key: 'expired1',
        value: 'val1',
        createdAt: 1000,
        expiresAt: 1500,
        lastAccessedAt: 1000
      });

      await store.set('expired2', {
        key: 'expired2',
        value: 'val2',
        createdAt: 1000,
        expiresAt: 1500,
        lastAccessedAt: 1000
      });

      const count = await ttlManager.evictExpired(store);
      expect(count).toBe(2);
    });

    test('preserves non-expired entries', async () => {
      const mockTime = createMockTime(1000);
      const ttlManager = createTTLManager(mockTime);
      const store = new MockCacheStore<string>();

      await store.set('valid', {
        key: 'valid',
        value: 'val',
        createdAt: 1000,
        expiresAt: 2000,
        lastAccessedAt: 1000
      });

      const count = await ttlManager.evictExpired(store);
      expect(count).toBe(0);
      expect(await store.has('valid')).toBe(true);
    });

    test('handles empty store', async () => {
      const ttlManager = createTTLManager();
      const store = new MockCacheStore<string>();
      
      const count = await ttlManager.evictExpired(store);
      expect(count).toBe(0);
    });
  });
});

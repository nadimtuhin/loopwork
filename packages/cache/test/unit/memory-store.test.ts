import { describe, test, expect, beforeEach } from 'bun:test';
import { MemoryCacheStore } from '../../src/implementations/memory-store.js';
import type { CacheEntry } from '../../src/interfaces/index.js';

describe('MemoryCacheStore', () => {
  let store: MemoryCacheStore<any>;
  
  const createEntry = (key: string, value: any): CacheEntry<any> => ({
    key,
    value,
    createdAt: Date.now(),
    expiresAt: 0,
    lastAccessedAt: Date.now()
  });

  beforeEach(() => {
    store = new MemoryCacheStore<any>();
  });

  describe('Basic Operations', () => {
    test('get() returns null for non-existent key', async () => {
      const result = await store.get('missing');
      expect(result).toBeNull();
    });

    test('set() and get() round-trip correctly', async () => {
      const entry = createEntry('key1', 'value1');
      await store.set('key1', entry);
      
      const result = await store.get('key1');
      expect(result).toEqual(entry);
    });

    test('has() returns true for existing key', async () => {
      const entry = createEntry('key1', 'value1');
      await store.set('key1', entry);
      
      const exists = await store.has('key1');
      expect(exists).toBe(true);
    });

    test('has() returns false for non-existent key', async () => {
      const exists = await store.has('missing');
      expect(exists).toBe(false);
    });

    test('delete() removes entry', async () => {
      const entry = createEntry('key1', 'value1');
      await store.set('key1', entry);
      
      await store.delete('key1');
      const result = await store.get('key1');
      expect(result).toBeNull();
      expect(await store.has('key1')).toBe(false);
    });

    test('clear() removes all entries', async () => {
      await store.set('key1', createEntry('key1', 'val1'));
      await store.set('key2', createEntry('key2', 'val2'));
      
      await store.clear();
      
      expect(await store.size()).toBe(0);
      expect(await store.get('key1')).toBeNull();
      expect(await store.get('key2')).toBeNull();
    });

    test('keys() returns all keys as array', async () => {
      await store.set('key1', createEntry('key1', 'val1'));
      await store.set('key2', createEntry('key2', 'val2'));
      await store.set('key3', createEntry('key3', 'val3'));
      
      const keys = await store.keys();
      expect(keys.length).toBe(3);
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('key3');
    });
  });

  describe('Size Tracking', () => {
    test('size() returns 0 for empty store', async () => {
      expect(await store.size()).toBe(0);
    });

    test('size() increases after set()', async () => {
      await store.set('key1', createEntry('key1', 'val1'));
      expect(await store.size()).toBe(1);
      
      await store.set('key2', createEntry('key2', 'val2'));
      expect(await store.size()).toBe(2);
    });

    test('size() decreases after delete()', async () => {
      await store.set('key1', createEntry('key1', 'val1'));
      await store.set('key2', createEntry('key2', 'val2'));
      
      await store.delete('key1');
      expect(await store.size()).toBe(1);
    });
  });

  describe('Data Integrity', () => {
    test('Stores complex objects correctly', async () => {
      const complexValue = { 
        foo: 'bar', 
        nested: { a: 1, b: [1, 2, 3] },
        nullVal: null
      };
      const entry = createEntry('complex', complexValue);
      
      await store.set('complex', entry);
      const result = await store.get('complex');
      
      expect(result?.value).toEqual(complexValue);
    });

    test('Handles concurrent operations', async () => {
      const operations: Promise<void>[] = [];
      for (let i = 0; i < 100; i++) {
        operations.push(store.set(`key${i}`, createEntry(`key${i}`, i)));
      }
      
      await Promise.all(operations);
      expect(await store.size()).toBe(100);
      
      const result = await store.get('key50');
      expect(result?.value).toBe(50);
    });
  });
});

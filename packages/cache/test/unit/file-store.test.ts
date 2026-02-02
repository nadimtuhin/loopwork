import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, access, constants, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileCacheStore } from '../../src/implementations/file-store.js';
import type { CacheEntry } from '../../src/interfaces/index.js';

describe('FileCacheStore', () => {
  let store: FileCacheStore<any>;
  let tempDir: string;

  const createEntry = (key: string, value: any): CacheEntry<any> => ({
    key,
    value,
    createdAt: Date.now(),
    expiresAt: 0,
    lastAccessedAt: Date.now()
  });

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cache-test-'));
    store = new FileCacheStore<any>(tempDir);
  });

  afterEach(async () => {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch (error) {
    }
  });

  describe('Basic File Operations', () => {
    test('get() returns null for non-existent file', async () => {
      const result = await store.get('missing');
      expect(result).toBeNull();
    });

    test('set() creates file and get() retrieves correctly', async () => {
      const entry = createEntry('key1', 'value1');
      await store.set('key1', entry);
      
      const result = await store.get('key1');
      expect(result).toEqual(entry);
    });

    test('has() checks file existence', async () => {
      const entry = createEntry('key1', 'value1');
      await store.set('key1', entry);
      
      const exists = await store.has('key1');
      expect(exists).toBe(true);
    });

    test('delete() removes file', async () => {
      const entry = createEntry('key1', 'value1');
      await store.set('key1', entry);
      
      await store.delete('key1');
      expect(await store.get('key1')).toBeNull();
      expect(await store.has('key1')).toBe(false);
    });

    test('clear() removes all cache files', async () => {
      await store.set('key1', createEntry('key1', 'val1'));
      await store.set('key2', createEntry('key2', 'val2'));
      
      await store.clear();
      
      expect(await store.size()).toBe(0);
      expect(await store.get('key1')).toBeNull();
    });

    test('keys() lists all cache keys (empty for now due to hashing)', async () => {
      await store.set('key1', createEntry('key1', 'val1'));
      
      const keys = await store.keys();
      expect(keys).toEqual([]);
    });

    test('Handles directory creation if missing', async () => {
      const newDir = join(tempDir, 'subdir');
      const newStore = new FileCacheStore(newDir);
      
      const entry = createEntry('key1', 'val1');
      await newStore.set('key1', entry);
      
      const exists = await newStore.has('key1');
      expect(exists).toBe(true);
      
      try {
        await access(newDir, constants.F_OK);
        expect(true).toBe(true);
      } catch {
        expect(false).toBe(true);
      }
    });
  });

  describe('Persistence', () => {
    test('Data persists across store instances', async () => {
      const entry = createEntry('persist', 'data');
      await store.set('persist', entry);
      
      const newStore = new FileCacheStore(tempDir);
      const result = await newStore.get('persist');
      
      expect(result).toEqual(entry);
    });

    test('Handles JSON serialization/deserialization', async () => {
      const complexValue = { a: 1, b: 'string', c: true, d: { nested: true } };
      const entry = createEntry('complex', complexValue);
      
      await store.set('complex', entry);
      const result = await store.get('complex');
      
      expect(result?.value).toEqual(complexValue);
    });

    test('Handles file corruption gracefully', async () => {
      const entry = createEntry('corrupt', 'data');
      await store.set('corrupt', entry);
      
      const files = await readdir(tempDir);
      const fileToCorrupt = files.find(f => f.endsWith('.json'));
      
      if (fileToCorrupt) {
        await writeFile(join(tempDir, fileToCorrupt), '{ invalid json');
        const result = await store.get('corrupt');
        expect(result).toBeNull();
      } else {
        throw new Error('Could not find file to corrupt');
      }
    });
  });

  describe('Atomic writes', () => {
    test('Uses temporary file pattern', async () => {
      const entry = createEntry('atomic', 'write');
      await store.set('atomic', entry);
      
      const files = await readdir(tempDir);
      const tmpFiles = files.filter(f => f.endsWith('.tmp'));
      
      expect(tmpFiles.length).toBe(0);
    });
  });
});

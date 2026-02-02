import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCacheManager } from '../../src/factories/index.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'cache-integration-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('Cache Manager - Integration Tests', () => {
  test('full workflow: set, get, eviction, stats', async () => {
    const cache = createCacheManager<string>({
      maxSize: 3,
      ttlMs: 1000,
    });

    await cache.set('prompt1', 'result1');
    await new Promise(resolve => setTimeout(resolve, 10));
    await cache.set('prompt2', 'result2');
    await new Promise(resolve => setTimeout(resolve, 10));
    await cache.set('prompt3', 'result3');
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(await cache.get('prompt1')).toBe('result1');
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(await cache.get('prompt2')).toBe('result2');
    await new Promise(resolve => setTimeout(resolve, 10));

    await cache.set('prompt4', 'result4');

    expect(await cache.get('prompt3')).toBeNull();
    expect(await cache.get('prompt4')).toBe('result4');

    const stats = await cache.getStats();
    expect(stats.hits).toBe(3);
    expect(stats.size).toBe(3);
    expect(stats.evictions).toBe(1);
  });

  test('L1/L2 integration with persistence', async () => {
    const config = {
      maxSize: 2,
      enableL2: true,
      l2Path: tempDir,
    };

    const cache1 = createCacheManager<string>(config);
    await cache1.set('persistent', 'data');

    const cache2 = createCacheManager<string>(config);
    
    const result = await cache2.get('persistent');
    expect(result).toBe('data');
  });

  test('pattern invalidation workflow', async () => {
    const cache = createCacheManager<string>({ maxSize: 100 });

    await cache.set('user:1:profile', 'alice');
    await cache.set('user:1:settings', 'prefs');
    await cache.set('user:2:profile', 'bob');

    const count = await cache.invalidate('user:1:*');
    expect(count).toBe(2);

    expect(await cache.get('user:1:profile')).toBeNull();
    expect(await cache.get('user:2:profile')).toBe('bob');
  });

  test('TTL expiration workflow', async () => {
    const cache = createCacheManager<string>({
      maxSize: 10,
      ttlMs: 100,
    });

    await cache.set('short-lived', 'data');
    
    expect(await cache.get('short-lived')).toBe('data');

    await new Promise(resolve => setTimeout(resolve, 150));

    expect(await cache.get('short-lived')).toBeNull();
  });

  test('concurrent operations stress test', async () => {
    const cache = createCacheManager<string>({ maxSize: 50 });

    await Promise.all([
      cache.set('key1', 'value1'),
      cache.set('key2', 'value2'),
      cache.set('key3', 'value3'),
    ]);

    const results = await Promise.all([
      cache.get('key1'),
      cache.get('key2'),
      cache.get('key3'),
    ]);

    expect(results).toEqual(['value1', 'value2', 'value3']);
  });

  test('fuzzy matching integration', async () => {
    const cache = createCacheManager<string>({
      maxSize: 10,
      fuzzyMatch: true,
      fuzzyThreshold: 0.85,
    });

    await cache.set('What is two plus two?', '4');

    const result = await cache.get('What is two plus 2?');
    expect(result).toBe('4');

    const resultExact = await cache.get('What is two plus two?');
    expect(resultExact).toBe('4');

    const resultMismatch = await cache.get('Something completely different');
    expect(resultMismatch).toBeNull();
  });
});

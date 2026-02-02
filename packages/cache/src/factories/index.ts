import { SemanticCacheKey } from '../implementations/cache-key.js';
import { TTLManagerImpl } from '../implementations/ttl-manager.js';
import { LRUPolicyImpl } from '../implementations/lru-policy.js';
import { LevenshteinSimilarityMatcher } from '../implementations/similarity-matcher.js';
import { MemoryCacheStore } from '../implementations/memory-store.js';
import { FileCacheStore } from '../implementations/file-store.js';
import { CacheManagerImpl } from '../implementations/cache-manager.js';
import type { CacheKey, TTLManager, LRUPolicy, TimeSource, SimilarityMatcher, CacheStore, CacheManager, CacheConfig } from '../interfaces/index.js';

export function createCacheKey(): CacheKey {
  return new SemanticCacheKey();
}

export function createTTLManager(timeSource?: TimeSource): TTLManager {
  return new TTLManagerImpl(timeSource);
}

export function createLRUPolicy(timeSource?: TimeSource): LRUPolicy {
  return new LRUPolicyImpl(timeSource);
}

export function createSimilarityMatcher(): SimilarityMatcher {
  return new LevenshteinSimilarityMatcher();
}

export function createMemoryStore<T>(): CacheStore<T> {
  return new MemoryCacheStore<T>();
}

export function createFileStore<T>(cacheDir: string): CacheStore<T> {
  return new FileCacheStore<T>(cacheDir);
}

export function createCacheManager<T>(config: CacheConfig): CacheManager<T> {
  const l1Store = createMemoryStore<T>();
  const l2Store = config.enableL2 && config.l2Path 
    ? createFileStore<T>(config.l2Path) 
    : undefined;

  return new CacheManagerImpl(
    config,
    l1Store,
    createCacheKey(),
    createTTLManager(),
    createLRUPolicy(),
    { now: () => Date.now() },
    l2Store,
    createSimilarityMatcher()
  );
}

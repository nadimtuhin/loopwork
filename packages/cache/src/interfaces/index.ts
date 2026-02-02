/**
 * Mockable time source for testing
 */
export interface TimeSource {
  now(): number;
}

/**
 * Metadata for a cached entry
 */
export interface CacheEntry<T> {
  /** Cache key */
  key: string;
  /** Cached value */
  value: T;
  /** Timestamp when cached */
  createdAt: number;
  /** Timestamp when expires (0 = never) */
  expiresAt: number;
  /** Last accessed timestamp for LRU tracking */
  lastAccessedAt: number;
  /** Optional custom metadata */
  metadata?: Record<string, any>;
}

/**
 * Key generation and normalization
 */
export interface CacheKey {
  /** Generate a semantic hash for the prompt */
  generate(prompt: string): string;
  /** Normalize prompt text (e.g., whitespace, casing) */
  normalize(prompt: string): string;
}

/**
 * Storage abstraction for cache entries
 */
export interface CacheStore<T> {
  /** Get an entry from storage */
  get(key: string): Promise<CacheEntry<T> | null>;
  /** Save an entry to storage */
  set(key: string, entry: CacheEntry<T>): Promise<void>;
  /** Check if a key exists */
  has(key: string): Promise<boolean>;
  /** Remove an entry */
  delete(key: string): Promise<void>;
  /** Clear all entries */
  clear(): Promise<void>;
  /** Get all keys */
  keys(): Promise<string[]>;
  /** Get total entry count */
  size(): Promise<number>;
}

/**
 * Time-to-live management
 */
export interface TTLManager {
  /** Check if an entry is expired */
  isExpired(entry: CacheEntry<any>): boolean;
  /** Calculate expiry timestamp based on TTL in milliseconds */
  calculateExpiry(ttlMs: number): number;
  /** Remove all expired entries from the store and return count */
  evictExpired(store: CacheStore<any>): Promise<number>;
}

/**
 * Generic eviction strategy
 */
export interface EvictionPolicy {
  /** Check if eviction is needed based on store size */
  shouldEvict(store: CacheStore<any>, maxSize: number): Promise<boolean>;
  /** Select the best candidate for eviction */
  selectVictim(store: CacheStore<any>): Promise<string | null>;
  /** Perform eviction and return number of evicted entries */
  evict(store: CacheStore<any>, maxSize: number): Promise<number>;
}

/**
 * Least Recently Used eviction policy
 */
export interface LRUPolicy extends EvictionPolicy {}

/**
 * Fuzzy matching for semantic cache
 */
export interface SimilarityMatcher {
  /** Find the most similar entry above the threshold */
  findSimilar(prompt: string, entries: CacheEntry<any>[], threshold: number): Promise<CacheEntry<any> | null>;
  /** Calculate similarity score between 0.0 and 1.0 */
  calculateSimilarity(prompt1: string, prompt2: string): number;
}

/**
 * Configuration for the cache manager
 */
export interface CacheConfig {
  /** Maximum number of entries (default: 1000) */
  maxSize?: number;
  /** Default TTL in milliseconds (default: 1 hour) */
  ttlMs?: number;
  /** Enable persistent L2 disk cache (default: false) */
  enableL2?: boolean;
  /** Directory path for L2 cache storage */
  l2Path?: string;
  /** Enable fuzzy/semantic matching (default: false) */
  fuzzyMatch?: boolean;
  /** Similarity threshold between 0.0 and 1.0 (default: 0.85) */
  fuzzyThreshold?: number;
  /** Eviction strategy (default: 'lru') */
  evictionPolicy?: 'lru' | 'fifo';
}

/**
 * Statistics for cache performance
 */
export interface CacheStats {
  /** Total cache hits */
  hits: number;
  /** Total cache misses */
  misses: number;
  /** Hit rate percentage (0-100) */
  hitRate: number;
  /** Current number of entries */
  size: number;
  /** Total number of evictions */
  evictions: number;
  /** Estimated cost or token savings */
  savings?: number;
}

/**
 * Main Cache Manager interface
 */
export interface CacheManager<T> {
  /** Get cached result for a prompt */
  get(prompt: string): Promise<T | null>;
  /** Cache a result for a prompt */
  set(prompt: string, value: T, ttlMs?: number): Promise<void>;
  /** Invalidate entries matching a glob pattern */
  invalidate(pattern: string): Promise<number>;
  /** Clear all cached data */
  clear(): Promise<void>;
  /** Get current performance statistics */
  getStats(): Promise<CacheStats>;
}

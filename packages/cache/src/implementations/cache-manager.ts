import type { 
  CacheManager, CacheConfig, CacheStats, CacheStore, CacheEntry,
  CacheKey, TTLManager, EvictionPolicy, TimeSource, SimilarityMatcher
} from '../interfaces/index.js';

export class CacheManagerImpl<T> implements CacheManager<T> {
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0
  };

  constructor(
    private config: CacheConfig,
    private l1Store: CacheStore<T>,
    private keyGen: CacheKey,
    private ttlManager: TTLManager,
    private evictionPolicy: EvictionPolicy,
    private timeSource: TimeSource = { now: () => Date.now() },
    private l2Store?: CacheStore<T>,
    private similarityMatcher?: SimilarityMatcher
  ) {}

  async get(prompt: string): Promise<T | null> {
    const key = this.keyGen.generate(prompt);

    let entry = await this.l1Store.get(key);
    
    if (entry) {
      if (this.ttlManager.isExpired(entry)) {
        await this.l1Store.delete(key);
        this.stats.misses++;
        return null;
      }
      
      entry.lastAccessedAt = this.timeSource.now();
      await this.l1Store.set(key, entry);
      this.stats.hits++;
      return entry.value;
    }

    if (this.l2Store) {
      entry = await this.l2Store.get(key);
      if (entry && !this.ttlManager.isExpired(entry)) {
        await this.l1Store.set(key, entry);
        this.stats.hits++;
        return entry.value;
      }
    }

    if (this.config.fuzzyMatch && this.similarityMatcher) {
      const keys = await this.l1Store.keys();
      const entries: CacheEntry<T>[] = [];
      for (const k of keys) {
        const e = await this.l1Store.get(k);
        if (e && !this.ttlManager.isExpired(e)) entries.push(e);
      }

      const threshold = this.config.fuzzyThreshold ?? 0.85;
      const similarEntry = await this.similarityMatcher.findSimilar(prompt, entries, threshold);
      
      if (similarEntry) {
        similarEntry.lastAccessedAt = this.timeSource.now();
        await this.l1Store.set(similarEntry.key, similarEntry);
        this.stats.hits++;
        return similarEntry.value;
      }
    }

    this.stats.misses++;
    return null;
  }

  async set(prompt: string, value: T, ttlMs?: number): Promise<void> {
    const key = this.keyGen.generate(prompt);
    const ttl = ttlMs ?? this.config.ttlMs ?? 3600000;
    const now = this.timeSource.now();

    const entry: CacheEntry<T> = {
      key,
      value,
      createdAt: now,
      expiresAt: this.ttlManager.calculateExpiry(ttl),
      lastAccessedAt: now,
      metadata: { prompt }
    };

    const maxSize = this.config.maxSize ?? 1000;
    if (await this.evictionPolicy.shouldEvict(this.l1Store, maxSize)) {
      const evicted = await this.evictionPolicy.evict(this.l1Store, maxSize);
      this.stats.evictions += evicted;
    }

    await this.l1Store.set(key, entry);

    if (this.l2Store && this.config.enableL2) {
      await this.l2Store.set(key, entry);
    }
  }

  async invalidate(pattern: string): Promise<number> {
    const keys = await this.l1Store.keys();
    let count = 0;

    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');

    for (const key of keys) {
      const entry = await this.l1Store.get(key);
      if (entry) {
        // Match against prompt if available in metadata
        const prompt = entry.metadata?.prompt;
        if ((prompt && regex.test(prompt)) || regex.test(key)) {
          await this.l1Store.delete(key);
          if (this.l2Store) await this.l2Store.delete(key);
          count++;
        }
      }
    }

    return count;
  }

  async clear(): Promise<void> {
    await this.l1Store.clear();
    if (this.l2Store) await this.l2Store.clear();
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }

  async getStats(): Promise<CacheStats> {
    const size = await this.l1Store.size();
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate,
      size,
      evictions: this.stats.evictions
    };
  }
}

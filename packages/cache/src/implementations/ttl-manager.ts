import type { TTLManager, CacheStore, CacheEntry, TimeSource } from '../interfaces/index.js';

export class TTLManagerImpl implements TTLManager {
  constructor(private timeSource: TimeSource = { now: () => Date.now() }) {}

  calculateExpiry(ttlMs: number): number {
    if (ttlMs === 0) return 0; // Never expires
    return this.timeSource.now() + ttlMs;
  }

  isExpired(entry: CacheEntry<any>): boolean {
    if (entry.expiresAt === 0) return false; // Never expires
    return this.timeSource.now() >= entry.expiresAt;
  }

  async evictExpired(store: CacheStore<any>): Promise<number> {
    const keys = await store.keys();
    let evictedCount = 0;

    for (const key of keys) {
      const entry = await store.get(key);
      if (entry && this.isExpired(entry)) {
        await store.delete(key);
        evictedCount++;
      }
    }

    return evictedCount;
  }
}

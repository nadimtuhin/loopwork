import type { LRUPolicy, CacheStore, TimeSource } from '../interfaces/index.js';

export class LRUPolicyImpl implements LRUPolicy {
  constructor(private timeSource: TimeSource = { now: () => Date.now() }) {}

  async shouldEvict(store: CacheStore<any>, maxSize: number): Promise<boolean> {
    const size = await store.size();
    return size >= maxSize;
  }

  async selectVictim(store: CacheStore<any>): Promise<string | null> {
    const keys = await store.keys();
    if (keys.length === 0) return null;

    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const key of keys) {
      const entry = await store.get(key);
      if (entry && entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt;
        oldestKey = key;
      }
    }

    return oldestKey;
  }

  async evict(store: CacheStore<any>, maxSize: number): Promise<number> {
    let evictedCount = 0;

    while (await this.shouldEvict(store, maxSize)) {
      const victim = await this.selectVictim(store);
      if (!victim) break; // No more entries to evict

      await store.delete(victim);
      evictedCount++;
    }

    return evictedCount;
  }
}

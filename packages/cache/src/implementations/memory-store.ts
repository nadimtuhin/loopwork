import type { CacheStore, CacheEntry } from '../interfaces/index.js';

export class MemoryCacheStore<T> implements CacheStore<T> {
  private store = new Map<string, CacheEntry<T>>();

  async get(key: string): Promise<CacheEntry<T> | null> {
    return this.store.get(key) || null;
  }

  async set(key: string, entry: CacheEntry<T>): Promise<void> {
    this.store.set(key, entry);
  }

  async has(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  async keys(): Promise<string[]> {
    return Array.from(this.store.keys());
  }

  async size(): Promise<number> {
    return this.store.size;
  }
}

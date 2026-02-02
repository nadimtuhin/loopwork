import { readFile, writeFile, unlink, readdir, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { CacheStore, CacheEntry } from '../interfaces/index.js';

export class FileCacheStore<T> implements CacheStore<T> {
  constructor(private cacheDir: string) {}

  private getFilePath(key: string): string {
    const hash = createHash('sha256').update(key).digest('hex');
    return join(this.cacheDir, `${hash}.json`);
  }

  async get(key: string): Promise<CacheEntry<T> | null> {
    try {
      const filePath = this.getFilePath(key);
      const data = await readFile(filePath, 'utf-8');
      return JSON.parse(data) as CacheEntry<T>;
    } catch (error) {
      return null;
    }
  }

  async set(key: string, entry: CacheEntry<T>): Promise<void> {
    const filePath = this.getFilePath(key);
    const tempPath = `${filePath}.tmp`;

    await mkdir(this.cacheDir, { recursive: true });

    await writeFile(tempPath, JSON.stringify(entry), 'utf-8');
    await rename(tempPath, filePath);
  }

  async has(key: string): Promise<boolean> {
    try {
      const filePath = this.getFilePath(key);
      await readFile(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const filePath = this.getFilePath(key);
      await unlink(filePath);
    } catch {
    }
  }

  async clear(): Promise<void> {
    try {
      const files = await readdir(this.cacheDir);
      await Promise.all(
        files
          .filter(f => f.endsWith('.json'))
          .map(f => unlink(join(this.cacheDir, f)))
      );
    } catch {
    }
  }

  async keys(): Promise<string[]> {
    try {
      return [];
    } catch {
      return [];
    }
  }

  async size(): Promise<number> {
    try {
      const files = await readdir(this.cacheDir);
      return files.filter(f => f.endsWith('.json')).length;
    } catch {
      return 0;
    }
  }
}

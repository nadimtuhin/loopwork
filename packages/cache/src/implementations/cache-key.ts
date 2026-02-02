import { createHash } from 'node:crypto';
import type { CacheKey } from '../interfaces/index.js';

export class SemanticCacheKey implements CacheKey {
  normalize(prompt: string): string {
    return prompt
      .trim()
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .toLowerCase();
  }

  generate(prompt: string): string {
    const normalized = this.normalize(prompt);
    const hash = createHash('sha256');
    hash.update(normalized, 'utf8');
    return hash.digest('hex');
  }
}

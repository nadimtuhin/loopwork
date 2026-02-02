import { describe, test, expect } from 'bun:test';
import { createCacheKey } from '../../src/factories/index.js';

describe('CacheKey - Normalization', () => {
  test('trims leading and trailing whitespace', () => {
    const cacheKey = createCacheKey();
    const result = cacheKey.normalize('  hello world  ');
    expect(result).toBe('hello world');
  });

  test('collapses multiple spaces to single space', () => {
    const cacheKey = createCacheKey();
    const result = cacheKey.normalize('hello    world');
    expect(result).toBe('hello world');
  });

  test('normalizes line endings (CRLF -> LF)', () => {
    const cacheKey = createCacheKey();
    const result = cacheKey.normalize('hello\r\nworld');
    expect(result).toBe('hello\nworld');
  });

  test('converts to lowercase (design decision)', () => {
    const cacheKey = createCacheKey();
    const result = cacheKey.normalize('Hello World');
    expect(result).toBe('hello world');
  });

  test('handles empty strings', () => {
    const cacheKey = createCacheKey();
    const result = cacheKey.normalize('');
    expect(result).toBe('');
  });
});

describe('CacheKey - Hash Generation', () => {
  test('generates consistent hashes for identical prompts', () => {
    const cacheKey = createCacheKey();
    const hash1 = cacheKey.generate('hello world');
    const hash2 = cacheKey.generate('hello world');
    expect(hash1).toBe(hash2);
  });

  test('generates different hashes for different prompts', () => {
    const cacheKey = createCacheKey();
    const hash1 = cacheKey.generate('hello world');
    const hash2 = cacheKey.generate('goodbye world');
    expect(hash1).not.toBe(hash2);
  });

  test('generates same hash after normalization', () => {
    const cacheKey = createCacheKey();
    const hash1 = cacheKey.generate('Hello  World');
    const hash2 = cacheKey.generate('hello world');
    expect(hash1).toBe(hash2);
  });

  test('generates SHA-256 hash (64 character hex)', () => {
    const cacheKey = createCacheKey();
    const hash = cacheKey.generate('test');
    expect(hash.length).toBe(64);
    expect(/^[a-f0-9]{64}$/.test(hash)).toBe(true);
  });

  test('returns hex encoding (lowercase)', () => {
    const cacheKey = createCacheKey();
    const hash = cacheKey.generate('Test');
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });
});

describe('CacheKey - Edge Cases', () => {
  test('handles very long prompts', () => {
    const cacheKey = createCacheKey();
    const longPrompt = 'a'.repeat(10000);
    const hash = cacheKey.generate(longPrompt);
    expect(hash.length).toBe(64); // Hash length is constant
  });

  test('handles unicode characters', () => {
    const cacheKey = createCacheKey();
    const prompt = 'Hello 🌍';
    const hash = cacheKey.generate(prompt);
    expect(hash.length).toBe(64);
  });

  test('handles special characters', () => {
    const cacheKey = createCacheKey();
    const prompt = 'Hello\tWorld\n"Test"';
    const hash = cacheKey.generate(prompt);
    expect(hash.length).toBe(64);
  });
});

import { describe, test, expect } from 'bun:test';
import { createSimilarityMatcher } from '../../src/factories/index.js';

describe('SimilarityMatcher - Similarity Calculation', () => {
  test('identical strings return 1.0', () => {
    const matcher = createSimilarityMatcher();
    const score = matcher.calculateSimilarity('hello world', 'hello world');
    expect(score).toBe(1.0);
  });

  test('completely different strings return low score', () => {
    const matcher = createSimilarityMatcher();
    const score = matcher.calculateSimilarity('hello', 'xyz');
    expect(score).toBeLessThan(0.5);
  });

  test('similar strings return score between 0 and 1', () => {
    const matcher = createSimilarityMatcher();
    const score = matcher.calculateSimilarity('hello world', 'hello word');
    expect(score).toBeGreaterThan(0.8);
    expect(score).toBeLessThan(1.0);
  });

  test('case-insensitive comparison', () => {
    const matcher = createSimilarityMatcher();
    const score = matcher.calculateSimilarity('Hello World', 'hello world');
    expect(score).toBe(1.0);
  });

  test('normalizes whitespace before comparison', () => {
    const matcher = createSimilarityMatcher();
    const score = matcher.calculateSimilarity('hello  world', 'hello world');
    expect(score).toBe(1.0);
  });

  test('handles empty strings', () => {
    const matcher = createSimilarityMatcher();
    expect(matcher.calculateSimilarity('', 'hello')).toBe(0.0);
    expect(matcher.calculateSimilarity('hello', '')).toBe(0.0);
    expect(matcher.calculateSimilarity('', '')).toBe(0.0);
  });

  test('handles unicode characters', () => {
    const matcher = createSimilarityMatcher();
    const score = matcher.calculateSimilarity('café', 'cafe');
    expect(score).toBeGreaterThan(0.5);
    expect(matcher.calculateSimilarity('👍', '👍')).toBe(1.0);
  });

  test('handles long strings reasonably', () => {
    const matcher = createSimilarityMatcher();
    const long1 = 'a'.repeat(1000);
    const long2 = 'a'.repeat(999) + 'b';
    const score = matcher.calculateSimilarity(long1, long2);
    expect(score).toBeGreaterThan(0.99);
  });
});

describe('SimilarityMatcher - Finding Similar Entries', () => {
  test('finds exact match above threshold', async () => {
    const matcher = createSimilarityMatcher();
    const entries = [
      { key: 'k1', value: 'result1', metadata: { prompt: 'hello world' }, createdAt: 1000, expiresAt: 0, lastAccessedAt: 1000 },
      { key: 'k2', value: 'result2', metadata: { prompt: 'goodbye world' }, createdAt: 1000, expiresAt: 0, lastAccessedAt: 1000 }
    ];

    const result = await matcher.findSimilar('hello world', entries, 0.9);
    expect(result).not.toBeNull();
    expect(result?.key).toBe('k1');
  });

  test('finds similar entry above threshold', async () => {
    const matcher = createSimilarityMatcher();
    const entries = [
      { key: 'k1', value: 'result1', metadata: { prompt: 'hello word' }, createdAt: 1000, expiresAt: 0, lastAccessedAt: 1000 }
    ];

    const result = await matcher.findSimilar('hello world', entries, 0.8);
    expect(result).not.toBeNull();
    expect(result?.key).toBe('k1');
  });

  test('returns null if no entries above threshold', async () => {
    const matcher = createSimilarityMatcher();
    const entries = [
      { key: 'k1', value: 'result1', metadata: { prompt: 'hello world' }, createdAt: 1000, expiresAt: 0, lastAccessedAt: 1000 }
    ];

    const result = await matcher.findSimilar('completely different', entries, 0.9);
    expect(result).toBeNull();
  });

  test('returns null for empty entries array', async () => {
    const matcher = createSimilarityMatcher();
    const result = await matcher.findSimilar('test', [], 0.5);
    expect(result).toBeNull();
  });

  test('returns best match when multiple candidates exist', async () => {
    const matcher = createSimilarityMatcher();
    const entries = [
      { key: 'k1', value: 'result1', metadata: { prompt: 'hello world' }, createdAt: 1000, expiresAt: 0, lastAccessedAt: 1000 },
      { key: 'k2', value: 'result2', metadata: { prompt: 'hello word' }, createdAt: 1000, expiresAt: 0, lastAccessedAt: 1000 },
      { key: 'k3', value: 'result3', metadata: { prompt: 'goodbye world' }, createdAt: 1000, expiresAt: 0, lastAccessedAt: 1000 }
    ];

    const result = await matcher.findSimilar('hello world', entries, 0.8);
    expect(result?.key).toBe('k1'); // Exact match
  });

  test('respects threshold boundary', async () => {
    const matcher = createSimilarityMatcher();
    const entries = [
      { key: 'k1', value: 'result1', metadata: { prompt: 'hello' }, createdAt: 1000, expiresAt: 0, lastAccessedAt: 1000 }
    ];

    // 'hello' vs 'hallo' is 4/5 = 0.8 similarity (1 sub)
    // Actually Levenshtein distance is 1. Max length 5. 1 - 1/5 = 0.8.
    
    // If threshold is 0.85, it should fail
    const resultStrict = await matcher.findSimilar('hallo', entries, 0.85);
    expect(resultStrict).toBeNull();

    // If threshold is 0.75, it should pass
    const resultLoose = await matcher.findSimilar('hallo', entries, 0.75);
    expect(resultLoose).not.toBeNull();
  });

  test('uses normalized prompts for comparison', async () => {
     const matcher = createSimilarityMatcher();
    const entries = [
      { key: 'k1', value: 'result1', metadata: { prompt: 'Hello  World' }, createdAt: 1000, expiresAt: 0, lastAccessedAt: 1000 }
    ];

    const result = await matcher.findSimilar('hello world', entries, 0.99);
    expect(result).not.toBeNull();
    expect(result?.key).toBe('k1');
  });
});

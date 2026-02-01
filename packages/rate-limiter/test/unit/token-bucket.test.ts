import { describe, test, expect } from 'bun:test';
import { createTokenBucket } from '../../src/factories';

describe('TokenBucket', () => {
  test('should allow request when tokens available', () => {
    // RED: This will fail because createTokenBucket is not implemented yet
    const bucket = createTokenBucket({ capacity: 10, refillRate: 1 });
    expect(bucket.consume(1)).toBe(true);
  });

  test('should deny request when no tokens available', () => {
    // RED: Implementation always returns true currently
    const bucket = createTokenBucket({ capacity: 1, refillRate: 1 });
    bucket.consume(1); // Consumes the only token
    expect(bucket.consume(1)).toBe(false);
  });

  test('should refill tokens over time', () => {
    let currentTime = 1000;
    const timeSource = { now: () => currentTime };
    // RED: Factory does not accept timeSource yet
    // @ts-ignore
    const bucket = createTokenBucket({ capacity: 10, refillRate: 1 }, timeSource);

    // Consume all tokens
    expect(bucket.consume(10)).toBe(true);
    expect(bucket.consume(1)).toBe(false);

    // Advance time by 1 second
    currentTime += 1000;
    
    // Should have 1 token now
    expect(bucket.consume(1)).toBe(true);
  });

  test('should not exceed max capacity', () => {
    let currentTime = 0;
    const timeSource = { now: () => currentTime };
    const bucket = createTokenBucket({ capacity: 10, refillRate: 1 }, timeSource);

    // Advance time by 100 seconds
    currentTime += 100000;
    
    // Should still only have 10 tokens (max capacity)
    expect(bucket.getTokens()).toBe(10);
    expect(bucket.consume(10)).toBe(true);
    expect(bucket.consume(1)).toBe(false);
  });

  test('should handle burst capacity', () => {
    const bucket = createTokenBucket({ capacity: 5, refillRate: 1 });
    // Burst consume
    expect(bucket.consume(5)).toBe(true);
    // Next one fails
    expect(bucket.consume(1)).toBe(false);
  });

  test('should handle fractional tokens correctly', () => {
    let currentTime = 0;
    const timeSource = { now: () => currentTime };
    const bucket = createTokenBucket({ capacity: 10, refillRate: 1 }, timeSource);

    // Empty bucket
    bucket.consume(10);
    expect(bucket.consume(1)).toBe(false);

    // Advance 0.5 seconds (0.5 tokens)
    currentTime += 500;
    expect(bucket.getTokens()).toBe(0.5);
    expect(bucket.consume(1)).toBe(false); // Cannot consume 1

    // Advance another 0.5 seconds (total 1 token)
    currentTime += 500;
    expect(bucket.getTokens()).toBe(1);
    expect(bucket.consume(1)).toBe(true);
  });

  test('should support custom refill rates', () => {
    let currentTime = 0;
    const timeSource = { now: () => currentTime };
    // 10 tokens per second
    const bucket = createTokenBucket({ capacity: 20, refillRate: 10 }, timeSource);

    bucket.consume(20); // Empty

    // Advance 0.1 seconds (should get 1 token)
    currentTime += 100;
    expect(bucket.getTokens()).toBe(1);
    expect(bucket.consume(1)).toBe(true);
  });
});

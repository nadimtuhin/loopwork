import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { RateLimitDetector } from '../../src/implementations/rate-limit-detector';
import { TokenBucket, SlidingWindow, DetectorConfig } from '../../src/interfaces';

describe('RateLimitDetector', () => {
  let detector: RateLimitDetector;
  let mockTokenBucket: TokenBucket;
  let mockSlidingWindow: SlidingWindow;

  const defaultConfig: DetectorConfig = {
    threshold: 0.8,
    backoffStrategy: 'exponential',
    baseDelay: 1000
  };

  beforeEach(() => {
    mockTokenBucket = {
      capacity: 10,
      refillRate: 1,
      consume: mock(() => true),
      getTokens: mock(() => 10),
    } as unknown as TokenBucket;

    mockSlidingWindow = {
      windowMs: 60000,
      limit: 100,
      allow: mock(() => true),
      getCount: mock(() => 0),
    } as unknown as SlidingWindow;

    detector = new RateLimitDetector(mockTokenBucket, mockSlidingWindow, defaultConfig);
  });

  test('should detect when approaching rate limit (80% threshold)', () => {
    // Setup: 85 used out of 100 limit (85%)
    mockSlidingWindow.getCount = mock(() => 85);
    mockSlidingWindow.limit = 100;
    
    // Also set token bucket to something safe
    mockTokenBucket.getTokens = mock(() => 5);
    mockTokenBucket.capacity = 10;

    const decision = detector.checkLimit();

    expect(decision.allowed).toBe(true);
    expect(decision.approachingLimit).toBe(true);
    expect(decision.currentUsage).toBe(85);
    expect(decision.limit).toBe(100);
  });

  test('should not flag approaching limit when usage is low', () => {
    // Setup: 50 used out of 100 limit (50%)
    mockSlidingWindow.getCount = mock(() => 50);
    
    const decision = detector.checkLimit();
    
    expect(decision.allowed).toBe(true);
    expect(decision.approachingLimit).toBe(false);
  });

  test('should calculate exponential backoff', () => {
    // Force failure
    mockTokenBucket.consume = mock(() => false);
    
    // First failure
    let decision = detector.checkLimit();
    expect(decision.allowed).toBe(false);
    expect(decision.retryAfter).toBe(1000); // baseDelay * 2^0
    
    // Second failure
    decision = detector.checkLimit();
    expect(decision.retryAfter).toBe(2000); // baseDelay * 2^1
    
    // Third failure
    decision = detector.checkLimit();
    expect(decision.retryAfter).toBe(4000); // baseDelay * 2^2
  });

  test('should calculate linear backoff', () => {
    const linearConfig: DetectorConfig = { ...defaultConfig, backoffStrategy: 'linear' };
    detector = new RateLimitDetector(mockTokenBucket, mockSlidingWindow, linearConfig);
    
    mockTokenBucket.consume = mock(() => false);
    
    // First failure
    let decision = detector.checkLimit();
    expect(decision.retryAfter).toBe(1000); // baseDelay * 1
    
    // Second failure
    decision = detector.checkLimit();
    expect(decision.retryAfter).toBe(2000); // baseDelay * 2
    
    // Third failure
    decision = detector.checkLimit();
    expect(decision.retryAfter).toBe(3000); // baseDelay * 3
  });

  test('should reset backoff after successful check', () => {
    mockTokenBucket.consume = mock(() => false);
    
    // Fail once
    detector.checkLimit();
    
    // Succeed
    mockTokenBucket.consume = mock(() => true);
    detector.checkLimit();
    
    // Fail again - should start from beginning
    mockTokenBucket.consume = mock(() => false);
    const decision = detector.checkLimit();
    expect(decision.retryAfter).toBe(1000);
  });

  test('should detect burst limit (TokenBucket failure)', () => {
    mockTokenBucket.consume = mock(() => false);
    mockSlidingWindow.allow = mock(() => true);
    
    const decision = detector.checkLimit();
    
    expect(decision.allowed).toBe(false);
    expect(mockTokenBucket.consume).toHaveBeenCalled();
  });

  test('should detect sustained limit (SlidingWindow failure)', () => {
    mockTokenBucket.consume = mock(() => true);
    mockSlidingWindow.allow = mock(() => false);
    
    const decision = detector.checkLimit();
    
    expect(decision.allowed).toBe(false);
    expect(mockSlidingWindow.allow).toHaveBeenCalled();
  });

  test('should calculate adaptive backoff based on token refill', () => {
    const adaptiveConfig: DetectorConfig = { ...defaultConfig, backoffStrategy: 'adaptive' };
    detector = new RateLimitDetector(mockTokenBucket, mockSlidingWindow, adaptiveConfig);
    
    mockTokenBucket.consume = mock(() => false);
    mockTokenBucket.getTokens = mock(() => 0);
    mockTokenBucket.refillRate = 2; // 2 tokens per second
    
    // Needs 1 token, has 0, refills at 2/sec -> needs 0.5s -> 500ms
    const decision = detector.checkLimit();
    
    // We expect it to calculate time needed for 1 token
    expect(decision.retryAfter).toBe(500); 
  });

  test('should provide detailed limit state', () => {
    mockSlidingWindow.getCount = mock(() => 42);
    mockSlidingWindow.limit = 100;
    
    const decision = detector.checkLimit();
    
    expect(decision.currentUsage).toBe(42);
    expect(decision.limit).toBe(100);
  });
});

import { 
  TokenBucket, 
  SlidingWindow, 
  RateLimitDecision, 
  DetectorConfig 
} from '../interfaces';

export class RateLimitDetector {
  private consecutiveFailures = 0;

  constructor(
    private tokenBucket: TokenBucket,
    private slidingWindow: SlidingWindow,
    private config: DetectorConfig
  ) {}

  checkLimit(): RateLimitDecision {
    const limit = this.slidingWindow.limit;
    const currentUsage = this.slidingWindow.getCount();
    
    // Check threshold for approaching limit
    const threshold = this.config.threshold ?? 0.8;
    const approachingLimit = (currentUsage / limit) >= threshold;

    // Check TokenBucket (burst capacity)
    if (!this.tokenBucket.consume(1)) {
      this.consecutiveFailures++;
      return {
        allowed: false,
        retryAfter: this.calculateBackoff('token'),
        currentUsage,
        limit,
        approachingLimit
      };
    }

    // Check SlidingWindow (sustained rate)
    if (!this.slidingWindow.allow()) {
      this.consecutiveFailures++;
      return {
        allowed: false,
        retryAfter: this.calculateBackoff('window'),
        currentUsage,
        limit,
        approachingLimit
      };
    }

    // Success
    this.consecutiveFailures = 0;
    return {
      allowed: true,
      currentUsage: this.slidingWindow.getCount(), // Update count after allow()
      limit,
      approachingLimit: (this.slidingWindow.getCount() / limit) >= threshold
    };
  }

  private calculateBackoff(source: 'token' | 'window'): number {
    const strategy = this.config.backoffStrategy ?? 'exponential';
    const baseDelay = this.config.baseDelay ?? 1000;
    const failures = this.consecutiveFailures;

    if (strategy === 'adaptive') {
      if (source === 'token') {
        const currentTokens = this.tokenBucket.getTokens();
        if (currentTokens < 1) {
           // Calculate time to refill 1 token
           // refillRate is tokens per second
           // needed: 1 - currentTokens
           // time = amount / rate
           const needed = 1 - currentTokens;
           const secondsNeeded = needed / this.tokenBucket.refillRate;
           return Math.ceil(secondsNeeded * 1000);
        }
      }
      // Fallback for window or weird state
      return baseDelay * failures;
    }

    if (strategy === 'linear') {
      return baseDelay * failures;
    }

    // Exponential (default)
    // 1st failure: 2^0 * base = 1 * base
    // 2nd failure: 2^1 * base = 2 * base
    return baseDelay * Math.pow(2, failures - 1);
  }
}

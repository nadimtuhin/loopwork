import { TokenBucket } from '../interfaces';

export interface TokenBucketConfig {
  capacity: number;
  refillRate: number;
}

export interface TimeSource {
  now(): number;
}

export class TokenBucketImpl implements TokenBucket {
  capacity: number;
  refillRate: number;
  private tokens: number;
  private lastRefill: number;
  private timeSource: TimeSource;

  constructor(config: TokenBucketConfig, timeSource: TimeSource = { now: () => Date.now() }) {
    this.capacity = config.capacity;
    this.refillRate = config.refillRate;
    this.tokens = config.capacity;
    this.timeSource = timeSource;
    this.lastRefill = this.timeSource.now();
  }

  consume(tokens: number): boolean {
    this.refill();
    
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    return false;
  }

  getTokens(): number {
    this.refill();
    return this.tokens;
  }

  private refill(): void {
    const now = this.timeSource.now();
    const elapsed = now - this.lastRefill;
    
    // refillRate is tokens per second, elapsed is ms
    const tokensToAdd = (elapsed * this.refillRate) / 1000;
    
    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }
}

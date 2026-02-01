import { RateLimitDecision, DetectorConfig } from '../interfaces';
import { RateLimitDetector } from './rate-limit-detector';
import { TokenBucketImpl } from './token-bucket';
import { SlidingWindowImpl } from './sliding-window';

export interface ProviderConfig {
  requestsPerMinute: number;
  tokensPerMinute: number;
}

export class ProviderManager {
  private detectors: Map<string, RateLimitDetector> = new Map();

  addProvider(name: string, config: ProviderConfig, detectorConfig: DetectorConfig = {}): void {
    const tokenBucket = new TokenBucketImpl({
      capacity: config.requestsPerMinute,
      refillRate: config.requestsPerMinute / 60,
    });

    const slidingWindow = new SlidingWindowImpl({
      limit: config.requestsPerMinute,
      windowMs: 60000,
    });

    const detector = new RateLimitDetector(tokenBucket, slidingWindow, detectorConfig);
    this.detectors.set(name, detector);
  }

  checkLimit(name: string): RateLimitDecision {
    const detector = this.detectors.get(name);
    if (!detector) {
      return {
        allowed: true,
        currentUsage: 0,
        limit: 0,
      };
    }

    return detector.checkLimit();
  }
}

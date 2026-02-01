import { TokenBucket, SlidingWindow, DetectorConfig, RateLimitStorage } from '../interfaces';
import { TokenBucketImpl } from '../implementations/token-bucket';
import type { TokenBucketConfig, TimeSource } from '../implementations/token-bucket';
import { SlidingWindowImpl } from '../implementations/sliding-window';
import type { SlidingWindowConfig } from '../implementations/sliding-window';
import { RateLimitDetector } from '../implementations/rate-limit-detector';
import { MemoryStorage } from '../implementations/memory-storage';
import { FileStorage } from '../implementations/file-storage';
import { ProviderManager } from '../implementations/provider-manager';

export * from '../interfaces';
export { RateLimitDetector, MemoryStorage, FileStorage, ProviderManager };
export type { TokenBucketConfig, TimeSource, SlidingWindowConfig };

export function createProviderManager(): ProviderManager {
  return new ProviderManager();
}

export function createTokenBucket(config: TokenBucketConfig, timeSource?: TimeSource): TokenBucket {
  return new TokenBucketImpl(config, timeSource);
}

export function createSlidingWindow(config: SlidingWindowConfig, timeSource?: TimeSource): SlidingWindow {
  return new SlidingWindowImpl(config, timeSource);
}

export function createRateLimitDetector(
  tokenBucket: TokenBucket,
  slidingWindow: SlidingWindow,
  config: DetectorConfig
): RateLimitDetector {
  return new RateLimitDetector(tokenBucket, slidingWindow, config);
}

export function createMemoryStorage(): RateLimitStorage {
  return new MemoryStorage();
}

export function createFileStorage(filePath: string): RateLimitStorage {
  return new FileStorage(filePath);
}

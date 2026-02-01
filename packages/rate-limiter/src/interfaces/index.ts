/**
 * Decision returned by the rate limiter for a specific request.
 */
export interface RateLimitDecision {
  /**
   * Whether the request is allowed to proceed.
   */
  allowed: boolean;
  /**
   * Optional number of seconds to wait before retrying if blocked.
   */
  retryAfter?: number;
  /**
   * Current usage count for the provider.
   */
  currentUsage: number;
  /**
   * Total limit allowed for the provider.
   */
  limit: number;
  /**
   * Whether the usage is approaching the limit (e.g., > 80%).
   */
  approachingLimit?: boolean;
}

/**
 * Configuration for the RateLimitDetector.
 */
export interface DetectorConfig {
  /**
   * Threshold percentage to flag approaching limit (0.0 to 1.0).
   * Default: 0.8
   */
  threshold?: number;
  /**
   * Strategy for calculating backoff time.
   * Default: 'exponential'
   */
  backoffStrategy?: 'exponential' | 'linear' | 'adaptive';
  /**
   * Base delay in milliseconds for backoff calculation.
   * Default: 1000
   */
  baseDelay?: number;
}

/**
 * Current state tracking for a rate-limited provider.
 */
export interface RateLimitState {
  /**
   * Provider identifier (e.g., 'claude', 'openai').
   */
  provider: string;
  /**
   * Current number of tokens/requests used.
   */
  used: number;
  /**
   * Timestamp of the last request.
   */
  lastRequest: number;
  /**
   * Additional metadata for the state.
   */
  metadata?: Record<string, any>;
}

/**
 * Configuration for rate limiting.
 */
export interface RateLimitConfig {
  /**
   * Maximum requests allowed in the time window.
   */
  limit: number;
  /**
   * Time window in milliseconds.
   */
  windowMs: number;
  /**
   * Whether to enable automatic backoff.
   */
  enableBackoff?: boolean;
}

/**
 * Interface for rate limit storage abstractions.
 */
export interface RateLimitStorage {
  /**
   * Get current state for a provider.
   */
  getState(provider: string): Promise<RateLimitState | null>;
  /**
   * Set state for a provider.
   */
  setState(provider: string, state: RateLimitState): Promise<void>;
  /**
   * Reset state for a provider.
   */
  reset(provider: string): Promise<void>;
}

/**
 * Interface for provider-specific limits.
 */
export interface RateLimitProvider {
  /**
   * Unique name of the provider.
   */
  name: string;
  /**
   * Configuration for the provider.
   */
  config: RateLimitConfig;
}

/**
 * Main rate limiting interface.
 */
export interface RateLimiter {
  /**
   * Check if a request for a provider is allowed.
   */
  checkLimit(provider: string): Promise<RateLimitDecision>;
  /**
   * Record a successful request for a provider.
   */
  recordRequest(provider: string): Promise<void>;
  /**
   * Get current state for a provider.
   */
  getState(provider: string): Promise<RateLimitState | null>;
  /**
   * Reset state for a provider.
   */
  reset(provider: string): Promise<void>;
}

/**
 * Token bucket algorithm interface.
 */
export interface TokenBucket {
  /**
   * Maximum capacity of the bucket.
   */
  capacity: number;
  /**
   * Rate at which tokens are added (tokens per second).
   */
  refillRate: number;
  /**
   * Try to consume a specific number of tokens.
   */
  consume(tokens: number): boolean;
  /**
   * Get current token count.
   */
  getTokens(): number;
}

/**
 * Sliding window algorithm interface.
 */
export interface SlidingWindow {
  /**
   * Time window in milliseconds.
   */
  windowMs: number;
  /**
   * Maximum requests allowed in the window.
   */
  limit: number;
  /**
   * Check if a request is allowed in the current window.
   */
  allow(): boolean;
  /**
   * Get current request count in the window.
   */
  getCount(): number;
}

import {
  IRetryStrategy
} from '@loopwork-ai/contracts'
import { isRateLimitError, RetryableError, DEFAULT_RATE_LIMIT_WAIT_MS } from './rate-limit'

export type { RetryableError }

/**
 * Options for the standard retry strategy
 */
export interface RetryOptions {
  /** Maximum number of attempts (including initial) */
  maxAttempts: number
  /** Whether to retry on rate limit errors (default: true) */
  retryOnRateLimit?: boolean
  /** Whether to retry on transient errors (default: true) */
  retryOnTransient?: boolean
  /** Whether to retry on all errors (default: false) */
  retryOnAllErrors?: boolean
  /** Custom error message patterns to retry on */
  retryableErrors?: string[]
  /** Wait time when rate limit is detected (default: 30000ms) */
  rateLimitWaitMs?: number
  /** Optional delay strategy function */
  delayStrategy?: (attempt: number) => number
}

/**
 * Default retry options
 */
export const DEFAULT_RETRY_OPTIONS: Partial<RetryOptions> = {
  maxAttempts: 3,
  retryOnRateLimit: true,
  retryOnTransient: true,
  retryOnAllErrors: false,
  rateLimitWaitMs: DEFAULT_RATE_LIMIT_WAIT_MS,
}

/**
 * Checks if an error is retryable based on the provided options
 */
export function isRetryable(
  error: unknown,
  options: Partial<RetryOptions>,
): boolean {
  const {
    retryOnRateLimit,
    retryOnTransient,
    retryOnAllErrors,
    retryableErrors,
  } = options

  if (!error) {
    return false
  }

  if (retryOnAllErrors) {
    return true
  }

  const err = error as Record<string, unknown>
  const errorMessage = (typeof error === 'string' ? error : String(err.message || '')).toLowerCase()
  const errorCode = typeof error === 'object' && error !== null && 'code' in err ? String(err.code).toLowerCase() : undefined

  if (retryableErrors && retryableErrors.length > 0) {
    if (retryableErrors.some(pattern => errorMessage.includes(pattern.toLowerCase()))) {
      return true
    }
    if (errorCode && retryableErrors.some(pattern => errorCode === pattern.toLowerCase())) {
      return true
    }
  }

  if (isRateLimitError(error)) {
    return retryOnRateLimit ?? true
  }

  if (retryOnTransient) {
    const transientErrors = [
      'econnreset',
      'etimeout',
      'connection refused',
      'connection reset',
      'network error',
      'network unreachable',
      'enotfound',
      'socket hang up',
      'internal server error',
      '500',
      '502',
      '503',
      '504',
      'eai_again',
      'econnrefused',
      'etimedout',
      '408',
      'gateway timeout',
      'bad gateway',
      'service unavailable',
      'timeout', // Generic timeout
    ]

    const isTransientMessage = transientErrors.some((transient) => errorMessage.includes(transient))
    const isTransientCode = errorCode && transientErrors.some((transient) => errorCode === transient)

    return Boolean(isTransientMessage || isTransientCode)
  }

  return false
}

/**
 * Standard Retry Strategy
 *
 * Implements IRetryStrategy interface with support for rate limits,
 * transient errors, and configurable max attempts.
 */
export class StandardRetryStrategy implements IRetryStrategy {
  constructor(private options: RetryOptions) {}

  getMaxAttempts(): number {
    return this.options.maxAttempts
  }

  /**
   * Determines if the operation should be retried based on current attempt
   * and the error that occurred.
   */
  shouldRetry(attempt: number, error: Error): boolean {
    if (attempt >= this.options.maxAttempts) {
      return false
    }

    return isRetryable(error, this.options)
  }
}

/**
 * Factory function to create a standard retry strategy
 */
export function standardRetry(options: RetryOptions): StandardRetryStrategy {
  return new StandardRetryStrategy(options)
}

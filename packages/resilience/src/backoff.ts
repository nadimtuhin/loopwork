import { IBackoffPolicy } from '@loopwork-ai/contracts'

/**
 * Default wait time when rate limit is detected (30 seconds)
 */
export const DEFAULT_RATE_LIMIT_WAIT_MS = 30000

export interface RetryableError {
  code?: string | number
  message: string
}

export class RateLimitError extends Error {
  public readonly code: string | number

  constructor(message: string, code: string | number = 429) {
    super(message)
    this.name = 'RateLimitError'
    this.code = code
  }
}

export const RATE_LIMIT_PATTERNS = [
  /rate.*limit/i,
  /429/i,
  /too.*many.*request/i,
  /resource.*exhausted/i,
  /quota.*exceed/i,
  /billing.*limit/i,
  /over.*quota/i,
  /over.*query.*limit/i,
]

/**
 * OpenCode cache corruption error patterns
 */
export const OPENCODE_CACHE_CORRUPTION_PATTERNS = [
  /ENOENT.*reading.*\.cache\/opencode/i,
  /ENOENT.*\.cache\/opencode\/node_modules/i,
  /BuildMessage:.*ENOENT.*opencode/i,
]

export function isRateLimitOutput(output: string): boolean {
  if (!output) return false
  return RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(output))
}

export function isOpenCodeCacheCorruption(output: string): boolean {
  if (!output) return false
  return OPENCODE_CACHE_CORRUPTION_PATTERNS.some((pattern) => pattern.test(output))
}

export function isRateLimitError(error: unknown): boolean {
  if (!error) {
    return false
  }

  if (error instanceof RateLimitError) {
    return true
  }

  if (typeof error === 'string') {
    return isRateLimitOutput(error)
  }

  if (typeof error !== 'object' || error === null) {
    return false
  }

  const err = error as Record<string, unknown>
  const errorMessage = String(err.message || '').toLowerCase()

  if (isRateLimitOutput(errorMessage)) {
    return true
  }

  if (err.code) {
    const codeStr = String(err.code).toLowerCase()
    if (codeStr === '429' || codeStr.includes('rate')) {
      return true
    }
  }

  return false
}

export interface ExponentialBackoffOptions {
  baseDelayMs: number
  maxDelayMs?: number
  multiplier?: number
  jitter?: boolean
}

export const DEFAULT_EXPONENTIAL_BACKOFF: Required<ExponentialBackoffOptions> = {
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  multiplier: 2,
  jitter: true,
}

export interface LinearBackoffOptions {
  baseDelayMs: number
  maxDelayMs?: number
  jitter?: boolean
}

export const DEFAULT_LINEAR_BACKOFF: Required<LinearBackoffOptions> = {
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitter: true,
}

export function calculateExponentialBackoff(
  attempt: number,
  options: ExponentialBackoffOptions,
): number {
  const { baseDelayMs, maxDelayMs = 60000, multiplier = 2, jitter = true } = options

  let delay = baseDelayMs * Math.pow(multiplier, attempt - 1)

  if (jitter) {
    const jitterAmount = delay * 0.2
    delay += Math.random() * jitterAmount * 2 - jitterAmount
  }

  delay = Math.min(delay, maxDelayMs)

  return Math.max(0, Math.floor(delay))
}

export class ExponentialBackoff implements IBackoffPolicy {
  private options: Required<ExponentialBackoffOptions>

  constructor(options: ExponentialBackoffOptions = DEFAULT_EXPONENTIAL_BACKOFF) {
    this.options = {
      baseDelayMs: options.baseDelayMs ?? DEFAULT_EXPONENTIAL_BACKOFF.baseDelayMs,
      maxDelayMs: options.maxDelayMs ?? DEFAULT_EXPONENTIAL_BACKOFF.maxDelayMs,
      multiplier: options.multiplier ?? DEFAULT_EXPONENTIAL_BACKOFF.multiplier,
      jitter: options.jitter ?? DEFAULT_EXPONENTIAL_BACKOFF.jitter,
    }
  }

  getDelay(attempt: number): number {
    return calculateExponentialBackoff(attempt, this.options)
  }

  /**
   * Calculates delay for a given attempt.
   * Part of IBackoffPolicy implementation.
   */
  calculateDelay(attempt: number, _error?: Error): number {
    return this.getDelay(attempt)
  }

  getBaseDelay(): number {
    return this.options.baseDelayMs
  }
}

/**
 * Factory function to create an exponential backoff strategy
 */
export function exponentialBackoff(options: ExponentialBackoffOptions): ExponentialBackoff {
  return new ExponentialBackoff(options)
}

export class LinearBackoff implements IBackoffPolicy {
  private options: Required<LinearBackoffOptions>

  constructor(options: Partial<LinearBackoffOptions> = {}) {
    this.options = {
      baseDelayMs: options.baseDelayMs ?? DEFAULT_LINEAR_BACKOFF.baseDelayMs,
      maxDelayMs: options.maxDelayMs ?? DEFAULT_LINEAR_BACKOFF.maxDelayMs,
      jitter: options.jitter ?? DEFAULT_LINEAR_BACKOFF.jitter,
    }
  }

  calculateDelay(attempt: number, _error?: Error): number {
    const delay = this.options.baseDelayMs * attempt
    let finalDelay = delay

    if (this.options.jitter) {
      const jitterFactor = 0.2
      const jitterAmount = delay * jitterFactor
      finalDelay += Math.random() * jitterAmount * 2 - jitterAmount
    }

    return Math.max(0, Math.min(Math.floor(finalDelay), this.options.maxDelayMs))
  }

  getBaseDelay(): number {
    return this.options.baseDelayMs
  }
}

export class ConstantBackoff implements IBackoffPolicy {
  constructor(private delayMs: number = 1000) {}

  calculateDelay(_attempt: number, _error?: Error): number {
    return this.delayMs
  }

  getBaseDelay(): number {
    return this.delayMs
  }
}

/**
 * Rate Limit Backoff Strategy
 *
 * A specific backoff strategy for handling rate limit errors.
 * When a rate limit error is detected, returns the configured wait time (default: 30s).
 */
export class RateLimitBackoffStrategy implements IBackoffPolicy {
  private rateLimitWaitMs: number
  private fallbackPolicy?: IBackoffPolicy

  /**
   * @param rateLimitWaitMs - Wait time when rate limit is detected (default: 30000ms = 30s)
   * @param fallbackPolicy - Optional fallback backoff policy for non-rate-limit errors
   */
  constructor(
    rateLimitWaitMs: number = DEFAULT_RATE_LIMIT_WAIT_MS,
    fallbackPolicy?: IBackoffPolicy,
  ) {
    this.rateLimitWaitMs = rateLimitWaitMs
    this.fallbackPolicy = fallbackPolicy
  }

  calculateDelay(attempt: number, error?: Error): number {
    if (error && isRateLimitError(error)) {
      return this.rateLimitWaitMs
    }

    return this.fallbackPolicy?.calculateDelay(attempt, error) ?? 0
  }

  getBaseDelay(): number {
    return this.rateLimitWaitMs
  }

  getRateLimitWaitMs(): number {
    return this.rateLimitWaitMs
  }
}

/**
 * Factory function to create a linear backoff strategy
 */
export function linearBackoff(options: Partial<LinearBackoffOptions> = {}): LinearBackoff {
  return new LinearBackoff(options)
}

/**
 * Factory function to create a constant backoff strategy
 */
export function constantBackoff(delayMs?: number): ConstantBackoff {
  return new ConstantBackoff(delayMs)
}

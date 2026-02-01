import { IBackoffPolicy } from '@loopwork-ai/contracts'

export interface RetryableError {
  code?: string | number
  message: string
}

interface RetryableErrorInternal {
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

export function isRateLimitOutput(output: string): boolean {
  if (!output) return false
  return RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(output))
}

export function isRateLimitError(error: unknown): boolean {
  if (!error) {
    return false
  }

  if (error instanceof RateLimitError) {
    return true
  }

  if (typeof error !== 'object') {
    return false
  }

  const err = error as RetryableErrorInternal
  const errorMessage = (err.message || '').toLowerCase()

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
    rateLimitWaitMs: number = 30000,
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

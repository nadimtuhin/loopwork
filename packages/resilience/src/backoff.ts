import { IBackoffPolicy } from '@loopwork-ai/contracts'

export interface ExponentialBackoffOptions {
  baseDelayMs: number
  maxDelayMs?: number
  multiplier?: number
  jitter?: boolean
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

  return Math.max(0, delay)
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

export const DEFAULT_EXPONENTIAL_BACKOFF: Required<ExponentialBackoffOptions> = {
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  multiplier: 2,
  jitter: true,
}

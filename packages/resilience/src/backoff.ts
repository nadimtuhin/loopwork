import { IBackoffPolicy } from '@loopwork-ai/contracts'

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

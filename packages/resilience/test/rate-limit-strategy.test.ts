import { describe, expect, test } from 'bun:test'
import { RateLimitBackoffStrategy, isRateLimitOutput, RateLimitError } from '../src/rate-limit'
import { ExponentialBackoff } from '../src/backoff'

describe('RateLimitBackoffStrategy', () => {
  test('isRateLimitOutput detects various patterns', () => {
    expect(isRateLimitOutput('rate limit exceeded')).toBe(true)
    expect(isRateLimitOutput('429 Too Many Requests')).toBe(true)
    expect(isRateLimitOutput('RESOURCE_EXHAUSTED')).toBe(true)
    expect(isRateLimitOutput('quota exceeded for model')).toBe(true)
    expect(isRateLimitOutput('billing limit reached')).toBe(true)
    expect(isRateLimitOutput('Something else')).toBe(false)
  })

  test('detects RateLimitError instance', () => {
    const { isRateLimitError } = require('../src/rate-limit')
    const error = new RateLimitError('Too many requests')
    expect(isRateLimitError(error)).toBe(true)
  })

  test('returns rate limit wait time for rate limit errors', () => {
    const strategy = new RateLimitBackoffStrategy(30000)
    const rateLimitError = new Error('rate limit exceeded')

    const delay = strategy.calculateDelay(1, rateLimitError)

    expect(delay).toBe(30000)
  })

  test('returns rate limit wait time for 429 errors', () => {
    const strategy = new RateLimitBackoffStrategy(30000)
    const error429 = new Error('429 too many requests')

    const delay = strategy.calculateDelay(1, error429)

    expect(delay).toBe(30000)
  })

  test('returns rate limit wait time for resource exhausted errors', () => {
    const strategy = new RateLimitBackoffStrategy(30000)
    const error = new Error('resource exhausted')

    const delay = strategy.calculateDelay(1, error)

    expect(delay).toBe(30000)
  })

  test('returns 0 when no error is provided', () => {
    const strategy = new RateLimitBackoffStrategy(30000)

    const delay = strategy.calculateDelay(1)

    expect(delay).toBe(0)
  })

  test('returns 0 for non-rate-limit errors when no fallback', () => {
    const strategy = new RateLimitBackoffStrategy(30000)
    const regularError = new Error('connection refused')

    const delay = strategy.calculateDelay(1, regularError)

    expect(delay).toBe(0)
  })

  test('uses fallback policy for non-rate-limit errors', () => {
    const fallback = new ExponentialBackoff({ baseDelayMs: 1000, jitter: false })
    const strategy = new RateLimitBackoffStrategy(30000, fallback)
    const regularError = new Error('connection refused')

    const delay = strategy.calculateDelay(1, regularError)

    expect(delay).toBe(1000) // Exponential backoff: 1000 * 2^0
  })

  test('ignores fallback for rate limit errors', () => {
    const fallback = new ExponentialBackoff({ baseDelayMs: 1000, jitter: false })
    const strategy = new RateLimitBackoffStrategy(30000, fallback)
    const rateLimitError = new Error('rate limit exceeded')

    const delay = strategy.calculateDelay(1, rateLimitError)

    expect(delay).toBe(30000) // Should use rate limit wait, not exponential backoff
  })

  test('returns custom rate limit wait time', () => {
    const strategy = new RateLimitBackoffStrategy(60000)
    const rateLimitError = new Error('rate limit exceeded')

    const delay = strategy.calculateDelay(1, rateLimitError)

    expect(delay).toBe(60000)
  })

  test('getBaseDelay returns rate limit wait time', () => {
    const strategy = new RateLimitBackoffStrategy(45000)

    expect(strategy.getBaseDelay()).toBe(45000)
  })

  test('getRateLimitWaitMs returns configured wait time', () => {
    const strategy = new RateLimitBackoffStrategy(30000)

    expect(strategy.getRateLimitWaitMs()).toBe(30000)
  })

  test('integrates with ResilienceRunner for rate limit handling', async () => {
    const { createResilienceRunner } = await import('../src/runner')
    const runner = createResilienceRunner({
      maxAttempts: 3,
      retryOnRateLimit: true,
      rateLimitWaitMs: 1, // Use 1ms for fast tests
      exponentialBackoffBaseDelay: 1,
    })

    let attemptCount = 0

    const result = await runner.execute(async () => {
      attemptCount++
      if (attemptCount < 2) {
        throw new Error('rate limit exceeded')
      }
      return 'success'
    })

    expect(result.success).toBe(true)
    expect(result.result).toBe('success')
    expect(attemptCount).toBe(2)
  })
})

import { describe, expect, test } from 'bun:test'
import { calculateExponentialBackoff, exponentialBackoff } from '../src/backoff'
import { DEFAULT_RETRY_OPTIONS, isRetryable } from '../src/retry'
import { createResilienceRunner, makeResilient, ResilienceRunner, type ResilienceRunnerOptions } from '../src/runner'

async function retryStrategyHelper<T>(fn: () => Promise<T>, options: any): Promise<T> {
  const runner = createResilienceRunner({
    maxAttempts: options.maxAttempts,
    retryOnRateLimit: options.retryOnRateLimit,
    retryOnTransient: options.retryOnTransient,
    rateLimitWaitMs: options.rateLimitWaitMs,
    exponentialBackoff: false,
  })
  
  const result = await runner.execute(fn)
  if (result.success) {
    return result.result as T
  }
  throw result.finalError
}

describe('backoff.ts', () => {
  describe('calculateExponentialBackoff', () => {
    test('calculates correct delay for attempt 1', () => {
      const delay = calculateExponentialBackoff(1, { baseDelayMs: 1000, jitter: false })
      expect(delay).toBe(1000)
    })

    test('doubles delay for each attempt', () => {
      const delay1 = calculateExponentialBackoff(1, { baseDelayMs: 1000, jitter: false })
      const delay2 = calculateExponentialBackoff(2, { baseDelayMs: 1000, jitter: false })
      const delay3 = calculateExponentialBackoff(3, { baseDelayMs: 1000, jitter: false })

      expect(delay1).toBe(1000)
      expect(delay2).toBe(2000)
      expect(delay3).toBe(4000)
    })

    test('respects maxDelayMs cap', () => {
      const delay = calculateExponentialBackoff(10, { baseDelayMs: 1000, maxDelayMs: 500 })
      expect(delay).toBeLessThanOrEqual(500)
    })

    test('uses custom multiplier', () => {
      const delay = calculateExponentialBackoff(2, { baseDelayMs: 1000, multiplier: 3, jitter: false })
      expect(delay).toBe(3000)
    })

    test('applies jitter when enabled', () => {
      const delays: number[] = []
      for (let i = 0; i < 100; i++) {
        delays.push(calculateExponentialBackoff(1, { baseDelayMs: 1000, jitter: true }))
      }

      // With jitter, delays should vary
      const min = Math.min(...delays)
      const max = Math.max(...delays)
      expect(max - min).toBeGreaterThan(0)
    })

    test('does not apply jitter when disabled', () => {
      const delay1 = calculateExponentialBackoff(1, { baseDelayMs: 1000, jitter: false })
      const delay2 = calculateExponentialBackoff(1, { baseDelayMs: 1000, jitter: false })

      expect(delay1).toBe(delay2)
    })
  })

  describe('exponentialBackoff', () => {
    test('returns a backoff strategy instance', () => {
      const strategy = exponentialBackoff({ baseDelayMs: 1000 })
      const delay = strategy.calculateDelay(1)

      expect(delay).toBeGreaterThan(0)
    })
  })
})

describe('retry.ts', () => {
  describe('isRetryable', () => {
    test('detects rate limit errors by message', () => {
      const error = { message: 'rate limit exceeded' }
      const options = { ...DEFAULT_RETRY_OPTIONS, maxAttempts: 3, retryOnRateLimit: true }
      expect(isRetryable(error, options)).toBe(true)
    })

    test('detects 429 status code', () => {
      const error = { code: '429' }
      const options = { ...DEFAULT_RETRY_OPTIONS, maxAttempts: 3, retryOnRateLimit: true }
      expect(isRetryable(error, options)).toBe(true)
    })

    test('detects resource exhausted errors', () => {
      const error = { message: 'resource exhausted' }
      const options = { ...DEFAULT_RETRY_OPTIONS, maxAttempts: 3, retryOnRateLimit: true }
      expect(isRetryable(error, options)).toBe(true)
    })

    test('does not retry non-retryable errors', () => {
      const error = { message: 'file not found' }
      const options = { ...DEFAULT_RETRY_OPTIONS, maxAttempts: 3, retryOnRateLimit: true, retryOnTransient: true }
      expect(isRetryable(error, options)).toBe(false)
    })

    test('can retry all errors when configured', () => {
      const error = { message: 'file not found' }
      const options = { ...DEFAULT_RETRY_OPTIONS, maxAttempts: 3, retryOnAllErrors: true }
      expect(isRetryable(error, options)).toBe(true)
    })

    test('checks transient errors', () => {
      const error = { message: 'connection reset' }
      const options = { ...DEFAULT_RETRY_OPTIONS, maxAttempts: 3, retryOnTransient: true }
      expect(isRetryable(error, options)).toBe(true)
    })

    test('checks custom retryable errors', () => {
      const error = { message: 'Custom fatal error' }
      const options = { ...DEFAULT_RETRY_OPTIONS, maxAttempts: 3, retryableErrors: ['Custom fatal'] }
      expect(isRetryable(error, options)).toBe(true)
    })

    test('checks custom retryable error codes', () => {
      const error = { code: 'E_CUSTOM' }
      const options = { ...DEFAULT_RETRY_OPTIONS, maxAttempts: 3, retryableErrors: ['E_CUSTOM'] }
      expect(isRetryable(error, options)).toBe(true)
    })

    test('handles non-error inputs', () => {
      const options = { ...DEFAULT_RETRY_OPTIONS, maxAttempts: 3 }
      expect(isRetryable(null, options)).toBe(false)
      expect(isRetryable(undefined, options)).toBe(false)
      expect(isRetryable('string', options)).toBe(false)
    })
  })

  describe('retryStrategy', () => {
    test('succeeds on first attempt', async () => {
      let attemptCount = 0
      const options = { ...DEFAULT_RETRY_OPTIONS, maxAttempts: 3, retryOnAllErrors: true }
      const result = await retryStrategyHelper(
        async () => {
          attemptCount++
          return 'success'
        },
        options,
      )

      expect(result).toBe('success')
      expect(attemptCount).toBe(1)
    })

    test('retries on transient error', async () => {
      let attemptCount = 0
      const options = { ...DEFAULT_RETRY_OPTIONS, maxAttempts: 3, retryOnTransient: true, delayStrategy: () => 1 }
      const result = await retryStrategyHelper(
        async () => {
          attemptCount++
          if (attemptCount < 2) {
            throw new Error('connection reset')
          }
          return 'success'
        },
        options,
      )

      expect(result).toBe('success')
      expect(attemptCount).toBe(2)
    })

    test('retries on rate limit error', async () => {
      let attemptCount = 0
      const options = { ...DEFAULT_RETRY_OPTIONS, maxAttempts: 3, retryOnRateLimit: true, rateLimitWaitMs: 1 }
      const result = await retryStrategyHelper(
        async () => {
          attemptCount++
          if (attemptCount < 2) {
            throw new Error('rate limit exceeded')
          }
          return 'success'
        },
        options,
      )

      expect(result).toBe('success')
      expect(attemptCount).toBe(2)
    })

    test('throws error after max attempts', async () => {
      let attemptCount = 0
      const options = { ...DEFAULT_RETRY_OPTIONS, maxAttempts: 2, retryOnTransient: true, delayStrategy: () => 1 }

      await expect(
        retryStrategyHelper(
          async () => {
            attemptCount++
            throw new Error('connection reset')
          },
          options,
        ),
      ).rejects.toThrow('connection reset')

      expect(attemptCount).toBe(2)
    })

    test('does not retry non-retryable errors', async () => {
      let attemptCount = 0
      const options = { ...DEFAULT_RETRY_OPTIONS, maxAttempts: 3, retryOnTransient: true, retryOnRateLimit: true }

      await expect(
        retryStrategyHelper(
          async () => {
            attemptCount++
            throw new Error('file not found')
          },
          options,
        ),
      ).rejects.toThrow('file not found')

      expect(attemptCount).toBe(1)
    })
  })
})

describe('ResilienceRunner', () => {
  test('creates runner with default options', () => {
    const runner = createResilienceRunner()
    expect(runner).toBeInstanceOf(ResilienceRunner)
  })

  test('creates runner with custom options', () => {
    const options: Partial<ResilienceRunnerOptions> = {
      maxAttempts: 5,
      rateLimitWaitMs: 60000,
    }
    const runner = createResilienceRunner(options)

    expect(runner).toBeInstanceOf(ResilienceRunner)
  })

  test('executes function successfully', async () => {
    const runner = createResilienceRunner({ maxAttempts: 3, retryOnTransient: true })
    const result = await runner.execute(async () => 'success')

    expect(result.success).toBe(true)
    expect(result.result).toBe('success')
  })

  test('handles successful undefined result', async () => {
    const runner = createResilienceRunner({ maxAttempts: 1 })
    const result = await runner.execute(async () => undefined)

    expect(result.success).toBe(true)
    expect(result.result).toBe(undefined)
    
    const runResult = await runner.run(async () => undefined)
    expect(runResult).toBe(undefined)
  })

  test('retries on transient errors', async () => {
    const runner = createResilienceRunner({ maxAttempts: 3, retryOnTransient: true, exponentialBackoffBaseDelay: 1 })
    let attemptCount = 0

    const result = await runner.execute(async () => {
      attemptCount++
      if (attemptCount < 2) {
        throw new Error('connection reset')
      }
      return 'success'
    })

    expect(result.success).toBe(true)
    expect(result.result).toBe('success')
    expect(attemptCount).toBe(2)
  })

  test('retries on rate limit errors', async () => {
    const runner = createResilienceRunner({ maxAttempts: 3, retryOnRateLimit: true, rateLimitWaitMs: 1 })
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

  test('throws after max attempts', async () => {
    const runner = createResilienceRunner({ maxAttempts: 2, retryOnTransient: true, exponentialBackoffBaseDelay: 1 })
    const result = await runner.execute(async () => {
      throw new Error('connection reset')
    })

    expect(result.success).toBe(false)
    expect(result.attempts).toBe(2)
    expect(result.finalError?.message).toBe('connection reset')
  })

  test('verifies backoff timing', async () => {
    const baseDelay = 50
    const runner = createResilienceRunner({
      maxAttempts: 2,
      exponentialBackoff: false,
      exponentialBackoffBaseDelay: baseDelay,
      retryOnTransient: true,
    })

    let attempts = 0
    const start = Date.now()
    await runner.execute(async () => {
      attempts++
      if (attempts < 2) {
        throw new Error('connection reset')
      }
      return 'success'
    })
    const duration = Date.now() - start

    expect(duration).toBeGreaterThanOrEqual(baseDelay - 20) // Allow small buffer for timing
    expect(attempts).toBe(2)
  })

  test('uses exponential backoff by default', async () => {
    const runner = createResilienceRunner({
      maxAttempts: 3,
      retryOnTransient: true,
      exponentialBackoff: true,
      exponentialBackoffBaseDelay: 1,
    })

    let attemptCount = 0

    await runner.execute(async () => {
      attemptCount++
      throw new Error('connection reset')
    })

    expect(attemptCount).toBe(3)
  })

  test('gets rate limit wait time', () => {
    const runner = createResilienceRunner({ rateLimitWaitMs: 45000 })
    expect(runner.getRateLimitWaitMs()).toBe(45000)
  })

  test('returns default rate limit wait time', () => {
    const runner = createResilienceRunner()
    expect(runner.getRateLimitWaitMs()).toBe(30000)
  })

  test('calls onRetry and onComplete hooks', async () => {
    let retryCalled = false
    let completeCalled = false
    const runner = createResilienceRunner({ 
      maxAttempts: 2, 
      exponentialBackoffBaseDelay: 1,
      retryOnTransient: true 
    })

    await runner.execute(
      async () => {
        throw new Error('connection reset')
      },
      {
        onRetry: () => { retryCalled = true },
        onComplete: () => { completeCalled = true }
      }
    )

    expect(retryCalled).toBe(true)
    expect(completeCalled).toBe(true)
  })

  test('respects attemptTimeout', async () => {
    const runner = createResilienceRunner({ maxAttempts: 1 })
    const result = await runner.execute(
      async () => {
        await new Promise(resolve => setTimeout(resolve, 100))
        return 'success'
      },
      { attemptTimeout: 10 }
    )

    expect(result.success).toBe(false)
    expect(result.finalError?.message).toContain('timed out')
  })
})

describe('makeResilient', () => {
  test('creates resilient version of async function', async () => {
    const fn = async (x: number) => {
      if (x < 2) {
        throw new Error('connection reset')
      }
      return x * 2
    }

    const resilientFn = makeResilient(fn, {
      maxAttempts: 3,
      retryOnTransient: true,
      exponentialBackoffBaseDelay: 1,
    } as Partial<ResilienceRunnerOptions>)

    const result = await resilientFn(3)

    expect(result).toBe(6)
  })

  test('applies exponential backoff', async () => {
    let callCount = 0
    const fn = async () => {
      callCount++
      throw new Error('connection reset')
    }

    const resilientFn = makeResilient(fn, {
      maxAttempts: 3,
      retryOnTransient: true,
      exponentialBackoff: true,
      exponentialBackoffBaseDelay: 1,
    } as Partial<ResilienceRunnerOptions>)

    await resilientFn().catch(() => {
      // Expected to fail
    })

    expect(callCount).toBe(3)
  })
})

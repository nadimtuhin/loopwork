
import { describe, test, expect } from 'bun:test'
import {
  calculateBackoff,
  isRetryableError,
  getRetryPolicy,
  DEFAULT_RETRY_POLICY,
  type RetryPolicy
} from '../../src/core/retry'
import type { Task } from '../../src/contracts/task'

describe('Retry Utilities', () => {
  describe('calculateBackoff', () => {
    test('calculates exponential backoff correctly', () => {
      const policy: RetryPolicy = {
        ...DEFAULT_RETRY_POLICY,
        initialDelay: 1000,
        backoffMultiplier: 2,
        maxDelay: 10000,
        jitter: false
      }

      expect(calculateBackoff(0, policy)).toBe(1000)
      expect(calculateBackoff(1, policy)).toBe(2000)
      expect(calculateBackoff(2, policy)).toBe(4000)
      expect(calculateBackoff(3, policy)).toBe(8000)
      expect(calculateBackoff(4, policy)).toBe(10000) // Capped at maxDelay
    })

    test('respects maxDelay', () => {
      const policy: RetryPolicy = {
        ...DEFAULT_RETRY_POLICY,
        initialDelay: 1000,
        backoffMultiplier: 10,
        maxDelay: 5000,
        jitter: false
      }

      expect(calculateBackoff(0, policy)).toBe(1000)
      expect(calculateBackoff(1, policy)).toBe(5000) // Capped
    })

    test('applies jitter when enabled', () => {
      const policy: RetryPolicy = {
        ...DEFAULT_RETRY_POLICY,
        initialDelay: 1000,
        backoffMultiplier: 2,
        jitter: true
      }

      // Run multiple times to verify randomness
      const results = new Set()
      for (let i = 0; i < 50; i++) {
        results.add(calculateBackoff(1, policy))
      }

      // Should have multiple different values
      expect(results.size).toBeGreaterThan(1)

      // All values should be within range [base, base * multiplier]
      // Actually standard jitter is often [0, sleep] or [sleep/2, sleep]
      // Let's assume Full Jitter: random_between(0, min(cap, base * 2 ** attempt))
      // OR Equal Jitter.
      // We need to define what jitter implementation we want.
      // Usually simple jitter is: delay = delay + (Math.random() * delay * jitterFactor)
      // Or delay = delay * (1 + (Math.random() - 0.5) * jitterFactor)
      
      // Let's check the implementation I plan to write:
      // delay = delay * (1 + (Math.random() * 0.2 - 0.1)) // +/- 10%
    })
  })

  describe('isRetryableError', () => {
    test('identifies retryable error strings', () => {
      expect(isRetryableError('Connection ECONNRESET')).toBe(true)
      expect(isRetryableError('Something failed')).toBe(false)
    })

    test('identifies retryable Error objects by message', () => {
      expect(isRetryableError(new Error('Connection ETIMEDOUT'))).toBe(true)
      expect(isRetryableError(new Error('Fatal error'))).toBe(false)
    })

    test('identifies retryable Error objects by code', () => {
      const error = new Error('Network error')
      ;(error as any).code = 'ECONNRESET'
      expect(isRetryableError(error)).toBe(true)

      const nonRetryable = new Error('System error')
      ;(nonRetryable as any).code = 'EACCES'
      expect(isRetryableError(nonRetryable)).toBe(false)
    })

    test('uses custom policy retryableErrors', () => {
      const policy: RetryPolicy = {
        ...DEFAULT_RETRY_POLICY,
        retryableErrors: ['CUSTOM_ERROR']
      }
      expect(isRetryableError('CUSTOM_ERROR occurred', policy)).toBe(true)
      expect(isRetryableError('ECONNRESET', policy)).toBe(false) // Overrides default? Or appends? 
      // Current impl replaces. Ideally it should probably append or replace. 
      // Code says: const retryableErrors = policy.retryableErrors || DEFAULT...
      // So if policy provides it, it overrides.
    })
  })

  describe('getRetryPolicy', () => {
    test('merges config correctly', () => {
      const task = { metadata: { maxRetries: 5 } } as unknown as Task
      const config = { retryDelay: 500 }
      
      const policy = getRetryPolicy(task, config)
      
      expect(policy.maxRetries).toBe(5)
      expect(policy.initialDelay).toBe(500)
      expect(policy.maxDelay).toBe(DEFAULT_RETRY_POLICY.maxDelay)
    })

    test('prioritizes task metadata over config', () => {
      const task = { metadata: { retryDelay: 200 } } as unknown as Task
      const config = { retryDelay: 500 }
      
      const policy = getRetryPolicy(task, config)
      expect(policy.initialDelay).toBe(200)
    })
  })
})

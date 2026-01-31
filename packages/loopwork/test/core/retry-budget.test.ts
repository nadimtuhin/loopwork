import { describe, expect, test, beforeEach } from 'bun:test'
import { RetryBudget, type RetryBudgetConfig } from '../../src/core/retry-budget'

describe('RetryBudget', () => {
  describe('constructor', () => {
    test('uses default values when not provided', () => {
      const budget = new RetryBudget()
      expect(budget.getConfig()).toEqual({ maxRetries: 50, windowMs: 3600000 })
    })

    test('uses custom configuration', () => {
      const config: RetryBudgetConfig = {
        maxRetries: 100,
        windowMs: 60000,
        enabled: true,
      }
      const budget = new RetryBudget(config.maxRetries, config.windowMs)
      expect(budget.getConfig()).toEqual({ maxRetries: 100, windowMs: 60000 })
    })
  })

  describe('hasBudget', () => {
    test('returns true when under limit', () => {
      const budget = new RetryBudget(10, 60000)
      expect(budget.hasBudget()).toBe(true)
    })

    test('returns true after some retries', () => {
      const budget = new RetryBudget(10, 60000)
      budget.consume()
      budget.consume()
      budget.consume()
      expect(budget.hasBudget()).toBe(true)
      expect(budget.getUsage()).toBe(3)
    })

    test('returns false when at limit', () => {
      const budget = new RetryBudget(3, 60000)
      budget.consume()
      budget.consume()
      budget.consume()
      expect(budget.hasBudget()).toBe(false)
      expect(budget.getUsage()).toBe(3)
    })

    test('returns true after consuming but not at limit', () => {
      const budget = new RetryBudget(5, 60000)
      for (let i = 0; i < 4; i++) {
        budget.consume()
      }
      expect(budget.hasBudget()).toBe(true)
      expect(budget.getUsage()).toBe(4)
    })
  })

  describe('consume', () => {
    test('increments usage count', () => {
      const budget = new RetryBudget(10, 60000)
      expect(budget.getUsage()).toBe(0)
      budget.consume()
      expect(budget.getUsage()).toBe(1)
      budget.consume()
      expect(budget.getUsage()).toBe(2)
    })

    test('tracks retry timestamps', () => {
      const budget = new RetryBudget(10, 60000)
      const beforeConsume = Date.now()

      budget.consume()

      const usage = budget.getUsage()
      expect(usage).toBe(1)
    })
  })

  describe('getUsage', () => {
    test('returns current usage count', () => {
      const budget = new RetryBudget(10, 60000)
      expect(budget.getUsage()).toBe(0)

      budget.consume()
      expect(budget.getUsage()).toBe(1)

      budget.consume()
      budget.consume()
      expect(budget.getUsage()).toBe(3)
    })

    test('returns 0 for new budget', () => {
      const budget = new RetryBudget(100, 60000)
      expect(budget.getUsage()).toBe(0)
    })
  })

  describe('getConfig', () => {
    test('returns current configuration', () => {
      const budget = new RetryBudget(75, 120000)
      const config = budget.getConfig()
      expect(config.maxRetries).toBe(75)
      expect(config.windowMs).toBe(120000)
    })

    test('returns default configuration when using defaults', () => {
      const budget = new RetryBudget()
      const config = budget.getConfig()
      expect(config.maxRetries).toBe(50)
      expect(config.windowMs).toBe(3600000)
    })
  })

  describe('window expiration', () => {
    test('expires old retries after window passes', () => {
      // Create a budget with a very short window (10ms)
      const budget = new RetryBudget(10, 10)

      // Consume one retry
      budget.consume()
      expect(budget.getUsage()).toBe(1)
      expect(budget.hasBudget()).toBe(true) // 1 < 10

      // Wait for window to expire
      const now = Date.now()
      while (Date.now() - now < 20) {
        // Busy wait for 20ms
      }

      // Old retry should be expired
      expect(budget.getUsage()).toBe(0)
      expect(budget.hasBudget()).toBe(true)
    })

    test('keeps recent retries within window', () => {
      const budget = new RetryBudget(2, 60000)

      budget.consume()
      budget.consume()

      expect(budget.getUsage()).toBe(2)
      expect(budget.hasBudget()).toBe(false) // At limit

      // Wait a tiny bit
      const now = Date.now()
      while (Date.now() - now < 5) {
        // Busy wait for 5ms
      }

      // Still within window
      expect(budget.getUsage()).toBe(2)
      expect(budget.hasBudget()).toBe(false)
    })
  })

  describe('edge cases', () => {
    test('handles zero maxRetries', () => {
      const budget = new RetryBudget(0, 60000)
      expect(budget.hasBudget()).toBe(false)
      expect(budget.getUsage()).toBe(0)
    })

    test('handles very small window', () => {
      const budget = new RetryBudget(5, 1)
      budget.consume()

      // Wait for window to expire
      const now = Date.now()
      while (Date.now() - now < 5) {
        // Busy wait for 5ms
      }

      expect(budget.getUsage()).toBe(0)
    })

    test('handles large maxRetries', () => {
      const budget = new RetryBudget(1000, 60000)
      expect(budget.hasBudget()).toBe(true)

      // Consume multiple times
      for (let i = 0; i < 100; i++) {
        budget.consume()
      }
      expect(budget.hasBudget()).toBe(true)
      expect(budget.getUsage()).toBe(100)
    })

    test('handles very large window', () => {
      const budget = new RetryBudget(10, 86400000) // 24 hours
      budget.consume()

      // Should still have the retry after a short wait
      const now = Date.now()
      while (Date.now() - now < 10) {
        // Busy wait for 10ms
      }

      expect(budget.getUsage()).toBe(1)
      expect(budget.hasBudget()).toBe(true)
    })
  })
})

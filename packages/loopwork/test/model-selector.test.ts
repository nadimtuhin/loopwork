import { describe, test, expect, beforeEach } from 'bun:test'
import { ModelSelector, calculateBackoffDelay } from '../src/core/model-selector'
import type { ModelConfig } from '../src/contracts/cli'

describe('ModelSelector', () => {
  const primaryModels: ModelConfig[] = [
    { name: 'sonnet', cli: 'claude', model: 'sonnet' },
    { name: 'haiku', cli: 'claude', model: 'haiku' },
    { name: 'flash', cli: 'opencode', model: 'gemini-flash' },
  ]

  const fallbackModels: ModelConfig[] = [
    { name: 'opus', cli: 'claude', model: 'opus' },
    { name: 'pro', cli: 'opencode', model: 'gemini-pro' },
  ]

  describe('round-robin strategy', () => {
    let selector: ModelSelector

    beforeEach(() => {
      selector = new ModelSelector(primaryModels, fallbackModels, 'round-robin')
    })

    test('cycles through primary models in order', () => {
      expect(selector.getNext()?.name).toBe('sonnet')
      expect(selector.getNext()?.name).toBe('haiku')
      expect(selector.getNext()?.name).toBe('flash')
      expect(selector.getNext()?.name).toBe('sonnet') // wraps around
    })

    test('switches to fallback pool', () => {
      selector.switchToFallback()
      expect(selector.isUsingFallback()).toBe(true)
      expect(selector.getNext()?.name).toBe('opus')
      expect(selector.getNext()?.name).toBe('pro')
      expect(selector.getNext()?.name).toBe('opus') // wraps around
    })

    test('resets to primary pool', () => {
      selector.switchToFallback()
      selector.resetToFallback()
      expect(selector.isUsingFallback()).toBe(false)
      expect(selector.getNext()?.name).toBe('sonnet')
    })
  })

  describe('priority strategy', () => {
    let selector: ModelSelector

    beforeEach(() => {
      selector = new ModelSelector(primaryModels, fallbackModels, 'priority')
    })

    test('always returns first model', () => {
      expect(selector.getNext()?.name).toBe('sonnet')
      expect(selector.getNext()?.name).toBe('sonnet')
      expect(selector.getNext()?.name).toBe('sonnet')
    })

    test('returns first fallback model when switched', () => {
      selector.switchToFallback()
      expect(selector.getNext()?.name).toBe('opus')
      expect(selector.getNext()?.name).toBe('opus')
    })
  })

  describe('cost-aware strategy', () => {
    const modelsWithCost: ModelConfig[] = [
      { name: 'opus', cli: 'claude', model: 'opus', costWeight: 100 },
      { name: 'sonnet', cli: 'claude', model: 'sonnet', costWeight: 30 },
      { name: 'haiku', cli: 'claude', model: 'haiku', costWeight: 10 },
    ]

    test('returns lowest cost model first', () => {
      const selector = new ModelSelector(modelsWithCost, [], 'cost-aware')
      expect(selector.getNext()?.name).toBe('haiku')
    })

    test('defaults costWeight to 50 if not specified', () => {
      const mixedModels: ModelConfig[] = [
        { name: 'expensive', cli: 'claude', model: 'opus', costWeight: 100 },
        { name: 'default', cli: 'claude', model: 'sonnet' }, // should be 50
        { name: 'cheap', cli: 'claude', model: 'haiku', costWeight: 10 },
      ]
      const selector = new ModelSelector(mixedModels, [], 'cost-aware')
      expect(selector.getNext()?.name).toBe('cheap')
    })
  })

  describe('random strategy', () => {
    test('returns a model from the pool', () => {
      const selector = new ModelSelector(primaryModels, [], 'random')
      const result = selector.getNext()
      expect(result).not.toBeNull()
      expect(primaryModels.some(m => m.name === result?.name)).toBe(true)
    })
  })

  describe('enabled filtering', () => {
    test('excludes disabled models', () => {
      const modelsWithDisabled: ModelConfig[] = [
        { name: 'enabled', cli: 'claude', model: 'sonnet', enabled: true },
        { name: 'disabled', cli: 'claude', model: 'haiku', enabled: false },
        { name: 'default', cli: 'claude', model: 'opus' }, // enabled by default
      ]
      const selector = new ModelSelector(modelsWithDisabled, [], 'round-robin')
      expect(selector.getTotalModelCount()).toBe(2)
      expect(selector.getNext()?.name).toBe('enabled')
      expect(selector.getNext()?.name).toBe('default')
    })
  })

  describe('retry tracking', () => {
    let selector: ModelSelector

    beforeEach(() => {
      selector = new ModelSelector(primaryModels, fallbackModels)
    })

    test('tracks retries per model', () => {
      expect(selector.getRetryCount('sonnet')).toBe(0)
      selector.trackRetry('sonnet')
      expect(selector.getRetryCount('sonnet')).toBe(1)
      selector.trackRetry('sonnet')
      expect(selector.getRetryCount('sonnet')).toBe(2)
    })

    test('tracks retries independently for each model', () => {
      selector.trackRetry('sonnet')
      selector.trackRetry('sonnet')
      selector.trackRetry('haiku')
      expect(selector.getRetryCount('sonnet')).toBe(2)
      expect(selector.getRetryCount('haiku')).toBe(1)
    })

    test('resets retry counts', () => {
      selector.trackRetry('sonnet')
      selector.trackRetry('haiku')
      selector.resetRetryCount()
      expect(selector.getRetryCount('sonnet')).toBe(0)
      expect(selector.getRetryCount('haiku')).toBe(0)
    })
  })

  describe('utility methods', () => {
    let selector: ModelSelector

    beforeEach(() => {
      selector = new ModelSelector(primaryModels, fallbackModels)
    })

    test('getTotalModelCount returns sum of primary and fallback', () => {
      expect(selector.getTotalModelCount()).toBe(5)
    })

    test('getCurrentPool returns correct pool', () => {
      expect(selector.getCurrentPool()).toEqual(primaryModels)
      selector.switchToFallback()
      expect(selector.getCurrentPool()).toEqual(fallbackModels)
    })

    test('getAllModels returns all models', () => {
      const all = selector.getAllModels()
      expect(all.length).toBe(5)
      expect(all).toContain(primaryModels[0])
      expect(all).toContain(fallbackModels[0])
    })

    test('hasExhaustedAllModels correctly detects exhaustion', () => {
      expect(selector.hasExhaustedAllModels(0)).toBe(false)
      expect(selector.hasExhaustedAllModels(4)).toBe(false)
      expect(selector.hasExhaustedAllModels(5)).toBe(true)
      expect(selector.hasExhaustedAllModels(10)).toBe(true)
    })

    test('reset clears all state', () => {
      selector.getNext()
      selector.getNext()
      selector.switchToFallback()
      selector.trackRetry('sonnet')
      selector.reset()

      expect(selector.isUsingFallback()).toBe(false)
      expect(selector.getRetryCount('sonnet')).toBe(0)
      expect(selector.getNext()?.name).toBe('sonnet') // back to beginning
    })
  })

  describe('empty pools', () => {
    test('returns null when pool is empty', () => {
      const selector = new ModelSelector([], [])
      expect(selector.getNext()).toBeNull()
    })

    test('handles empty fallback pool', () => {
      const selector = new ModelSelector(primaryModels, [])
      selector.switchToFallback()
      // Since fallback is empty, switchToFallback doesn't actually switch
      // so we still get from primary pool
      expect(selector.isUsingFallback()).toBe(false)
      expect(selector.getNext()?.name).toBe('sonnet')
    })

    test('switchToFallback does nothing when fallback is empty', () => {
      const selector = new ModelSelector(primaryModels, [])
      selector.switchToFallback()
      // Should still be on primary since fallback is empty
      expect(selector.isUsingFallback()).toBe(false)
    })
  })
})

describe('calculateBackoffDelay', () => {
  test('returns base delay for attempt 0', () => {
    expect(calculateBackoffDelay(0, 1000, 60000)).toBe(1000)
  })

  test('doubles delay for each attempt', () => {
    expect(calculateBackoffDelay(1, 1000, 60000)).toBe(2000)
    expect(calculateBackoffDelay(2, 1000, 60000)).toBe(4000)
    expect(calculateBackoffDelay(3, 1000, 60000)).toBe(8000)
  })

  test('caps at maxDelayMs', () => {
    expect(calculateBackoffDelay(10, 1000, 60000)).toBe(60000)
    expect(calculateBackoffDelay(100, 1000, 60000)).toBe(60000)
  })

  test('uses default values', () => {
    expect(calculateBackoffDelay(0)).toBe(1000)
    expect(calculateBackoffDelay(5)).toBeLessThanOrEqual(60000)
  })

  test('handles custom base and max', () => {
    expect(calculateBackoffDelay(0, 500, 5000)).toBe(500)
    expect(calculateBackoffDelay(4, 500, 5000)).toBe(5000) // 500 * 16 = 8000, capped to 5000
  })
})

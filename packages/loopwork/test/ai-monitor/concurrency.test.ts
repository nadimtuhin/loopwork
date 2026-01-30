/**
 * Concurrency Manager Tests
 * Tests for per-provider/model request limits with key-based queuing
 */

import { describe, test, expect, beforeEach } from 'bun:test'
import { ConcurrencyManager, createConcurrencyManager, parseKey } from '../../src/ai-monitor/concurrency'
import type { ConcurrencyConfig } from '../../src/ai-monitor/types'

const defaultConfig: ConcurrencyConfig = {
  default: 3,
  providers: {
    claude: 2,
    gemini: 3,
    openai: 1
  },
  models: {
    'claude-opus': 1,
    'claude-sonnet': 2,
    'gemini-flash': 5
  }
}

describe('ConcurrencyManager - Configuration', () => {
  test('should create manager with factory function', () => {
    const manager = createConcurrencyManager(defaultConfig)
    expect(manager).toBeInstanceOf(ConcurrencyManager)
  })

  test('should initialize with default config', () => {
    const manager = new ConcurrencyManager(defaultConfig)
    expect(manager).toBeDefined()
  })
})

describe('ConcurrencyManager - Limit Resolution', () => {
  let manager: ConcurrencyManager

  beforeEach(() => {
    manager = new ConcurrencyManager(defaultConfig)
  })

  test('should use model-specific limit when available', () => {
    // claude-opus has model-specific limit of 1
    const slots = manager.getAvailableSlots('claude:opus')
    expect(slots).toBe(1)
  })

  test('should use provider-specific limit when model limit not found', () => {
    // claude has provider limit of 2, no specific model limit
    const slots = manager.getAvailableSlots('claude:haiku')
    expect(slots).toBe(2)
  })

  test('should use default limit when neither model nor provider limit found', () => {
    // unknown provider should use default of 3
    const slots = manager.getAvailableSlots('unknown:model')
    expect(slots).toBe(3)
  })

  test('should handle provider-only keys', () => {
    // Provider without model specified
    const slots = manager.getAvailableSlots('gemini')
    expect(slots).toBe(3)
  })

  test('should prioritize model > provider > default', () => {
    // gemini-flash has model-specific limit of 5
    expect(manager.getAvailableSlots('gemini:flash')).toBe(5)

    // gemini-pro doesn't have model limit, uses provider limit of 3
    expect(manager.getAvailableSlots('gemini:pro')).toBe(3)

    // unknown provider uses default of 3
    expect(manager.getAvailableSlots('custom:model')).toBe(3)
  })
})

describe('ConcurrencyManager - Slot Management', () => {
  let manager: ConcurrencyManager

  beforeEach(() => {
    manager = new ConcurrencyManager(defaultConfig)
  })

  test('should acquire slot when available', async () => {
    const key = 'claude:opus'

    // Initially 1 slot available
    expect(manager.getAvailableSlots(key)).toBe(1)

    // Acquire the slot
    await manager.acquire(key)

    // No slots available now
    expect(manager.getAvailableSlots(key)).toBe(0)
  })

  test('should release slot and make it available', async () => {
    const key = 'claude:opus'

    await manager.acquire(key)
    expect(manager.getAvailableSlots(key)).toBe(0)

    manager.release(key)
    expect(manager.getAvailableSlots(key)).toBe(1)
  })

  test('should handle multiple acquires up to limit', async () => {
    const key = 'gemini:flash' // limit: 5

    // Acquire all 5 slots
    for (let i = 0; i < 5; i++) {
      await manager.acquire(key)
      expect(manager.getAvailableSlots(key)).toBe(5 - i - 1)
    }

    // No more slots available
    expect(manager.getAvailableSlots(key)).toBe(0)
  })

  test('should release slots in any order', async () => {
    const key = 'claude:sonnet' // limit: 2

    await manager.acquire(key)
    await manager.acquire(key)
    expect(manager.getAvailableSlots(key)).toBe(0)

    manager.release(key)
    expect(manager.getAvailableSlots(key)).toBe(1)

    manager.release(key)
    expect(manager.getAvailableSlots(key)).toBe(2)
  })

  test('should handle release when no slots acquired', () => {
    const key = 'claude:opus'

    // Releasing when nothing acquired should be safe
    manager.release(key)
    expect(manager.getAvailableSlots(key)).toBe(1)
  })
})

describe('ConcurrencyManager - Queueing', () => {
  let manager: ConcurrencyManager

  beforeEach(() => {
    manager = new ConcurrencyManager(defaultConfig)
  })

  test('should queue request when no slots available', async () => {
    const key = 'claude:opus' // limit: 1

    // Acquire the only slot
    await manager.acquire(key)

    // Try to acquire again - should queue
    const acquirePromise = manager.acquire(key)

    // Should be queued (not resolved yet)
    expect(manager.getQueueLength(key)).toBe(1)

    // Release slot - should process queue
    manager.release(key)

    // Wait for queue processing
    await acquirePromise

    // Queue should be empty now
    expect(manager.getQueueLength(key)).toBe(0)
    expect(manager.getAvailableSlots(key)).toBe(0)
  })

  test('should process queue in FIFO order', async () => {
    const key = 'openai' // limit: 1
    const results: number[] = []

    // Acquire the only slot
    await manager.acquire(key)

    // Queue 3 requests
    const promises = [
      manager.acquire(key).then(() => results.push(1)),
      manager.acquire(key).then(() => results.push(2)),
      manager.acquire(key).then(() => results.push(3))
    ]

    expect(manager.getQueueLength(key)).toBe(3)

    // Release slots one by one
    manager.release(key)
    await new Promise(resolve => setTimeout(resolve, 10))

    manager.release(key)
    await new Promise(resolve => setTimeout(resolve, 10))

    manager.release(key)
    await Promise.all(promises)

    // Should process in order
    expect(results).toEqual([1, 2, 3])
  })

  test('should handle timeout when waiting for slot', async () => {
    const key = 'claude:opus' // limit: 1

    // Acquire the only slot
    await manager.acquire(key)

    // Try to acquire with short timeout
    const acquirePromise = manager.acquire(key, 100)

    // Should timeout and reject
    await expect(acquirePromise).rejects.toThrow('Timeout waiting for concurrency slot')

    // Queue should be cleaned up
    expect(manager.getQueueLength(key)).toBe(0)
  })

  test('should handle multiple queues independently', async () => {
    const key1 = 'claude:opus'  // limit: 1
    const key2 = 'openai'       // limit: 1

    // Fill both slots
    await manager.acquire(key1)
    await manager.acquire(key2)

    // Queue on both
    const promise1 = manager.acquire(key1)
    const promise2 = manager.acquire(key2)

    expect(manager.getQueueLength(key1)).toBe(1)
    expect(manager.getQueueLength(key2)).toBe(1)

    // Release key1 - should only affect key1 queue
    manager.release(key1)
    await promise1

    expect(manager.getQueueLength(key1)).toBe(0)
    expect(manager.getQueueLength(key2)).toBe(1)

    // Release key2
    manager.release(key2)
    await promise2

    expect(manager.getQueueLength(key2)).toBe(0)
  })
})

describe('ConcurrencyManager - Statistics', () => {
  let manager: ConcurrencyManager

  beforeEach(() => {
    manager = new ConcurrencyManager(defaultConfig)
  })

  test('should report empty stats initially', () => {
    const stats = manager.getStats()

    expect(stats.activeSlots).toEqual({})
    expect(stats.queueLengths).toEqual({})
    expect(stats.totalActive).toBe(0)
    expect(stats.totalQueued).toBe(0)
  })

  test('should report active slots correctly', async () => {
    await manager.acquire('claude:opus')
    await manager.acquire('gemini:flash')
    await manager.acquire('gemini:flash')

    const stats = manager.getStats()

    expect(stats.activeSlots['claude:opus']).toBe(1)
    expect(stats.activeSlots['gemini:flash']).toBe(2)
    expect(stats.totalActive).toBe(3)
  })

  test('should report queue lengths correctly', async () => {
    const key1 = 'claude:opus'
    const key2 = 'openai'

    // Fill slots
    await manager.acquire(key1)
    await manager.acquire(key2)

    // Queue requests
    manager.acquire(key1)
    manager.acquire(key1)
    manager.acquire(key2)

    const stats = manager.getStats()

    expect(stats.queueLengths[key1]).toBe(2)
    expect(stats.queueLengths[key2]).toBe(1)
    expect(stats.totalQueued).toBe(3)
  })

  test('should update stats after release', async () => {
    const key = 'gemini:flash'

    await manager.acquire(key)
    await manager.acquire(key)

    let stats = manager.getStats()
    expect(stats.totalActive).toBe(2)

    manager.release(key)

    stats = manager.getStats()
    expect(stats.totalActive).toBe(1)
  })
})

describe('ConcurrencyManager - Reset', () => {
  let manager: ConcurrencyManager

  beforeEach(() => {
    manager = new ConcurrencyManager(defaultConfig)
  })

  test('should reset all queues and slots', async () => {
    // Acquire slots (use keys with limit 1)
    await manager.acquire('claude:opus')  // limit: 1
    await manager.acquire('openai')       // limit: 1

    // Queue requests (these will queue since slots are full)
    const promise1 = manager.acquire('claude:opus').catch(() => {})  // Catch rejection
    const promise2 = manager.acquire('openai').catch(() => {})        // Catch rejection

    expect(manager.getStats().totalActive).toBe(2)
    expect(manager.getStats().totalQueued).toBe(2)

    // Reset
    manager.reset()

    // Wait for promises to settle
    await Promise.all([promise1, promise2])

    const stats = manager.getStats()
    expect(stats.totalActive).toBe(0)
    expect(stats.totalQueued).toBe(0)
    expect(stats.activeSlots).toEqual({})
    expect(stats.queueLengths).toEqual({})
  })

  test('should reject queued requests on reset', async () => {
    const key = 'claude:opus'

    await manager.acquire(key)

    const promise1 = manager.acquire(key)
    const promise2 = manager.acquire(key)

    manager.reset()

    // Both promises should reject
    let error1: Error | null = null
    let error2: Error | null = null

    try {
      await promise1
    } catch (e) {
      error1 = e as Error
    }

    try {
      await promise2
    } catch (e) {
      error2 = e as Error
    }

    expect(error1).toBeDefined()
    expect(error1?.message).toContain('Concurrency manager reset')
    expect(error2).toBeDefined()
    expect(error2?.message).toContain('Concurrency manager reset')
  })

  test('should allow new acquires after reset', async () => {
    await manager.acquire('claude:opus')
    manager.reset()

    // Should work normally after reset
    await manager.acquire('claude:opus')
    expect(manager.getAvailableSlots('claude:opus')).toBe(0)
  })
})

describe('parseKey utility', () => {
  test('should parse provider:model format', () => {
    const result = parseKey('claude:opus')
    expect(result).toEqual({ provider: 'claude', model: 'opus' })
  })

  test('should parse provider-only format', () => {
    const result = parseKey('gemini')
    expect(result).toEqual({ provider: 'gemini' })
  })

  test('should handle complex model names', () => {
    const result = parseKey('claude:sonnet-3.5')
    expect(result).toEqual({ provider: 'claude', model: 'sonnet-3.5' })
  })

  test('should handle empty string', () => {
    const result = parseKey('')
    expect(result).toEqual({ provider: '' })
  })
})

describe('ConcurrencyManager - Real-world Scenarios', () => {
  test('should handle burst requests correctly', async () => {
    const config: ConcurrencyConfig = {
      default: 2,
      providers: { claude: 2 },
      models: {}
    }

    const manager = new ConcurrencyManager(config)
    const key = 'claude:opus'
    const results: number[] = []

    // Simulate 5 concurrent requests with limit of 2
    const promises = Array.from({ length: 5 }, (_, i) =>
      manager.acquire(key).then(() => {
        results.push(i)
        // Simulate work
        return new Promise(resolve => setTimeout(resolve, 50))
      }).then(() => {
        manager.release(key)
      })
    )

    await Promise.all(promises)

    // All requests should complete
    expect(results).toHaveLength(5)
    expect(manager.getAvailableSlots(key)).toBe(2)
  })

  test('should prevent API rate limits with strict limits', async () => {
    const config: ConcurrencyConfig = {
      default: 10,
      providers: {},
      models: { 'claude-opus': 1 } // Expensive model - only 1 concurrent
    }

    const manager = new ConcurrencyManager(config)
    const key = 'claude:opus'
    let concurrentCount = 0
    let maxConcurrent = 0

    const promises = Array.from({ length: 10 }, async () => {
      await manager.acquire(key)
      concurrentCount++
      maxConcurrent = Math.max(maxConcurrent, concurrentCount)

      await new Promise(resolve => setTimeout(resolve, 20))

      concurrentCount--
      manager.release(key)
    })

    await Promise.all(promises)

    // Should never exceed 1 concurrent
    expect(maxConcurrent).toBe(1)
  })

  test('should handle mixed provider usage', async () => {
    const manager = new ConcurrencyManager(defaultConfig)
    const completed: string[] = []

    const claudeTask = async (id: string) => {
      await manager.acquire('claude:opus')
      completed.push(id)
      await new Promise(resolve => setTimeout(resolve, 50))
      manager.release('claude:opus')
    }

    const geminiTask = async (id: string) => {
      await manager.acquire('gemini:flash')
      completed.push(id)
      await new Promise(resolve => setTimeout(resolve, 50))
      manager.release('gemini:flash')
    }

    await Promise.all([
      claudeTask('claude-1'),
      claudeTask('claude-2'),
      geminiTask('gemini-1'),
      geminiTask('gemini-2'),
      geminiTask('gemini-3')
    ])

    // All tasks should complete
    expect(completed).toHaveLength(5)
    expect(completed).toContain('claude-1')
    expect(completed).toContain('gemini-3')
  })
})

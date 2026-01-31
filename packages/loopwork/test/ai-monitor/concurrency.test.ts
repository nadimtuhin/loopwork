/**
 * ConcurrencyManager Test Suite
 * Tests for per-provider/model concurrency limits with key-based queuing
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { ConcurrencyManager, createConcurrencyManager, parseKey } from '@loopwork-ai/ai-monitor'
import { ConcurrencyConfig } from '@loopwork-ai/ai-monitor'

describe('ConcurrencyManager', () => {
  let manager: ConcurrencyManager
  let config: ConcurrencyConfig

  beforeEach(() => {
    config = {
      default: 3,
      providers: {
        claude: 2,
        gemini: 3
      },
      models: {
        'claude-opus': 1
      }
    }
    manager = createConcurrencyManager(config)
  })

  describe('Configuration', () => {
    test('should create manager with valid config', () => {
      expect(manager).toBeDefined()
      expect(manager.getStats()).toEqual({
        activeSlots: {},
        queueLengths: {},
        totalActive: 0,
        totalQueued: 0
      })
    })

    test('should accept default config without providers/models', () => {
      const simpleManager = createConcurrencyManager({ default: 2, providers: {}, models: {} })
      expect(simpleManager).toBeDefined()
      expect(simpleManager.getAvailableSlots('any-key')).toBe(2)
    })
  })

  describe('Limit Resolution', () => {
    test('should use model-specific limit when available', () => {
      const available = manager.getAvailableSlots('claude:opus')
      expect(available).toBe(1)
    })

    test('should use provider-specific limit when model not found', () => {
      const available = manager.getAvailableSlots('claude:sonnet')
      expect(available).toBe(2)
    })

    test('should use provider-specific limit for provider-only keys', () => {
      const available = manager.getAvailableSlots('claude')
      expect(available).toBe(2)
    })

    test('should fall back to default when no specific limit', () => {
      const available = manager.getAvailableSlots('openai')
      expect(available).toBe(3)
    })

    test('should handle unknown provider with default limit', () => {
      const available = manager.getAvailableSlots('unknown:model')
      expect(available).toBe(3)
    })
  })

  describe('Slot Management', () => {
    test('should acquire slot when available', async () => {
      await manager.acquire('claude')
      const stats = manager.getStats()
      expect(stats.totalActive).toBe(1)
      expect(stats.activeSlots['claude']).toBe(1)
    })

    test('should release acquired slot', async () => {
      await manager.acquire('claude')
      manager.release('claude')
      const stats = manager.getStats()
      expect(stats.totalActive).toBe(0)
      expect(stats.activeSlots['claude']).toBeUndefined()
    })

    test('should allow multiple concurrent requests within limit', async () => {
      const promises = [
        manager.acquire('gemini'),
        manager.acquire('gemini'),
        manager.acquire('gemini')
      ]
      await Promise.all(promises)

      const stats = manager.getStats()
      expect(stats.totalActive).toBe(3)
      expect(stats.activeSlots['gemini']).toBe(3)
    })

    test('should track available slots correctly', async () => {
      await manager.acquire('claude')
      expect(manager.getAvailableSlots('claude')).toBe(1)

      await manager.acquire('claude')
      expect(manager.getAvailableSlots('claude')).toBe(0)
    })

    test('should decrement available slots on release', async () => {
      await manager.acquire('gemini')
      await manager.acquire('gemini')
      manager.release('gemini')
      expect(manager.getAvailableSlots('gemini')).toBe(2)
    })
  })

  describe('Queueing', () => {
    test('should queue request when no slots available', async () => {
      await manager.acquire('claude')
      await manager.acquire('claude')

      let queued = false
      const queuePromise = manager.acquire('claude').then(() => {
        queued = true
      })

      await new Promise(resolve => setTimeout(resolve, 10))
      expect(queued).toBe(false)
      expect(manager.getQueueLength('claude')).toBe(1)

      manager.release('claude')
      await queuePromise

      expect(queued).toBe(true)
      expect(manager.getQueueLength('claude')).toBe(0)
    })

    test('should process queue in FIFO order', async () => {
      const results: number[] = []

      await manager.acquire('claude')
      await manager.acquire('claude')

      const p1 = manager.acquire('claude').then(() => results.push(1))
      const p2 = manager.acquire('claude').then(() => results.push(2))
      const p3 = manager.acquire('claude').then(() => results.push(3))

      await new Promise(resolve => setTimeout(resolve, 10))
      expect(results).toEqual([])

      manager.release('claude')
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(results).toEqual([1])

      manager.release('claude')
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(results).toEqual([1, 2])

      manager.release('claude')
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(results).toEqual([1, 2, 3])

      await Promise.all([p1, p2, p3])
    })

    test('should timeout queued request after specified time', async () => {
      await manager.acquire('claude')
      await manager.acquire('claude')

      let timedOut = false
      try {
        await manager.acquire('claude', 50) 
      } catch (error) {
        timedOut = error instanceof Error && error.message.includes('Timeout')
      }

      expect(timedOut).toBe(true)
      expect(manager.getQueueLength('claude')).toBe(0)
    })

    test('should queue requests independently for different keys', async () => {
      await manager.acquire('claude')
      await manager.acquire('claude')

      await manager.acquire('gemini')
      await manager.acquire('gemini')
      await manager.acquire('gemini')

      const claudeQueue = manager.acquire('claude')
      const geminiQueue = manager.acquire('gemini')

      await new Promise(resolve => setTimeout(resolve, 10))

      expect(manager.getQueueLength('claude')).toBe(1)
      expect(manager.getQueueLength('gemini')).toBe(1)

      manager.release('claude')
      await claudeQueue

      expect(manager.getQueueLength('claude')).toBe(0)
      expect(manager.getQueueLength('gemini')).toBe(1)

      manager.release('gemini')
      await geminiQueue

      expect(manager.getQueueLength('claude')).toBe(0)
      expect(manager.getQueueLength('gemini')).toBe(0)
    })
  })

  describe('Statistics', () => {
    test('should track active slots per key', async () => {
      await manager.acquire('claude')
      await manager.acquire('claude')
      await manager.acquire('gemini')
      await manager.acquire('gemini')
      await manager.acquire('gemini')

      const stats = manager.getStats()
      expect(stats.activeSlots['claude']).toBe(2)
      expect(stats.activeSlots['gemini']).toBe(3)
      expect(stats.totalActive).toBe(5)
    })

    test('should track queue lengths per key', async () => {
      await manager.acquire('claude')
      await manager.acquire('claude')

      manager.acquire('claude') 
      manager.acquire('claude') 

      await new Promise(resolve => setTimeout(resolve, 10))

      const stats = manager.getStats()
      expect(stats.queueLengths['claude']).toBe(2)
      expect(stats.totalQueued).toBe(2)
    })

    test('should update statistics on release', async () => {
      await manager.acquire('claude')
      await manager.acquire('claude')
      
      const p3 = manager.acquire('claude')

      let stats = manager.getStats()
      expect(stats.totalActive).toBe(2)
      expect(stats.totalQueued).toBe(1)

      manager.release('claude')
      
      await new Promise(resolve => setTimeout(resolve, 0))

      stats = manager.getStats()
      expect(stats.totalActive).toBe(2)
      expect(stats.totalQueued).toBe(0)
      
      await p3
    })

    test('should provide accurate available slots count', async () => {
      await manager.acquire('claude')
      await manager.acquire('claude')

      expect(manager.getAvailableSlots('claude')).toBe(0)
      expect(manager.getQueueLength('claude')).toBe(0)
    })
  })

  describe('Reset', () => {
    test('should clear all active slots', async () => {
      await manager.acquire('claude')
      await manager.acquire('gemini')

      manager.reset()

      const stats = manager.getStats()
      expect(stats.totalActive).toBe(0)
      expect(stats.activeSlots).toEqual({})
    })

    test('should clear all queues', async () => {
      await manager.acquire('claude')
      await manager.acquire('claude')

      const queuePromise = manager.acquire('claude').catch(err => {
        expect(err.message).toContain('Concurrency manager reset')
      })

      await new Promise(resolve => setTimeout(resolve, 10))
      expect(manager.getQueueLength('claude')).toBe(1)

      manager.reset()
      
      await queuePromise

      expect(manager.getQueueLength('claude')).toBe(0)
    })

    test('should reject all queued promises on reset', async () => {
      await manager.acquire('claude')
      await manager.acquire('claude')

      let rejected = false
      const queuePromise = manager.acquire('claude').catch(() => {
        rejected = true
      })

      await new Promise(resolve => setTimeout(resolve, 10))
      expect(manager.getQueueLength('claude')).toBe(1)

      manager.reset()
      await queuePromise.catch(() => {})
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(rejected).toBe(true)
    })
  })

  describe('Utility Functions', () => {
    test('createConcurrencyManager should return new instance', () => {
      const manager1 = createConcurrencyManager({ default: 2, providers: {}, models: {} })
      const manager2 = createConcurrencyManager({ default: 2, providers: {}, models: {} })

      expect(manager1).not.toBe(manager2)
    })

    test('parseKey should extract provider from simple key', () => {
      const result = parseKey('claude')
      expect(result).toEqual({ provider: 'claude', model: undefined })
    })

    test('parseKey should extract provider and model from compound key', () => {
      const result = parseKey('claude:opus')
      expect(result).toEqual({ provider: 'claude', model: 'opus' })
    })

    test('parseKey should handle keys with multiple colons', () => {
      const result = parseKey('provider:model:extra')
      expect(result).toEqual({ provider: 'provider', model: 'model' })
    })
  })

  describe('Real-world Scenarios', () => {
    test('should handle burst of requests without exceeding limits', async () => {
      const activeAtPeak: number[] = []

      const requests = Array.from({ length: 10 }, (_, i) =>
        manager.acquire('default').then(() => {
          activeAtPeak.push(Date.now())
          return new Promise(resolve => setTimeout(resolve, 100))
        }).then(() => manager.release('default'))
      )

      await new Promise(resolve => setTimeout(resolve, 20))
      expect(manager.getStats().totalActive).toBe(3)

      await Promise.all(requests)

      expect(activeAtPeak.length).toBe(10)
    })

    test('should prevent API rate limit by throttling requests', async () => {
      const requestTimes: number[] = []

      const makeRequest = async (id: number) => {
        await manager.acquire('claude')
        const startTime = Date.now()
        requestTimes.push(startTime)
        await new Promise(resolve => setTimeout(resolve, 50))
        manager.release('claude')
      }

      const requests = Array.from({ length: 5 }, (_, i) => makeRequest(i))
      await Promise.all(requests)

      expect(requestTimes.length).toBe(5)
    })

    test('should handle mixed providers with different limits', async () => {
      const claudeRequests = Array.from({ length: 4 }, () =>
        manager.acquire('claude')
          .then(() => new Promise(resolve => setTimeout(resolve, 50)))
          .then(() => manager.release('claude'))
      )

      const geminiRequests = Array.from({ length: 6 }, () =>
        manager.acquire('gemini')
          .then(() => new Promise(resolve => setTimeout(resolve, 50)))
          .then(() => manager.release('gemini'))
      )

      const allRequests = [...claudeRequests, ...geminiRequests]

      await new Promise(resolve => setTimeout(resolve, 10))

      const stats = manager.getStats()
      expect(stats.activeSlots['claude']).toBe(2)
      expect(stats.activeSlots['gemini']).toBe(3)

      await Promise.all(allRequests)
    })
  })
})

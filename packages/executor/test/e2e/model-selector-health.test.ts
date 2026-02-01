import { describe, test, expect, beforeEach } from 'bun:test'
import { ModelSelector } from '../../src/model-selector'
import type { ModelConfig } from '@loopwork-ai/contracts/executor'

/**
 * Model Selector Health E2E Tests
 * 
 * Tests model selection with health checking and circuit breaker integration.
 */

describe('Model Selector Health E2E', () => {
  const createModels = (): ModelConfig[] => [
    { name: 'model-a', model: 'model-a-v1', cli: 'test-cli' as const },
    { name: 'model-b', model: 'model-b-v1', cli: 'test-cli' as const },
    { name: 'model-c', model: 'model-c-v1', cli: 'test-cli' as const },
  ]

  describe('Circuit Breaker Integration', () => {
    test('skips models with open circuit', () => {
      const models = createModels()
      const selector = new ModelSelector(models, [], 'round-robin', {
        enableCircuitBreaker: true,
        failureThreshold: 2,
      })

      // Record failures to open circuit for model-a
      selector.recordFailure('model-a')
      selector.recordFailure('model-a')

      // model-a should be skipped
      const selected1 = selector.getNext()
      expect(selected1?.name).not.toBe('model-a')

      const selected2 = selector.getNext()
      expect(selected2?.name).not.toBe('model-a')
    })

    test('returns null when all models have open circuits', () => {
      const models = createModels()
      const selector = new ModelSelector(models, [], 'round-robin', {
        enableCircuitBreaker: true,
        failureThreshold: 1,
      })

      // Open all circuits
      for (const model of models) {
        selector.recordFailure(model.name)
      }

      // Should return null - no healthy models
      expect(selector.getNext()).toBeNull()
    })

    test('resumes using model after circuit closes', async () => {
      const models = createModels()
      const selector = new ModelSelector(models, [], 'round-robin', {
        enableCircuitBreaker: true,
        failureThreshold: 1,
        resetTimeoutMs: 100, // Short for testing
      })

      // Open circuit
      selector.recordFailure('model-a')
      expect(selector.getNext()?.name).not.toBe('model-a')

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 150))

      // model-a should be available again
      let foundModelA = false
      for (let i = 0; i < 10; i++) {
        const model = selector.getNext()
        if (model?.name === 'model-a') {
          foundModelA = true
          break
        }
      }
      expect(foundModelA).toBe(true)
    })

    test('tracks disabled models', () => {
      const models = createModels()
      const selector = new ModelSelector(models, [], 'round-robin', {
        enableCircuitBreaker: true,
        failureThreshold: 1,
      })

      expect(selector.getDisabledModels().length).toBe(0)

      selector.recordFailure('model-a')
      expect(selector.getDisabledModels()).toContain('model-a')

      selector.recordFailure('model-b')
      expect(selector.getDisabledModels()).toContain('model-a')
      expect(selector.getDisabledModels()).toContain('model-b')
    })
  })

  describe('Health Status Reporting', () => {
    test('provides accurate health status', () => {
      const models = createModels()
      const selector = new ModelSelector(models, [], 'round-robin', {
        enableCircuitBreaker: true,
        failureThreshold: 1,
      })

      let health = selector.getHealthStatus()
      expect(health.total).toBe(3)
      expect(health.available).toBe(3)
      expect(health.disabled).toBe(0)
      expect(health.circuitBreakersOpen).toBe(0)

      // Open one circuit
      selector.recordFailure('model-a')
      health = selector.getHealthStatus()
      expect(health.total).toBe(3)
      expect(health.available).toBe(2)
      expect(health.disabled).toBe(1)
      expect(health.circuitBreakersOpen).toBe(1)
    })

    test('counts available models correctly', () => {
      const models = createModels()
      const selector = new ModelSelector(models, [], 'round-robin', {
        enableCircuitBreaker: true,
        failureThreshold: 1,
      })

      expect(selector.getAvailableModelCount()).toBe(3)

      selector.recordFailure('model-a')
      expect(selector.getAvailableModelCount()).toBe(2)

      selector.recordFailure('model-b')
      expect(selector.getAvailableModelCount()).toBe(1)

      selector.recordFailure('model-c')
      expect(selector.getAvailableModelCount()).toBe(0)
    })
  })

  describe('Fallback Pool Management', () => {
    test('switches to fallback when primary exhausted', () => {
      const primary = [{ name: 'primary', model: 'p1', cli: 'test-cli' as const }]
      const fallback = [{ name: 'fallback', model: 'f1', cli: 'test-cli' as const }]

      const selector = new ModelSelector(primary, fallback, 'round-robin', {
        enableCircuitBreaker: true,
        failureThreshold: 1,
      })

      // Use primary first
      expect(selector.getNext()?.name).toBe('primary')

      // Exhaust primary
      selector.recordFailure('primary')

      // Should use fallback
      expect(selector.getNext()?.name).toBe('fallback')
    })

    test('excludes disabled models from current pool', () => {
      const primary = createModels()
      const selector = new ModelSelector(primary, [], 'round-robin', {
        enableCircuitBreaker: true,
        failureThreshold: 1,
      })

      // Disable one model
      selector.recordFailure('model-b')

      const pool = selector.getCurrentPool()
      const poolNames = pool.map(m => m.name)
      expect(poolNames).toContain('model-a')
      expect(poolNames).not.toContain('model-b')
      expect(poolNames).toContain('model-c')
    })
  })

  describe('Success Tracking', () => {
    test('records success and clears failures', () => {
      const models = createModels()
      const selector = new ModelSelector(models, [], 'round-robin', {
        enableCircuitBreaker: true,
        failureThreshold: 3,
      })

      // Some failures but not enough to open
      selector.recordFailure('model-a')
      selector.recordFailure('model-a')

      // Success should reset
      selector.recordSuccess('model-a')

      // Circuit should still be closed
      expect(selector.getNext()?.name).toBe('model-a')
    })

    test('resetModel clears circuit breaker', () => {
      const models = createModels()
      const selector = new ModelSelector(models, [], 'round-robin', {
        enableCircuitBreaker: true,
        failureThreshold: 1,
      })

      // Open circuit
      selector.recordFailure('model-a')
      expect(selector.isModelAvailable('model-a')).toBe(false)

      // Reset specific model
      selector.resetModel('model-a')
      expect(selector.isModelAvailable('model-a')).toBe(true)
    })
  })

  describe('Round-Robin with Health', () => {
    test('maintains round-robin order skipping unhealthy', () => {
      const models = createModels()
      const selector = new ModelSelector(models, [], 'round-robin', {
        enableCircuitBreaker: true,
        failureThreshold: 1,
      })

      // Disable middle model
      selector.recordFailure('model-b')

      // Should cycle through a, c (skipping b)
      const order: string[] = []
      for (let i = 0; i < 6; i++) {
        const model = selector.getNext()
        if (model) order.push(model.name)
      }

      expect(order).toEqual(['model-a', 'model-c', 'model-a', 'model-c', 'model-a', 'model-c'])
    })
  })
})

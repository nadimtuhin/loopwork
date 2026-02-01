import { describe, expect, test, beforeEach } from 'bun:test'
import { ModelSelector, type ModelSelectorOptions } from '../model-selector'
import type { ModelConfig } from '@loopwork-ai/contracts'

/**
 * Model Selector Tests
 * 
 * Comprehensive test suite for model selection and circuit breaker integration
 */

const createMockModels = (): ModelConfig[] => [
  { name: 'model1', cli: 'claude', model: 'sonnet', costWeight: 50 },
  { name: 'model2', cli: 'opencode', model: 'gemini-flash', costWeight: 30 },
  { name: 'model3', cli: 'claude', model: 'opus', costWeight: 100 },
]

const createMockFallbackModels = (): ModelConfig[] => [
  { name: 'fallback1', cli: 'gemini', model: 'pro', costWeight: 40 },
  { name: 'fallback2', cli: 'opencode', model: 'gemini-pro', costWeight: 60 },
]

describe('ModelSelector', () => {
  describe('basic functionality', () => {
    test('should instantiate with default options', () => {
      const models = createMockModels()
      const selector = new ModelSelector(models)
      
      expect(selector).toBeDefined()
      expect(selector.getTotalModelCount()).toBe(3)
    })

    test('should instantiate with fallback models', () => {
      const primary = createMockModels()
      const fallback = createMockFallbackModels()
      const selector = new ModelSelector(primary, fallback)
      
      expect(selector.getTotalModelCount()).toBe(5)
    })

    test('should filter disabled models', () => {
      const models: ModelConfig[] = [
        { name: 'enabled', cli: 'claude', model: 'sonnet', enabled: true },
        { name: 'disabled', cli: 'claude', model: 'opus', enabled: false },
      ]
      const selector = new ModelSelector(models)
      
      expect(selector.getTotalModelCount()).toBe(1)
    })
  })

  describe('selection strategies', () => {
    test('should use round-robin strategy by default', () => {
      const models = createMockModels()
      const selector = new ModelSelector(models, [], 'round-robin')
      
      const model1 = selector.getNext()
      const model2 = selector.getNext()
      const model3 = selector.getNext()
      const model4 = selector.getNext() // Should cycle back
      
      expect(model1?.name).toBe('model1')
      expect(model2?.name).toBe('model2')
      expect(model3?.name).toBe('model3')
      expect(model4?.name).toBe('model1') // Back to start
    })

    test('should use priority strategy', () => {
      const models = createMockModels()
      const selector = new ModelSelector(models, [], 'priority')
      
      const model1 = selector.getNext()
      const model2 = selector.getNext()
      
      expect(model1?.name).toBe('model1')
      expect(model2?.name).toBe('model1') // Always first
    })

    test('should use cost-aware strategy', () => {
      const models = createMockModels()
      const selector = new ModelSelector(models, [], 'cost-aware')
      
      const model = selector.getNext()
      
      // Should select lowest costWeight (model2 with 30)
      expect(model?.name).toBe('model2')
    })

    test('should use random strategy', () => {
      const models = createMockModels()
      const selector = new ModelSelector(models, [], 'random')
      
      const model = selector.getNext()
      
      // Should return one of the available models
      expect(['model1', 'model2', 'model3']).toContain(model?.name)
    })

    test('should default to round-robin for unknown strategy', () => {
      const models = createMockModels()
      const selector = new ModelSelector(models, [], 'unknown' as any)
      
      const model1 = selector.getNext()
      const model2 = selector.getNext()
      
      expect(model1?.name).toBe('model1')
      expect(model2?.name).toBe('model2')
    })
  })

  describe('circuit breaker integration', () => {
    test('should track failures and open circuit', () => {
      const models = createMockModels()
      const selector = new ModelSelector(models, [], 'round-robin', {
        failureThreshold: 2,
        enableCircuitBreaker: true,
      })
      
      selector.recordFailure('model1')
      expect(selector.isModelAvailable('model1')).toBe(true)
      
      const justOpened = selector.recordFailure('model1')
      expect(justOpened).toBe(true)
      expect(selector.isModelAvailable('model1')).toBe(false)
    })

    test('should skip models with open circuit', () => {
      const models = createMockModels()
      const selector = new ModelSelector(models, [], 'round-robin', {
        failureThreshold: 1,
        enableCircuitBreaker: true,
      })
      
      selector.recordFailure('model1') // Opens circuit immediately
      
      // Should skip model1 and return model2
      const next = selector.getNext()
      expect(next?.name).toBe('model2')
    })

    test('should return null when all models circuit-broken', () => {
      const models = createMockModels()
      const selector = new ModelSelector(models, [], 'round-robin', {
        failureThreshold: 1,
        enableCircuitBreaker: true,
      })
      
      // Break all models
      selector.recordFailure('model1')
      selector.recordFailure('model2')
      selector.recordFailure('model3')
      
      expect(selector.getNext()).toBeNull()
    })

    test('should record success and reset retry count', () => {
      const models = createMockModels()
      const selector = new ModelSelector(models, [], 'round-robin', {
        enableCircuitBreaker: true,
      })
      
      selector.trackRetry('model1')
      selector.trackRetry('model1')
      expect(selector.getRetryCount('model1')).toBe(2)
      
      selector.recordSuccess('model1')
      expect(selector.getRetryCount('model1')).toBe(0)
    })

    test('should track retries', () => {
      const models = createMockModels()
      const selector = new ModelSelector(models)
      
      expect(selector.trackRetry('model1')).toBe(1)
      expect(selector.trackRetry('model1')).toBe(2)
      expect(selector.getRetryCount('model1')).toBe(2)
    })

    test('should reset all state', () => {
      const models = createMockModels()
      const selector = new ModelSelector(models, [], 'round-robin', {
        failureThreshold: 1,
        enableCircuitBreaker: true,
      })
      
      selector.recordFailure('model1')
      expect(selector.isModelAvailable('model1')).toBe(false)
      
      selector.reset()
      expect(selector.isModelAvailable('model1')).toBe(true)
      expect(selector.getRetryCount('model1')).toBe(0)
    })

    test('should reset specific model', () => {
      const models = createMockModels()
      const selector = new ModelSelector(models, [], 'round-robin', {
        failureThreshold: 1,
        enableCircuitBreaker: true,
      })
      
      selector.recordFailure('model1')
      selector.recordFailure('model2')
      
      selector.resetModel('model1')
      
      expect(selector.isModelAvailable('model1')).toBe(true)
      expect(selector.isModelAvailable('model2')).toBe(false)
    })

    test('should get disabled models', () => {
      const models = createMockModels()
      const selector = new ModelSelector(models, [], 'round-robin', {
        failureThreshold: 1,
        enableCircuitBreaker: true,
      })
      
      selector.recordFailure('model1')
      
      const disabled = selector.getDisabledModels()
      expect(disabled).toContain('model1')
      expect(disabled).not.toContain('model2')
    })

    test('should get circuit breaker state', () => {
      const models = createMockModels()
      const selector = new ModelSelector(models, [], 'round-robin', {
        failureThreshold: 1,
        enableCircuitBreaker: true,
      })
      
      selector.recordFailure('model1')
      
      const state = selector.getCircuitBreakerState('model1')
      expect(state).toBeDefined()
      expect(state?.state).toBe('open')
      expect(state?.failures).toBe(1)
    })

    test('should return null for circuit breaker state when disabled', () => {
      const models = createMockModels()
      const selector = new ModelSelector(models, [], 'round-robin', {
        enableCircuitBreaker: false,
      })
      
      const state = selector.getCircuitBreakerState('model1')
      expect(state).toBeNull()
    })

    test('should get all circuit breaker states', () => {
      const models = createMockModels()
      const selector = new ModelSelector(models, [], 'round-robin', {
        failureThreshold: 1,
        enableCircuitBreaker: true,
      })
      
      selector.recordFailure('model1')
      
      const states = selector.getAllCircuitBreakerStates()
      expect(states.size).toBeGreaterThan(0)
    })
  })

  describe('fallback pool', () => {
    test('should switch to fallback pool', () => {
      const primary = createMockModels()
      const fallback = createMockFallbackModels()
      const selector = new ModelSelector(primary, fallback)
      
      expect(selector.isUsingFallback()).toBe(false)
      
      selector.switchToFallback()
      
      expect(selector.isUsingFallback()).toBe(true)
    })

    test('should select from fallback pool when switched', () => {
      const primary = createMockModels()
      const fallback = createMockFallbackModels()
      const selector = new ModelSelector(primary, fallback, 'round-robin')
      
      selector.switchToFallback()
      
      const model = selector.getNext()
      expect(model?.name).toBe('fallback1')
    })

    test('should auto-switch to fallback when primary exhausted', () => {
      const primary: ModelConfig[] = [
        { name: 'model1', cli: 'claude', model: 'sonnet' },
      ]
      const fallback = createMockFallbackModels()
      const selector = new ModelSelector(primary, fallback, 'round-robin', {
        failureThreshold: 1,
        enableCircuitBreaker: true,
      })
      
      // Break the only primary model
      selector.recordFailure('model1')
      
      // Should return fallback model
      const model = selector.getNext()
      expect(model?.name).toBe('fallback1')
      expect(selector.isUsingFallback()).toBe(true)
    })

    test('should reset to primary pool', () => {
      const primary = createMockModels()
      const fallback = createMockFallbackModels()
      const selector = new ModelSelector(primary, fallback)
      
      selector.switchToFallback()
      expect(selector.isUsingFallback()).toBe(true)
      
      selector.resetToFallback()
      expect(selector.isUsingFallback()).toBe(false)
    })
  })

  describe('health status', () => {
    test('should get health status summary', () => {
      const models = createMockModels()
      const selector = new ModelSelector(models, [], 'round-robin', {
        failureThreshold: 1,
        enableCircuitBreaker: true,
      })
      
      selector.recordFailure('model1')
      
      const status = selector.getHealthStatus()
      expect(status.total).toBe(3)
      expect(status.available).toBe(2)
      expect(status.disabled).toBe(1)
      expect(status.circuitBreakersOpen).toBe(1)
    })

    test('should get available model count', () => {
      const models = createMockModels()
      const selector = new ModelSelector(models, [], 'round-robin', {
        failureThreshold: 1,
        enableCircuitBreaker: true,
      })
      
      expect(selector.getAvailableModelCount()).toBe(3)
      
      selector.recordFailure('model1')
      expect(selector.getAvailableModelCount()).toBe(2)
    })

    test('should get current pool', () => {
      const primary = createMockModels()
      const selector = new ModelSelector(primary)
      
      const pool = selector.getCurrentPool()
      expect(pool.length).toBe(3)
    })

    test('should get all models', () => {
      const primary = createMockModels()
      const fallback = createMockFallbackModels()
      const selector = new ModelSelector(primary, fallback)
      
      const all = selector.getAllModels()
      expect(all.length).toBe(5)
    })
  })

  describe('exhaustion check', () => {
    test('should report exhausted after trying all models', () => {
      const models = createMockModels()
      const selector = new ModelSelector(models)
      
      expect(selector.hasExhaustedAllModels(3)).toBe(true)
      expect(selector.hasExhaustedAllModels(2)).toBe(false)
    })
  })

  describe('progressive validation', () => {
    test('should mark models as pending', () => {
      const models = createMockModels()
      const selector = new ModelSelector(models)
      
      selector.markPending('model1')
      expect(selector.hasPendingModels()).toBe(true)
      expect(selector.getPendingModels()).toContain('model1')
    })

    test('should dynamically add models', () => {
      const models = createMockModels()
      const selector = new ModelSelector(models)
      
      const newModel: ModelConfig = {
        name: 'dynamic-model',
        cli: 'opencode',
        model: 'new-model',
      }
      
      selector.addModel(newModel)
      
      expect(selector.getTotalModelCount()).toBe(4)
      // The new model should be in the pool
      const allModels = selector.getAllModels()
      expect(allModels.some(m => m.name === 'dynamic-model')).toBe(true)
    })

    test('should update existing model when adding duplicate', () => {
      const models: ModelConfig[] = [
        { name: 'model1', cli: 'claude', model: 'old-model', enabled: false },
      ]
      const selector = new ModelSelector(models)
      
      const updatedModel: ModelConfig = {
        name: 'model1',
        cli: 'claude',
        model: 'new-model',
        enabled: true,
      }
      
      selector.addModel(updatedModel)
      
      expect(selector.getTotalModelCount()).toBe(1)
      const next = selector.getNext()
      expect(next?.model).toBe('new-model')
    })

    test('should mark models as unavailable', () => {
      const models = createMockModels()
      const selector = new ModelSelector(models)
      
      selector.markModelUnavailable('model1')
      
      expect(selector.isModelAvailable('model1')).toBe(false)
    })

    test('should notify when model becomes available', () => {
      const models = createMockModels()
      const selector = new ModelSelector(models)
      
      let notified = false
      let notifiedModel: ModelConfig | null = null
      
      selector.onModelAvailable((model) => {
        notified = true
        notifiedModel = model
      })
      
      const newModel: ModelConfig = { name: 'new', cli: 'claude', model: 'sonnet' }
      selector.addModel(newModel)
      
      expect(notified).toBe(true)
      expect(notifiedModel?.name).toBe('new')
    })

    test('should allow unsubscribing from model availability', () => {
      const models = createMockModels()
      const selector = new ModelSelector(models)
      
      let callCount = 0
      const unsubscribe = selector.onModelAvailable(() => {
        callCount++
      })
      
      unsubscribe()
      
      selector.addModel({ name: 'new', cli: 'claude', model: 'sonnet' })
      expect(callCount).toBe(0)
    })

    test('should notify when validation is complete', () => {
      const models = createMockModels()
      const selector = new ModelSelector(models)
      
      let notified = false
      selector.onValidationComplete(() => {
        notified = true
      })
      
      selector.signalValidationComplete()
      expect(notified).toBe(true)
    })

    test('should check if any models are available', () => {
      const selector = new ModelSelector([])
      expect(selector.hasAvailableModels()).toBe(false)
      
      selector.addModel({ name: 'new', cli: 'claude', model: 'sonnet' })
      expect(selector.hasAvailableModels()).toBe(true)
    })

    test('should wait for available models with timeout', async () => {
      const selector = new ModelSelector([])
      
      // Should timeout if no models available
      const result = await selector.waitForAvailableModels(50)
      expect(result).toBe(false)
    })

    test('should resolve wait immediately if models already available', async () => {
      const models = createMockModels()
      const selector = new ModelSelector(models)
      
      const start = Date.now()
      const result = await selector.waitForAvailableModels(5000)
      const elapsed = Date.now() - start
      
      expect(result).toBe(true)
      expect(elapsed).toBeLessThan(100) // Should return immediately
    })

    test('should resolve wait when model becomes available', async () => {
      const selector = new ModelSelector([])
      
      // Mark a model as pending first
      selector.markPending('upcoming-model')
      
      // Start waiting
      const waitPromise = selector.waitForAvailableModels(5000)
      
      // Add model after short delay
      setTimeout(() => {
        selector.addModel({ name: 'upcoming-model', cli: 'claude', model: 'sonnet' })
      }, 50)
      
      const result = await waitPromise
      expect(result).toBe(true)
    })

    test('health status should include pending count', () => {
      const models = createMockModels()
      const selector = new ModelSelector(models)
      
      selector.markPending('model1')
      selector.markPending('model2')
      
      const status = selector.getHealthStatus()
      expect(status.pending).toBe(2)
    })
  })
})

describe('sleep', () => {
  test('should delay execution', async () => {
    const start = Date.now()
    const { sleep } = await import('../model-selector')
    await sleep(50)
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(45) // Allow small timing variance
  })

  test('should resolve after delay', async () => {
    const { sleep } = await import('../model-selector')
    const result = await sleep(10)
    expect(result).toBeUndefined()
  })
})

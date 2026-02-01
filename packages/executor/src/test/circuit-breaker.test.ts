import { describe, expect, test, beforeEach } from 'bun:test'
import { CircuitBreaker, CircuitBreakerRegistry } from '../circuit-breaker'

/**
 * Circuit Breaker Tests
 * 
 * Comprehensive test suite for circuit breaker functionality
 */

describe('CircuitBreaker', () => {
  describe('basic functionality', () => {
    test('should start in closed state', () => {
      const cb = new CircuitBreaker()
      expect(cb.isClosed()).toBe(true)
      expect(cb.isOpen()).toBe(false)
    })

    test('should allow execution when closed', () => {
      const cb = new CircuitBreaker()
      expect(cb.canExecute()).toBe(true)
    })

    test('should record success', () => {
      const cb = new CircuitBreaker()
      cb.recordSuccess()
      const state = cb.getState()
      expect(state.successes).toBe(1)
      expect(state.totalCalls).toBe(1)
    })

    test('should record failure', () => {
      const cb = new CircuitBreaker()
      cb.recordFailure()
      const state = cb.getState()
      expect(state.failures).toBe(1)
      expect(state.totalCalls).toBe(1)
      expect(state.totalFailures).toBe(1)
    })
  })

  describe('circuit opening', () => {
    test('should open after threshold failures', () => {
      const cb = new CircuitBreaker({ failureThreshold: 3 })
      
      cb.recordFailure()
      expect(cb.isClosed()).toBe(true)
      
      cb.recordFailure()
      expect(cb.isClosed()).toBe(true)
      
      cb.recordFailure()
      expect(cb.isOpen()).toBe(true)
      expect(cb.canExecute()).toBe(false)
    })

    test('should return true when circuit just opened', () => {
      const cb = new CircuitBreaker({ failureThreshold: 2 })
      
      cb.recordFailure()
      const justOpened = cb.recordFailure()
      
      expect(justOpened).toBe(true)
    })

    test('should return false when circuit already open', () => {
      const cb = new CircuitBreaker({ failureThreshold: 2 })
      
      cb.recordFailure()
      cb.recordFailure() // Opens circuit
      const justOpened = cb.recordFailure()
      
      expect(justOpened).toBe(false)
    })
  })

  describe('half-open state', () => {
    test('should transition to half-open after reset timeout', async () => {
      const cb = new CircuitBreaker({ 
        failureThreshold: 1, 
        resetTimeoutMs: 50,
        halfOpenMaxCalls: 3
      })
      
      cb.recordFailure() // Opens circuit
      expect(cb.isOpen()).toBe(true)
      
      // Wait for reset timeout
      await new Promise(r => setTimeout(r, 60))
      
      // Should be in half-open state (can execute but limited)
      expect(cb.canExecute()).toBe(true)
      const state = cb.getState()
      expect(state.state).toBe('half-open')
    })

    test('should close circuit after successful half-open calls', async () => {
      const cb = new CircuitBreaker({ 
        failureThreshold: 1, 
        resetTimeoutMs: 50,
        halfOpenMaxCalls: 3
      })
      
      cb.recordFailure() // Opens circuit
      await new Promise(r => setTimeout(r, 60))
      
      // Transition to half-open happens on first canExecute/getState call
      expect(cb.getState().state).toBe('half-open')
      
      // Three successful calls in half-open should close circuit
      // Need to call canExecute before each recordSuccess to simulate actual usage
      cb.canExecute()
      cb.recordSuccess()
      
      cb.canExecute()
      cb.recordSuccess()
      
      cb.canExecute()
      cb.recordSuccess()
      
      expect(cb.isClosed()).toBe(true)
    })

    test('should re-open on failure in half-open state', async () => {
      const cb = new CircuitBreaker({ 
        failureThreshold: 1, 
        resetTimeoutMs: 50 
      })
      
      cb.recordFailure() // Opens circuit
      await new Promise(r => setTimeout(r, 60))
      
      // Should be in half-open
      expect(cb.getState().state).toBe('half-open')
      
      // Failure in half-open re-opens circuit
      cb.recordFailure()
      expect(cb.isOpen()).toBe(true)
    })
  })

  describe('state reset', () => {
    test('should reset to closed state', () => {
      const cb = new CircuitBreaker({ failureThreshold: 2 })
      
      cb.recordFailure()
      cb.recordFailure()
      expect(cb.isOpen()).toBe(true)
      
      cb.reset()
      expect(cb.isClosed()).toBe(true)
      expect(cb.getState().failures).toBe(0)
    })

    test('should manually open circuit', () => {
      const cb = new CircuitBreaker()
      cb.open()
      expect(cb.isOpen()).toBe(true)
    })

    test('should manually close circuit', () => {
      const cb = new CircuitBreaker({ failureThreshold: 1 })
      cb.recordFailure()
      expect(cb.isOpen()).toBe(true)
      
      cb.close()
      expect(cb.isClosed()).toBe(true)
    })
  })

  describe('time until reset', () => {
    test('should return time until reset when open', async () => {
      const cb = new CircuitBreaker({ 
        failureThreshold: 1, 
        resetTimeoutMs: 100 
      })
      
      cb.recordFailure()
      const timeUntilReset = cb.getTimeUntilReset()
      
      expect(timeUntilReset).toBeGreaterThan(0)
      expect(timeUntilReset).toBeLessThanOrEqual(100)
    })

    test('should return 0 when closed', () => {
      const cb = new CircuitBreaker()
      expect(cb.getTimeUntilReset()).toBe(0)
    })
  })

  describe('state change listeners', () => {
    test('should notify listeners on state change', () => {
      const cb = new CircuitBreaker({ failureThreshold: 1 })
      let callCount = 0
      const listener = () => { callCount++ }
      
      cb.onStateChange(listener)
      cb.recordFailure()
      
      expect(callCount).toBeGreaterThan(0)
    })

    test('should allow unsubscribing listeners', () => {
      const cb = new CircuitBreaker({ failureThreshold: 1 })
      let callCount = 0
      const listener = () => { callCount++ }
      
      const unsubscribe = cb.onStateChange(listener)
      unsubscribe()
      
      cb.recordFailure()
      expect(callCount).toBe(0)
    })
  })

  describe('decrement failures on success', () => {
    test('should decrement failure count on success in closed state', () => {
      const cb = new CircuitBreaker({ failureThreshold: 5 })
      
      cb.recordFailure()
      cb.recordFailure()
      expect(cb.getState().failures).toBe(2)
      
      cb.recordSuccess()
      expect(cb.getState().failures).toBe(1)
      
      cb.recordSuccess()
      expect(cb.getState().failures).toBe(0)
    })

    test('should not go below zero', () => {
      const cb = new CircuitBreaker()
      cb.recordSuccess()
      cb.recordSuccess()
      expect(cb.getState().failures).toBe(0)
    })
  })
})

describe('CircuitBreakerRegistry', () => {
  describe('basic functionality', () => {
    test('should create breakers on demand', () => {
      const registry = new CircuitBreakerRegistry()
      const cb = registry.get('model1')
      
      expect(cb).toBeDefined()
      expect(registry.get('model1')).toBe(cb) // Same instance
    })

    test('should track multiple breakers', () => {
      const registry = new CircuitBreakerRegistry()
      
      const cb1 = registry.get('model1')
      const cb2 = registry.get('model2')
      
      expect(cb1).not.toBe(cb2)
    })
  })

  describe('convenience methods', () => {
    test('should check if model can execute', () => {
      const registry = new CircuitBreakerRegistry({ failureThreshold: 2 })
      
      expect(registry.canExecute('model1')).toBe(true)
      
      registry.recordFailure('model1')
      expect(registry.canExecute('model1')).toBe(true) // Still closed (1 failure, threshold 2)
      
      registry.recordFailure('model1') // Opens circuit (2 failures)
      expect(registry.canExecute('model1')).toBe(false)
    })

    test('should record success', () => {
      const registry = new CircuitBreakerRegistry()
      registry.recordSuccess('model1')
      
      expect(registry.get('model1').getState().successes).toBe(1)
    })

    test('should record failure', () => {
      const registry = new CircuitBreakerRegistry()
      const justOpened = registry.recordFailure('model1')
      
      expect(registry.get('model1').getState().failures).toBe(1)
    })
  })

  describe('bulk operations', () => {
    test('should get all states', () => {
      const registry = new CircuitBreakerRegistry()
      
      registry.recordSuccess('model1')
      registry.recordFailure('model2')
      
      const states = registry.getAllStates()
      
      expect(states.size).toBe(2)
      expect(states.get('model1')?.successes).toBe(1)
      expect(states.get('model2')?.failures).toBe(1)
    })

    test('should get open circuits', () => {
      const registry = new CircuitBreakerRegistry({ failureThreshold: 2 })
      
      registry.recordFailure('model1')
      registry.recordFailure('model1') // Opens (2 failures)
      
      registry.recordFailure('model2')
      // model2 still closed (only 1 failure)
      
      const open = registry.getOpenCircuits()
      
      expect(open).toContain('model1')
      expect(open).not.toContain('model2')
    })

    test('should reset all breakers', () => {
      const registry = new CircuitBreakerRegistry({ failureThreshold: 1 })
      
      registry.recordFailure('model1')
      registry.recordFailure('model1') // Opens
      
      registry.recordFailure('model2')
      registry.recordFailure('model2') // Opens
      
      expect(registry.getOpenCircuits().length).toBe(2)
      
      registry.resetAll()
      
      expect(registry.getOpenCircuits().length).toBe(0)
    })

    test('should reset specific breaker', () => {
      const registry = new CircuitBreakerRegistry({ failureThreshold: 1 })
      
      registry.recordFailure('model1')
      registry.recordFailure('model1') // Opens
      
      registry.recordFailure('model2')
      registry.recordFailure('model2') // Opens
      
      registry.reset('model1')
      
      expect(registry.canExecute('model1')).toBe(true)
      expect(registry.canExecute('model2')).toBe(false)
    })

    test('should clear all breakers', () => {
      const registry = new CircuitBreakerRegistry()
      
      registry.recordSuccess('model1')
      registry.clear()
      
      // After clear, getting model1 creates a new breaker
      const state = registry.get('model1').getState()
      expect(state.totalCalls).toBe(0)
    })
  })
})



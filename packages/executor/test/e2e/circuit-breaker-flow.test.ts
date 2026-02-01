import { describe, test, expect, beforeEach } from 'bun:test'
import { CircuitBreaker, CircuitBreakerRegistry } from '../../src/circuit-breaker'

/**
 * Circuit Breaker E2E Tests
 * 
 * Tests the complete circuit breaker lifecycle in realistic scenarios.
 */

describe('Circuit Breaker E2E', () => {
  describe('Service Degradation Scenario', () => {
    test('handles cascading service failures', () => {
      const cb = new CircuitBreaker({
        failureThreshold: 3,
        resetTimeoutMs: 1000,
      })

      // Service starts healthy
      expect(cb.canExecute()).toBe(true)
      expect(cb.isClosed()).toBe(true)

      // First failure
      cb.recordFailure()
      expect(cb.canExecute()).toBe(true)
      expect(cb.isClosed()).toBe(true)

      // Second failure
      cb.recordFailure()
      expect(cb.canExecute()).toBe(true)
      expect(cb.isClosed()).toBe(true)

      // Third failure - circuit opens
      cb.recordFailure()
      expect(cb.canExecute()).toBe(false)
      expect(cb.isOpen()).toBe(true)

      // All subsequent calls blocked
      expect(cb.canExecute()).toBe(false)
      expect(cb.canExecute()).toBe(false)
    })

    test('recovers after timeout period', async () => {
      const cb = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeoutMs: 100, // Short timeout for testing
      })

      // Open the circuit
      cb.recordFailure()
      cb.recordFailure()
      expect(cb.isOpen()).toBe(true)

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150))

      // Circuit should transition to half-open
      expect(cb.canExecute()).toBe(true)
      
      // Successful call should close circuit
      cb.recordSuccess()
      expect(cb.isClosed()).toBe(true)
    })

    test('returns to open on failure in half-open state', async () => {
      const cb = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 50,
      })

      // Open circuit
      cb.recordFailure()
      expect(cb.isOpen()).toBe(true)

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 100))

      // Should be able to try again
      expect(cb.canExecute()).toBe(true)

      // Fail again - should go back to open
      cb.recordFailure()
      expect(cb.isOpen()).toBe(true)
    })
  })

  describe('Registry Management', () => {
    test('manages multiple service breakers', () => {
      const registry = new CircuitBreakerRegistry({
        failureThreshold: 3,
        resetTimeoutMs: 5000,
      })

      const services = ['api-service', 'database', 'cache', 'queue']

      // All services start healthy
      for (const service of services) {
        expect(registry.canExecute(service)).toBe(true)
      }

      // Fail one service multiple times
      registry.recordFailure('database')
      registry.recordFailure('database')
      registry.recordFailure('database')

      // Only that service should be blocked
      expect(registry.canExecute('database')).toBe(false)
      expect(registry.canExecute('api-service')).toBe(true)
      expect(registry.canExecute('cache')).toBe(true)
      expect(registry.canExecute('queue')).toBe(true)

      // Check open circuits
      const openCircuits = registry.getOpenCircuits()
      expect(openCircuits).toContain('database')
      expect(openCircuits).not.toContain('api-service')
    })

    test('tracks all breaker states', () => {
      const registry = new CircuitBreakerRegistry({
        failureThreshold: 2,
        resetTimeoutMs: 5000,
      })

      // Create some diversity in states
      registry.recordFailure('service-a')
      registry.recordSuccess('service-b')
      registry.recordFailure('service-c')
      registry.recordFailure('service-c') // This one opens

      const states = registry.getAllStates()
      expect(states.size).toBe(3)
      expect(states.get('service-c')?.state).toBe('open')
    })

    test('resets individual breakers', () => {
      const registry = new CircuitBreakerRegistry({
        failureThreshold: 1,
        resetTimeoutMs: 5000,
      })

      // Open a circuit
      registry.recordFailure('service-a')
      expect(registry.canExecute('service-a')).toBe(false)

      // Reset it
      registry.reset('service-a')
      expect(registry.canExecute('service-a')).toBe(true)
    })

    test('resets all breakers', () => {
      const registry = new CircuitBreakerRegistry({
        failureThreshold: 1,
        resetTimeoutMs: 5000,
      })

      // Open multiple circuits
      registry.recordFailure('service-a')
      registry.recordFailure('service-b')
      registry.recordFailure('service-c')

      expect(registry.getOpenCircuits().length).toBe(3)

      // Reset all
      registry.resetAll()

      expect(registry.getOpenCircuits().length).toBe(0)
      expect(registry.canExecute('service-a')).toBe(true)
      expect(registry.canExecute('service-b')).toBe(true)
      expect(registry.canExecute('service-c')).toBe(true)
    })
  })

  describe('Metrics and Monitoring', () => {
    test('tracks failure statistics', () => {
      const cb = new CircuitBreaker({
        failureThreshold: 5,
        resetTimeoutMs: 5000,
      })

      // Record mixed results
      cb.recordSuccess()
      cb.recordFailure()
      cb.recordSuccess()
      cb.recordFailure()
      cb.recordFailure()

      const state = cb.getState()
      expect(state.totalCalls).toBe(5)
      expect(state.totalFailures).toBe(3)
      expect(state.successes).toBe(2)
    })

    test('provides time until reset', async () => {
      const cb = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 500,
      })

      // Initially no time to reset
      expect(cb.getTimeUntilReset()).toBe(0)

      // Open circuit
      cb.recordFailure()
      expect(cb.isOpen()).toBe(true)

      // Should have time remaining
      const timeRemaining = cb.getTimeUntilReset()
      expect(timeRemaining).toBeGreaterThan(0)
      expect(timeRemaining).toBeLessThanOrEqual(500)

      // Wait and check again
      await new Promise(resolve => setTimeout(resolve, 100))
      const newTimeRemaining = cb.getTimeUntilReset()
      expect(newTimeRemaining).toBeLessThan(timeRemaining)
    })
  })
})

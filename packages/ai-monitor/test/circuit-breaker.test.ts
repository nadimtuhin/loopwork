/**
 * Tests for Circuit Breaker
 */

import { describe, test, expect, beforeEach } from 'bun:test'
import { CircuitBreaker, createCircuitBreaker } from '../src/circuit-breaker'

describe('CircuitBreaker', () => {
  describe('State Transitions', () => {
    test('should start in CLOSED state', () => {
      const cb = new CircuitBreaker()
      const state = cb.getState()

      expect(state.state).toBe('closed')
      expect(state.consecutiveFailures).toBe(0)
      expect(cb.canProceed()).toBe(true)
    })

    test('should transition to OPEN after max failures', () => {
      const cb = new CircuitBreaker({ maxFailures: 3 })

      expect(cb.canProceed()).toBe(true)
      cb.recordFailure()
      expect(cb.canProceed()).toBe(true)
      cb.recordFailure()
      expect(cb.canProceed()).toBe(true)
      cb.recordFailure()

      const state = cb.getState()
      expect(state.state).toBe('open')
      expect(state.consecutiveFailures).toBe(3)
      expect(cb.canProceed()).toBe(false)
      expect(cb.isOpen()).toBe(true)
    })

    test('should transition to HALF_OPEN after cooldown', async () => {
      const cb = new CircuitBreaker({
        maxFailures: 2,
        cooldownPeriodMs: 100 // 100ms for testing
      })

      cb.recordFailure()
      cb.recordFailure()
      expect(cb.getState().state).toBe('open')

      // Wait for cooldown
      await new Promise(resolve => setTimeout(resolve, 150))

      expect(cb.canProceed()).toBe(true) // Should transition to half-open
      expect(cb.getState().state).toBe('half-open')
    })

    test('should close circuit on success in HALF_OPEN state', async () => {
      const cb = new CircuitBreaker({
        maxFailures: 2,
        cooldownPeriodMs: 100
      })

      // Open the circuit
      cb.recordFailure()
      cb.recordFailure()
      expect(cb.getState().state).toBe('open')

      // Wait for cooldown
      await new Promise(resolve => setTimeout(resolve, 150))

      // Transition to half-open
      expect(cb.canProceed()).toBe(true)
      expect(cb.getState().state).toBe('half-open')

      // Record success should close the circuit
      cb.recordSuccess()
      expect(cb.getState().state).toBe('closed')
      expect(cb.getState().consecutiveFailures).toBe(0)
    })

    test('should reopen circuit on failure in HALF_OPEN state', async () => {
      const cb = new CircuitBreaker({
        maxFailures: 2,
        cooldownPeriodMs: 100
      })

      // Open the circuit
      cb.recordFailure()
      cb.recordFailure()
      expect(cb.getState().state).toBe('open')

      // Wait for cooldown
      await new Promise(resolve => setTimeout(resolve, 150))

      // Transition to half-open
      expect(cb.canProceed()).toBe(true)
      expect(cb.getState().state).toBe('half-open')

      // Record failure should reopen the circuit
      cb.recordFailure()
      expect(cb.getState().state).toBe('open')
      expect(cb.canProceed()).toBe(false)
    })
  })

  describe('Success Recording', () => {
    test('should reset failure counter on success', () => {
      const cb = new CircuitBreaker({ maxFailures: 3 })

      cb.recordFailure()
      cb.recordFailure()
      expect(cb.getState().consecutiveFailures).toBe(2)

      cb.recordSuccess()
      expect(cb.getState().consecutiveFailures).toBe(0)
      expect(cb.getState().state).toBe('closed')
    })

    test('should close circuit on success in half-open state', async () => {
      const cb = new CircuitBreaker({
        maxFailures: 2,
        cooldownPeriodMs: 100
      })

      cb.recordFailure()
      cb.recordFailure()
      await new Promise(resolve => setTimeout(resolve, 150))

      cb.canProceed() // Transition to half-open
      cb.recordSuccess()

      expect(cb.getState().state).toBe('closed')
    })
  })

  describe('Cooldown Period', () => {
    test('should block requests during cooldown', async () => {
      const cb = new CircuitBreaker({
        maxFailures: 2,
        cooldownPeriodMs: 200
      })

      cb.recordFailure()
      cb.recordFailure()
      expect(cb.canProceed()).toBe(false)

      // Still in cooldown
      await new Promise(resolve => setTimeout(resolve, 100))
      expect(cb.canProceed()).toBe(false)

      // Cooldown elapsed
      await new Promise(resolve => setTimeout(resolve, 150))
      expect(cb.canProceed()).toBe(true)
    })

    test('should report remaining cooldown time', () => {
      const cb = new CircuitBreaker({
        maxFailures: 2,
        cooldownPeriodMs: 60000
      })

      cb.recordFailure()
      cb.recordFailure()

      const remaining = cb.getCooldownRemaining()
      expect(remaining).toBeGreaterThan(59000)
      expect(remaining).toBeLessThanOrEqual(60000)
    })

    test('should return 0 cooldown when not open', () => {
      const cb = new CircuitBreaker()
      expect(cb.getCooldownRemaining()).toBe(0)

      cb.recordFailure()
      expect(cb.getCooldownRemaining()).toBe(0)
    })
  })

  describe('Manual Reset', () => {
    test('should reset circuit breaker state', () => {
      const cb = new CircuitBreaker({ maxFailures: 2 })

      cb.recordFailure()
      cb.recordFailure()
      expect(cb.getState().state).toBe('open')
      expect(cb.getState().consecutiveFailures).toBe(2)

      cb.reset()
      expect(cb.getState().state).toBe('closed')
      expect(cb.getState().consecutiveFailures).toBe(0)
      expect(cb.canProceed()).toBe(true)
    })
  })

  describe('State Persistence', () => {
    test('should save and load state', () => {
      const cb1 = new CircuitBreaker({ maxFailures: 3 })

      cb1.recordFailure()
      cb1.recordFailure()
      const savedState = cb1.getState()

      const cb2 = new CircuitBreaker({ maxFailures: 3 })
      cb2.loadState(savedState)

      expect(cb2.getState().consecutiveFailures).toBe(2)
      expect(cb2.getState().state).toBe('closed')
    })

    test('should preserve open state across loads', () => {
      const cb1 = new CircuitBreaker({ maxFailures: 2 })

      cb1.recordFailure()
      cb1.recordFailure()
      const savedState = cb1.getState()

      const cb2 = new CircuitBreaker({ maxFailures: 2 })
      cb2.loadState(savedState)

      expect(cb2.getState().state).toBe('open')
      expect(cb2.isOpen()).toBe(true)
    })
  })

  describe('Half-Open Attempts', () => {
    test('should limit attempts in half-open state', async () => {
      const cb = new CircuitBreaker({
        maxFailures: 2,
        cooldownPeriodMs: 100,
        maxHalfOpenAttempts: 1
      })

      cb.recordFailure()
      cb.recordFailure()
      await new Promise(resolve => setTimeout(resolve, 150))

      // First attempt allowed
      expect(cb.canProceed()).toBe(true)
      expect(cb.getState().state).toBe('half-open')

      // Second attempt blocked
      expect(cb.canProceed()).toBe(false)
    })

    test('should allow multiple half-open attempts if configured', async () => {
      const cb = new CircuitBreaker({
        maxFailures: 2,
        cooldownPeriodMs: 100,
        maxHalfOpenAttempts: 3
      })

      cb.recordFailure()
      cb.recordFailure()
      await new Promise(resolve => setTimeout(resolve, 150))

      expect(cb.canProceed()).toBe(true)
      expect(cb.canProceed()).toBe(true)
      expect(cb.canProceed()).toBe(true)
      expect(cb.canProceed()).toBe(false) // 4th attempt blocked
    })
  })

  describe('Status Reporting', () => {
    test('should report closed state status', () => {
      const cb = new CircuitBreaker({ maxFailures: 3 })
      const status = cb.getStatus()

      expect(status).toContain('CLOSED')
      expect(status).toContain('failures: 0/3')
    })

    test('should report open state with cooldown', () => {
      const cb = new CircuitBreaker({ maxFailures: 2, cooldownPeriodMs: 60000 })
      cb.recordFailure()
      cb.recordFailure()

      const status = cb.getStatus()
      expect(status).toContain('OPEN')
      expect(status).toContain('cooldown:')
      expect(status).toContain('failures: 2/2')
    })

    test('should report half-open state with attempts', async () => {
      const cb = new CircuitBreaker({
        maxFailures: 2,
        cooldownPeriodMs: 100,
        maxHalfOpenAttempts: 2
      })

      cb.recordFailure()
      cb.recordFailure()
      await new Promise(resolve => setTimeout(resolve, 150))

      cb.canProceed() // Transition to half-open
      const status = cb.getStatus()

      expect(status).toContain('HALF_OPEN')
      expect(status).toContain('testing recovery')
      expect(status).toContain('attempts: 1/2')
    })
  })

  describe('Factory Function', () => {
    test('should create circuit breaker with default config', () => {
      const cb = createCircuitBreaker()
      const state = cb.getState()

      expect(state.maxFailures).toBe(3)
      expect(state.cooldownPeriodMs).toBe(60000)
      expect(state.state).toBe('closed')
    })

    test('should create circuit breaker with custom config', () => {
      const cb = createCircuitBreaker({
        maxFailures: 5,
        cooldownPeriodMs: 30000
      })
      const state = cb.getState()

      expect(state.maxFailures).toBe(5)
      expect(state.cooldownPeriodMs).toBe(30000)
    })
  })

  describe('Edge Cases', () => {
    test('should handle rapid failure recording', () => {
      const cb = new CircuitBreaker({ maxFailures: 10 })

      for (let i = 0; i < 15; i++) {
        cb.recordFailure()
      }

      expect(cb.getState().state).toBe('open')
      expect(cb.getState().consecutiveFailures).toBe(15)
    })

    test('should handle success before any failures', () => {
      const cb = new CircuitBreaker()

      cb.recordSuccess()
      expect(cb.getState().state).toBe('closed')
      expect(cb.getState().consecutiveFailures).toBe(0)
    })

    test('should handle reset when already closed', () => {
      const cb = new CircuitBreaker()

      cb.reset()
      expect(cb.getState().state).toBe('closed')
      expect(cb.canProceed()).toBe(true)
    })
  })
})

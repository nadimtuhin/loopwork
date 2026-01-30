/**
 * Circuit Breaker for AI Monitor
 * Prevents infinite healing loops by tracking failures and enforcing cooldown periods
 *
 * States:
 * - CLOSED: Normal operation, allows all requests
 * - OPEN: Failures threshold reached, blocks all requests during cooldown
 * - HALF_OPEN: Testing if system recovered, allows limited requests
 */

import type { CircuitBreakerState } from './types'
import { logger } from '../core/utils'

export class CircuitBreaker {
  private state: CircuitBreakerState
  private halfOpenAttempts: number = 0
  private maxHalfOpenAttempts: number

  constructor(config?: {
    maxFailures?: number
    cooldownPeriodMs?: number
    maxHalfOpenAttempts?: number
  }) {
    this.maxHalfOpenAttempts = config?.maxHalfOpenAttempts ?? 1

    this.state = {
      consecutiveFailures: 0,
      maxFailures: config?.maxFailures ?? 3,
      cooldownPeriodMs: config?.cooldownPeriodMs ?? 60000, // 60 seconds
      lastFailureTime: 0,
      state: 'closed'
    }
  }

  /**
   * Check if a request is allowed through the circuit breaker
   */
  canProceed(): boolean {
    const now = Date.now()

    switch (this.state.state) {
      case 'closed':
        // Normal operation
        return true

      case 'open':
        // Check if cooldown period has elapsed
        const timeSinceFail = now - this.state.lastFailureTime
        if (timeSinceFail >= this.state.cooldownPeriodMs) {
          // Transition to half-open to test recovery
          this.transitionTo('half-open')
          this.halfOpenAttempts = 1 // First attempt is being made now
          logger.debug('Circuit breaker: cooldown elapsed, entering half-open state')
          return true
        }
        // Still in cooldown
        const remainingMs = this.state.cooldownPeriodMs - timeSinceFail
        logger.debug(`Circuit breaker: blocked (cooldown: ${Math.ceil(remainingMs / 1000)}s remaining)`)
        return false

      case 'half-open':
        // Allow limited attempts to test recovery
        if (this.halfOpenAttempts < this.maxHalfOpenAttempts) {
          this.halfOpenAttempts++
          return true
        }
        logger.debug('Circuit breaker: half-open attempt limit reached')
        return false

      default:
        return false
    }
  }

  /**
   * Record a successful operation
   * Resets failure counter and closes circuit if in half-open state
   */
  recordSuccess(): void {
    if (this.state.state === 'half-open') {
      logger.debug('Circuit breaker: success in half-open state, closing circuit')
      this.transitionTo('closed')
    }

    // Reset failure counter on any success
    this.state.consecutiveFailures = 0
    this.halfOpenAttempts = 0
  }

  /**
   * Record a failed operation
   * Increments failure counter and opens circuit if threshold reached
   */
  recordFailure(): void {
    this.state.consecutiveFailures++
    this.state.lastFailureTime = Date.now()

    logger.debug(`Circuit breaker: failure recorded (${this.state.consecutiveFailures}/${this.state.maxFailures})`)

    if (this.state.state === 'half-open') {
      // Failed during recovery test, reopen circuit
      logger.warn('Circuit breaker: failed during half-open test, reopening circuit')
      this.transitionTo('open')
      return
    }

    // Check if we've hit the failure threshold
    if (this.state.consecutiveFailures >= this.state.maxFailures) {
      logger.warn(`Circuit breaker: failure threshold reached (${this.state.maxFailures}), opening circuit for ${this.state.cooldownPeriodMs}ms`)
      this.transitionTo('open')
    }
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    logger.debug('Circuit breaker: manual reset')
    this.state.consecutiveFailures = 0
    this.state.lastFailureTime = 0
    this.halfOpenAttempts = 0
    this.transitionTo('closed')
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: 'closed' | 'open' | 'half-open'): void {
    const oldState = this.state.state
    this.state.state = newState

    if (oldState !== newState) {
      logger.debug(`Circuit breaker: ${oldState} → ${newState}`)
    }
  }

  /**
   * Get current state for inspection/persistence
   */
  getState(): CircuitBreakerState {
    return { ...this.state }
  }

  /**
   * Load state from persistence
   */
  loadState(state: CircuitBreakerState): void {
    this.state = { ...state }
    this.halfOpenAttempts = 0
    logger.debug(`Circuit breaker: state loaded (${state.state}, failures: ${state.consecutiveFailures})`)
  }

  /**
   * Get time remaining in cooldown (0 if not in cooldown)
   */
  getCooldownRemaining(): number {
    if (this.state.state !== 'open') {
      return 0
    }

    const now = Date.now()
    const elapsed = now - this.state.lastFailureTime
    const remaining = this.state.cooldownPeriodMs - elapsed

    return Math.max(0, remaining)
  }

  /**
   * Check if circuit is currently open (blocking requests)
   */
  isOpen(): boolean {
    return this.state.state === 'open' && this.getCooldownRemaining() > 0
  }

  /**
   * Get human-readable status
   */
  getStatus(): string {
    const state = this.state.state === 'half-open' ? 'HALF_OPEN' : this.state.state.toUpperCase()
    const failures = this.state.consecutiveFailures

    if (this.state.state === 'open') {
      const remaining = Math.ceil(this.getCooldownRemaining() / 1000)
      return `${state} (cooldown: ${remaining}s, failures: ${failures}/${this.state.maxFailures})`
    }

    if (this.state.state === 'half-open') {
      return `${state} (testing recovery, attempts: ${this.halfOpenAttempts}/${this.maxHalfOpenAttempts})`
    }

    return `${state} (failures: ${failures}/${this.state.maxFailures})`
  }
}

/**
 * Factory function to create a circuit breaker
 */
export function createCircuitBreaker(config?: {
  maxFailures?: number
  cooldownPeriodMs?: number
  maxHalfOpenAttempts?: number
}): CircuitBreaker {
  return new CircuitBreaker(config)
}

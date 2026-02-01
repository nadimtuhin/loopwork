/**
 * Model Selection Strategies
 *
 * Provides algorithms for selecting which model to try next
 * based on configuration and current state.
 */

import type { ModelConfig, ModelSelectionStrategy } from '@loopwork-ai/contracts/executor'
import { CircuitBreakerRegistry, CircuitBreaker } from './circuit-breaker.js'

export interface ModelSelectorOptions {
  failureThreshold?: number
  resetTimeoutMs?: number
  enableCircuitBreaker?: boolean
  /**
   * Delay between model execution attempts in milliseconds.
   * Useful for rate limiting and avoiding resource contention.
   * @default 1000 (1 second)
   */
  delayBetweenAttemptsMs?: number
}

/**
 * ModelSelector manages the selection of models from primary and fallback pools
 * using configurable selection strategies.
 */
export class ModelSelector {
  private primaryModels: ModelConfig[]
  private fallbackModels: ModelConfig[]
  private strategy: ModelSelectionStrategy
  private useFallback = false
  private circuitBreakers: CircuitBreakerRegistry
  private enableCircuitBreaker: boolean

  // Indices for round-robin strategy
  private primaryIndex = 0
  private fallbackIndex = 0

  // Retry tracking per model
  private retryCount = new Map<string, number>()
  // Track disabled models
  private disabledModels = new Set<string>()

  constructor(
    primaryModels: ModelConfig[],
    fallbackModels: ModelConfig[] = [],
    strategy: ModelSelectionStrategy = 'round-robin',
    options: ModelSelectorOptions = {}
  ) {
    this.primaryModels = primaryModels.filter(m => m.enabled !== false)
    this.fallbackModels = fallbackModels.filter(m => m.enabled !== false)
    this.strategy = strategy
    this.enableCircuitBreaker = options.enableCircuitBreaker ?? true
    
    this.circuitBreakers = new CircuitBreakerRegistry({
      failureThreshold: options.failureThreshold ?? 3,
      resetTimeoutMs: options.resetTimeoutMs ?? 300000, // 5 minutes
    })
  }

  /**
   * Get the next model to try based on the selection strategy
   * Returns null if no healthy models are available
   */
  getNext(): ModelConfig | null {
    const maxAttempts = this.getTotalModelCount()
    let attempts = 0

    while (attempts < maxAttempts) {
      const model = this.selectNextInternal()
      if (!model) {
        return null
      }

      // Check if model is disabled by circuit breaker
      if (this.enableCircuitBreaker && !this.circuitBreakers.canExecute(model.name)) {
        attempts++
        continue
      }

      return model
    }

    // All models exhausted
    return null
  }

  /**
   * Internal selection without circuit breaker check
   */
  private selectNextInternal(): ModelConfig | null {
    const pool = this.useFallback ? this.fallbackModels : this.primaryModels
    
    // Filter out disabled models
    const availablePool = pool.filter(m => !this.disabledModels.has(m.name))
    
    if (availablePool.length === 0) {
      // Try fallback if not already using it
      if (!this.useFallback && this.fallbackModels.length > 0) {
        this.switchToFallback()
        return this.selectNextInternal()
      }
      return null
    }

    switch (this.strategy) {
      case 'round-robin':
        return this.selectRoundRobin(availablePool)
      case 'priority':
        return this.selectPriority(availablePool)
      case 'cost-aware':
        return this.selectCostAware(availablePool)
      case 'random':
        return this.selectRandom(availablePool)
      default:
        return this.selectRoundRobin(availablePool)
    }
  }

  /**
   * Round-robin: Cycle through models in order
   */
  private selectRoundRobin(pool: ModelConfig[]): ModelConfig {
    const index = this.useFallback ? this.fallbackIndex : this.primaryIndex
    const model = pool[index % pool.length]

    if (this.useFallback) {
      this.fallbackIndex++
    } else {
      this.primaryIndex++
    }

    return model
  }

  /**
   * Priority: Always try first available model
   */
  private selectPriority(pool: ModelConfig[]): ModelConfig {
    return pool[0]
  }

  /**
   * Cost-aware: Prefer models with lower costWeight
   */
  private selectCostAware(pool: ModelConfig[]): ModelConfig {
    // Sort by costWeight (default 50 if not specified)
    const sorted = [...pool].sort((a, b) => {
      const costA = a.costWeight ?? 50
      const costB = b.costWeight ?? 50
      return costA - costB
    })
    return sorted[0]
  }

  /**
   * Random: Random selection from pool
   */
  private selectRandom(pool: ModelConfig[]): ModelConfig {
    const randomIndex = Math.floor(Math.random() * pool.length)
    return pool[randomIndex]
  }

  /**
   * Record a successful execution for a model
   */
  recordSuccess(modelName: string): void {
    if (this.enableCircuitBreaker) {
      this.circuitBreakers.recordSuccess(modelName)
    }
    // Reset retry count on success
    this.retryCount.set(modelName, 0)
  }

  /**
   * Record a failed execution for a model
   * Returns true if the circuit breaker just opened for this model
   */
  recordFailure(modelName: string): boolean {
    const retryCount = this.getRetryCount(modelName) + 1
    this.retryCount.set(modelName, retryCount)

    if (this.enableCircuitBreaker) {
      const justOpened = this.circuitBreakers.recordFailure(modelName)
      if (justOpened) {
        this.disabledModels.add(modelName)
      }
      return justOpened
    }
    return false
  }

  /**
   * Check if a model is currently available (not circuit-broken)
   */
  isModelAvailable(modelName: string): boolean {
    if (this.disabledModels.has(modelName)) {
      // Check if circuit breaker has reset
      if (this.enableCircuitBreaker && this.circuitBreakers.canExecute(modelName)) {
        this.disabledModels.delete(modelName)
        return true
      }
      return false
    }
    return true
  }

  /**
   * Get list of currently disabled models
   */
  getDisabledModels(): string[] {
    // Check if any can be re-enabled
    for (const modelName of this.disabledModels) {
      if (this.enableCircuitBreaker && this.circuitBreakers.canExecute(modelName)) {
        this.disabledModels.delete(modelName)
      }
    }
    return Array.from(this.disabledModels)
  }

  /**
   * Get circuit breaker state for a model
   */
  getCircuitBreakerState(modelName: string) {
    if (!this.enableCircuitBreaker) {
      return null
    }
    return this.circuitBreakers.get(modelName).getState()
  }

  /**
   * Get all circuit breaker states
   */
  getAllCircuitBreakerStates() {
    if (!this.enableCircuitBreaker) {
      return new Map()
    }
    return this.circuitBreakers.getAllStates()
  }

  /**
   * Switch to fallback pool
   */
  switchToFallback(): void {
    if (!this.useFallback && this.fallbackModels.length > 0) {
      this.useFallback = true
      this.fallbackIndex = 0
    }
  }

  /**
   * Reset to primary pool
   */
  resetToFallback(): void {
    this.useFallback = false
    this.primaryIndex = 0
  }

  /**
   * Check if currently using fallback pool
   */
  isUsingFallback(): boolean {
    return this.useFallback
  }

  /**
   * Get total number of models (primary + fallback)
   */
  getTotalModelCount(): number {
    return this.primaryModels.length + this.fallbackModels.length
  }

  /**
   * Get number of currently available models
   */
  getAvailableModelCount(): number {
    const allModels = [...this.primaryModels, ...this.fallbackModels]
    return allModels.filter(m => this.isModelAvailable(m.name)).length
  }

  /**
   * Get the current pool being used
   */
  getCurrentPool(): ModelConfig[] {
    const pool = this.useFallback ? this.fallbackModels : this.primaryModels
    return pool.filter(m => !this.disabledModels.has(m.name))
  }

  /**
   * Get all models (for exhaustion check)
   */
  getAllModels(): ModelConfig[] {
    return [...this.primaryModels, ...this.fallbackModels]
  }

  /**
   * Track a retry for a model
   * Returns the new retry count
   */
  trackRetry(modelName: string): number {
    const current = this.retryCount.get(modelName) || 0
    const newCount = current + 1
    this.retryCount.set(modelName, newCount)
    return newCount
  }

  /**
   * Get retry count for a model
   */
  getRetryCount(modelName: string): number {
    return this.retryCount.get(modelName) || 0
  }

  /**
   * Reset retry count for all models
   */
  resetRetryCount(): void {
    this.retryCount.clear()
  }

  /**
   * Reset all state (indices, fallback flag, retry counts, circuit breakers)
   */
  reset(): void {
    this.primaryIndex = 0
    this.fallbackIndex = 0
    this.useFallback = false
    this.retryCount.clear()
    this.disabledModels.clear()
    this.circuitBreakers.resetAll()
  }

  /**
   * Reset a specific model's circuit breaker
   */
  resetModel(modelName: string): void {
    this.disabledModels.delete(modelName)
    this.circuitBreakers.reset(modelName)
    this.retryCount.set(modelName, 0)
  }

  /**
   * Check if we've exhausted all models (been through entire primary + fallback)
   */
  hasExhaustedAllModels(attemptCount: number): boolean {
    return attemptCount >= this.getTotalModelCount()
  }

  /**
   * Get health status summary
   */
  getHealthStatus(): {
    total: number
    available: number
    disabled: number
    circuitBreakersOpen: number
  } {
    const states = this.getAllCircuitBreakerStates()
    let openCount = 0
    for (const state of states.values()) {
      if (state.state === 'open') {
        openCount++
      }
    }

    return {
      total: this.getTotalModelCount(),
      available: this.getAvailableModelCount(),
      disabled: this.getDisabledModels().length,
      circuitBreakersOpen: openCount,
    }
  }
}

/**
 * Calculate exponential backoff delay
 *
 * @param attempt - Current attempt number (0-indexed)
 * @param baseDelayMs - Base delay in milliseconds
 * @param maxDelayMs - Maximum delay cap in milliseconds
 * @returns Delay in milliseconds
 */
export function calculateBackoffDelay(
  attempt: number,
  baseDelayMs: number = 1000,
  maxDelayMs: number = 60000
): number {
  const delay = baseDelayMs * Math.pow(2, attempt)
  return Math.min(delay, maxDelayMs)
}

/**
 * Sleep/delay utility for async operations
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after the delay
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

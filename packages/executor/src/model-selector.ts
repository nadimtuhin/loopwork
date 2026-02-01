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
  // Track disabled models (circuit breaker opened)
  private disabledModels = new Set<string>()
  // Track explicitly unavailable models (manual disable)
  private unavailableModels = new Set<string>()
  // Track pending models (still being validated)
  private pendingModels = new Set<string>()
  // Callbacks for when models become available
  private onModelAvailableCallbacks: ((model: ModelConfig) => void)[] = []
  private onValidationCompleteCallbacks: (() => void)[] = []

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
   * Peek at the next model without advancing the selector
   * Returns null if no healthy models are available
   */
  peek(): ModelConfig | null {
    const maxAttempts = this.getTotalModelCount()
    let attempts = 0

    while (attempts < maxAttempts) {
      const model = this.peekNextInternal()
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
   * Internal peek without advancing indices or circuit breaker check
   */
  private peekNextInternal(): ModelConfig | null {
    const pool = this.useFallback ? this.fallbackModels : this.primaryModels
    
    this.updateDisabledModels()
    
    const availablePool = pool.filter(m => !this.disabledModels.has(m.name))
    
    if (availablePool.length === 0) {
      if (!this.useFallback && this.fallbackModels.length > 0) {
        const fallbackAvailable = this.fallbackModels.filter(m => !this.disabledModels.has(m.name))
        if (fallbackAvailable.length > 0) {
          return fallbackAvailable[0]
        }
      }
      return null
    }

    switch (this.strategy) {
      case 'round-robin': {
        const index = this.useFallback ? this.fallbackIndex : this.primaryIndex
        return pool[index % pool.length]
      }
      case 'priority':
        return pool[0]
      case 'cost-aware':
        return this.selectCostAware(availablePool)
      case 'random':
        return this.selectRandom(availablePool)
      default:
        return pool[0]
    }
  }

  /**
   * Internal selection without circuit breaker check
   */
  private selectNextInternal(): ModelConfig | null {
    const pool = this.useFallback ? this.fallbackModels : this.primaryModels
    
    this.updateDisabledModels()
    
    const availablePool = pool.filter(m => !this.disabledModels.has(m.name))
    
    if (availablePool.length === 0) {
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
   * Update disabled models by checking if circuit breakers have reset
   */
  private updateDisabledModels(): void {
    if (!this.enableCircuitBreaker) return
    
    for (const modelName of this.disabledModels) {
      if (this.circuitBreakers.canExecute(modelName)) {
        this.disabledModels.delete(modelName)
      }
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
   * Check if a model is currently available (not circuit-broken or explicitly unavailable)
   */
  isModelAvailable(modelName: string): boolean {
    // Check if explicitly marked unavailable
    if (this.unavailableModels.has(modelName)) {
      return false
    }
    
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
    this.unavailableModels.clear()
    this.circuitBreakers.resetAll()
  }

  /**
   * Reset a specific model's circuit breaker
   */
  resetModel(modelName: string): void {
    this.disabledModels.delete(modelName)
    this.unavailableModels.delete(modelName)
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
    pending: number
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
      pending: this.pendingModels.size,
      circuitBreakersOpen: openCount,
    }
  }

  /**
   * Mark a model as pending (being validated)
   */
  markPending(modelName: string): void {
    this.pendingModels.add(modelName)
  }

  /**
   * Mark a model as available (validation complete)
   * This adds the model to the primary pool and notifies listeners
   */
  addModel(modelConfig: ModelConfig): void {
    // Remove from pending if it was there
    this.pendingModels.delete(modelConfig.name)
    
    // Check if model already exists
    const existingIndex = this.primaryModels.findIndex(m => m.name === modelConfig.name)
    if (existingIndex >= 0) {
      // Update existing model
      this.primaryModels[existingIndex] = { ...modelConfig, enabled: true }
    } else {
      // Add new model to primary pool
      this.primaryModels.push({ ...modelConfig, enabled: true })
    }
    
    // Notify listeners
    this.onModelAvailableCallbacks.forEach(cb => {
      try {
        cb(modelConfig)
      } catch {
        // Ignore callback errors
      }
    })
  }

  /**
   * Mark a model as unavailable/invalid
   */
  markModelUnavailable(modelName: string): void {
    this.pendingModels.delete(modelName)
    // Add to unavailable models set (explicit disable, won't auto-recover)
    this.unavailableModels.add(modelName)
    // Also add to disabled models for consistency
    this.disabledModels.add(modelName)
    // Disable the model config
    const model = this.primaryModels.find(m => m.name === modelName)
    if (model) {
      model.enabled = false
    }
    // Record failure in circuit breaker to prevent immediate re-enable
    if (this.enableCircuitBreaker) {
      this.circuitBreakers.recordFailure(modelName)
    }
  }

  /**
   * Register callback for when a model becomes available
   * Returns unsubscribe function
   */
  onModelAvailable(callback: (model: ModelConfig) => void): () => void {
    this.onModelAvailableCallbacks.push(callback)
    return () => {
      const index = this.onModelAvailableCallbacks.indexOf(callback)
      if (index >= 0) {
        this.onModelAvailableCallbacks.splice(index, 1)
      }
    }
  }

  /**
   * Register callback for when all pending validations are complete
   * Returns unsubscribe function
   */
  onValidationComplete(callback: () => void): () => void {
    this.onValidationCompleteCallbacks.push(callback)
    return () => {
      const index = this.onValidationCompleteCallbacks.indexOf(callback)
      if (index >= 0) {
        this.onValidationCompleteCallbacks.splice(index, 1)
      }
    }
  }

  /**
   * Signal that all validations are complete
   */
  signalValidationComplete(): void {
    this.pendingModels.clear()
    this.onValidationCompleteCallbacks.forEach(cb => {
      try {
        cb()
      } catch {
        // Ignore callback errors
      }
    })
  }

  /**
   * Check if there are any pending models being validated
   */
  hasPendingModels(): boolean {
    return this.pendingModels.size > 0
  }

  /**
   * Get list of pending model names
   */
  getPendingModels(): string[] {
    return Array.from(this.pendingModels)
  }

  /**
   * Check if any models are available (including already validated ones)
   */
  hasAvailableModels(): boolean {
    return this.getAvailableModelCount() > 0
  }

  /**
   * Wait for at least one model to become available
   * Returns immediately if models are already available
   */
  async waitForAvailableModels(timeoutMs: number = 30000): Promise<boolean> {
    // If already have available models, return immediately
    if (this.hasAvailableModels()) {
      return true
    }
    
    // If no pending models and none available, we'll never get any
    if (!this.hasPendingModels()) {
      return false
    }
    
    return new Promise((resolve) => {
      let resolved = false
      
      // Set timeout
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          unsubscribeAvailable()
          unsubscribeComplete()
          resolve(this.hasAvailableModels())
        }
      }, timeoutMs)
      
      // Subscribe to model availability
      const unsubscribeAvailable = this.onModelAvailable(() => {
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          unsubscribeComplete()
          resolve(true)
        }
      })
      
      // Also resolve if validation completes
      const unsubscribeComplete = this.onValidationComplete(() => {
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          unsubscribeAvailable()
          resolve(this.hasAvailableModels())
        }
      })
    })
  }
}

/**
 * Sleep/delay utility for async operations
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after the delay
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

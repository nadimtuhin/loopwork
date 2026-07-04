/**
 * Model Selection Strategies
 *
 * Provides algorithms for selecting which model to try next
 * based on configuration and current state.
 */

import type { ModelConfig, ModelSelectionStrategy } from '@loopwork-ai/contracts/executor'
import { CircuitBreakerRegistry, CircuitBreaker } from './circuit-breaker.js'
export { sleep } from '@loopwork-ai/utils-common'

/**
 * Options for configuring the ModelSelector
 */
export interface ModelSelectorOptions {
  /** Number of failures before circuit breaker opens */
  failureThreshold?: number
  /** Time in milliseconds before circuit breaker attempts to reset */
  resetTimeoutMs?: number
  /** Whether to enable circuit breaker logic */
  enableCircuitBreaker?: boolean
  /**
   * Delay between model execution attempts in milliseconds.
   * Useful for rate limiting and avoiding resource contention.
   * @default 1000 (1 second)
   */
  delayBetweenAttemptsMs?: number
}

/**
 * ModelSelector manages the selection of AI models from primary and fallback pools.
 * 
 * It implements various selection strategies (round-robin, priority, cost-aware, random)
 * and incorporates circuit breaker logic to temporarily disable failing models.
 * It also supports progressive validation where models can be added or removed dynamically.
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
  // Callbacks for when models wake up from sleep
  private onModelWakeUpCallbacks: ((modelName: string) => void)[] = []

  /**
   * Creates a new ModelSelector instance
   * 
   * @param primaryModels - Initial list of primary models
   * @param fallbackModels - Initial list of fallback models
   * @param strategy - Selection strategy to use
   * @param options - Additional selector options
   */
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
      resetTimeoutMs: options.resetTimeoutMs ?? 600000, // 10 minutes (model sleep duration)
    })
  }

  /**
   * Peek at the next model without advancing the selector
   * 
   * Skips models that are currently disabled by the circuit breaker.
   * 
   * @returns Model configuration or null if no healthy models are available
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
   * 
   * Advances the internal indices or state for the selected strategy.
   * Skips models that are currently disabled by the circuit breaker.
   * 
   * @returns Model configuration or null if no healthy models are available
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
        
        // Reset retry count for fresh start
        this.retryCount.set(modelName, 0)
        
        // Notify wake-up callbacks
        for (const callback of this.onModelWakeUpCallbacks) {
          try {
            callback(modelName)
          } catch {
            // Ignore callback errors
          }
        }
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
   * 
   * Resets the retry count and signals success to the circuit breaker.
   * 
   * @param modelName - Unique identifier for the model
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
   * 
   * Increments the retry count and signals failure to the circuit breaker.
   * 
   * @param modelName - Unique identifier for the model
   * @returns True if the circuit breaker just opened for this model
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
   * Check if a model is currently available
   * 
   * A model is available if it's not explicitly disabled, not in the 
   * circuit breaker 'open' state, and not still pending validation.
   * 
   * @param modelName - Unique identifier for the model
   * @returns True if the model can be used
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
   * Get list of currently disabled (sleeping) models
   * 
   * @deprecated Use getSleepingModels() instead for clearer terminology
   * @returns Array of model names
   */
  getDisabledModels(): string[] {
    return this.getSleepingModels()
  }

  /**
   * Get list of models that are currently "sleeping" due to circuit breaker
   * 
   * These models will automatically wake up after the cooldown period.
   * 
   * @returns Array of model names
   */
  getSleepingModels(): string[] {
    // Check if any can be re-enabled
    for (const modelName of this.disabledModels) {
      if (this.enableCircuitBreaker && this.circuitBreakers.canExecute(modelName)) {
        this.disabledModels.delete(modelName)
      }
    }
    return Array.from(this.disabledModels)
  }

  /**
   * Get wake-up time for a sleeping model
   * 
   * @param modelName - Unique identifier for the model
   * @returns Date when the model will be available again, or null if not sleeping
   */
  getModelWakeUpTime(modelName: string): Date | null {
    if (!this.enableCircuitBreaker || !this.disabledModels.has(modelName)) {
      return null
    }
    
    const breaker = this.circuitBreakers.get(modelName)
    const state = breaker.getState()
    
    if (state.state !== 'open' || !state.lastFailureTime) {
      return null
    }
    
    // Get reset timeout from breaker (10 minutes)
    const resetMs = 600000
    return new Date(state.lastFailureTime + resetMs)
  }

  /**
   * Get human-readable sleep status for a model
   * 
   * @param modelName - Unique identifier for the model
   * @returns Sleep status information
   */
  getModelSleepStatus(modelName: string): { 
    isSleeping: boolean 
    wakeUpTime: Date | null
    timeRemaining: string 
  } {
    if (!this.enableCircuitBreaker) {
      return { isSleeping: false, wakeUpTime: null, timeRemaining: '' }
    }

    const breaker = this.circuitBreakers.get(modelName)
    const state = breaker.getState()

    if (state.state !== 'open') {
      return { isSleeping: false, wakeUpTime: null, timeRemaining: '' }
    }

    const wakeUpTime = this.getModelWakeUpTime(modelName)
    const timeRemaining = breaker.getTimeUntilResetText()

    return {
      isSleeping: true,
      wakeUpTime,
      timeRemaining,
    }
  }

  /**
   * Get human-readable status for all configured models
   * 
   * @returns Array of model status objects
   */
  getModelStatus(): Array<{
    name: string
    status: 'available' | 'sleeping' | 'unavailable'
    wakeUpTime?: Date
    failures: number
  }> {
    const allModels = [...this.primaryModels, ...this.fallbackModels]
    
    return allModels.map(model => {
      const state = this.getCircuitBreakerState(model.name)
      const isSleeping = this.disabledModels.has(model.name) && !this.isModelAvailable(model.name)
      const isUnavailable = this.unavailableModels.has(model.name)
      
      return {
        name: model.name,
        status: isUnavailable ? 'unavailable' : isSleeping ? 'sleeping' : 'available',
        wakeUpTime: isSleeping ? this.getModelWakeUpTime(model.name) || undefined : undefined,
        failures: state?.failures || 0,
      }
    })
  }

  /**
   * Get current circuit breaker state for a specific model
   * 
   * @param modelName - Unique identifier for the model
   * @returns Circuit breaker state object or null if disabled
   */
  getCircuitBreakerState(modelName: string) {
    if (!this.enableCircuitBreaker) {
      return null
    }
    return this.circuitBreakers.get(modelName).getState()
  }

  /**
   * Get all circuit breaker states for all models
   * 
   * @returns Map of model names to circuit breaker states
   */
  getAllCircuitBreakerStates() {
    if (!this.enableCircuitBreaker) {
      return new Map()
    }
    return this.circuitBreakers.getAllStates()
  }

  /**
   * Switch the selector to use the fallback model pool
   */
  switchToFallback(): void {
    if (!this.useFallback && this.fallbackModels.length > 0) {
      this.useFallback = true
      this.fallbackIndex = 0
    }
  }

  /**
   * Reset the selector to use the primary model pool
   */
  resetToFallback(): void {
    this.useFallback = false
    this.primaryIndex = 0
  }

  /**
   * Check if the selector is currently using the fallback pool
   * 
   * @returns True if using fallback pool
   */
  isUsingFallback(): boolean {
    return this.useFallback
  }

  /**
   * Get the total number of models in both pools
   * 
   * @returns Model count
   */
  getTotalModelCount(): number {
    return this.primaryModels.length + this.fallbackModels.length
  }

  /**
   * Get the number of models that are currently available for use
   * 
   * @returns Available model count
   */
  getAvailableModelCount(): number {
    const allModels = [...this.primaryModels, ...this.fallbackModels]
    return allModels.filter(m => this.isModelAvailable(m.name)).length
  }

  /**
   * Get the current pool of models being used, filtered for healthy ones
   * 
   * @returns Array of healthy model configurations
   */
  getCurrentPool(): ModelConfig[] {
    const pool = this.useFallback ? this.fallbackModels : this.primaryModels
    return pool.filter(m => !this.disabledModels.has(m.name))
  }

  /**
   * Get all configured models regardless of pool or status
   * 
   * @returns Array of all model configurations
   */
  getAllModels(): ModelConfig[] {
    return [...this.primaryModels, ...this.fallbackModels]
  }

  /**
   * Increment and track the retry count for a model
   * 
   * @param modelName - Unique identifier for the model
   * @returns New retry count
   */
  trackRetry(modelName: string): number {
    const current = this.retryCount.get(modelName) || 0
    const newCount = current + 1
    this.retryCount.set(modelName, newCount)
    return newCount
  }

  /**
   * Get the current retry count for a model
   * 
   * @param modelName - Unique identifier for the model
   * @returns Current retry count
   */
  getRetryCount(modelName: string): number {
    return this.retryCount.get(modelName) || 0
  }

  /**
   * Reset retry counts for all models
   */
  resetRetryCount(): void {
    this.retryCount.clear()
  }

  /**
   * Reset all selector state (indices, pools, retries, circuit breakers)
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
   * Reset state for a specific model
   * 
   * @param modelName - Unique identifier for the model
   */
  resetModel(modelName: string): void {
    this.disabledModels.delete(modelName)
    this.unavailableModels.delete(modelName)
    this.circuitBreakers.reset(modelName)
    this.retryCount.set(modelName, 0)
  }

  /**
   * Check if all models in both pools have been tried
   * 
   * @param attemptCount - Current number of attempts made
   * @returns True if all models have been tried
   */
  hasExhaustedAllModels(attemptCount: number): boolean {
    return attemptCount >= this.getTotalModelCount()
  }

  /**
   * Get a summary of the current health status of all models
   * 
   * @returns Health status summary object
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
   * Mark a model as pending validation
   * 
   * @param modelName - Unique identifier for the model
   */
  markPending(modelName: string): void {
    this.pendingModels.add(modelName)
  }

  /**
   * Add or update a model and mark it as available
   * 
   * @param modelConfig - Model configuration to add or update
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
   * Mark a model as explicitly unavailable
   * 
   * @param modelName - Unique identifier for the model
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
   * Register a callback for when a model becomes available
   * 
   * @param callback - Function to call when a model is added or becomes available
   * @returns Unsubscribe function
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
   * Register a callback for when all pending validations are complete
   * 
   * @param callback - Function to call when validation finishes
   * @returns Unsubscribe function
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
   * Register a callback for when a model wakes up from the circuit breaker 'open' state
   * 
   * @param callback - Function to call with the name of the waking model
   * @returns Unsubscribe function
   */
  onModelWakeUp(callback: (modelName: string) => void): () => void {
    this.onModelWakeUpCallbacks.push(callback)
    return () => {
      const index = this.onModelWakeUpCallbacks.indexOf(callback)
      if (index >= 0) {
        this.onModelWakeUpCallbacks.splice(index, 1)
      }
    }
  }

  /**
   * Signal that all validations are complete and notify listeners
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
   * Check if any models are currently being validated
   * 
   * @returns True if validation is in progress
   */
  hasPendingModels(): boolean {
    return this.pendingModels.size > 0
  }

  /**
   * Get the names of all models currently being validated
   * 
   * @returns Array of pending model names
   */
  getPendingModels(): string[] {
    return Array.from(this.pendingModels)
  }

  /**
   * Check if any healthy models are available for use
   * 
   * @returns True if at least one model is available
   */
  hasAvailableModels(): boolean {
    return this.getAvailableModelCount() > 0
  }

  /**
   * Wait for at least one model to become available, up to a timeout
   * 
   * @param timeoutMs - Maximum time to wait in milliseconds
   * @returns Promise resolving to true if a model became available
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

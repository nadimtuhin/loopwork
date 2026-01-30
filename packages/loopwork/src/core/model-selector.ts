/**
 * Model Selection Strategies
 *
 * Provides algorithms for selecting which model to try next
 * based on configuration and current state.
 */

import type { ModelConfig, ModelSelectionStrategy } from '../contracts/cli'

/**
 * ModelSelector manages the selection of models from primary and fallback pools
 * using configurable selection strategies.
 */
export class ModelSelector {
  private primaryModels: ModelConfig[]
  private fallbackModels: ModelConfig[]
  private strategy: ModelSelectionStrategy
  private useFallback = false

  // Indices for round-robin strategy
  private primaryIndex = 0
  private fallbackIndex = 0

  // Retry tracking per model
  private retryCount = new Map<string, number>()

  constructor(
    primaryModels: ModelConfig[],
    fallbackModels: ModelConfig[] = [],
    strategy: ModelSelectionStrategy = 'round-robin'
  ) {
    this.primaryModels = primaryModels.filter(m => m.enabled !== false)
    this.fallbackModels = fallbackModels.filter(m => m.enabled !== false)
    this.strategy = strategy
  }

  /**
   * Get the next model to try based on the selection strategy
   */
  getNext(): ModelConfig | null {
    const pool = this.useFallback ? this.fallbackModels : this.primaryModels
    if (pool.length === 0) {
      return null
    }

    switch (this.strategy) {
      case 'round-robin':
        return this.selectRoundRobin(pool)
      case 'priority':
        return this.selectPriority(pool)
      case 'cost-aware':
        return this.selectCostAware(pool)
      case 'random':
        return this.selectRandom(pool)
      default:
        return this.selectRoundRobin(pool)
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
   * Get the current pool being used
   */
  getCurrentPool(): ModelConfig[] {
    return this.useFallback ? this.fallbackModels : this.primaryModels
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
   * Reset all state (indices, fallback flag, retry counts)
   */
  reset(): void {
    this.primaryIndex = 0
    this.fallbackIndex = 0
    this.useFallback = false
    this.retryCount.clear()
  }

  /**
   * Check if we've exhausted all models (been through entire primary + fallback)
   */
  hasExhaustedAllModels(attemptCount: number): boolean {
    return attemptCount >= this.getTotalModelCount()
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

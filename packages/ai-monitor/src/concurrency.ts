/**
 * Concurrency Manager for AI Monitor
 * Manages per-provider/model request limits with key-based queuing
 */

import type { ConcurrencyConfig } from './types'

interface QueueEntry {
  resolve: () => void
  reject: (error: Error) => void
  timestamp: number
}

export class ConcurrencyManager {
  private config: ConcurrencyConfig
  private activeSlots: Map<string, number> = new Map()
  private queues: Map<string, QueueEntry[]> = new Map()

  constructor(config: ConcurrencyConfig) {
    this.config = config
  }

  /**
   * Parse a key into provider and model components
   * Examples: 'claude:opus' → { provider: 'claude', model: 'opus' }
   *           'gemini' → { provider: 'gemini' }
   */
  private parseKey(key: string): { provider?: string; model?: string } {
    const parts = key.split(':')
    if (parts.length === 1) {
      return { provider: parts[0] }
    }
    return { provider: parts[0], model: parts[1] }
  }

  /**
   * Get the limit for a specific key using hierarchical resolution
   * Priority: model-specific > provider-specific > default
   */
  private getLimit(key: string): number {
    const { provider, model } = this.parseKey(key)

    // Try model-specific limit first (e.g., 'claude-opus')
    if (provider && model) {
      const modelKey = `${provider}-${model}`
      if (this.config.models[modelKey] !== undefined) {
        return this.config.models[modelKey]
      }
    }

    // Try provider-specific limit (e.g., 'claude')
    if (provider && this.config.providers[provider] !== undefined) {
      return this.config.providers[provider]
    }

    // Fall back to default
    return this.config.default
  }

  /**
   * Get current active slot count for a key
   */
  private getActiveCount(key: string): number {
    return this.activeSlots.get(key) || 0
  }

  /**
   * Check if a slot is available for the given key
   */
  getAvailableSlots(key: string): number {
    const limit = this.getLimit(key)
    const active = this.getActiveCount(key)
    return Math.max(0, limit - active)
  }

  /**
   * Acquire a slot for the given key (waits if none available)
   * Returns a promise that resolves when a slot is available
   */
  async acquire(key: string, timeoutMs?: number): Promise<void> {
    const available = this.getAvailableSlots(key)

    if (available > 0) {
      // Slot immediately available
      this.activeSlots.set(key, this.getActiveCount(key) + 1)
      return
    }

    // Need to wait in queue
    return new Promise<void>((resolve, reject) => {
      const entry: QueueEntry = {
        resolve,
        reject,
        timestamp: Date.now()
      }

      if (!this.queues.has(key)) {
        this.queues.set(key, [])
      }
      this.queues.get(key)!.push(entry)

      // Set timeout if specified
      if (timeoutMs) {
        setTimeout(() => {
          const queue = this.queues.get(key)
          if (queue) {
            const index = queue.indexOf(entry)
            if (index !== -1) {
              queue.splice(index, 1)
              reject(new Error(`Timeout waiting for concurrency slot: ${key}`))
            }
          }
        }, timeoutMs)
      }
    })
  }

  /**
   * Release a slot for the given key
   * Processes the next queued request if any
   */
  release(key: string): void {
    const active = this.getActiveCount(key)
    if (active === 0) {
      return
    }

    this.activeSlots.set(key, active - 1)

    // Process next queued request if any
    const queue = this.queues.get(key)
    if (queue && queue.length > 0) {
      const next = queue.shift()!
      this.activeSlots.set(key, this.getActiveCount(key) + 1)
      next.resolve()
    }
  }

  /**
   * Get queue length for a specific key
   */
  getQueueLength(key: string): number {
    const queue = this.queues.get(key)
    return queue ? queue.length : 0
  }

  /**
   * Clear all queues and reset active slots (for testing/cleanup)
   */
  reset(): void {
    // Reject all queued requests
    for (const [key, queue] of this.queues.entries()) {
      for (const entry of queue) {
        entry.reject(new Error(`Concurrency manager reset: ${key}`))
      }
    }
    this.queues.clear()
    this.activeSlots.clear()
  }

  /**
   * Get statistics about current state
   */
  getStats(): {
    activeSlots: Record<string, number>
    queueLengths: Record<string, number>
    totalActive: number
    totalQueued: number
  } {
    const activeSlots: Record<string, number> = {}
    const queueLengths: Record<string, number> = {}
    let totalActive = 0
    let totalQueued = 0

    for (const [key, count] of this.activeSlots.entries()) {
      if (count > 0) {
        activeSlots[key] = count
        totalActive += count
      }
    }

    for (const [key, queue] of this.queues.entries()) {
      if (queue.length > 0) {
        queueLengths[key] = queue.length
        totalQueued += queue.length
      }
    }

    return { activeSlots, queueLengths, totalActive, totalQueued }
  }
}

/**
 * Helper function to create a concurrency manager with config
 */
export function createConcurrencyManager(config: ConcurrencyConfig): ConcurrencyManager {
  return new ConcurrencyManager(config)
}

/**
 * Helper function to parse a concurrency key
 */
export function parseKey(key: string): { provider?: string; model?: string } {
  const parts = key.split(':')
  if (parts.length === 1) {
    return { provider: parts[0] }
  }
  return { provider: parts[0], model: parts[1] }
}

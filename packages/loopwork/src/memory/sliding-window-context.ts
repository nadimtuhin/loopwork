/**
 * Sliding Window Context Manager
 *
 * Manages context window for AI models using a sliding window approach.
 * Keeps most recent/relevant context within token limits.
 */

export interface ContextItem {
  id: string
  content: string
  type: 'user' | 'assistant' | 'system' | 'retrieved'
  timestamp: number
  tokens: number
  priority: number
  metadata?: Record<string, unknown>
}

export interface SlidingWindowOptions {
  /** Maximum tokens in the context window */
  maxTokens: number

  /** Tokens to reserve for system prompt */
  reservedTokens?: number

  /** Whether to prioritize recent messages */
  prioritizeRecent?: boolean

  /** Whether to prioritize high-priority items */
  prioritizeHighPriority?: boolean

  /** Custom token estimation function */
  tokenEstimator?: (content: string) => number
}

export interface ContextStats {
  totalTokens: number
  itemCount: number
  oldestTimestamp: number | null
  newestTimestamp: number | null
  droppedItems: number
  droppedTokens: number
}

export interface ContextSummary {
  items: ContextItem[]
  stats: ContextStats
  trimmed: boolean
}

/**
 * Sliding Window Context Manager
 *
 * Manages a context window that automatically evicts old/low-priority
 * items when token limit is exceeded.
 */
export class SlidingWindowContextManager {
  private items: ContextItem[] = []
  private maxTokens: number
  private reservedTokens: number
  private prioritizeRecent: boolean
  private prioritizeHighPriority: boolean
  private tokenEstimator: (content: string) => number
  private droppedItemsCount = 0
  private droppedTokensCount = 0

  constructor(options: SlidingWindowOptions) {
    this.maxTokens = options.maxTokens
    this.reservedTokens = options.reservedTokens ?? 0
    this.prioritizeRecent = options.prioritizeRecent ?? true
    this.prioritizeHighPriority = options.prioritizeHighPriority ?? true
    this.tokenEstimator = options.tokenEstimator ?? this.defaultTokenEstimator
  }

  /**
   * Add an item to the context window
   */
  add(item: Omit<ContextItem, 'tokens' | 'timestamp'>): ContextItem {
    const contextItem: ContextItem = {
      ...item,
      timestamp: Date.now(),
      tokens: this.tokenEstimator(item.content),
    }

    this.items.push(contextItem)
    this.enforceLimit()

    return contextItem
  }

  /**
   * Add multiple items at once
   */
  addBatch(items: Array<Omit<ContextItem, 'tokens' | 'timestamp'>>): ContextItem[] {
    const contextItems: ContextItem[] = items.map((item) => ({
      ...item,
      timestamp: Date.now(),
      tokens: this.tokenEstimator(item.content),
    }))

    this.items.push(...contextItems)
    this.enforceLimit()

    return contextItems
  }

  /**
   * Get all items in the context window
   */
  getAll(): ContextItem[] {
    return [...this.items]
  }

  /**
   * Get items by type
   */
  getByType(type: ContextItem['type']): ContextItem[] {
    return this.items.filter((item) => item.type === type)
  }

  /**
   * Get a specific item by ID
   */
  getById(id: string): ContextItem | undefined {
    return this.items.find((item) => item.id === id)
  }

  /**
   * Remove an item from the context window
   */
  remove(id: string): boolean {
    const index = this.items.findIndex((item) => item.id === id)
    if (index === -1) return false

    this.items.splice(index, 1)
    return true
  }

  /**
   * Update an existing item
   */
  update(id: string, updates: Partial<Omit<ContextItem, 'id' | 'tokens' | 'timestamp'>>): ContextItem | null {
    const index = this.items.findIndex((item) => item.id === id)
    if (index === -1) return null

    const item = this.items[index]

    if (updates.content !== undefined) {
      item.content = updates.content
      item.tokens = this.tokenEstimator(updates.content)
    }

    if (updates.priority !== undefined) {
      item.priority = updates.priority
    }

    if (updates.metadata !== undefined) {
      item.metadata = updates.metadata
    }

    this.enforceLimit()

    return item
  }

  /**
   * Clear all items from the context window
   */
  clear(): void {
    this.items = []
  }

  /**
   * Get the current context as a formatted string
   */
  toString(): string {
    return this.items.map((item) => item.content).join('\n')
  }

  /**
   * Get statistics about the context window
   */
  getStats(): ContextStats {
    const timestamps = this.items.map((item) => item.timestamp)

    return {
      totalTokens: this.items.reduce((sum, item) => sum + item.tokens, 0),
      itemCount: this.items.length,
      oldestTimestamp: timestamps.length > 0 ? Math.min(...timestamps) : null,
      newestTimestamp: timestamps.length > 0 ? Math.max(...timestamps) : null,
      droppedItems: this.droppedItemsCount,
      droppedTokens: this.droppedTokensCount,
    }
  }

  /**
   * Get a summary with optional token limit
   */
  getSummary(maxTokens?: number): ContextSummary {
    if (maxTokens && this.getStats().totalTokens > maxTokens) {
      const workingItems = [...this.items]
      const trimmed: ContextItem[] = []
      let totalTokens = 0

      // Sort by priority and recency
      this.sortItems(workingItems)

      for (const item of workingItems) {
        if (totalTokens + item.tokens <= maxTokens) {
          trimmed.push(item)
          totalTokens += item.tokens
        } else {
          this.droppedItemsCount++
          this.droppedTokensCount += item.tokens
        }
      }

      return {
        items: trimmed,
        stats: this.getStats(),
        trimmed: true,
      }
    }

    return {
      items: [...this.items],
      stats: this.getStats(),
      trimmed: false,
    }
  }

  /**
   * Get available token budget
   */
  getAvailableTokens(): number {
    const usedTokens = this.items.reduce((sum, item) => sum + item.tokens, 0)
    return this.maxTokens - this.reservedTokens - usedTokens
  }

  /**
   * Check if context window is within limits
   */
  isWithinLimit(): boolean {
    const usedTokens = this.items.reduce((sum, item) => sum + item.tokens, 0)
    return usedTokens <= this.maxTokens - this.reservedTokens
  }

  /**
   * Peek at the oldest item without removing it
   */
  peekOldest(): ContextItem | null {
    if (this.items.length === 0) return null
    return this.items[0]
  }

  /**
   * Peek at the newest item
   */
  peekNewest(): ContextItem | null {
    if (this.items.length === 0) return null
    return this.items[this.items.length - 1]
  }

  /**
   * Get the count of items
   */
  size(): number {
    return this.items.length
  }

  /**
   * Get the total token count
   */
  tokenCount(): number {
    return this.items.reduce((sum, item) => sum + item.tokens, 0)
  }

  /**
   * Enforce the token limit by removing lowest priority items
   */
  private enforceLimit(): void {
    const availableTokens = this.maxTokens - this.reservedTokens

    if (this.getStats().totalTokens <= availableTokens) {
      return
    }

    // Sort items by priority (higher first) and recency (newer first)
    this.sortItems(this.items)

    // Remove items from the end until we're within limit
    while (this.getStats().totalTokens > availableTokens && this.items.length > 0) {
      const removed = this.items.pop()
      if (removed) {
        this.droppedItemsCount++
        this.droppedTokensCount += removed.tokens
      }
    }
  }

  /**
   * Sort items by priority and recency
   */
  private sortItems(items: ContextItem[]): void {
    items.sort((a, b) => {
      // First, sort by priority (higher priority first)
      if (this.prioritizeHighPriority) {
        if (b.priority !== a.priority) {
          return b.priority - a.priority
        }
      }

      // Then, sort by recency (newer first)
      if (this.prioritizeRecent) {
        return b.timestamp - a.timestamp
      }

      return 0
    })
  }

  /**
   * Default token estimator (rough approximation)
   */
  private defaultTokenEstimator(content: string): number {
    // Average of 4 characters per token
    return Math.ceil(content.length / 4)
  }
}

/**
 * Create a SlidingWindowContextManager with default settings
 */
export function createSlidingWindowContextManager(maxTokens: number): SlidingWindowContextManager {
  return new SlidingWindowContextManager({ maxTokens })
}

/**
 * Offline Queue
 *
 * Queues task operations when the backend is unavailable,
 * and flushes them when connectivity is restored.
 */

export interface QueuedOperation {
  type: string
  taskId: string
  data?: unknown
  timestamp: number
}

export interface OfflineQueueOptions {
  maxSize?: number
  persistToDisk?: boolean
}

/**
 * OfflineQueue manages a queue of task operations
 * to be synced when backend comes back online
 */
export class OfflineQueue {
  private queue: QueuedOperation[] = []
  private maxSize: number
  private persistToDisk: boolean

  constructor(
    private state: unknown,
    options: OfflineQueueOptions = {}
  ) {
    this.maxSize = options.maxSize ?? 1000
    this.persistToDisk = options.persistToDisk ?? false
  }

  /**
   * Enqueue an operation to be executed when backend is available
   */
  async enqueue(operation: QueuedOperation): Promise<void> {
    if (this.queue.length >= this.maxSize) {
      // Remove oldest operation if queue is full
      this.queue.shift()
    }

    this.queue.push({
      ...operation,
      timestamp: operation.timestamp || Date.now(),
    })
  }

  /**
   * Get the number of queued operations
   */
  size(): number {
    return this.queue.length
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.queue.length === 0
  }

  /**
   * Get all queued operations
   */
  getAll(): QueuedOperation[] {
    return [...this.queue]
  }

  /**
   * Clear the queue
   */
  clear(): void {
    this.queue = []
  }

  /**
   * Flush queued operations (placeholder for actual sync logic)
   * This will be called when backend connectivity is restored
   */
  async flush(): Promise<void> {
    // Placeholder implementation
    // In a full implementation, this would sync queued operations
    // back to the primary backend
    this.queue = []
  }

  /**
   * Remove a specific operation from queue by ID
   */
  remove(operationId: number): boolean {
    if (operationId >= 0 && operationId < this.queue.length) {
      this.queue.splice(operationId, 1)
      return true
    }
    return false
  }
}

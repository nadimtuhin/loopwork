/**
 * Offline Queue
 *
 * Queues task operations when the backend is unavailable,
 * and flushes them when connectivity is restored.
 */

import fs from 'fs'
import type { LoopworkState } from './loopwork-state'
import type { TaskBackend, BackendPlugin } from '../contracts/backend'
import type { Task, Priority } from '../contracts/task'
import { logger } from './utils'

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
    private state: LoopworkState,
    options: OfflineQueueOptions = {}
  ) {
    this.maxSize = options.maxSize ?? 1000
    this.persistToDisk = options.persistToDisk ?? false

    if (this.persistToDisk) {
      this.load()
    }
  }

  /**
   * Load queue from disk
   */
  private load(): void {
    try {
      const filePath = this.state.paths.offlineQueue()
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8')
        this.queue = JSON.parse(content)
      }
    } catch (error) {
      logger.warn(`Failed to load offline queue: ${error}`)
    }
  }

  /**
   * Save queue to disk
   */
  private save(): void {
    if (!this.persistToDisk) return

    try {
      const filePath = this.state.paths.offlineQueue()
      if (this.queue.length === 0) {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
        }
      } else {
        this.state.writeJson(filePath, this.queue)
      }
    } catch (error) {
      logger.error(`Failed to save offline queue: ${error}`)
    }
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

    this.save()
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
    this.save()
  }

  /**
   * Flush queued operations
   * This will be called when backend connectivity is restored
   */
  async flush(backend: TaskBackend): Promise<void> {
    if (this.isEmpty()) return

    const failedOps: QueuedOperation[] = []
    const initialSize = this.queue.length

    logger.info(`Flushing ${initialSize} offline operations...`)

    for (const op of this.queue) {
      try {
        await this.executeOperation(backend, op)
      } catch (error) {
        logger.warn(`Failed to flush operation ${op.type} for ${op.taskId}: ${error}`)
        failedOps.push(op)
      }
    }

    this.queue = failedOps
    this.save()

    const succeeded = initialSize - failedOps.length
    if (succeeded > 0) {
      logger.info(`Successfully flushed ${succeeded} operations`)
    }
    if (failedOps.length > 0) {
      logger.warn(`${failedOps.length} operations failed to flush and remain in queue`)
    }
  }

  /**
   * Execute a single operation against the backend
   */
  private async executeOperation(backend: TaskBackend, op: QueuedOperation): Promise<void> {
    const data = (op.data as Record<string, unknown>) || {}

    switch (op.type) {
      case 'markInProgress':
        await backend.markInProgress(op.taskId)
        break
      case 'markCompleted':
        await backend.markCompleted(op.taskId, data.comment as string | undefined)
        break
      case 'markFailed':
        await backend.markFailed(op.taskId, (data.error as string) || 'Unknown error')
        break
      case 'markQuarantined':
        await backend.markQuarantined(op.taskId, (data.reason as string) || 'Unknown reason')
        break
      case 'resetToPending':
        await backend.resetToPending(op.taskId)
        break
      case 'addComment':
        if (backend.addComment) {
          await backend.addComment(op.taskId, (data.comment as string) || '')
        }
        break
      case 'updateTask':
        if (backend.updateTask) {
          await backend.updateTask(op.taskId, (data.updates as Partial<Task>) || {})
        }
        break
      case 'setPriority':
        if ((backend as BackendPlugin).setPriority) {
          await (backend as BackendPlugin).setPriority!(op.taskId, data.priority as Priority)
        }
        break
      default:
        logger.warn(`Unknown offline operation type: ${op.type}`)
    }
  }

  /**
   * Remove a specific operation from queue by ID
   */
  remove(operationId: number): boolean {
    if (operationId >= 0 && operationId < this.queue.length) {
      this.queue.splice(operationId, 1)
      this.save()
      return true
    }
    return false
  }
}

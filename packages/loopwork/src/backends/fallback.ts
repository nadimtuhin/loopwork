/**
 * Fallback Task Backend
 *
 * Wraps two backends: primary and fallback.
 * - Read operations try primary first, then fallback on connection/5xx errors
 * - Write operations only use primary
 */

import type { Task, TaskBackend, FindTaskOptions, UpdateResult, PingResult, ApiQuotaInfo } from './types'
import type { BackendPlugin } from '../contracts'

export interface OfflineQueue {
  enqueue(operation: unknown): Promise<void>
  flush(): Promise<void>
}

/**
 * FallbackTaskBackend implements TaskBackend interface
 * Provides automatic failover from primary to fallback backend
 */
export class FallbackTaskBackend implements TaskBackend {
  readonly name = 'fallback'

  constructor(
    private primaryBackend: BackendPlugin,
    private fallbackBackend: BackendPlugin,
    private offlineQueue?: OfflineQueue
  ) {}

  /**
   * Try primary backend, fall back on error
   */
  private async tryWithFallback<T>(
    operation: (backend: BackendPlugin) => Promise<T>,
    _operationName: string
  ): Promise<T> {
    try {
      return await operation(this.primaryBackend)
    } catch (error) {
      const err = error as Record<string, unknown>
      const statusCode = err.statusCode as number | undefined
      const isNetworkError = err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND'

      // Fall back on network errors or 5xx errors
      if (isNetworkError || (statusCode && statusCode >= 500)) {
        try {
          return await operation(this.fallbackBackend)
        } catch (fallbackError) {
          throw fallbackError
        }
      }

      throw error
    }
  }

  async findNextTask(options?: FindTaskOptions): Promise<Task | null> {
    return this.tryWithFallback(
      (backend) => backend.findNextTask(options),
      'findNextTask'
    )
  }

  async claimTask(options?: FindTaskOptions): Promise<Task | null> {
    return this.tryWithFallback(
      (backend) => backend.claimTask?.(options) || backend.findNextTask(options),
      'claimTask'
    )
  }

  async getTask(taskId: string): Promise<Task | null> {
    return this.tryWithFallback((backend) => backend.getTask(taskId), 'getTask')
  }

  async listPendingTasks(options?: FindTaskOptions): Promise<Task[]> {
    return this.tryWithFallback(
      (backend) => backend.listPendingTasks(options),
      'listPendingTasks'
    )
  }

  async listTasks(options?: FindTaskOptions): Promise<Task[]> {
    return this.tryWithFallback(
      (backend) => backend.listTasks(options),
      'listTasks'
    )
  }

  async countPending(options?: FindTaskOptions): Promise<number> {
    return this.tryWithFallback(
      (backend) => backend.countPending(options),
      'countPending'
    )
  }

  // Write operations only use primary
  async markInProgress(taskId: string): Promise<UpdateResult> {
    return this.primaryBackend.markInProgress(taskId)
  }

  async markCompleted(taskId: string, comment?: string): Promise<UpdateResult> {
    return this.primaryBackend.markCompleted(taskId, comment)
  }

  async markFailed(taskId: string, error: string): Promise<UpdateResult> {
    return this.primaryBackend.markFailed(taskId, error)
  }

  async markQuarantined(taskId: string, reason: string): Promise<UpdateResult> {
    return this.primaryBackend.markQuarantined(taskId, reason)
  }

  async resetToPending(taskId: string): Promise<UpdateResult> {
    return this.primaryBackend.resetToPending(taskId)
  }

  async updateTask(taskId: string, updates: Partial<Task>): Promise<UpdateResult> {
    if (!this.primaryBackend.updateTask) {
      return { success: false, error: 'updateTask not supported' }
    }
    return this.primaryBackend.updateTask(taskId, updates)
  }

  async resetAllInProgress(): Promise<UpdateResult> {
    if (!this.primaryBackend.resetAllInProgress) {
      return { success: false, error: 'resetAllInProgress not supported' }
    }
    return this.primaryBackend.resetAllInProgress()
  }

  async addComment(taskId: string, comment: string): Promise<UpdateResult> {
    if (!this.primaryBackend.addComment) {
      return { success: false, error: 'addComment not supported' }
    }
    return this.primaryBackend.addComment(taskId, comment)
  }

  async ping(): Promise<PingResult> {
    return this.tryWithFallback((backend) => backend.ping(), 'ping')
  }

  async getQuotaInfo(): Promise<ApiQuotaInfo> {
    if (!this.primaryBackend.getQuotaInfo) {
      return { limit: 0, remaining: 0, reset: new Date() }
    }
    return this.tryWithFallback(
      (backend) => backend.getQuotaInfo?.() || Promise.resolve({ limit: 0, remaining: 0, reset: new Date() }),
      'getQuotaInfo'
    )
  }

  async getSubTasks(taskId: string): Promise<Task[]> {
    return this.tryWithFallback(
      (backend) => backend.getSubTasks(taskId),
      'getSubTasks'
    )
  }

  async getDependencies(taskId: string): Promise<Task[]> {
    return this.tryWithFallback(
      (backend) => backend.getDependencies(taskId),
      'getDependencies'
    )
  }

  async getDependents(taskId: string): Promise<Task[]> {
    return this.tryWithFallback(
      (backend) => backend.getDependents(taskId),
      'getDependents'
    )
  }

  async areDependenciesMet(taskId: string): Promise<boolean> {
    return this.tryWithFallback(
      (backend) => backend.areDependenciesMet(taskId),
      'areDependenciesMet'
    )
  }

  async createTask(task: Omit<Task, 'id' | 'status'>): Promise<Task> {
    if (!this.primaryBackend.createTask) {
      throw new Error('createTask not supported by primary backend')
    }
    return this.primaryBackend.createTask(task)
  }

  async createSubTask(parentId: string, task: Omit<Task, 'id' | 'parentId' | 'status'>): Promise<Task> {
    if (!this.primaryBackend.createSubTask) {
      throw new Error('createSubTask not supported by primary backend')
    }
    return this.primaryBackend.createSubTask(parentId, task)
  }

  async addDependency(taskId: string, dependsOnId: string): Promise<UpdateResult> {
    if (!this.primaryBackend.addDependency) {
      return { success: false, error: 'addDependency not supported' }
    }
    return this.primaryBackend.addDependency(taskId, dependsOnId)
  }

  async removeDependency(taskId: string, dependsOnId: string): Promise<UpdateResult> {
    if (!this.primaryBackend.removeDependency) {
      return { success: false, error: 'removeDependency not supported' }
    }
    return this.primaryBackend.removeDependency(taskId, dependsOnId)
  }

  async rescheduleCompleted(taskId: string, scheduledFor?: string): Promise<UpdateResult> {
    if (!this.primaryBackend.rescheduleCompleted) {
      return { success: false, error: 'rescheduleCompleted not supported' }
    }
    return this.primaryBackend.rescheduleCompleted(taskId, scheduledFor)
  }
}

/**
 * Backend Interface Contract
 */

import type {
  Task,
  Priority,
  FindTaskOptions,
  UpdateResult,
  PingResult,
  ApiQuotaInfo,
  BackendConfig,
  JsonBackendConfig,
  GithubBackendConfig,
  FallbackBackendConfig,
  LooseBackendConfig,
} from './types'
export type { TaskStatus } from './types'
import type { LoopworkPlugin } from './plugin'

/**
 * Backend health check result
 */
export type { PingResult, ApiQuotaInfo }

/**
 * Task Backend Interface
 *
 * All task sources (GitHub Issues, JSON files, etc.) must implement this interface.
 */
export interface TaskBackend {
  /** Backend name for logging */
  readonly name: string

  /** Find the next pending task */
  findNextTask(options?: FindTaskOptions): Promise<Task | null>

  /**
   * Atomically claim the next available task (find + mark in-progress)
   * Used for parallel execution to prevent race conditions.
   * If not implemented, falls back to findNextTask + markInProgress.
   */
  claimTask?(options?: FindTaskOptions): Promise<Task | null>

  /** Get a specific task by ID */
  getTask(taskId: string): Promise<Task | null>

  /** List all pending tasks */
  listPendingTasks(options?: FindTaskOptions): Promise<Task[]>

  /** List tasks matching criteria */
  listTasks(options?: FindTaskOptions): Promise<Task[]>

  /** Count pending tasks */
  countPending(options?: FindTaskOptions): Promise<number>

  /** Mark task as in-progress */
  markInProgress(taskId: string): Promise<UpdateResult>

  /** Mark task as completed */
  markCompleted(taskId: string, comment?: string): Promise<UpdateResult>

  /** Mark task as failed */
  markFailed(taskId: string, error: string): Promise<UpdateResult>

  /** Mark task as quarantined */
  markQuarantined(taskId: string, reason: string): Promise<UpdateResult>

  /** Reset task to pending */
  resetToPending(taskId: string): Promise<UpdateResult>

  updateTask?(taskId: string, updates: Partial<Task>): Promise<UpdateResult>

  /** Reset all in-progress tasks to pending (for startup cleanup) */
  resetAllInProgress?(): Promise<UpdateResult>

  /** Add a comment to a task (optional) */
  addComment?(taskId: string, comment: string): Promise<UpdateResult>

  /** Health check */
  ping(): Promise<PingResult>

  /** Get API quota information (optional - only for API backends like GitHub) */
  getQuotaInfo?(): Promise<ApiQuotaInfo>

  // Sub-task and dependency methods

  /** Get sub-tasks of a parent */
  getSubTasks(taskId: string): Promise<Task[]>

  /** Get tasks this task depends on */
  getDependencies(taskId: string): Promise<Task[]>

  /** Get tasks that depend on this task */
  getDependents(taskId: string): Promise<Task[]>

  /** Check if all dependencies are completed */
  areDependenciesMet(taskId: string): Promise<boolean>

  /** Create a new task (optional) */
  createTask?(task: Omit<Task, 'id' | 'status'>): Promise<Task>

  /** Create a sub-task (optional) */
  createSubTask?(parentId: string, task: Omit<Task, 'id' | 'parentId' | 'status'>): Promise<Task>

  /** Add a dependency (optional) */
  addDependency?(taskId: string, dependsOnId: string): Promise<UpdateResult>

  /** Remove a dependency (optional) */
  removeDependency?(taskId: string, dependsOnId: string): Promise<UpdateResult>

  /**
   * Reschedule a completed task to pending
   * @param taskId Task ID to reschedule
   * @param scheduledFor Optional ISO 8601 datetime to schedule for
   */
  rescheduleCompleted?(taskId: string, scheduledFor?: string): Promise<UpdateResult>
}

/**
 * Backend Plugin - combines TaskBackend operations with Plugin lifecycle hooks
 */
export interface BackendPlugin extends LoopworkPlugin, TaskBackend {
  /** Backend type identifier */
  readonly backendType: 'json' | 'github' | string

  /** Set task priority (optional) */
  setPriority?(taskId: string, priority: Priority): Promise<UpdateResult>
}

export type {
  BackendConfig,
  JsonBackendConfig,
  GithubBackendConfig,
  FallbackBackendConfig,
  LooseBackendConfig,
  FindTaskOptions,
  UpdateResult,
}

let warnedLooseBackend = false

/**
 * Warns if the backend configuration is using the loose type instead of a specialized one.
 * Only warns once per runtime.
 *
 * @param config - The backend configuration to check
 */
export function warnIfLooseBackendConfig(config: BackendConfig): void {
  if (warnedLooseBackend) return

  const isSpecialized =
    config.type === 'json' ||
    config.type === 'github' ||
    config.type === 'fallback'

  if (!isSpecialized) {
    // eslint-disable-next-line no-console
    console.warn(
      '\x1b[33m%s\x1b[0m',
      `[DEPRECATION WARNING] Using loose BackendConfig (type: "${config.type}"). ` +
      'In a future version, backends will require specific types like JsonBackendConfig or GithubBackendConfig. ' +
      'Please update your configuration for better type safety and future compatibility.'
    )
    warnedLooseBackend = true
  }
}

/**
 * Factory function type for creating backends
 */
export type BackendFactory = (config: BackendConfig) => TaskBackend

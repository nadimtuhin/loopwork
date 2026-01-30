/**
 * Backend Interface Contract
 */

import type { Task, Priority } from './task'
import type { LoopworkPlugin } from './plugin'

/**
 * Options for finding tasks
 */
export interface FindTaskOptions {
  feature?: string
  priority?: Priority
  startFrom?: string
  parentId?: string
  includeBlocked?: boolean
  topLevelOnly?: boolean
}

/**
 * Result of a task update operation
 */
export interface UpdateResult {
  success: boolean
  error?: string
}

/**
 * Backend health check result
 */
export interface PingResult {
  ok: boolean
  latencyMs: number
  error?: string
}

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

  /** Count pending tasks */
  countPending(options?: FindTaskOptions): Promise<number>

  /** Mark task as in-progress */
  markInProgress(taskId: string): Promise<UpdateResult>

  /** Mark task as completed */
  markCompleted(taskId: string, comment?: string): Promise<UpdateResult>

  /** Mark task as failed */
  markFailed(taskId: string, error: string): Promise<UpdateResult>

  /** Reset task to pending */
  resetToPending(taskId: string): Promise<UpdateResult>

  /** Reset all in-progress tasks to pending (for startup cleanup) */
  resetAllInProgress?(): Promise<UpdateResult>

  /** Add a comment to a task (optional) */
  addComment?(taskId: string, comment: string): Promise<UpdateResult>

  /** Health check */
  ping(): Promise<PingResult>

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

/**
 * Backend configuration
 */
export interface BackendConfig {
  type: 'github' | 'json'
  repo?: string
  tasksFile?: string
  tasksDir?: string
}

/**
 * Factory function type for creating backends
 */
export type BackendFactory = (config: BackendConfig) => TaskBackend

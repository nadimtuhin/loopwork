/**
 * Backend Interface Contract
 */

import type { Task, Priority, TaskStatus } from './task'
import type { LoopworkPlugin } from './plugin'

/**
 * Options for finding tasks
 */
export interface FindTaskOptions {
  feature?: string
  priority?: Priority
  status?: TaskStatus | TaskStatus[]
  startFrom?: string
  parentId?: string
  includeBlocked?: boolean
  topLevelOnly?: boolean
  retryCooldown?: number
}

/**
 * Result of a task update operation
 */
export interface UpdateResult {
  success: boolean
  error?: string
  queued?: boolean
  /** ISO 8601 datetime when the task is scheduled for (if applicable) */
  scheduledFor?: string
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
 * API quota information for rate-limited backends
 */
export interface ApiQuotaInfo {
  /** Total quota limit */
  limit: number
  /** Remaining quota */
  remaining: number
  /** When the quota resets (UTC) */
  reset: Date
  /** Resource type (e.g., 'core', 'search', 'graphql') */
  resource?: string
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

/**
 * Configuration for the JSON backend.
 */
export interface JsonBackendConfig {
  type: 'json'
  /** 
   * Path to the JSON file where tasks are stored.
   * Required for JSON backend.
   */
  tasksFile: string
  /** 
   * Directory where task PRD markdown files are located.
   */
  tasksDir?: string
  /** 
   * Optional feature flags to toggle backend-specific behaviors.
   */
  flags?: Record<string, boolean>
}

/**
 * Configuration for the GitHub backend.
 */
export interface GithubBackendConfig {
  type: 'github'
  /** 
   * The GitHub repository identifier in 'owner/repo' format.
   * Required for GitHub backend.
   */
  repo: string
  /** 
   * Optional feature flags to toggle backend-specific behaviors.
   */
  flags?: Record<string, boolean>
}

/**
 * Configuration for the Fallback (no-op) backend.
 */
export interface FallbackBackendConfig {
  type: 'fallback'
  flags?: Record<string, boolean>
}

/**
 * Configuration for task backends.
 * 
 * This is a discriminated union that supports different backend types:
 * - 'json': Local JSON file storage (best for local development)
 * - 'github': GitHub Issues (best for team collaboration)
 * - 'fallback': No-op backend for testing
 * 
 * @example
 * // JSON Backend configuration
 * const jsonConfig: BackendConfig = {
 *   type: 'json',
 *   tasksFile: '.specs/tasks/tasks.json',
 *   tasksDir: '.specs/tasks'
 * };
 * 
 * @example
 * // GitHub Backend configuration
 * const githubConfig: BackendConfig = {
 *   type: 'github',
 *   repo: 'owner/repo',
 *   flags: { useLabels: true }
 * };
 */
export type BackendConfig = 
  | JsonBackendConfig 
  | GithubBackendConfig 
  | FallbackBackendConfig
  | LooseBackendConfig

/**
 * Loose backend configuration for backward compatibility.
 * @deprecated Use JsonBackendConfig, GithubBackendConfig, or FallbackBackendConfig instead.
 */
export interface LooseBackendConfig {
  /** Backend type identifier */
  type: string
  /** GitHub repository (for GitHub backend) */
  repo?: string
  /** Tasks file path (for JSON backend) */
  tasksFile?: string
  /** Tasks directory (for JSON backend) */
  tasksDir?: string
  /** Feature flags */
  flags?: Record<string, boolean>
  /** Catch-all for other backend-specific options */
  [key: string]: unknown
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

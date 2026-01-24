/**
 * Backend Plugin System for Loopwork
 *
 * Backends (JSON, GitHub) are now plugins that implement both:
 * - LoopworkPlugin: lifecycle hooks
 * - TaskBackend: task CRUD operations
 *
 * Usage:
 *   export default compose(
 *     withJSONBackend({ tasksFile: 'tasks.json' }),
 *     // or
 *     withGitHubBackend({ repo: 'owner/repo' }),
 *   )(defineConfig({ cli: 'opencode' }))
 */

import type { LoopworkPlugin, LoopworkConfig } from '../contracts'
import type { Task, Priority, FindTaskOptions, UpdateResult } from './types'
import { logger } from '../core/utils'

// ============================================================================
// Backend Plugin Interface
// ============================================================================

/**
 * Backend plugin combines LoopworkPlugin with TaskBackend operations
 */
export interface BackendPlugin extends LoopworkPlugin {
  /** Backend type identifier */
  readonly backendType: 'json' | 'github' | string

  // Task operations
  findNextTask(options?: FindTaskOptions): Promise<Task | null>
  getTask(taskId: string): Promise<Task | null>
  listPendingTasks(options?: FindTaskOptions): Promise<Task[]>
  countPending(options?: FindTaskOptions): Promise<number>
  markInProgress(taskId: string): Promise<UpdateResult>
  markCompleted(taskId: string, comment?: string): Promise<UpdateResult>
  markFailed(taskId: string, error: string): Promise<UpdateResult>
  resetToPending(taskId: string): Promise<UpdateResult>
  addComment?(taskId: string, comment: string): Promise<UpdateResult>
  ping(): Promise<{ ok: boolean; latencyMs: number; error?: string }>

  // Sub-task and dependency methods
  getSubTasks(taskId: string): Promise<Task[]>
  getDependencies(taskId: string): Promise<Task[]>
  getDependents(taskId: string): Promise<Task[]>
  areDependenciesMet(taskId: string): Promise<boolean>
  createTask?(task: Omit<Task, 'id' | 'status'>): Promise<Task>
  createSubTask?(parentId: string, task: Omit<Task, 'id' | 'parentId' | 'status'>): Promise<Task>
  addDependency?(taskId: string, dependsOnId: string): Promise<UpdateResult>
  removeDependency?(taskId: string, dependsOnId: string): Promise<UpdateResult>

  // Priority
  setPriority?(taskId: string, priority: Priority): Promise<UpdateResult>
}

// ============================================================================
// JSON Backend Plugin
// ============================================================================

export interface JSONBackendConfig {
  tasksFile?: string
  tasksDir?: string
}

/**
 * Create JSON backend plugin
 */
export function createJSONBackendPlugin(config: JSONBackendConfig = {}): BackendPlugin {
  const tasksFile = config.tasksFile || '.specs/tasks/tasks.json'

  // Lazy load the adapter
  let adapter: any = null

  const getAdapter = async () => {
    if (!adapter) {
      const { JsonTaskAdapter } = await import('./json')
      adapter = new JsonTaskAdapter({ type: 'json', tasksFile, tasksDir: config.tasksDir })
    }
    return adapter
  }

  return {
    name: 'json-backend',
    backendType: 'json',

    async onConfigLoad(cfg) {
      await getAdapter()
      return cfg
    },

    // Delegate all backend operations to the adapter
    async findNextTask(options) {
      return (await getAdapter()).findNextTask(options)
    },
    async getTask(taskId) {
      return (await getAdapter()).getTask(taskId)
    },
    async listPendingTasks(options) {
      return (await getAdapter()).listPendingTasks(options)
    },
    async countPending(options) {
      return (await getAdapter()).countPending(options)
    },
    async markInProgress(taskId) {
      return (await getAdapter()).markInProgress(taskId)
    },
    async markCompleted(taskId, comment) {
      return (await getAdapter()).markCompleted(taskId, comment)
    },
    async markFailed(taskId, error) {
      return (await getAdapter()).markFailed(taskId, error)
    },
    async resetToPending(taskId) {
      return (await getAdapter()).resetToPending(taskId)
    },
    async addComment(taskId, comment) {
      const a = await getAdapter()
      return a.addComment?.(taskId, comment) || { success: false, error: 'Not supported' }
    },
    async ping() {
      return (await getAdapter()).ping()
    },
    async getSubTasks(taskId) {
      return (await getAdapter()).getSubTasks(taskId)
    },
    async getDependencies(taskId) {
      return (await getAdapter()).getDependencies(taskId)
    },
    async getDependents(taskId) {
      return (await getAdapter()).getDependents(taskId)
    },
    async areDependenciesMet(taskId) {
      return (await getAdapter()).areDependenciesMet(taskId)
    },
    async createTask(task) {
      const a = await getAdapter()
      if (!a.createTask) throw new Error('createTask not supported')
      return a.createTask(task)
    },
    async createSubTask(parentId, task) {
      const a = await getAdapter()
      if (!a.createSubTask) throw new Error('createSubTask not supported')
      return a.createSubTask(parentId, task)
    },
    async addDependency(taskId, dependsOnId) {
      const a = await getAdapter()
      return a.addDependency?.(taskId, dependsOnId) || { success: false, error: 'Not supported' }
    },
    async removeDependency(taskId, dependsOnId) {
      const a = await getAdapter()
      return a.removeDependency?.(taskId, dependsOnId) || { success: false, error: 'Not supported' }
    },
    async setPriority(taskId, priority) {
      const a = await getAdapter()
      if (a.setPriority) {
        return a.setPriority(taskId, priority)
      }
      return { success: false, error: 'setPriority not supported by JSON adapter' }
    },
  }
}

/**
 * Config wrapper for JSON backend
 */
export function withJSONBackend(config: JSONBackendConfig = {}) {
  return (baseConfig: LoopworkConfig): LoopworkConfig => ({
    ...baseConfig,
    backend: {
      type: 'json',
      tasksFile: config.tasksFile || '.specs/tasks/tasks.json',
      tasksDir: config.tasksDir,
    },
    plugins: [...(baseConfig.plugins || []), createJSONBackendPlugin(config)],
  })
}

// ============================================================================
// GitHub Backend Plugin
// ============================================================================

export interface GitHubBackendConfig {
  repo?: string
  token?: string
}

/**
 * Create GitHub backend plugin
 */
export function createGitHubBackendPlugin(config: GitHubBackendConfig = {}): BackendPlugin {
  const repo = config.repo || process.env.GITHUB_REPOSITORY

  // Lazy load the adapter
  let adapter: any = null

  const getAdapter = async () => {
    if (!adapter) {
      const { GitHubTaskAdapter } = await import('./github')
      adapter = new GitHubTaskAdapter({ type: 'github', repo })
    }
    return adapter
  }

  return {
    name: 'github-backend',
    backendType: 'github',

    async onConfigLoad(cfg) {
      if (!repo) {
        logger.warn('GitHub backend: Missing repo. Set GITHUB_REPOSITORY or pass repo option.')
      }
      await getAdapter()
      return cfg
    },

    // Delegate all backend operations
    async findNextTask(options) {
      return (await getAdapter()).findNextTask(options)
    },
    async getTask(taskId) {
      return (await getAdapter()).getTask(taskId)
    },
    async listPendingTasks(options) {
      return (await getAdapter()).listPendingTasks(options)
    },
    async countPending(options) {
      return (await getAdapter()).countPending(options)
    },
    async markInProgress(taskId) {
      return (await getAdapter()).markInProgress(taskId)
    },
    async markCompleted(taskId, comment) {
      return (await getAdapter()).markCompleted(taskId, comment)
    },
    async markFailed(taskId, error) {
      return (await getAdapter()).markFailed(taskId, error)
    },
    async resetToPending(taskId) {
      return (await getAdapter()).resetToPending(taskId)
    },
    async addComment(taskId, comment) {
      return (await getAdapter()).addComment(taskId, comment)
    },
    async ping() {
      return (await getAdapter()).ping()
    },
    async getSubTasks(taskId) {
      return (await getAdapter()).getSubTasks(taskId)
    },
    async getDependencies(taskId) {
      return (await getAdapter()).getDependencies(taskId)
    },
    async getDependents(taskId) {
      return (await getAdapter()).getDependents(taskId)
    },
    async areDependenciesMet(taskId) {
      return (await getAdapter()).areDependenciesMet(taskId)
    },
    async createTask(task) {
      return (await getAdapter()).createTask(task)
    },
    async createSubTask(parentId, task) {
      return (await getAdapter()).createSubTask(parentId, task)
    },
    async addDependency(taskId, dependsOnId) {
      return (await getAdapter()).addDependency(taskId, dependsOnId)
    },
    async removeDependency(taskId, dependsOnId) {
      return (await getAdapter()).removeDependency(taskId, dependsOnId)
    },
    async setPriority(taskId, priority) {
      return (await getAdapter()).setPriority(taskId, priority)
    },
  }
}

/**
 * Config wrapper for GitHub backend
 */
export function withGitHubBackend(config: GitHubBackendConfig = {}) {
  return (baseConfig: LoopworkConfig): LoopworkConfig => ({
    ...baseConfig,
    backend: {
      type: 'github',
      repo: config.repo || process.env.GITHUB_REPOSITORY,
    },
    plugins: [...(baseConfig.plugins || []), createGitHubBackendPlugin(config)],
  })
}

// ============================================================================
// Helper to get backend from config
// ============================================================================

/**
 * Get the backend plugin from config plugins array
 */
export function getBackendPlugin(config: LoopworkConfig): BackendPlugin | null {
  const plugins = config.plugins || []
  for (const plugin of plugins) {
    if ('backendType' in plugin) {
      return plugin as BackendPlugin
    }
  }
  return null
}

/**
 * Get backend or throw error
 */
export function requireBackend(config: LoopworkConfig): BackendPlugin {
  const backend = getBackendPlugin(config)
  if (!backend) {
    throw new Error('No backend plugin found. Use withJSONBackend() or withGitHubBackend().')
  }
  return backend
}

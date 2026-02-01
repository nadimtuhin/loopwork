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

import type { LoopworkPlugin, LoopworkConfig, BackendPlugin } from '../contracts'
import type { Task, Priority, FindTaskOptions, UpdateResult, TaskBackend } from './types'
import { logger } from '../core/utils'
import { LoopworkError } from '../core/errors'

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
  let adapter: TaskBackend | null = null

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
    classification: 'critical',

    async onConfigLoad(cfg: any) {
      await getAdapter()
      return cfg
    },

    // Delegate all backend operations to the adapter
    async findNextTask(options) {
      const a = await getAdapter()
      return a!.findNextTask(options)
    },
    async getTask(taskId) {
      const a = await getAdapter()
      return a!.getTask(taskId)
    },
    async listPendingTasks(options) {
      const a = await getAdapter()
      return a!.listPendingTasks(options)
    },
    async listTasks(options) {
      const a = await getAdapter()
      return a!.listTasks(options)
    },
    async countPending(options) {
      const a = await getAdapter()
      return a!.countPending(options)
    },
    async markInProgress(taskId) {
      const a = await getAdapter()
      return a!.markInProgress(taskId)
    },
    async markCompleted(taskId, comment) {
      const a = await getAdapter()
      return a!.markCompleted(taskId, comment)
    },
    async markFailed(taskId, error) {
      const a = await getAdapter()
      return a!.markFailed(taskId, error)
    },
    async markQuarantined(taskId, reason) {
      const a = await getAdapter()
      return a!.markQuarantined(taskId, reason)
    },
    async resetToPending(taskId) {
      const a = await getAdapter()
      return a!.resetToPending(taskId)
    },
    async addComment(taskId, comment) {
      const a = await getAdapter()
      return a!.addComment?.(taskId, comment) || { success: false, error: 'Not supported' }
    },
    async ping() {
      const a = await getAdapter()
      return a!.ping()
    },
    async getSubTasks(taskId) {
      const a = await getAdapter()
      return a!.getSubTasks(taskId)
    },
    async getDependencies(taskId) {
      const a = await getAdapter()
      return a!.getDependencies(taskId)
    },
    async getDependents(taskId) {
      const a = await getAdapter()
      return a!.getDependents(taskId)
    },
    async areDependenciesMet(taskId) {
      const a = await getAdapter()
      return a!.areDependenciesMet(taskId)
    },
    async createTask(task) {
      const a = await getAdapter()
      if (!a!.createTask) {
        throw new LoopworkError(
          'ERR_BACKEND_INVALID',
          'This backend does not support creating tasks',
          [
            'Try using a different backend that supports task creation',
            'Or manually create tasks in your backend system',
            'GitHub backend: create issues manually',
            'JSON backend: edit tasks.json file directly'
          ]
        )
      }
      return a!.createTask(task)
    },
    async createSubTask(parentId, task) {
      const a = await getAdapter()
      if (!a!.createSubTask) {
        throw new LoopworkError(
          'ERR_BACKEND_INVALID',
          'This backend does not support creating sub-tasks',
          [
            'Sub-tasks may need to be created manually',
            'Or use a backend that supports hierarchical tasks'
          ]
        )
      }
      return a!.createSubTask(parentId, task)
    },
    async addDependency(taskId, dependsOnId) {
      const a = await getAdapter()
      return a!.addDependency?.(taskId, dependsOnId) || { success: false, error: 'Not supported' }
    },
    async removeDependency(taskId, dependsOnId) {
      const a = await getAdapter()
      return a!.removeDependency?.(taskId, dependsOnId) || { success: false, error: 'Not supported' }
    },
    async setPriority(taskId, priority) {
      const a = (await getAdapter()) as unknown as BackendPlugin
      if (a && a.setPriority) {
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
  let adapter: TaskBackend | null = null

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
    classification: 'critical',

    async onConfigLoad(cfg: any) {
      if (!repo) {
        logger.warn('GitHub backend: Missing repo. Set GITHUB_REPOSITORY or pass repo option.')
      }
      await getAdapter()
      return cfg
    },

    // Delegate all backend operations
    async findNextTask(options) {
      const a = await getAdapter()
      return a!.findNextTask(options)
    },
    async getTask(taskId) {
      const a = await getAdapter()
      return a!.getTask(taskId)
    },
    async listPendingTasks(options) {
      const a = await getAdapter()
      return a!.listPendingTasks(options)
    },
    async listTasks(options) {
      const a = await getAdapter()
      return a!.listTasks(options)
    },
    async countPending(options) {
      const a = await getAdapter()
      return a!.countPending(options)
    },
    async markInProgress(taskId) {
      const a = await getAdapter()
      return a!.markInProgress(taskId)
    },
    async markCompleted(taskId, comment) {
      const a = await getAdapter()
      return a!.markCompleted(taskId, comment)
    },
    async markFailed(taskId, error) {
      const a = await getAdapter()
      return a!.markFailed(taskId, error)
    },
    async markQuarantined(taskId, reason) {
      const a = await getAdapter()
      return a!.markQuarantined(taskId, reason)
    },
    async resetToPending(taskId) {
      const a = await getAdapter()
      return a!.resetToPending(taskId)
    },
    async addComment(taskId, comment) {
      const a = await getAdapter()
      return a!.addComment?.(taskId, comment) || { success: false, error: 'Not supported' }
    },
    async ping() {
      const a = await getAdapter()
      return a!.ping()
    },
    async getSubTasks(taskId) {
      const a = await getAdapter()
      return a!.getSubTasks(taskId)
    },
    async getDependencies(taskId) {
      const a = await getAdapter()
      return a!.getDependencies(taskId)
    },
    async getDependents(taskId) {
      const a = await getAdapter()
      return a!.getDependents(taskId)
    },
    async areDependenciesMet(taskId) {
      const a = await getAdapter()
      return a!.areDependenciesMet(taskId)
    },
    async createTask(task) {
      const a = await getAdapter()
      return a!.createTask!(task)
    },
    async createSubTask(parentId, task) {
      const a = await getAdapter()
      return a!.createSubTask!(parentId, task)
    },
    async addDependency(taskId, dependsOnId) {
      const a = await getAdapter()
      return a!.addDependency?.(taskId, dependsOnId) || { success: false, error: 'Not supported' }
    },
    async removeDependency(taskId, dependsOnId) {
      const a = await getAdapter()
      return a!.removeDependency?.(taskId, dependsOnId) || { success: false, error: 'Not supported' }
    },
    async setPriority(taskId, priority) {
      const a = (await getAdapter()) as unknown as BackendPlugin
      if (a && a.setPriority) {
        return a.setPriority(taskId, priority)
      }
      return { success: false, error: 'setPriority not supported by GitHub adapter' }
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
// Fallback Backend Plugin
// ============================================================================

export interface FallbackBackendConfig {
  primary: BackendPlugin
  fallback: BackendPlugin
}

/**
 * Create Fallback backend plugin
 *
 * Wraps two backends (primary and fallback). Read operations try primary first,
 * then fallback on connection/5xx errors. Write operations only use primary.
 */
export function createFallbackBackendPlugin(config: FallbackBackendConfig): BackendPlugin {
  let adapter: TaskBackend | null = null

  const getAdapter = async (cfg?: LoopworkConfig) => {
    if (!adapter) {
      const { FallbackTaskBackend } = await import('./fallback')
      
      let queue
      if (cfg) {
        const { OfflineQueue } = await import('../core/offline-queue')
        const { LoopworkState } = await import('../core/loopwork-state')
        const state = new LoopworkState({ 
          projectRoot: (cfg as unknown as Record<string, unknown>).projectRoot as string, 
          namespace: cfg.namespace 
        })
        queue = new OfflineQueue(state)
      }

      adapter = new FallbackTaskBackend(config.primary, config.fallback, queue)
    }
    return adapter
  }

  const plugin: BackendPlugin = {
    name: 'fallback-backend',
    backendType: 'fallback',
    classification: 'critical',

    async onConfigLoad(cfg: any) {
      await getAdapter(cfg)
      return cfg
    },

    // Delegate all backend operations to the adapter
    async findNextTask(options) {
      const a = await getAdapter()
      return a!.findNextTask(options)
    },
    async getTask(taskId) {
      const a = await getAdapter()
      return a!.getTask(taskId)
    },
    async listPendingTasks(options) {
      const a = await getAdapter()
      return a!.listPendingTasks(options)
    },
    async listTasks(options) {
      const a = await getAdapter()
      return a!.listTasks(options)
    },
    async countPending(options) {
      const a = await getAdapter()
      return a!.countPending(options)
    },
    async markInProgress(taskId) {
      const a = await getAdapter()
      return a!.markInProgress(taskId)
    },
    async markCompleted(taskId, comment) {
      const a = await getAdapter()
      return a!.markCompleted(taskId, comment)
    },
    async markFailed(taskId, error) {
      const a = await getAdapter()
      return a!.markFailed(taskId, error)
    },
    async markQuarantined(taskId, reason) {
      const a = await getAdapter()
      return a!.markQuarantined(taskId, reason)
    },
    async resetToPending(taskId) {
      const a = await getAdapter()
      return a!.resetToPending(taskId)
    },
    async addComment(taskId, comment) {
      const a = await getAdapter()
      return a!.addComment?.(taskId, comment) || { success: false, error: 'Not supported' }
    },
    async ping() {
      const a = await getAdapter()
      return a!.ping()
    },
    async getSubTasks(taskId) {
      const a = await getAdapter()
      return a!.getSubTasks(taskId)
    },
    async getDependencies(taskId) {
      const a = await getAdapter()
      return a!.getDependencies(taskId)
    },
    async getDependents(taskId) {
      const a = await getAdapter()
      return a!.getDependents(taskId)
    },
    async areDependenciesMet(taskId) {
      const a = await getAdapter()
      return a!.areDependenciesMet(taskId)
    },
    async createTask(task) {
      const a = await getAdapter()
      if (!a!.createTask) {
        throw new LoopworkError(
          'ERR_BACKEND_INVALID',
          'This backend does not support creating tasks',
          [
            'Primary backend does not support task creation',
            'Try using a different backend combination'
          ]
        )
      }
      return a!.createTask(task)
    },
    async createSubTask(parentId, task) {
      const a = await getAdapter()
      if (!a!.createSubTask) {
        throw new LoopworkError(
          'ERR_BACKEND_INVALID',
          'This backend does not support creating sub-tasks',
          [
            'Primary backend does not support sub-task creation',
            'Try using a different backend combination'
          ]
        )
      }
      return a!.createSubTask(parentId, task)
    },
    async addDependency(taskId, dependsOnId) {
      const a = await getAdapter()
      return a!.addDependency?.(taskId, dependsOnId) || { success: false, error: 'Not supported' }
    },
    async removeDependency(taskId, dependsOnId) {
      const a = await getAdapter()
      return a!.removeDependency?.(taskId, dependsOnId) || { success: false, error: 'Not supported' }
    },
    async setPriority(taskId, priority) {
      const a = (await getAdapter()) as unknown as BackendPlugin
      if (a && a.setPriority) {
        return a.setPriority(taskId, priority)
      }
      return { success: false, error: 'setPriority not supported by primary backend' }
    },
  }

  // Expose adapter for sync-offline command
  Object.defineProperty(plugin, 'adapter', {
    get: () => adapter,
    enumerable: false,
    configurable: true
  })

  return plugin
}

/**
 * Config wrapper for Fallback backend
 *
 * Usage:
 *   export default compose(
 *     withFallbackBackend({
 *       primary: createGitHubBackendPlugin({ repo: 'owner/repo' }),
 *       fallback: createJSONBackendPlugin({ tasksFile: 'tasks.json' })
 *     })
 *   )(defineConfig({ cli: 'claude' }))
 */
export function withFallbackBackend(config: FallbackBackendConfig) {
  return (baseConfig: LoopworkConfig): LoopworkConfig => ({
    ...baseConfig,
    backend: {
      type: 'fallback',
    },
    plugins: [...(baseConfig.plugins || []), createFallbackBackendPlugin(config)],
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
    if (typeof plugin === 'object' && plugin !== null && 'backendType' in plugin) {
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
    throw new LoopworkError(
      'ERR_BACKEND_INIT',
      'No backend plugin found in configuration',
      [
        'Add a backend to your loopwork.config.ts:',
        '  withJSONBackend({ tasksFile: ".specs/tasks/tasks.json" })',
        '  or',
        '  withGitHubBackend({ repo: "owner/repo" })',
        '',
        'Or run: npx loopwork init'
      ],
      'https://github.com/nadimtuhin/loopwork#configuration'
    )
  }
  return backend
}

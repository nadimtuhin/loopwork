/**
 * Task Recovery Plugin for Loopwork
 *
 * Analyzes task failures to understand what went wrong and creates recovery plans.
 * Can auto-retry with fixes, update tests, or create corrective tasks.
 *
 * Setup:
 * 1. Add plugin to your loopwork.config.ts
 * 2. Configure recovery strategies
 * 3. Optionally enable auto-recovery mode
 */

import type { LoopworkPlugin, ConfigWrapper, LoopworkConfig } from '@loopwork-ai/loopwork/contracts'

export interface TaskRecoveryConfig {
  /** Enable task recovery analysis */
  enabled?: boolean

  /** CLI tool to use for failure analysis */
  cli?: 'claude' | 'opencode' | 'gemini'

  /** Model to use (default: sonnet for better reasoning) */
  model?: string

  /** Auto-execute recovery plan without approval */
  autoRecover?: boolean

  /** Maximum number of auto-retry attempts per task */
  maxRetries?: number

  /** Recovery strategies to enable */
  strategies?: {
    /** Retry task with AI-suggested fixes */
    autoRetry?: boolean
    /** Create corrective tasks in backlog */
    createTasks?: boolean
    /** Update or create tests based on failure */
    updateTests?: boolean
    /** Update task description with failure context */
    updateTaskDescription?: boolean
  }

  /** Skip recovery for certain failure types */
  skip?: {
    /** Error message patterns to skip */
    errorPatterns?: RegExp[]
    /** Task title patterns to skip */
    taskPatterns?: RegExp[]
    /** Labels to skip */
    labels?: string[]
  }
}

/**
 * Create task recovery plugin
 *
 * This plugin analyzes task failures and generates recovery plans.
 * It can automatically retry tasks, create follow-up tasks, or update tests.
 *
 * @param config - Plugin configuration options
 * @returns LoopworkPlugin instance
 */
export function createTaskRecoveryPlugin(
  config: TaskRecoveryConfig = {}
): LoopworkPlugin {
  return {
    name: 'task-recovery',
    classification: 'enhancement',

    async onConfigLoad(loopworkConfig) {
      // Validate config
      if (config.autoRecover && config.maxRetries === 0) {
        console.warn('Task Recovery: autoRecover enabled but maxRetries is 0')
      }

      return loopworkConfig
    },

    async onTaskFailed(context, error) {
      if (!config.enabled) return

      console.log(`Task ${context.task.id} failed: ${error}`)

      // Recovery logic will be implemented here
      // For now, this is a scaffold for the standalone plugin
    },
  }
}

/**
 * Convenience export: Config wrapper for task recovery plugin
 *
 * Usage:
 * ```typescript
 * import { withTaskRecovery } from '@loopwork-ai/plugin-task-recovery'
 *
 * export default compose(
 *   withTaskRecovery({
 *     enabled: true,
 *     autoRecover: false,
 *     maxRetries: 2
 *   })
 * )(defineConfig({}))
 * ```
 */
export function withTaskRecovery(config: TaskRecoveryConfig = {}): ConfigWrapper {
  return (loopworkConfig: any) => ({
    ...loopworkConfig,
    plugins: [...(loopworkConfig.plugins || []), createTaskRecoveryPlugin(config)],
    taskRecovery: {
      ...config,
      classification: 'enhancement',
    },
  })
}

/**
 * Preset: Auto-recovery mode (automatic fixes)
 *
 * Enables automatic recovery with higher retry limits.
 * Best for projects where you want aggressive self-healing.
 *
 * Usage:
 * ```typescript
 * import { withAutoRecovery } from '@loopwork-ai/plugin-task-recovery'
 *
 * export default compose(
 *   withAutoRecovery()
 * )(defineConfig({}))
 * ```
 */
export function withAutoRecovery(
  config: Partial<TaskRecoveryConfig> = {}
): ConfigWrapper {
  return (loopworkConfig: any) => ({
    ...loopworkConfig,
    plugins: [
      ...(loopworkConfig.plugins || []),
      createTaskRecoveryPlugin({
        ...config,
        autoRecover: true,
        maxRetries: 3,
        strategies: {
          autoRetry: true,
          createTasks: true,
          updateTests: true,
          updateTaskDescription: true,
          ...config.strategies,
        },
      }),
    ],
    taskRecovery: {
      ...config,
      autoRecover: true,
      maxRetries: 3,
      classification: 'enhancement',
    },
  })
}

/**
 * Preset: Conservative recovery (manual approval)
 *
 * Disables auto-recovery, focuses on creating follow-up tasks.
 * Best for production environments where you want manual oversight.
 *
 * Usage:
 * ```typescript
 * import { withConservativeRecovery } from '@loopwork-ai/plugin-task-recovery'
 *
 * export default compose(
 *   withConservativeRecovery()
 * )(defineConfig({}))
 * ```
 */
export function withConservativeRecovery(
  config: Partial<TaskRecoveryConfig> = {}
): ConfigWrapper {
  return (loopworkConfig: any) => ({
    ...loopworkConfig,
    plugins: [
      ...(loopworkConfig.plugins || []),
      createTaskRecoveryPlugin({
        ...config,
        autoRecover: false,
        maxRetries: 1,
        strategies: {
          autoRetry: false,
          createTasks: true,
          updateTests: false,
          updateTaskDescription: false,
          ...config.strategies,
        },
      }),
    ],
    taskRecovery: {
      ...config,
      autoRecover: false,
      maxRetries: 1,
      classification: 'enhancement',
    },
  })
}

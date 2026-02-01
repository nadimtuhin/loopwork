import type { LoopworkPlugin, ConfigWrapper, TaskContext, PluginTaskResult } from '../contracts'
import { takeSnapshot, rollbackToSnapshot, getChangesSinceSnapshot, rollbackFiles, type GitSnapshot } from '../utils/git-snapshots'
import { logger } from '../core/utils'
import { promptForRollback } from './rollback-prompt'

/**
 * Rollback Plugin
 *
 * Provides task rollback capabilities using Git snapshots
 */

export interface RollbackPluginOptions {
  /** Enable/disable the plugin */
  enabled?: boolean
  /** Enable interactive selective rollback on failure */
  interactive?: boolean
  /** Automatically rollback to pre-task state if a task fails */
  rollbackOnFailure?: boolean
  /** Automatically rollback to pre-task state before each retry */
  rollbackOnRetry?: boolean
  /** Automatically rollback to pre-task state if a task is aborted/interrupted */
  rollbackOnAbort?: boolean
}

/**
 * Create a new Rollback Plugin
 */
export function createRollbackPlugin(options: RollbackPluginOptions = {}): LoopworkPlugin {
  const {
    enabled = true,
    interactive = false,
    rollbackOnFailure = true,
    rollbackOnRetry = true,
    rollbackOnAbort = true,
  } = options
  const taskSnapshots = new Map<string, GitSnapshot>()

  // Helper to check for non-interactive mode
  const isNonInteractive = () => {
    return (
      process.env.LOOPWORK_NON_INTERACTIVE === 'true' ||
      process.env.CI === 'true' ||
      process.argv.includes('-y') ||
      process.argv.includes('--yes')
    )
  }

  return {
    name: 'rollback',
    essential: false,

    async onTaskStart(context: TaskContext) {
      if (!enabled) return

      // Only take snapshot on the first attempt
      if (context.retryAttempt && context.retryAttempt > 0) {
        return
      }

      try {
        const snapshot = await takeSnapshot(context)
        if (snapshot) {
          taskSnapshots.set(context.task.id, snapshot)
        }
      } catch (error) {
        logger.debug(`Failed to take pre-task snapshot: ${error}`)
      }
    },

    async onTaskRetry(context: TaskContext, _error: string) {
      if (!enabled || !rollbackOnRetry) return

      const snapshot = taskSnapshots.get(context.task.id)
      if (snapshot) {
        logger.warn(`Task ${context.task.id} failed. Rolling back before retry...`)
        try {
          await rollbackToSnapshot(snapshot)
          logger.info(`Successfully rolled back task ${context.task.id} for retry`)
        } catch (rollbackError) {
          logger.error(`Rollback failed for task ${context.task.id}: ${rollbackError}`)
        }
      }
    },

    async onTaskFailed(context: TaskContext, _error: string) {
      if (!enabled) return

      const snapshot = taskSnapshots.get(context.task.id)
      if (snapshot) {
        // Interactive Mode
        if (interactive && !isNonInteractive()) {
          const changes = getChangesSinceSnapshot(snapshot)
          if (changes.length > 0) {
            try {
              const result = await promptForRollback(changes)
              
              if (result.action === 'all') {
                logger.warn(`Task ${context.task.id} failed. Rolling back all changes...`)
                await rollbackToSnapshot(snapshot)
                logger.info(`Successfully rolled back task ${context.task.id}`)
              } else if (result.action === 'selective' && result.files) {
                logger.warn(`Task ${context.task.id} failed. Rolling back selective changes...`)
                await rollbackFiles(snapshot, result.files)
                logger.info(`Successfully rolled back ${result.files.length} files for task ${context.task.id}`)
              } else {
                logger.info(`Rollback skipped for task ${context.task.id}`)
              }
              // If we handled it interactively (even if skipped), we shouldn't do auto-rollback
              return
            } catch (err) {
              logger.error(`Interactive rollback failed: ${err}`)
              // Fall through to auto-rollback if configured? 
              // Probably safer to stop here if user interaction failed, but let's just log.
            }
          } else {
             logger.debug(`No changes detected for task ${context.task.id}, skipping interactive rollback prompt`)
          }
        }

        // Auto Rollback
        if (rollbackOnFailure) {
          logger.warn(`Task ${context.task.id} failed. Rolling back to pre-task state...`)
          try {
            await rollbackToSnapshot(snapshot)
            logger.info(`Successfully rolled back task ${context.task.id}`)
          } catch (rollbackError) {
            logger.error(`Rollback failed for task ${context.task.id}: ${rollbackError}`)
          }
        }
      }
    },

    async onTaskAbort(context: TaskContext) {
      if (!enabled || !rollbackOnAbort) return

      const snapshot = taskSnapshots.get(context.task.id)
      if (snapshot) {
        logger.warn(`Task ${context.task.id} aborted. Rolling back to pre-task state...`)
        try {
          await rollbackToSnapshot(snapshot)
          logger.info(`Successfully rolled back task ${context.task.id} after abort`)
        } catch (rollbackError) {
          logger.error(`Rollback failed for task ${context.task.id}: ${rollbackError}`)
        }
      }
    },

    async onTaskComplete(context: TaskContext, _result: PluginTaskResult) {
      taskSnapshots.delete(context.task.id)
    },
  }
}

/**
 * Config wrapper for Rollback plugin
 */
export function withRollback(options: RollbackPluginOptions = {}): ConfigWrapper {
  return (config) => ({
    ...config,
    plugins: [...(config.plugins || []), createRollbackPlugin(options)],
  })
}

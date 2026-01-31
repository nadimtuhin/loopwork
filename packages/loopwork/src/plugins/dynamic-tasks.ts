/**
 * Dynamic Task Creation Plugin
 *
 * Automatically creates follow-up tasks based on analysis of completed task output
 */

import type { LoopworkPlugin } from '../contracts/plugin'
import type { TaskBackend } from '../contracts/backend'
import type { TaskContext } from '../contracts/plugin'
import type { PluginTaskResult } from '../contracts/plugin'
import type { TaskAnalyzer, SuggestedTask } from '../contracts/analysis'
import type { ConfigWrapper } from '../contracts'
import { PatternAnalyzer } from '../analyzers/pattern-analyzer'
import { logger } from '../core/utils'

/**
 * Configuration options for the dynamic tasks plugin
 */
export interface DynamicTasksOptions {
  /** Whether the plugin is enabled (default: true) */
  enabled?: boolean

  /** Custom task analyzer to use (default: PatternAnalyzer) */
  analyzer?: TaskAnalyzer

  /** Whether to create tasks as sub-tasks of the completed task (default: true) */
  createSubTasks?: boolean

  /** Maximum number of tasks to create per task completion (default: 5) */
  maxTasksPerExecution?: number

  /** Whether to create tasks immediately or queue for approval (default: true) */
  autoApprove?: boolean

  /** Whether to log created tasks to console (default: true) */
  logCreatedTasks?: boolean
}

/**
 * Configuration wrapper for dynamic tasks plugin
 *
 * @example
 * ```typescript
 * export default compose(
 *   withJSONBackend(),
 *   withDynamicTasks({
 *     maxTasksPerExecution: 3,
 *     autoApprove: false
 *   })
 * )(defineConfig({ cli: 'claude' }))
 * ```
 */
export function withDynamicTasks(options: DynamicTasksOptions = {}): ConfigWrapper {
  return (config) => ({
    ...config,
    dynamicTasks: {
      enabled: options.enabled ?? true,
      createSubTasks: options.createSubTasks ?? true,
      maxTasksPerExecution: options.maxTasksPerExecution ?? 5,
      autoApprove: options.autoApprove ?? true,
      logCreatedTasks: options.logCreatedTasks ?? true
    }
  })
}

/**
 * Creates a plugin that automatically generates follow-up tasks based on analysis
 *
 * @example
 * ```typescript
 * const plugin = createDynamicTasksPlugin({
 *   analyzer: new PatternAnalyzer({ patterns: ['todo-comment', 'fixme-comment'] }),
 *   maxTasksPerExecution: 3
 * })
 * ```
 */
export function createDynamicTasksPlugin(
  options: DynamicTasksOptions = {}
): LoopworkPlugin {
  const config: Required<DynamicTasksOptions> = {
    enabled: options.enabled ?? true,
    analyzer: options.analyzer ?? new PatternAnalyzer(),
    createSubTasks: options.createSubTasks ?? true,
    maxTasksPerExecution: options.maxTasksPerExecution ?? 5,
    autoApprove: options.autoApprove ?? true,
    logCreatedTasks: options.logCreatedTasks ?? true
  }

  let backend: TaskBackend | null = null
  const pendingApprovals: Map<string, SuggestedTask[]> = new Map()

  return {
    name: 'dynamic-tasks',
    classification: 'enhancement',

    /**
     * Store backend reference when it's ready
     */
    async onBackendReady(taskBackend: TaskBackend): Promise<void> {
      backend = taskBackend
      if (config.enabled) {
        logger.info('[dynamic-tasks] Plugin initialized and ready to create tasks')
      }
    },

    /**
     * Analyze completed task and create follow-up tasks if needed
     */
    async onTaskComplete(
      context: TaskContext,
      result: PluginTaskResult
    ): Promise<void> {
      if (!config.enabled) {
        return
      }

      if (!backend) {
        logger.warn('[dynamic-tasks] Backend not available, cannot create tasks')
        return
      }

      try {
        // Analyze the task output
        const analysis = await config.analyzer.analyze(context.task, result)

        if (!analysis.shouldCreateTasks || analysis.suggestedTasks.length === 0) {
          logger.debug(
            `[dynamic-tasks] No follow-up tasks suggested for ${context.task.id}: ${analysis.reason}`
          )
          return
        }

        // Limit number of tasks per execution
        const tasksToCreate = analysis.suggestedTasks.slice(
          0,
          config.maxTasksPerExecution
        )

        if (config.logCreatedTasks) {
          logger.info(
            `[dynamic-tasks] Found ${tasksToCreate.length} potential follow-up task(s) for ${context.task.id}`
          )
          logger.info(`[dynamic-tasks] Reason: ${analysis.reason}`)
        }

        if (!config.autoApprove) {
          // Queue for approval
          pendingApprovals.set(context.task.id, tasksToCreate)
          logger.info(
            `[dynamic-tasks] ${tasksToCreate.length} task(s) queued for approval. Use getPendingApprovals() to review.`
          )
          return
        }

        // Create tasks automatically
        await createTasks(
          backend,
          context.task.id,
          tasksToCreate,
          config.createSubTasks,
          config.logCreatedTasks
        )
      } catch (error) {
        logger.error(
          `[dynamic-tasks] Error analyzing task ${context.task.id}: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    },

    /**
     * Optionally analyze failed tasks for remediation
     */
    async onTaskFailed(context: TaskContext, error: string): Promise<void> {
      if (!config.enabled || !backend) {
        return
      }

      // For failed tasks, we could create remediation tasks
      // This is a simple example - you might want more sophisticated analysis
      if (config.autoApprove && backend.createTask) {
        try {
          const remediationTask = {
            title: `Debug failure: ${context.task.title}`,
            description: `Task ${context.task.id} failed with error:\n\n${error}\n\nInvestigate and fix the root cause.`,
            priority: 'high' as const,
            tags: ['remediation', 'debugging']
          }

          const newTask = await backend.createTask(remediationTask)

          if (config.logCreatedTasks) {
            logger.info(
              `[dynamic-tasks] Created remediation task ${newTask.id} for failed task ${context.task.id}`
            )
          }
        } catch (err) {
          logger.error(
            `[dynamic-tasks] Error creating remediation task: ${err instanceof Error ? err.message : String(err)}`
          )
        }
      }
    }
  }
}

/**
 * Helper function to create tasks via backend
 */
async function createTasks(
  backend: TaskBackend,
  parentId: string,
  suggestedTasks: SuggestedTask[],
  createAsSubTasks: boolean,
  logCreatedTasks: boolean
): Promise<void> {
  let createdCount = 0

  for (const suggested of suggestedTasks) {
    try {
      let newTask

      if (createAsSubTasks && suggested.isSubTask && backend.createSubTask) {
        // Create as sub-task
        newTask = await backend.createSubTask(suggested.parentId || parentId, {
          title: suggested.title,
          description: suggested.description,
          priority: suggested.priority,
          metadata: { autoGenerated: true }
        })
      } else if (backend.createTask) {
        // Create as top-level task
        newTask = await backend.createTask({
          title: suggested.title,
          description: suggested.description,
          priority: suggested.priority,
          parentId: suggested.isSubTask ? suggested.parentId || parentId : undefined,
          metadata: { autoGenerated: true }
        })
      } else {
        logger.warn(
          '[dynamic-tasks] Backend does not support task creation (createTask/createSubTask not available)'
        )
        break
      }

      if (newTask && logCreatedTasks) {
        logger.info(
          `[dynamic-tasks] Created task ${newTask.id}: ${newTask.title}`
        )
      }

      createdCount++
    } catch (error) {
      logger.error(
        `[dynamic-tasks] Failed to create task "${suggested.title}": ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  if (logCreatedTasks && createdCount > 0) {
    logger.info(
      `[dynamic-tasks] Successfully created ${createdCount} new task(s)`
    )
  }
}

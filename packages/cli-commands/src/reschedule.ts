/**
 * Reschedule Command
 *
 * Reschedules completed tasks back to pending status.
 * Implements ICommand interface for the CLI command system.
 */

import type {
  ICommand,
  CommandContext,
  CommandResult,
  CommandOptions,
} from '@loopwork-ai/contracts'

export interface RescheduleOptions {
  /** Task ID to reschedule (optional for --all or --feature) */
  id?: string
  /** Schedule for a specific datetime (ISO 8601 format) */
  for?: string
  /** Reschedule tasks for a specific feature */
  feature?: string
  /** Reschedule all completed tasks */
  all?: boolean
}

interface RescheduleResult {
  success: boolean
  error?: string
}

interface TaskListOptions {
  status: string
  feature?: string
}

interface ListTasksResult {
  id: string
}

interface BackendWithReschedule {
  name: string
  rescheduleCompleted?: (taskId: string, scheduledFor?: string) => Promise<RescheduleResult>
  listTasks?: (options: TaskListOptions) => Promise<ListTasksResult[]>
}

class RescheduleError extends Error {
  code: string
  constructor(code: string, message: string, details?: string[]) {
    super(message)
    this.name = 'RescheduleError'
    this.code = code
    if (details) {
      this.message = `${message}\n${details.map(d => `  - ${d}`).join('\n')}`
    }
  }
}

export class RescheduleCommand implements ICommand {
  readonly name = 'reschedule'
  readonly description = 'Reschedule completed tasks back to pending status'
  readonly usage = '[task-id] [options]'
  readonly examples = [
    { command: 'loopwork reschedule TASK-001', description: 'Reschedule a specific task' },
    { command: 'loopwork reschedule --all', description: 'Reschedule all completed tasks' },
    { command: 'loopwork reschedule --feature auth', description: 'Reschedule all completed auth tasks' },
    { command: 'loopwork reschedule TASK-001 --for 2025-02-01T12:00:00Z', description: 'Schedule for a specific time' },
  ]
  readonly seeAlso = ['loopwork run', 'loopwork start']

  async execute(context: CommandContext, options: CommandOptions): Promise<CommandResult> {
    const opts = options as RescheduleOptions
    const logger = context.logger

    // Get backend from deps - must be provided by the CLI entry point
    const backend = context.deps?.backend as BackendWithReschedule | undefined

    if (!backend) {
      logger.error('Backend not available. Ensure the command is registered with a backend.')
      return {
        success: false,
        code: 1,
        message: 'Backend not available',
      }
    }

    try {
      // Validate datetime if provided
      if (opts.for) {
        const date = new Date(opts.for)
        if (isNaN(date.getTime())) {
          throw new RescheduleError(
            'ERR_TASK_INVALID',
            `Invalid datetime format: ${opts.for}`,
            [
              'Use ISO 8601 format: YYYY-MM-DDTHH:mm:ssZ',
              'Example: 2025-02-01T12:00:00Z'
            ]
          )
        }
      }

      // Handle multiple tasks rescheduling
      if (!opts.id) {
        if (!opts.all && !opts.feature) {
          throw new RescheduleError(
            'ERR_TASK_INVALID',
            'Task ID is required unless --all or --feature is specified',
            [
              'Use: loopwork reschedule <task-id>',
              'Or: loopwork reschedule --all',
              'Or: loopwork reschedule --feature <name>'
            ]
          )
        }

        logger.info('Searching for completed tasks to reschedule...')

        const listTasks = backend.listTasks
        if (!listTasks) {
          throw new RescheduleError(
            'ERR_BACKEND_INVALID',
            'Backend does not support listing tasks'
          )
        }

        const tasks = await listTasks({
          status: 'completed',
          feature: opts.feature
        })

        if (tasks.length === 0) {
          logger.warn('No completed tasks found to reschedule')
          return {
            success: true,
            code: 0,
            message: 'No completed tasks found to reschedule',
            data: { count: 0 }
          }
        }

        logger.info(`Found ${tasks.length} tasks. Rescheduling...`)

        let successCount = 0
        let failCount = 0

        for (const task of tasks) {
          try {
            const rescheduleFn = backend.rescheduleCompleted
            if (!rescheduleFn) {
              failCount++
              logger.error(`Backend does not support rescheduling: ${task.id}`)
              continue
            }

            const result = await rescheduleFn(task.id, opts.for)
            if (result.success) {
              successCount++
              logger.debug(`Rescheduled ${task.id}`)
            } else {
              failCount++
              logger.error(`Failed to reschedule ${task.id}: ${result.error || 'Unknown error'}`)
            }
          } catch (err) {
            failCount++
            logger.error(`Failed to reschedule ${task.id}: ${err}`)
          }
        }

        logger.success(`Rescheduled ${successCount} tasks (${failCount} failed)`)
        return {
          success: failCount === 0,
          code: failCount > 0 ? 1 : 0,
          message: `Rescheduled ${successCount} tasks (${failCount} failed)`,
          data: { successCount, failCount, total: tasks.length }
        }
      }

      // Single task reschedule
      logger.info(`Rescheduling task ${opts.id} in ${backend.name} backend...`)

      const rescheduleFn = backend.rescheduleCompleted
      if (!rescheduleFn) {
        throw new RescheduleError(
          'ERR_BACKEND_INVALID',
          'Backend does not support rescheduling'
        )
      }

      const result = await rescheduleFn(opts.id, opts.for)

      if (!result.success) {
        throw new RescheduleError(
          'ERR_BACKEND_INVALID',
          result.error || `Failed to reschedule task ${opts.id}`,
          [
            'Check if the task exists and is currently completed',
            'Verify backend connectivity and permissions'
          ]
        )
      }

      const scheduleMsg = opts.for ? `for ${opts.for}` : 'immediately'
      logger.success(`Successfully rescheduled task ${opts.id} to pending ${scheduleMsg}`)
      return {
        success: true,
        code: 0,
        message: `Successfully rescheduled task ${opts.id} to pending ${scheduleMsg}`,
        data: { taskId: opts.id, scheduledFor: opts.for }
      }
    } catch (error: unknown) {
      if (error instanceof RescheduleError) {
        logger.error(error.message)
        return {
          success: false,
          code: 1,
          message: error.message,
        }
      }

      const message = error instanceof Error ? error.message : String(error)
      logger.error(`Failed to reschedule: ${message}`)
      return {
        success: false,
        code: 1,
        message: `Failed to reschedule: ${message}`,
      }
    }
  }

  validate?(options: CommandOptions): string | undefined {
    const opts = options as RescheduleOptions

    if (opts.id && opts.all) {
      return 'Cannot specify both task ID and --all flag'
    }

    if (opts.id && opts.feature) {
      return 'Cannot specify both task ID and --feature flag'
    }

    if (opts.for) {
      const date = new Date(opts.for)
      if (isNaN(date.getTime())) {
        return 'Invalid datetime format for --for option. Use ISO 8601 format.'
      }
    }

    return undefined
  }
}

export function createRescheduleCommand(): ICommand {
  return new RescheduleCommand()
}

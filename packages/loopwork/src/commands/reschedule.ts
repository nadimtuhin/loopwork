import { logger } from '../core/utils'
import { LoopworkError } from '../core/errors'
import { getBackendAndConfig } from './shared'

type RescheduleOptions = {
  id?: string
  for?: string
  feature?: string
  all?: boolean
}

type RescheduleDeps = {
  getBackendAndConfig?: typeof getBackendAndConfig
  logger?: typeof logger
  LoopworkErrorClass?: typeof LoopworkError
}

export async function reschedule(
  id: string | undefined,
  options: RescheduleOptions,
  deps: RescheduleDeps = {}
) {
  const resolveBackendAndConfig = deps.getBackendAndConfig ?? getBackendAndConfig
  const activeLogger = deps.logger ?? logger
  const ErrorClass = deps.LoopworkErrorClass ?? LoopworkError

  const { backend } = await resolveBackendAndConfig(options)

  if (options.for) {
    const date = new Date(options.for)
    if (isNaN(date.getTime())) {
      throw new ErrorClass(
        'ERR_TASK_INVALID',
        `Invalid datetime format: ${options.for}`,
        [
          'Use ISO 8601 format: YYYY-MM-DDTHH:mm:ssZ',
          'Example: 2025-02-01T12:00:00Z'
        ]
      )
    }
  }

  // Handle multiple tasks rescheduling
  if (!id) {
    if (!options.all && !options.feature) {
      throw new ErrorClass(
        'ERR_TASK_INVALID',
        'Task ID is required unless --all or --feature is specified',
        [
          'Use: loopwork reschedule <task-id>',
          'Or: loopwork reschedule --all',
          'Or: loopwork reschedule --feature <name>'
        ]
      )
    }

    activeLogger.info(`Searching for completed tasks to reschedule...`)

    const tasks = await backend.listTasks({
      status: 'completed',
      feature: options.feature
    })

    if (tasks.length === 0) {
      activeLogger.warn('No completed tasks found to reschedule')
      return
    }

    activeLogger.info(`Found ${tasks.length} tasks. Rescheduling...`)

    let successCount = 0
    let failCount = 0

    for (const task of tasks) {
      try {
        const result = await backend.rescheduleCompleted(task.id, options.for)
        if (result.success) {
          successCount++
          activeLogger.debug(`Rescheduled ${task.id}`)
        } else {
          failCount++
          activeLogger.error(`Failed to reschedule ${task.id}: ${result.error}`)
        }
      } catch (err) {
        failCount++
        activeLogger.error(`Failed to reschedule ${task.id}: ${err}`)
      }
    }

    activeLogger.success(`Rescheduled ${successCount} tasks (${failCount} failed)`)
    return
  }

  activeLogger.info(`Rescheduling task ${id} in ${backend.name} backend...`)

  try {
    const result = await backend.rescheduleCompleted(id, options.for)

    if (!result.success) {
      throw new ErrorClass(
        'ERR_BACKEND_INVALID',
        result.error || `Failed to reschedule task ${id}`,
        [
          'Check if the task exists and is currently completed',
          'Verify backend connectivity and permissions'
        ]
      )
    }

    const scheduleMsg = options.for ? `for ${options.for}` : 'immediately'
    activeLogger.success(`Successfully rescheduled task ${id} to pending ${scheduleMsg}`)
  } catch (error: unknown) {
    if (error instanceof ErrorClass) throw error

    const message = error instanceof Error ? error.message : String(error)
    throw new ErrorClass(
      'ERR_BACKEND_INIT',
      `Failed to reschedule task: ${message}`,
      [
        'Check backend connectivity and permissions',
        'Verify the task ID is correct and the task is completed'
      ]
    )
  }
}

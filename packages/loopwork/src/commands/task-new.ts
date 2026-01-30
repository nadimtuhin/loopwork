import { getConfig } from '../core/config'
import { createBackend } from '../backends'
import { logger } from '../core/utils'
import { LoopworkError } from '../core/errors'
import type { Priority } from '../backends/types'

type TaskNewDeps = {
  getConfig?: typeof getConfig
  createBackend?: typeof createBackend
  logger?: typeof logger
  LoopworkErrorClass?: typeof LoopworkError
}

export async function taskNew(options: {
  title?: string
  description?: string
  priority?: string
  feature?: string
}, deps: TaskNewDeps = {}) {
  const resolveConfig = deps.getConfig ?? getConfig
  const resolveBackend = deps.createBackend ?? createBackend
  const activeLogger = deps.logger ?? logger
  const ErrorClass = deps.LoopworkErrorClass ?? LoopworkError

  const config = await resolveConfig()
  const backend = resolveBackend(config.backend)

  if (!options.title) {
    throw new ErrorClass(
      'Task title is required',
      [
        'Use --title "My task title"',
        'Example: loopwork task-new --title "Add user authentication" --description "Add login form and JWT handling"'
      ]
    )
  }

  activeLogger.info(`Creating new task in ${backend.name} backend...`)

  if (typeof backend.createTask !== 'function') {
    throw new ErrorClass(
      `Backend '${backend.name}' does not support creating tasks`,
      [
        'Check if your backend version is up to date',
        'Try manually creating the task in the backend (e.g., GitHub issue or tasks.json)'
      ]
    )
  }

  try {
    const task = await backend.createTask({
      title: options.title,
      description: options.description || '',
      priority: (options.priority as Priority) || 'medium',
      feature: options.feature,
    })

    activeLogger.success(`Created task ${task.id}: ${task.title}`)
    if (task.metadata?.prdFile) {
      activeLogger.info(`PRD file: ${task.metadata.prdFile}`)
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    throw new ErrorClass(
      `Failed to create task: ${message}`,
      [
        'Check backend connectivity and permissions',
        'If using GitHub backend, ensure you have write access to the repository',
        'If using JSON backend, ensure the tasks file is writable'
      ]
    )
  }
}

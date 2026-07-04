import React from 'react'
import { logger, renderInk, InkTable } from '../core/utils'
import { LoopworkError } from '../core/errors'
import type { Config } from '../core/config'
import type { TaskBackend } from '../backends'

export interface DeadletterListOptions {
  json?: boolean
}

export interface DeadletterDependencies {
  getConfig(): Promise<Config>
  createBackend(backendConfig: Config['backend']): TaskBackend
  logger: {
    info: (msg: string) => void
    success: (msg: string) => void
    warn: (msg: string) => void
    error: (msg: string) => void
    raw: (msg: string, noNewline?: boolean) => void
  }
}

const defaultDependencies: DeadletterDependencies = {
  async getConfig() {
    const { getConfig } = await import('../core/config')
    return getConfig()
  },
  createBackend(backendConfig) {
    const { createBackend } = require('../backends')
    return createBackend(backendConfig)
  },
  logger,
}

export async function list(options: DeadletterListOptions = {}, deps = defaultDependencies) {
  const config = await deps.getConfig()
  const backend = deps.createBackend(config.backend)

  const tasks = await backend.listTasks({ status: 'quarantined' })

  if (options.json) {
    deps.logger.raw(JSON.stringify(tasks, null, 2))
    return
  }

  if (tasks.length === 0) {
    deps.logger.info('No quarantined tasks found.')
    return
  }

  deps.logger.info(`Dead Letter Queue (${tasks.length} quarantined tasks)\n`)

  const rows = tasks.map(task => {
    const error = task.lastError || task.events?.find(e => e.type === 'quarantined')?.message || 'Unknown'
    const quarantinedAt = task.timestamps?.quarantinedAt
      ? new Date(task.timestamps.quarantinedAt).toLocaleString()
      : '-'

    return [
      task.id,
      task.title.substring(0, 29),
      (task.failureCount || 0).toString(),
      quarantinedAt,
      error.substring(0, 34)
    ]
  }) as string[][]

  const tableOutput = await renderInk(
    React.createElement(InkTable, {
      headers: ['ID', 'Title', 'Failures', 'Quarantined At', 'Last Error'],
      rows,
      columnConfigs: [
        { width: 12, align: 'left' },
        { width: 30, align: 'left' },
        { width: 10, align: 'center' },
        { width: 25, align: 'left' },
        { width: 35, align: 'left' },
      ],
    })
  )

  deps.logger.raw(tableOutput)
  
  if (config.deadletter?.enabled) {
    deps.logger.raw('')
    deps.logger.info('Policy:')
    deps.logger.info(`  Threshold:    ${config.deadletter.threshold || 3} failures`)
    deps.logger.info(`  Retry CD:     ${(config.deadletter.retryCooldownMs || 60000) / 1000}s`)
    if (config.deadletter.autoRetry) {
      deps.logger.info(`  Auto-Retry:   Enabled (delay: ${(config.deadletter.autoRetryDelayMs || 3600000) / 3600000}h)`)
    } else {
      deps.logger.info('  Auto-Retry:   Disabled')
    }
  }

  deps.logger.raw('')
  deps.logger.info('Use `loopwork deadletter retry <id>` to move a task back to pending queue.')
}

export async function retry(taskId: string, deps = defaultDependencies) {
  const config = await deps.getConfig()
  const backend = deps.createBackend(config.backend)

  const task = await backend.getTask(taskId)
  if (!task) {
    throw new LoopworkError('ERR_TASK_NOT_FOUND', `Task ${taskId} not found`)
  }

  if (task.status !== 'quarantined') {
    throw new LoopworkError('ERR_TASK_INVALID', `Task ${taskId} is not quarantined (status: ${task.status})`)
  }

  await backend.resetToPending(taskId)
  deps.logger.success(`Task ${taskId} moved back to pending queue`)
}

export async function clear(taskId: string, deps = defaultDependencies) {
  const config = await deps.getConfig()
  const backend = deps.createBackend(config.backend)

  const task = await backend.getTask(taskId)
  if (!task) {
    throw new LoopworkError('ERR_TASK_NOT_FOUND', `Task ${taskId} not found`)
  }

  if (task.status !== 'quarantined') {
    throw new LoopworkError('ERR_TASK_INVALID', `Task ${taskId} is not quarantined (status: ${task.status})`)
  }

  await backend.markFailed(taskId, 'Manually cleared from dead letter queue')
  deps.logger.success(`Task ${taskId} marked as failed and cleared from dead letter queue`)
}

export function createDeadletterCommand() {
  return {
    name: 'deadletter',
    description: 'Manage quarantined tasks (Dead Letter Queue)',
    usage: '<subcommand> [options]',
    subcommands: [
      {
        name: 'list',
        description: 'List all quarantined tasks',
        examples: [
          { command: 'loopwork deadletter list', description: 'Show all quarantined tasks' },
          { command: 'loopwork deadletter list --json', description: 'Output as JSON' },
        ],
      },
      {
        name: 'retry <id>',
        description: 'Move a quarantined task back to pending',
        examples: [
          { command: 'loopwork deadletter retry TASK-001', description: 'Retry task TASK-001' },
        ],
      },
      {
        name: 'clear <id>',
        description: 'Mark a quarantined task as failed and clear from DLQ',
        examples: [
          { command: 'loopwork deadletter clear TASK-001', description: 'Clear task TASK-001' },
        ],
      },
    ],
    handler: {
      list,
      retry,
      clear,
    },
  }
}

/**
 * Custom Logging Plugin
 *
 * This plugin demonstrates:
 * - Maintaining plugin state across hooks
 * - Writing and reading files from a plugin
 * - Recording both successes and failures
 * - Persisting data across multiple runs
 *
 * Every task execution is recorded to a JSON file with:
 * - Task ID and title
 * - Execution timestamp
 * - Duration
 * - Success/failure status
 * - Error message (if failed)
 */

import type { LoopworkPlugin, TaskContext, PluginTaskResult, LoopStats } from 'loopwork'
import fs from 'fs'
import path from 'path'

export interface LoggingPluginOptions {
  /** Path to store logs (default: '.loopwork-logs/tasks.json') */
  logFile?: string

  /** Create log directory if it doesn't exist (default: true) */
  createDir?: boolean
}

interface TaskLogEntry {
  timestamp: string
  taskId: string
  title: string
  status: 'completed' | 'failed'
  duration: number
  error: string | null
}

interface LogsData {
  logs: TaskLogEntry[]
}

/**
 * Create a logging plugin that persists task execution logs to a JSON file
 *
 * @param options Configuration options
 *
 * @example
 * ```typescript
 * import { compose, defineConfig, withPlugin } from 'loopwork'
 * import { createLoggingPlugin } from './plugins/logging-plugin'
 *
 * export default compose(
 *   withPlugin(createLoggingPlugin({
 *     logFile: '.loopwork-logs/tasks.json'
 *   })),
 *   withJSONBackend()
 * )(defineConfig({ cli: 'claude' }))
 * ```
 */
export function createLoggingPlugin(options: LoggingPluginOptions = {}): LoopworkPlugin {
  const {
    logFile = '.loopwork-logs/tasks.json',
    createDir = true,
  } = options

  // Plugin state
  let logs: TaskLogEntry[] = []
  let currentTask: { id: string; startTime: number } | null = null

  /**
   * Load logs from file
   */
  async function loadLogs(): Promise<TaskLogEntry[]> {
    try {
      if (!fs.existsSync(logFile)) {
        return []
      }
      const data = JSON.parse(fs.readFileSync(logFile, 'utf-8')) as LogsData
      return data.logs || []
    } catch (error) {
      console.error(`Failed to load logs from ${logFile}:`, error)
      return []
    }
  }

  /**
   * Save logs to file
   */
  async function saveLogs(): Promise<void> {
    try {
      // Ensure directory exists
      const dir = path.dirname(logFile)
      if (createDir && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      // Write logs
      const data: LogsData = { logs }
      fs.writeFileSync(logFile, JSON.stringify(data, null, 2))
    } catch (error) {
      console.error(`Failed to save logs to ${logFile}:`, error)
    }
  }

  return {
    name: 'custom-logging',

    /**
     * Called when loop starts - load existing logs
     */
    async onLoopStart(namespace: string) {
      logs = await loadLogs()
      console.log(`Logging plugin initialized. Logs: ${logFile}`)
    },

    /**
     * Called when each task starts - record start time
     */
    async onTaskStart(context: TaskContext) {
      currentTask = {
        id: context.task.id,
        startTime: Date.now(),
      }
    },

    /**
     * Called when task completes - record success
     */
    async onTaskComplete(context: TaskContext, result: PluginTaskResult) {
      const entry: TaskLogEntry = {
        timestamp: new Date().toISOString(),
        taskId: context.task.id,
        title: context.task.title,
        status: 'completed',
        duration: result.duration,
        error: null,
      }

      logs.push(entry)
      await saveLogs()
    },

    /**
     * Called when task fails - record failure
     */
    async onTaskFailed(context: TaskContext, error: string) {
      const startTime = currentTask?.startTime || Date.now()
      const duration = Date.now() - startTime

      const entry: TaskLogEntry = {
        timestamp: new Date().toISOString(),
        taskId: context.task.id,
        title: context.task.title,
        status: 'failed',
        duration,
        error,
      }

      logs.push(entry)
      await saveLogs()
    },

    /**
     * Called when loop ends - log summary
     */
    async onLoopEnd(stats: LoopStats) {
      const completedLogs = logs.filter(log => log.status === 'completed')
      const failedLogs = logs.filter(log => log.status === 'failed')

      const totalDuration = completedLogs.reduce((sum, log) => sum + log.duration, 0)
      const avgDuration = completedLogs.length > 0 ? totalDuration / completedLogs.length : 0

      console.log(`\nLogging summary:`)
      console.log(`  Completed: ${stats.completed}`)
      console.log(`  Failed: ${stats.failed}`)
      console.log(`  Average duration: ${Math.round(avgDuration)}ms`)
      console.log(`  Total logs: ${logs.length}`)
      console.log(`  Log file: ${logFile}`)
    },
  }
}

/**
 * Utility: Analyze logs from file
 * Can be used standalone to examine log data
 *
 * @example
 * ```typescript
 * const stats = await analyzeLogs('.loopwork-logs/tasks.json')
 * console.log('Success rate:', stats.successRate)
 * console.log('Slowest task:', stats.slowest)
 * ```
 */
export async function analyzeLogs(logFile: string) {
  try {
    const data = JSON.parse(fs.readFileSync(logFile, 'utf-8')) as LogsData
    const logs = data.logs || []

    if (logs.length === 0) {
      return {
        total: 0,
        completed: 0,
        failed: 0,
        successRate: 0,
        avgDuration: 0,
        slowest: null,
        fastest: null,
      }
    }

    const completed = logs.filter(log => log.status === 'completed')
    const failed = logs.filter(log => log.status === 'failed')
    const totalDuration = completed.reduce((sum, log) => sum + log.duration, 0)
    const avgDuration = completed.length > 0 ? totalDuration / completed.length : 0

    const slowest = [...logs].sort((a, b) => b.duration - a.duration)[0] || null
    const fastest = [...logs].sort((a, b) => a.duration - b.duration)[0] || null

    return {
      total: logs.length,
      completed: completed.length,
      failed: failed.length,
      successRate: (completed.length / logs.length) * 100,
      avgDuration,
      slowest,
      fastest,
    }
  } catch (error) {
    console.error(`Failed to analyze logs: ${error}`)
    return null
  }
}

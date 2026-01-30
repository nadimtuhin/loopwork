/**
 * Simple Notification Plugin
 *
 * This plugin demonstrates basic plugin structure by logging simple notifications
 * when tasks start, complete, fail, or the loop ends.
 *
 * Key concepts:
 * - Implementing LoopworkPlugin interface
 * - Using lifecycle hooks (onLoopStart, onTaskStart, onTaskComplete, onTaskFailed, onLoopEnd)
 * - Accessing task and context information
 * - Formatting timestamps
 */

import type { LoopworkPlugin, TaskContext, PluginTaskResult, LoopStats } from 'loopwork'

/**
 * Create a simple notification plugin
 *
 * @example
 * ```typescript
 * import { compose, defineConfig, withPlugin } from 'loopwork'
 * import { withJSONBackend } from 'loopwork/backends'
 * import { createNotificationPlugin } from './plugins/notification-plugin'
 *
 * export default compose(
 *   withPlugin(createNotificationPlugin()),
 *   withJSONBackend()
 * )(defineConfig({ cli: 'claude' }))
 * ```
 */
export function createNotificationPlugin(): LoopworkPlugin {
  return {
    name: 'simple-notifications',

    /**
     * Called when the automation loop starts
     * Use this to log the start or send an initial notification
     */
    async onLoopStart(namespace: string) {
      const time = getFormattedTime()
      console.log(`\n${time} - Starting loop: ${namespace}`)
    },

    /**
     * Called before each task is executed
     * Use this to log which task is starting or prepare external systems
     */
    async onTaskStart(context: TaskContext) {
      const { task, iteration } = context
      const time = getFormattedTime()
      console.log(`${time} - [${iteration}] Starting: ${task.id} - ${task.title}`)
    },

    /**
     * Called when a task completes successfully
     * Use this to log completion or update external systems
     */
    async onTaskComplete(context: TaskContext, result: PluginTaskResult) {
      const { task, iteration } = context
      const time = getFormattedTime()
      const duration = formatDuration(result.duration)
      console.log(`${time} - [${iteration}] Completed: ${task.id} in ${duration}`)
    },

    /**
     * Called when a task fails
     * Use this to log errors or trigger alerts
     */
    async onTaskFailed(context: TaskContext, error: string) {
      const { task, iteration } = context
      const time = getFormattedTime()
      console.log(`${time} - [${iteration}] Failed: ${task.id}`)
      console.log(`       Error: ${error}`)
    },

    /**
     * Called when the automation loop ends
     * Use this to log a summary or send a final notification
     */
    async onLoopEnd(stats: LoopStats) {
      const time = getFormattedTime()
      const duration = formatDuration(stats.duration)
      const total = stats.completed + stats.failed
      const successRate = total > 0 ? Math.round((stats.completed / total) * 100) : 0

      console.log(`\n${time} - Loop complete!`)
      console.log(`       Completed: ${stats.completed}/${total}`)
      console.log(`       Failed: ${stats.failed}/${total}`)
      console.log(`       Success Rate: ${successRate}%`)
      console.log(`       Total Duration: ${duration}`)
      console.log()
    },
  }
}

/**
 * Helper: Format current time as HH:MM:SS
 */
function getFormattedTime(): string {
  const now = new Date()
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}

/**
 * Helper: Format milliseconds as human-readable duration
 * Examples: "1.2s", "45ms", "2m 30s"
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`
  }

  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) {
    const decimal = ((ms % 1000) / 1000).toFixed(1)
    return `${seconds}.${decimal.split('.')[1]}s`
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

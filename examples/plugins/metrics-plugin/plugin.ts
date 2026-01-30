/**
 * Metrics Collection Plugin
 *
 * This plugin demonstrates:
 * - Collecting data from multiple hooks
 * - Computing statistics (min, max, average, median)
 * - Handling task metadata for analytics
 * - Generating detailed reports
 *
 * Metrics collected:
 * - Task completion/failure rates
 * - Duration statistics
 * - Slowest and fastest tasks
 * - Failure analysis
 */

import type { LoopworkPlugin, TaskContext, PluginTaskResult, LoopStats } from 'loopwork'

interface TaskMetric {
  id: string
  title: string
  duration: number
  status: 'completed' | 'failed'
  error?: string
}

interface MetricsState {
  total: number
  completed: number
  failed: number
  durations: number[]
  tasks: TaskMetric[]
  failures: Map<string, string> // taskId -> error
  startTime: number
}

export interface MetricsPluginOptions {
  /** Enable/disable the plugin (default: true) */
  enabled?: boolean

  /** Show full report at loop end (default: true) */
  showReport?: boolean
}

/**
 * Create a metrics collection plugin
 *
 * Collects comprehensive performance metrics and generates reports
 * at loop completion.
 *
 * @param options Configuration options
 *
 * @example
 * ```typescript
 * import { compose, defineConfig, withPlugin } from 'loopwork'
 * import { createMetricsPlugin } from './plugins/metrics-plugin'
 *
 * export default compose(
 *   withPlugin(createMetricsPlugin({
 *     showReport: true
 *   })),
 *   withJSONBackend()
 * )(defineConfig({ cli: 'claude' }))
 * ```
 */
export function createMetricsPlugin(options: MetricsPluginOptions = {}): LoopworkPlugin {
  const {
    enabled = true,
    showReport = true,
  } = options

  // Plugin state
  const metrics: MetricsState = {
    total: 0,
    completed: 0,
    failed: 0,
    durations: [],
    tasks: [],
    failures: new Map(),
    startTime: 0,
  }

  return {
    name: 'metrics-collection',

    /**
     * Called when loop starts - initialize metrics
     */
    async onLoopStart(namespace: string) {
      if (!enabled) return

      metrics.startTime = Date.now()
      metrics.total = 0
      metrics.completed = 0
      metrics.failed = 0
      metrics.durations = []
      metrics.tasks = []
      metrics.failures.clear()
    },

    /**
     * Called when task completes - record metrics
     */
    async onTaskComplete(context: TaskContext, result: PluginTaskResult) {
      if (!enabled) return

      metrics.total++
      metrics.completed++
      metrics.durations.push(result.duration)

      metrics.tasks.push({
        id: context.task.id,
        title: context.task.title,
        duration: result.duration,
        status: 'completed',
      })
    },

    /**
     * Called when task fails - record failure
     */
    async onTaskFailed(context: TaskContext, error: string) {
      if (!enabled) return

      metrics.total++
      metrics.failed++

      // For failed tasks, duration is approximate
      metrics.tasks.push({
        id: context.task.id,
        title: context.task.title,
        duration: 0, // Duration not available for failed tasks
        status: 'failed',
        error,
      })

      // Store failure information
      metrics.failures.set(context.task.id, error)
    },

    /**
     * Called when loop ends - generate and display metrics
     */
    async onLoopEnd(stats: LoopStats) {
      if (!enabled || !showReport) return

      const report = generateReport(metrics)
      console.log(report)
    },
  }
}

/**
 * Generate a human-readable metrics report
 */
function generateReport(metrics: MetricsState): string {
  const lines: string[] = []

  lines.push('\nTASK EXECUTION METRICS')
  lines.push('='.repeat(50))

  // Summary section
  lines.push('\nSummary:')
  const successRate = metrics.total > 0 ? (metrics.completed / metrics.total) * 100 : 0
  lines.push(`  Total Tasks: ${metrics.total}`)
  lines.push(`  Completed: ${metrics.completed} (${successRate.toFixed(1)}%)`)
  lines.push(`  Failed: ${metrics.failed} (${(100 - successRate).toFixed(1)}%)`)

  // Duration statistics (only for completed tasks)
  if (metrics.durations.length > 0) {
    lines.push('\nDuration:')
    const min = Math.min(...metrics.durations)
    const max = Math.max(...metrics.durations)
    const avg = metrics.durations.reduce((a, b) => a + b, 0) / metrics.durations.length
    const med = calculateMedian(metrics.durations)

    lines.push(`  Min: ${formatMs(min)}`)
    lines.push(`  Max: ${formatMs(max)}`)
    lines.push(`  Average: ${formatMs(avg)}`)
    lines.push(`  Median: ${formatMs(med)}`)
  }

  // Performance section - slowest tasks
  const completedTasks = metrics.tasks.filter(t => t.status === 'completed')
  if (completedTasks.length > 0) {
    lines.push('\nPerformance:')
    lines.push('  Slowest Tasks:')

    const slowest = getSlowestTasks(completedTasks, 3)
    slowest.forEach((task, i) => {
      lines.push(`    ${i + 1}. ${task.id}: ${task.title} (${formatMs(task.duration)})`)
    })

    lines.push('  Fastest Tasks:')
    const fastest = getFastestTasks(completedTasks, 3)
    fastest.forEach((task, i) => {
      lines.push(`    ${i + 1}. ${task.id}: ${task.title} (${formatMs(task.duration)})`)
    })
  }

  // Failures section
  if (metrics.failures.size > 0) {
    lines.push('\nFailures:')
    metrics.failures.forEach((error, taskId) => {
      const task = metrics.tasks.find(t => t.id === taskId)
      const title = task?.title || 'Unknown'
      const errorMsg = error.substring(0, 60) + (error.length > 60 ? '...' : '')
      lines.push(`  ${taskId}: ${errorMsg}`)
    })
  }

  lines.push()
  return lines.join('\n')
}

/**
 * Calculate median of an array of numbers
 */
function calculateMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

/**
 * Get the N slowest tasks
 */
function getSlowestTasks(tasks: TaskMetric[], n: number): TaskMetric[] {
  return [...tasks]
    .sort((a, b) => b.duration - a.duration)
    .slice(0, n)
}

/**
 * Get the N fastest tasks
 */
function getFastestTasks(tasks: TaskMetric[], n: number): TaskMetric[] {
  return [...tasks]
    .sort((a, b) => a.duration - b.duration)
    .slice(0, n)
}

/**
 * Format milliseconds as human-readable duration
 * Examples: "1.2s", "45ms", "2m 30s"
 */
function formatMs(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`
  }

  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`
  }

  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}m ${seconds}s`
}

/**
 * Utility: Get task duration statistics
 *
 * @example
 * ```typescript
 * const stats = getStats(metrics)
 * console.log(`P95 duration: ${stats.p95}ms`)
 * ```
 */
export function getStats(metrics: MetricsState) {
  if (metrics.durations.length === 0) {
    return {
      min: 0,
      max: 0,
      avg: 0,
      median: 0,
      p95: 0,
      p99: 0,
    }
  }

  const sorted = [...metrics.durations].sort((a, b) => a - b)
  const sum = sorted.reduce((a, b) => a + b, 0)

  const percentile = (p: number) => {
    const index = Math.ceil((p / 100) * sorted.length) - 1
    return sorted[Math.max(0, index)]
  }

  return {
    min: Math.min(...sorted),
    max: Math.max(...sorted),
    avg: sum / sorted.length,
    median: calculateMedian(sorted),
    p95: percentile(95),
    p99: percentile(99),
  }
}

/**
 * Utility: Get success rate as percentage
 */
export function getSuccessRate(metrics: MetricsState): number {
  return metrics.total > 0 ? (metrics.completed / metrics.total) * 100 : 0
}

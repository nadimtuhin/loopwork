/**
 * Cost Tracking Telemetry Provider
 *
 * Implements ITelemetryProvider interface to provide cost tracking
 * as a standard telemetry provider that the core can use generically.
 */

import type {
  ITelemetryProvider,
  IMetricsCollector,
  StructuredLog,
} from '@loopwork-ai/contracts'
import { 
  CostTracker, 
  parseUsageFromOutput, 
  type TokenUsage, 
  type CostTrackingConfig 
} from './index'

/**
 * Metrics collector implementation that tracks cost-related metrics
 */
class CostMetricsCollector implements IMetricsCollector {
  private metrics: Map<string, number> = new Map()
  private tags: Map<string, Record<string, string>> = new Map()

  increment(name: string, value = 1, tags?: Record<string, string>): void {
    const current = this.metrics.get(name) || 0
    this.metrics.set(name, current + value)
    if (tags) {
      this.tags.set(name, tags)
    }
  }

  decrement(name: string, value = 1, tags?: Record<string, string>): void {
    const current = this.metrics.get(name) || 0
    this.metrics.set(name, current - value)
    if (tags) {
      this.tags.set(name, tags)
    }
  }

  gauge(name: string, value: number, tags?: Record<string, string>): void {
    this.metrics.set(name, value)
    if (tags) {
      this.tags.set(name, tags)
    }
  }

  timing(name: string, value: number, tags?: Record<string, string>): void {
    // Store timing values with a special prefix to distinguish from other metrics
    const timingName = `timing:${name}`
    this.metrics.set(timingName, value)
    if (tags) {
      this.tags.set(timingName, tags)
    }
  }

  /**
   * Get the current value of a metric
   */
  getValue(name: string): number | undefined {
    return this.metrics.get(name)
  }

  /**
   * Get all recorded metrics
   */
  getAllMetrics(): Record<string, { value: number; tags?: Record<string, string> }> {
    const result: Record<string, { value: number; tags?: Record<string, string> }> = {}
    for (const [name, value] of this.metrics.entries()) {
      result[name] = {
        value,
        tags: this.tags.get(name),
      }
    }
    return result
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics.clear()
    this.tags.clear()
  }
}

/**
 * Options for creating a CostTrackingTelemetryProvider
 */
export interface CostTelemetryProviderOptions {
  projectRoot: string
  namespace?: string
  config?: CostTrackingConfig
}

/**
 * Cost Tracking Telemetry Provider
 *
 * Wraps CostTracker to implement ITelemetryProvider interface,
 * allowing cost tracking to be used as a generic telemetry provider.
 */
export class CostTrackingTelemetryProvider implements ITelemetryProvider {
  public readonly metrics: IMetricsCollector
  private tracker: CostTracker
  private config: CostTrackingConfig
  private pendingLogs: StructuredLog[] = []

  constructor(options: CostTelemetryProviderOptions) {
    this.tracker = new CostTracker(options.projectRoot, options.namespace || 'default')
    this.metrics = new CostMetricsCollector()
    this.config = options.config || {}
  }

  /**
   * Log a structured log entry
   * Stores logs that may contain cost information for later processing
   */
  log(entry: StructuredLog): void {
    this.pendingLogs.push(entry)

    // Try to extract usage information from log metadata
    if (entry.metadata) {
      const usage = this.extractUsageFromMetadata(entry.metadata)
      if (usage) {
        this.recordUsage(
          entry.taskId || 'unknown',
          entry.metadata.model as string || this.config.defaultModel || 'default',
          usage,
          entry.metadata.duration as number | undefined,
          entry.level === 'error' ? 'failed' : 'success',
          entry.level === 'error' ? entry.message : undefined,
          entry.iteration,
          entry.metadata.userId as string | undefined
        )
      }
    }

    // Update metrics based on log level
    this.updateMetricsFromLog(entry)
  }

  /**
   * Flush any pending data
   * Saves the current state to disk
   */
  async flush(): Promise<void> {
    // The CostTracker already saves on each record, but we could
    // implement batch saving here if needed in the future
    this.pendingLogs = []
  }

  /**
   * Record token usage directly
   */
  recordUsage(
    taskId: string,
    model: string,
    usage: TokenUsage,
    duration?: number,
    status: 'success' | 'failed' = 'success',
    error?: string,
    iteration?: number,
    userId?: string
  ): void {
    this.tracker.record(taskId, model, usage, duration, status, error, iteration, userId)

    // Update metrics
    this.metrics.increment('tasks.total', 1, { taskId, model, status })
    this.metrics.increment(`tasks.${status}`, 1, { taskId, model })
    this.metrics.increment('tokens.input', usage.inputTokens, { taskId, model })
    this.metrics.increment('tokens.output', usage.outputTokens, { taskId, model })

    if (usage.cacheReadTokens) {
      this.metrics.increment('tokens.cache.read', usage.cacheReadTokens, { taskId, model })
    }
    if (usage.cacheWriteTokens) {
      this.metrics.increment('tokens.cache.write', usage.cacheWriteTokens, { taskId, model })
    }

    // Calculate and track cost
    const cost = this.tracker.calculateCost(model, usage)
    this.metrics.increment('cost.total', cost, { taskId, model })

    if (duration && duration > 0) {
      this.metrics.timing('task.duration', duration * 1000, { taskId, model }) // Store in ms
    }
  }

  /**
   * Parse usage from CLI output string
   */
  parseUsageFromOutput(output: string): TokenUsage | null {
    return parseUsageFromOutput(output)
  }

  /**
   * Get the underlying CostTracker instance
   */
  getCostTracker(): CostTracker {
    return this.tracker
  }

  /**
   * Get today's cost summary
   */
  getTodaySummary() {
    return this.tracker.getTodaySummary()
  }

  /**
   * Get cost summary for a specific task
   */
  getTaskSummary(taskId: string) {
    return this.tracker.getTaskSummary(taskId)
  }

  /**
   * Get all-time summary
   */
  getAllTimeSummary() {
    return this.tracker.getAllTimeSummary()
  }

  /**
   * Validate budget constraints
   */
  validateBudgets(taskId: string) {
    return this.tracker.validateBudgets(taskId, {
      dailyBudget: this.config.dailyBudget,
      perTaskBudget: this.config.perTaskBudget,
      perUserBudget: this.config.perUserBudget,
      userId: this.config.userId,
      budgetAction: this.config.budgetAction,
    })
  }

  /**
   * Check daily budget
   */
  checkDailyBudget(dailyBudget: number): { allowed: boolean; currentCost: number } {
    return this.tracker.checkDailyBudget(dailyBudget)
  }

  /**
   * Get telemetry report
   */
  getTelemetryReport() {
    return this.tracker.getTelemetryReport()
  }

  private extractUsageFromMetadata(metadata: Record<string, unknown>): TokenUsage | null {
    if (metadata.usage && typeof metadata.usage === 'object') {
      const usage = metadata.usage as Record<string, number>
      return {
        inputTokens: usage.inputTokens || usage.input_tokens || 0,
        outputTokens: usage.outputTokens || usage.output_tokens || 0,
        cacheReadTokens: usage.cacheReadTokens || usage.cache_read_tokens,
        cacheWriteTokens: usage.cacheWriteTokens || usage.cache_write_tokens,
      }
    }
    return null
  }

  private updateMetricsFromLog(entry: StructuredLog): void {
    // Track log counts by level
    this.metrics.increment(`logs.${entry.level}`, 1)

    // Track by namespace if provided
    if (entry.namespace) {
      this.metrics.increment(`logs.namespace.${entry.namespace}`, 1, { level: entry.level })
    }

    // Track errors separately
    if (entry.level === 'error' || entry.error) {
      this.metrics.increment('errors.total', 1, {
        taskId: entry.taskId || 'unknown',
        namespace: entry.namespace || 'default',
      })
    }
  }
}

/**
 * Create a CostTrackingTelemetryProvider instance
 */
export function createCostTelemetryProvider(
  options: CostTelemetryProviderOptions
): CostTrackingTelemetryProvider {
  return new CostTrackingTelemetryProvider(options)
}

import type { IMetricsCollector } from '@loopwork-ai/contracts'

/**
 * Token usage data structure
 */
export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

/**
 * Token metrics entry with metadata
 */
export interface TokenMetricsEntry {
  taskId: string
  model: string
  usage: TokenUsage
  timestamp: Date
  duration?: number
  status: 'success' | 'failed'
  tags?: Record<string, string>
}

/**
 * Aggregated token metrics summary
 */
export interface TokenMetricsSummary {
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheReadTokens: number
  totalCacheWriteTokens: number
  totalTokens: number
  taskCount: number
  successCount: number
  failureCount: number
  avgTokensPerTask: number
  avgInputTokens: number
  avgOutputTokens: number
  byModel: Record<string, ModelTokenMetrics>
  entries: TokenMetricsEntry[]
}

/**
 * Token metrics per model
 */
export interface ModelTokenMetrics {
  model: string
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheReadTokens: number
  totalCacheWriteTokens: number
  totalTokens: number
  taskCount: number
  successCount: number
  failureCount: number
  avgTokensPerTask: number
}

/**
 * Configuration for TokenMetricsCollector
 */
export interface TokenMetricsCollectorConfig {
  /** Maximum number of entries to keep in memory (default: 1000) */
  maxEntries?: number
  /** Enable automatic aggregation by model */
  trackByModel?: boolean
  /** Enable tracking of cache tokens */
  trackCacheTokens?: boolean
}

/**
 * TokenMetricsCollector - Advanced token usage tracking and analysis
 * 
 * Provides detailed token metrics collection with:
 * - Per-task token tracking
 * - Model-based aggregation
 * - Cache token monitoring
 * - Statistical analysis (averages, trends)
 */
export class TokenMetricsCollector implements IMetricsCollector {
  private entries: TokenMetricsEntry[] = []
  private config: Required<TokenMetricsCollectorConfig>

  constructor(config: TokenMetricsCollectorConfig = {}) {
    this.config = {
      maxEntries: config.maxEntries ?? 1000,
      trackByModel: config.trackByModel ?? true,
      trackCacheTokens: config.trackCacheTokens ?? true,
    }
  }

  /**
   * Record token usage for a task
   */
  record(entry: TokenMetricsEntry): void {
    // Add entry
    this.entries.push(entry)

    // Trim if exceeding max entries (keep most recent)
    if (this.entries.length > this.config.maxEntries) {
      this.entries = this.entries.slice(-this.config.maxEntries)
    }
  }

  /**
   * Record token usage with individual parameters
   */
  recordUsage(
    taskId: string,
    model: string,
    usage: TokenUsage,
    status: 'success' | 'failed' = 'success',
    duration?: number,
    tags?: Record<string, string>
  ): void {
    this.record({
      taskId,
      model,
      usage,
      timestamp: new Date(),
      duration,
      status,
      tags,
    })
  }

  /**
   * Get summary of all token metrics
   */
  getSummary(): TokenMetricsSummary {
    return this.calculateSummary(this.entries)
  }

  /**
   * Get summary for a specific task
   */
  getTaskSummary(taskId: string): TokenMetricsSummary {
    const taskEntries = this.entries.filter(e => e.taskId === taskId)
    return this.calculateSummary(taskEntries)
  }

  /**
   * Get summary for a specific model
   */
  getModelSummary(model: string): ModelTokenMetrics | null {
    const modelEntries = this.entries.filter(e => e.model === model)
    if (modelEntries.length === 0) return null

    return this.calculateModelMetrics(model, modelEntries)
  }

  /**
   * Get all recorded entries
   */
  getEntries(): TokenMetricsEntry[] {
    return [...this.entries]
  }

  /**
   * Get recent entries (last N)
   */
  getRecentEntries(count: number): TokenMetricsEntry[] {
    return this.entries.slice(-count)
  }

  /**
   * Get entries by status
   */
  getEntriesByStatus(status: 'success' | 'failed'): TokenMetricsEntry[] {
    return this.entries.filter(e => e.status === status)
  }

  /**
   * Get token usage trend (increasing/decreasing)
   */
  getTrend(windowSize: number = 10): { input: 'up' | 'down' | 'stable'; output: 'up' | 'down' | 'stable' } {
    if (this.entries.length < windowSize * 2) {
      return { input: 'stable', output: 'stable' }
    }

    const recent = this.entries.slice(-windowSize)
    const previous = this.entries.slice(-windowSize * 2, -windowSize)

    const recentAvgInput = recent.reduce((sum, e) => sum + e.usage.inputTokens, 0) / recent.length
    const previousAvgInput = previous.reduce((sum, e) => sum + e.usage.inputTokens, 0) / previous.length

    const recentAvgOutput = recent.reduce((sum, e) => sum + e.usage.outputTokens, 0) / recent.length
    const previousAvgOutput = previous.reduce((sum, e) => sum + e.usage.outputTokens, 0) / previous.length

    const threshold = 0.1 // 10% change threshold

    return {
      input: this.getTrendDirection(recentAvgInput, previousAvgInput, threshold),
      output: this.getTrendDirection(recentAvgOutput, previousAvgOutput, threshold),
    }
  }

  /**
   * Get top models by token usage
   */
  getTopModels(limit: number = 5): ModelTokenMetrics[] {
    const byModel = this.getSummary().byModel
    return Object.values(byModel)
      .sort((a, b) => b.totalTokens - a.totalTokens)
      .slice(0, limit)
  }

  /**
   * IMetricsCollector implementation - increment counter
   * Maps counter increments to token metrics tracking
   */
  increment(name: string, value?: number, tags?: Record<string, string>): void {
    // Token metrics collector doesn't use increment/decrement
    // This is here to satisfy IMetricsCollector interface
    // Actual token tracking happens via record() or recordUsage()
  }

  /**
   * IMetricsCollector implementation - decrement counter
   */
  decrement(name: string, value?: number, tags?: Record<string, string>): void {
    // No-op for token metrics
  }

  /**
   * IMetricsCollector implementation - gauge value
   * Records current token count as gauge
   */
  gauge(name: string, value: number, tags?: Record<string, string>): void {
    // Can be used to track current token pool/window usage
    if (tags?.taskId && tags?.model) {
      this.record({
        taskId: tags.taskId,
        model: tags.model,
        usage: { inputTokens: 0, outputTokens: value },
        timestamp: new Date(),
        status: 'success',
        tags,
      })
    }
  }

  /**
   * IMetricsCollector implementation - timing
   * Records duration along with token usage
   */
  timing(name: string, value: number, tags?: Record<string, string>): void {
    // Timing is recorded with token entries
  }

  /**
   * Flush/clear all entries
   */
  flush(): void {
    this.entries = []
  }

  /**
   * Clear all entries (alias for flush)
   */
  clear(): void {
    this.flush()
  }

  /**
   * Get total token count
   */
  getTotalTokens(): number {
    return this.entries.reduce((sum, e) => 
      sum + e.usage.inputTokens + e.usage.outputTokens, 0
    )
  }

  /**
   * Get average tokens per task
   */
  getAverageTokensPerTask(): number {
    if (this.entries.length === 0) return 0
    return this.getTotalTokens() / this.entries.length
  }

  /**
   * Calculate summary from entries
   */
  private calculateSummary(entries: TokenMetricsEntry[]): TokenMetricsSummary {
    const summary = entries.reduce(
      (acc, entry) => ({
        totalInputTokens: acc.totalInputTokens + entry.usage.inputTokens,
        totalOutputTokens: acc.totalOutputTokens + entry.usage.outputTokens,
        totalCacheReadTokens: acc.totalCacheReadTokens + (entry.usage.cacheReadTokens || 0),
        totalCacheWriteTokens: acc.totalCacheWriteTokens + (entry.usage.cacheWriteTokens || 0),
        totalTokens: acc.totalTokens + entry.usage.inputTokens + entry.usage.outputTokens +
          (entry.usage.cacheReadTokens || 0) + (entry.usage.cacheWriteTokens || 0),
        taskCount: acc.taskCount + 1,
        successCount: acc.successCount + (entry.status === 'success' ? 1 : 0),
        failureCount: acc.failureCount + (entry.status === 'failed' ? 1 : 0),
        entries: [...acc.entries, entry],
      }),
      {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCacheReadTokens: 0,
        totalCacheWriteTokens: 0,
        totalTokens: 0,
        taskCount: 0,
        successCount: 0,
        failureCount: 0,
        entries: [] as TokenMetricsEntry[],
      }
    )

    const avgTokensPerTask = summary.taskCount > 0 ? summary.totalTokens / summary.taskCount : 0
    const avgInputTokens = summary.taskCount > 0 ? summary.totalInputTokens / summary.taskCount : 0
    const avgOutputTokens = summary.taskCount > 0 ? summary.totalOutputTokens / summary.taskCount : 0

    // Calculate by model
    const byModel: Record<string, ModelTokenMetrics> = {}
    if (this.config.trackByModel) {
      const models = Array.from(new Set(entries.map(e => e.model)))
      for (const model of models) {
        const modelEntries = entries.filter(e => e.model === model)
        byModel[model] = this.calculateModelMetrics(model, modelEntries)
      }
    }

    return {
      ...summary,
      avgTokensPerTask,
      avgInputTokens,
      avgOutputTokens,
      byModel,
    }
  }

  /**
   * Calculate metrics for a specific model
   */
  private calculateModelMetrics(model: string, entries: TokenMetricsEntry[]): ModelTokenMetrics {
    const summary = entries.reduce(
      (acc, entry) => ({
        totalInputTokens: acc.totalInputTokens + entry.usage.inputTokens,
        totalOutputTokens: acc.totalOutputTokens + entry.usage.outputTokens,
        totalCacheReadTokens: acc.totalCacheReadTokens + (entry.usage.cacheReadTokens || 0),
        totalCacheWriteTokens: acc.totalCacheWriteTokens + (entry.usage.cacheWriteTokens || 0),
        totalTokens: acc.totalTokens + entry.usage.inputTokens + entry.usage.outputTokens +
          (entry.usage.cacheReadTokens || 0) + (entry.usage.cacheWriteTokens || 0),
        taskCount: acc.taskCount + 1,
        successCount: acc.successCount + (entry.status === 'success' ? 1 : 0),
        failureCount: acc.failureCount + (entry.status === 'failed' ? 1 : 0),
      }),
      {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCacheReadTokens: 0,
        totalCacheWriteTokens: 0,
        totalTokens: 0,
        taskCount: 0,
        successCount: 0,
        failureCount: 0,
      }
    )

    return {
      model,
      ...summary,
      avgTokensPerTask: summary.taskCount > 0 ? summary.totalTokens / summary.taskCount : 0,
    }
  }

  /**
   * Determine trend direction
   */
  private getTrendDirection(
    current: number,
    previous: number,
    threshold: number
  ): 'up' | 'down' | 'stable' {
    if (previous === 0) return current > 0 ? 'up' : 'stable'
    const change = (current - previous) / previous
    if (change > threshold) return 'up'
    if (change < -threshold) return 'down'
    return 'stable'
  }
}

/**
 * Create a new TokenMetricsCollector instance
 */
export function createTokenMetricsCollector(
  config?: TokenMetricsCollectorConfig
): TokenMetricsCollector {
  return new TokenMetricsCollector(config)
}

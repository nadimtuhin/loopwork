import type { ITelemetryProvider, IMetricsCollector, StructuredLog } from '@loopwork-ai/contracts'
import { TokenMetricsCollector, TokenMetricsEntry, TokenMetricsSummary } from './token-metrics'
import { ErrorCorrelationAnalyzer, ErrorEntry, ErrorCorrelationReport } from './error-correlation'

/**
 * Combined telemetry report with token metrics and error correlation
 */
export interface CombinedTelemetryReport {
  tokenMetrics: TokenMetricsSummary
  errorCorrelation: ErrorCorrelationReport
  generatedAt: Date
}

/**
 * Configuration for TelemetryProvider
 */
export interface TelemetryProviderConfig {
  /** Maximum token metrics entries to keep */
  maxTokenEntries?: number
  /** Enable model-based token tracking */
  trackTokensByModel?: boolean
  /** Maximum error entries to keep */
  maxErrorEntries?: number
  /** Error correlation config */
  errorConfig?: {
    signatureMaxLength?: number
    maxExamplesPerGroup?: number
    recentWindowHours?: number
  }
}

/**
 * TelemetryProvider - Integrated token metrics and error correlation
 * 
 * Implements ITelemetryProvider to provide:
 * - Token usage tracking and analysis
 * - Error correlation and grouping
 * - Structured log integration
 * - Combined telemetry reports
 */
export class TelemetryProvider implements ITelemetryProvider {
  public readonly metrics: IMetricsCollector
  private tokenCollector: TokenMetricsCollector
  private errorAnalyzer: ErrorCorrelationAnalyzer

  constructor(config: TelemetryProviderConfig = {}) {
    this.tokenCollector = new TokenMetricsCollector({
      maxEntries: config.maxTokenEntries ?? 1000,
      trackByModel: config.trackTokensByModel ?? true,
    })

    this.errorAnalyzer = new ErrorCorrelationAnalyzer({
      signatureMaxLength: config.errorConfig?.signatureMaxLength ?? 100,
      maxExamplesPerGroup: config.errorConfig?.maxExamplesPerGroup ?? 3,
      recentWindowHours: config.errorConfig?.recentWindowHours ?? 24,
    })

    this.metrics = this.tokenCollector
  }

  /**
   * Log a structured log entry
   * Extracts token usage and error information from logs
   */
  log(entry: StructuredLog): void {
    // Extract and record token usage if present
    const tokenUsage = this.extractTokenUsage(entry)
    if (tokenUsage && entry.taskId) {
      this.tokenCollector.record({
        taskId: entry.taskId,
        model: entry.metadata?.model as string || 'unknown',
        usage: tokenUsage,
        timestamp: new Date(entry.timestamp),
        status: entry.level === 'error' ? 'failed' : 'success',
        tags: {
          namespace: entry.namespace || 'default',
          level: entry.level,
        },
      })
    }

    // Record errors
    if (entry.level === 'error' || entry.error) {
      this.errorAnalyzer.record({
        message: entry.error?.toString() || entry.message,
        taskId: entry.taskId || 'unknown',
        model: entry.metadata?.model as string,
        timestamp: new Date(entry.timestamp),
        metadata: entry.metadata,
      })
    }
  }

  /**
   * Flush any pending data
   */
  async flush(): Promise<void> {
    this.tokenCollector.flush()
  }

  /**
   * Record token usage directly
   */
  recordTokenUsage(
    taskId: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    status: 'success' | 'failed' = 'success',
    cacheReadTokens?: number,
    cacheWriteTokens?: number,
    duration?: number
  ): void {
    this.tokenCollector.recordUsage(
      taskId,
      model,
      {
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheWriteTokens,
      },
      status,
      duration
    )
  }

  /**
   * Record an error directly
   */
  recordError(
    message: string,
    taskId: string,
    model?: string
  ): void {
    this.errorAnalyzer.recordError(message, taskId, model)
  }

  /**
   * Get token metrics summary
   */
  getTokenMetrics(): TokenMetricsSummary {
    return this.tokenCollector.getSummary()
  }

  /**
   * Get token metrics for a specific task
   */
  getTaskTokenMetrics(taskId: string): TokenMetricsSummary {
    return this.tokenCollector.getTaskSummary(taskId)
  }

  /**
   * Get error correlation report
   */
  getErrorCorrelation(): ErrorCorrelationReport {
    return this.errorAnalyzer.getReport()
  }

  /**
   * Get combined telemetry report
   */
  getReport(): CombinedTelemetryReport {
    return {
      tokenMetrics: this.tokenCollector.getSummary(),
      errorCorrelation: this.errorAnalyzer.getReport(),
      generatedAt: new Date(),
    }
  }

  /**
   * Get recent token entries
   */
  getRecentTokenEntries(count: number): TokenMetricsEntry[] {
    return this.tokenCollector.getRecentEntries(count)
  }

  /**
   * Get recent errors
   */
  getRecentErrors(hours: number = 24): ErrorEntry[] {
    return this.errorAnalyzer.getRecentErrors(hours)
  }

  /**
   * Find similar errors to a given message
   */
  findSimilarErrors(message: string, threshold?: number): ErrorEntry[] {
    return this.errorAnalyzer.findSimilar(message, threshold)
  }

  /**
   * Get token usage trend
   */
  getTokenTrend(windowSize?: number): { input: 'up' | 'down' | 'stable'; output: 'up' | 'down' | 'stable' } {
    return this.tokenCollector.getTrend(windowSize)
  }

  /**
   * Clear all telemetry data
   */
  clear(): void {
    this.tokenCollector.clear()
    this.errorAnalyzer.clear()
  }

  /**
   * Extract token usage from log metadata
   */
  private extractTokenUsage(entry: StructuredLog): { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number } | null {
    if (!entry.metadata?.usage) return null

    const usage = entry.metadata.usage as Record<string, number>
    return {
      inputTokens: usage.inputTokens ?? usage.input_tokens ?? 0,
      outputTokens: usage.outputTokens ?? usage.output_tokens ?? 0,
      cacheReadTokens: usage.cacheReadTokens ?? usage.cache_read_tokens,
      cacheWriteTokens: usage.cacheWriteTokens ?? usage.cache_write_tokens,
    }
  }
}

/**
 * Create a new TelemetryProvider instance
 */
export function createTelemetryProvider(
  config?: TelemetryProviderConfig
): TelemetryProvider {
  return new TelemetryProvider(config)
}

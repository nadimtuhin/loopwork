/**
 * Cost Tracking for Loopwork
 *
 * Tracks token usage and costs for AI CLI tools (Claude, OpenCode, Gemini)
 */

import fs from 'fs'
import path from 'path'
import type { LoopworkPlugin, PluginTask, LoopStats, ConfigWrapper, TaskContext, PluginTaskResult, CliResultEvent } from '@loopwork-ai/loopwork/contracts'

export interface CostTrackingConfig {
  enabled?: boolean
  defaultModel?: string
  dailyBudget?: number
  alertThreshold?: number
}

// ============================================================================
// Token Pricing (per 1M tokens, in USD)
// ============================================================================

export interface ModelPricing {
  inputPer1M: number
  outputPer1M: number
  cacheReadPer1M?: number
  cacheWritePer1M?: number
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Claude models
  'claude-3-opus': { inputPer1M: 15.00, outputPer1M: 75.00 },
  'claude-3-sonnet': { inputPer1M: 3.00, outputPer1M: 15.00 },
  'claude-3-haiku': { inputPer1M: 0.25, outputPer1M: 1.25 },
  'claude-3.5-sonnet': { inputPer1M: 3.00, outputPer1M: 15.00 },
  'claude-3.5-haiku': { inputPer1M: 0.80, outputPer1M: 4.00 },
  'claude-opus-4': { inputPer1M: 15.00, outputPer1M: 75.00 },
  'claude-sonnet-4': { inputPer1M: 3.00, outputPer1M: 15.00 },

  // OpenAI models (for opencode)
  'gpt-4': { inputPer1M: 30.00, outputPer1M: 60.00 },
  'gpt-4-turbo': { inputPer1M: 10.00, outputPer1M: 30.00 },
  'gpt-4o': { inputPer1M: 2.50, outputPer1M: 10.00 },
  'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.60 },
  'o1': { inputPer1M: 15.00, outputPer1M: 60.00 },
  'o1-mini': { inputPer1M: 3.00, outputPer1M: 12.00 },

  // Google models (for gemini)
  'gemini-1.5-pro': { inputPer1M: 1.25, outputPer1M: 5.00 },
  'gemini-1.5-flash': { inputPer1M: 0.075, outputPer1M: 0.30 },
  'gemini-2.0-flash': { inputPer1M: 0.10, outputPer1M: 0.40 },

  // Default fallback
  'default': { inputPer1M: 3.00, outputPer1M: 15.00 },
}

// ============================================================================
// Usage Types
// ============================================================================

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

export interface UsageEntry {
  taskId: string
  model: string
  usage: TokenUsage
  cost: number
  timestamp: Date
  duration?: number // in seconds
  status?: 'success' | 'failed'
  error?: string
  iteration?: number
  namespace?: string
}

export interface UsageSummary {
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheReadTokens: number
  totalCacheWriteTokens: number
  totalCost: number
  taskCount: number
  successCount: number
  failureCount: number
  avgTokensPerSecond: number
  avgCostPerTask: number
  entries: UsageEntry[]
}

export interface DailySummary extends UsageSummary {
  date: string // YYYY-MM-DD
}

export interface ErrorGroup {
  message: string
  count: number
  lastOccurred: Date
  examples: { taskId: string; timestamp: Date }[]
}

export interface TelemetryReport {
  summary: UsageSummary
  byModel: Record<string, UsageSummary>
  recentFailures: UsageEntry[]
  errorCorrelation: ErrorGroup[]
}

// ============================================================================
// Cost Tracker
// ============================================================================

export class CostTracker {
  private entries: UsageEntry[] = []
  private storageFile: string
  private namespace: string

  constructor(projectRoot: string, namespace = 'default') {
    this.namespace = namespace
    const suffix = namespace === 'default' ? '' : `-${namespace}`
    this.storageFile = path.join(projectRoot, `.loopwork-cost-tracking${suffix}.json`)
    this.load()
  }

  /**
   * Calculate cost for token usage
   */
  calculateCost(model: string, usage: TokenUsage): number {
    const pricing = MODEL_PRICING[model] || MODEL_PRICING['default']

    let cost = 0
    cost += (usage.inputTokens / 1_000_000) * pricing.inputPer1M
    cost += (usage.outputTokens / 1_000_000) * pricing.outputPer1M

    if (usage.cacheReadTokens && pricing.cacheReadPer1M) {
      cost += (usage.cacheReadTokens / 1_000_000) * pricing.cacheReadPer1M
    }
    if (usage.cacheWriteTokens && pricing.cacheWritePer1M) {
      cost += (usage.cacheWriteTokens / 1_000_000) * pricing.cacheWritePer1M
    }

    return cost
  }

  /**
   * Record token usage for a task
   */
  record(
    taskId: string,
    model: string,
    usage: TokenUsage,
    duration?: number,
    status: 'success' | 'failed' = 'success',
    error?: string,
    iteration?: number
  ): UsageEntry {
    const cost = this.calculateCost(model, usage)

    const entry: UsageEntry = {
      taskId,
      model,
      usage,
      cost,
      timestamp: new Date(),
      duration,
      status,
      error,
      iteration,
      namespace: this.namespace,
    }

    this.entries.push(entry)
    this.save()

    return entry
  }

  /**
   * Parse token usage from CLI output
   * Supports various CLI output formats
   */
  parseUsageFromOutput(output: string): TokenUsage | null {
    // Claude Code format: "Tokens: 1234 input, 567 output"
    const claudeMatch = output.match(/Tokens:\s*(\d+)\s*input,\s*(\d+)\s*output/i)
    if (claudeMatch) {
      return {
        inputTokens: parseInt(claudeMatch[1], 10),
        outputTokens: parseInt(claudeMatch[2], 10),
      }
    }

    // OpenCode format: "Usage: 1234 prompt tokens, 567 completion tokens"
    const openCodeMatch = output.match(/Usage:\s*(\d+)\s*prompt\s*tokens?,\s*(\d+)\s*completion\s*tokens?/i)
    if (openCodeMatch) {
      return {
        inputTokens: parseInt(openCodeMatch[1], 10),
        outputTokens: parseInt(openCodeMatch[2], 10),
      }
    }

    // Generic format: "input_tokens: 1234, output_tokens: 567"
    const genericMatch = output.match(/input[_\s]tokens?:\s*(\d+).*output[_\s]tokens?:\s*(\d+)/i)
    if (genericMatch) {
      return {
        inputTokens: parseInt(genericMatch[1], 10),
        outputTokens: parseInt(genericMatch[2], 10),
      }
    }

    // JSON format in output
    const jsonMatch = output.match(/\{[^}]*"input[_\s]?tokens?":\s*(\d+)[^}]*"output[_\s]?tokens?":\s*(\d+)[^}]*\}/i)
    if (jsonMatch) {
      return {
        inputTokens: parseInt(jsonMatch[1], 10),
        outputTokens: parseInt(jsonMatch[2], 10),
      }
    }

    return null
  }

  /**
   * Get summary for a specific task
   */
  getTaskSummary(taskId: string): UsageSummary {
    const taskEntries = this.entries.filter(e => e.taskId === taskId)
    return this.summarize(taskEntries)
  }

  /**
   * Get summary for today
   */
  getTodaySummary(): DailySummary {
    const today = new Date().toISOString().split('T')[0]
    const todayEntries = this.entries.filter(e =>
      e.timestamp.toISOString().split('T')[0] === today
    )

    return {
      date: today,
      ...this.summarize(todayEntries),
    }
  }

  /**
   * Get summary for a date range
   */
  getRangeSummary(startDate: Date, endDate: Date): UsageSummary {
    const rangeEntries = this.entries.filter(e =>
      e.timestamp >= startDate && e.timestamp <= endDate
    )
    return this.summarize(rangeEntries)
  }

  /**
   * Get all-time summary
   */
  getAllTimeSummary(): UsageSummary {
    return this.summarize(this.entries)
  }

  /**
   * Get daily summaries for the last N days
   */
  getDailySummaries(days = 7): DailySummary[] {
    const summaries: DailySummary[] = []

    for (let i = 0; i < days; i++) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]

      const dayEntries = this.entries.filter(e =>
        e.timestamp.toISOString().split('T')[0] === dateStr
      )

      summaries.push({
        date: dateStr,
        ...this.summarize(dayEntries),
      })
    }

    return summaries
  }

  /**
   * Get cost breakdown by model
   */
  getCostByModel(): Record<string, { cost: number; tokens: TokenUsage }> {
    const byModel: Record<string, { cost: number; tokens: TokenUsage }> = {}

    for (const entry of this.entries) {
      if (!byModel[entry.model]) {
        byModel[entry.model] = {
          cost: 0,
          tokens: { inputTokens: 0, outputTokens: 0 },
        }
      }

      byModel[entry.model].cost += entry.cost
      byModel[entry.model].tokens.inputTokens += entry.usage.inputTokens
      byModel[entry.model].tokens.outputTokens += entry.usage.outputTokens
    }

    return byModel
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries = []
    this.save()
  }

  getTelemetryReport(): TelemetryReport {
    const summary = this.summarize(this.entries)
    const byModel: Record<string, UsageSummary> = {}
    
    const models = Array.from(new Set(this.entries.map(e => e.model)))
    for (const model of models) {
      byModel[model] = this.summarize(this.entries.filter(e => e.model === model))
    }

    const recentFailures = this.entries
      .filter(e => e.status === 'failed')
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 10)

    const errorCorrelation = this.correlateErrors(this.entries.filter(e => e.status === 'failed'))

    return {
      summary,
      byModel,
      recentFailures,
      errorCorrelation,
    }
  }

  private correlateErrors(failures: UsageEntry[]): ErrorGroup[] {
    const groups: Record<string, ErrorGroup> = {}

    for (const failure of failures) {
      if (!failure.error) continue

      // Simple correlation by error message (first 50 chars)
      const key = failure.error.split('\n')[0].substring(0, 50).trim()
      
      if (!groups[key]) {
        groups[key] = {
          message: key,
          count: 0,
          lastOccurred: failure.timestamp,
          examples: []
        }
      }

      groups[key].count++
      if (failure.timestamp > groups[key].lastOccurred) {
        groups[key].lastOccurred = failure.timestamp
      }
      if (groups[key].examples.length < 3) {
        groups[key].examples.push({ taskId: failure.taskId, timestamp: failure.timestamp })
      }
    }

    return Object.values(groups).sort((a, b) => b.count - a.count)
  }

  private summarize(entries: UsageEntry[]): UsageSummary {
    const summary = entries.reduce(
      (acc, entry) => ({
        totalInputTokens: acc.totalInputTokens + entry.usage.inputTokens,
        totalOutputTokens: acc.totalOutputTokens + entry.usage.outputTokens,
        totalCacheReadTokens: acc.totalCacheReadTokens + (entry.usage.cacheReadTokens || 0),
        totalCacheWriteTokens: acc.totalCacheWriteTokens + (entry.usage.cacheWriteTokens || 0),
        totalCost: acc.totalCost + entry.cost,
        taskCount: acc.taskCount + 1,
        successCount: acc.successCount + (entry.status === 'success' || !entry.status ? 1 : 0),
        failureCount: acc.failureCount + (entry.status === 'failed' ? 1 : 0),
        avgTokensPerSecond: 0, // Calculated after reduce
        avgCostPerTask: 0,     // Calculated after reduce
        entries: [...acc.entries, entry],
      }),
      {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCacheReadTokens: 0,
        totalCacheWriteTokens: 0,
        totalCost: 0,
        taskCount: 0,
        successCount: 0,
        failureCount: 0,
        avgTokensPerSecond: 0,
        avgCostPerTask: 0,
        entries: [] as UsageEntry[],
      }
    )

    // Calculate averages
    if (summary.taskCount > 0) {
      summary.avgCostPerTask = summary.totalCost / summary.taskCount
    }

    // Calculate tokens per second (if duration is available)
    let totalDuration = 0
    let totalTokens = 0
    for (const entry of entries) {
      if (entry.duration && entry.duration > 0) {
        totalDuration += entry.duration
        totalTokens += (entry.usage.inputTokens + entry.usage.outputTokens)
      }
    }
    
    if (totalDuration > 0) {
      summary.avgTokensPerSecond = totalTokens / totalDuration
    }

    return summary
  }

  private load(): void {
    try {
      if (fs.existsSync(this.storageFile)) {
        const content = fs.readFileSync(this.storageFile, 'utf-8')
        const data = JSON.parse(content)
        this.entries = data.entries.map((e: any) => ({
          ...e,
          timestamp: new Date(e.timestamp),
        }))
      }
    } catch {
      this.entries = []
    }
  }

  private save(): void {
    try {
      const data = { entries: this.entries, namespace: this.namespace }
      fs.writeFileSync(this.storageFile, JSON.stringify(data, null, 2))
    } catch {
      // Ignore save errors
    }
  }
}

// ============================================================================
// Cost Tracking Hook Plugin
// ============================================================================

/**
 * Add cost tracking wrapper
 */
export function withCostTracking(options: CostTrackingConfig = {}): ConfigWrapper {
  return (config) => ({
    ...config,
    costTracking: {
      enabled: true,
      defaultModel: 'claude-3.5-sonnet',
      classification: 'enhancement',
      ...options,
    },
  })
}

export function createCostTrackingPlugin(
  projectRoot: string,
  namespace = 'default',
  defaultModel = 'claude-3.5-sonnet'
): LoopworkPlugin {
  const tracker = new CostTracker(projectRoot, namespace)

  return {
    name: 'cost-tracking',
    classification: 'enhancement',

    async onTaskStart(context: TaskContext) {
      // Track task start time (stored in tracker)
    },

    async onTaskComplete(context: TaskContext, result: PluginTaskResult) {
    },

    async onTaskFailed(context: TaskContext, error: string) {
    },

    async onCliResult(event: CliResultEvent) {
      const usage = tracker.parseUsageFromOutput(event.output)
      const status = event.exitCode === 0 ? 'success' : 'failed'
      
      if (usage || event.exitCode !== 0) {
        tracker.record(
          event.taskId || 'unknown',
          event.model,
          usage || { inputTokens: 0, outputTokens: 0 },
          event.durationMs / 1000,
          status,
          event.exitCode !== 0 ? event.output.slice(-500) : undefined,
          event.iteration
        )
      }
    },

    async onLoopEnd(stats: LoopStats) {
      const summary = tracker.getTodaySummary()
      console.log(`\n📊 Cost and Performance Summary for today:`)
      console.log(`   Tasks: ${summary.taskCount} (${summary.successCount} success, ${summary.failureCount} failed)`)
      console.log(`   Tokens: ${summary.totalInputTokens.toLocaleString()} in / ${summary.totalOutputTokens.toLocaleString()} out`)
      console.log(`   Cost: $${summary.totalCost.toFixed(4)}`)
    },
  }
}

// ============================================================================
// Formatting Helpers
// ============================================================================

export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`
  } else if (cost < 1) {
    return `$${cost.toFixed(3)}`
  } else {
    return `$${cost.toFixed(2)}`
  }
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(2)}M`
  } else if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`
  }
  return tokens.toString()
}

export function formatUsageSummary(summary: UsageSummary): string {
  const successRate = summary.taskCount > 0 ? (summary.successCount / summary.taskCount) * 100 : 0
  const lines = [
    `Tasks: ${summary.taskCount} (${summary.successCount} success, ${summary.failureCount} failed, ${successRate.toFixed(1)}% success rate)`,
    `Input tokens: ${formatTokens(summary.totalInputTokens)}`,
    `Output tokens: ${formatTokens(summary.totalOutputTokens)}`,
    `Total cost: ${formatCost(summary.totalCost)} (Avg: ${formatCost(summary.avgCostPerTask)}/task)`,
    `Speed: ${summary.avgTokensPerSecond.toFixed(1)} tokens/sec`,
  ]

  if (summary.totalCacheReadTokens > 0) {
    lines.push(`Cache read: ${formatTokens(summary.totalCacheReadTokens)}`)
  }
  if (summary.totalCacheWriteTokens > 0) {
    lines.push(`Cache write: ${formatTokens(summary.totalCacheWriteTokens)}`)
  }

  return lines.join('\n')
}

export function formatTelemetryReport(report: TelemetryReport): string {
  const lines: string[] = []
  lines.push('📊 Telemetry & Token Metrics Report')
  lines.push('==================================')
  lines.push('')
  lines.push('Overall Summary:')
  lines.push(formatUsageSummary(report.summary))
  lines.push('')
  
  lines.push('Breakdown by Model:')
  for (const [model, stats] of Object.entries(report.byModel)) {
    const successRate = stats.taskCount > 0 ? (stats.successCount / stats.taskCount) * 100 : 0
    lines.push(`- ${model}: ${stats.taskCount} calls, ${successRate.toFixed(1)}% success, ${formatCost(stats.totalCost)} total`)
  }
  
  if (report.recentFailures.length > 0) {
    lines.push('')
    lines.push('Recent Failures:')
    for (const failure of report.recentFailures) {
      lines.push(`- [${failure.timestamp.toISOString()}] ${failure.taskId} (${failure.model}):`)
      lines.push(`  Error: ${failure.error?.split('\n')[0].substring(0, 100)}...`)
    }
  }

  if (report.errorCorrelation && report.errorCorrelation.length > 0) {
    lines.push('')
    lines.push('Error Correlation (Top Issues):')
    for (const group of report.errorCorrelation) {
      lines.push(`- "${group.message}..." (${group.count} occurrences)`)
      lines.push(`  Last seen: ${group.lastOccurred.toISOString()}`)
    }
  }
  
  return lines.join('\n')
}

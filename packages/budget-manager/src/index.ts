/**
 * Budget Manager Package for Loopwork
 *
 * Manages cost tracking and budget enforcement.
 */

import fs from 'fs'
import path from 'path'
import type { 
  ICostTracker, 
  IBudgetManager, 
  UsageLimit, 
  TokenUsage, 
  UsageEntry, 
  UsageSummary, 
  DailySummary 
} from '@loopwork-ai/contracts'

export type { 
  ICostTracker, 
  IBudgetManager, 
  UsageLimit, 
  TokenUsage, 
  UsageEntry, 
  UsageSummary, 
  DailySummary 
}

export const version = '0.1.0'

export class BudgetExceededError extends Error {
  public readonly budgetType: 'daily' | 'perTask' | 'perUser'
  public readonly currentCost: number
  public readonly budgetLimit: number
  public readonly taskId?: string

  constructor(
    budgetType: 'daily' | 'perTask' | 'perUser',
    currentCost: number,
    budgetLimit: number,
    taskId?: string
  ) {
    const taskInfo = taskId ? ` for task ${taskId}` : ''
    const typeLabel = budgetType === 'daily' ? 'Daily' : budgetType === 'perTask' ? 'Per-task' : 'Per-user'
    super(
      `${typeLabel} budget exceeded${taskInfo}: $${currentCost.toFixed(4)} > $${budgetLimit.toFixed(4)}`
    )
    this.name = 'BudgetExceededError'
    this.budgetType = budgetType
    this.currentCost = currentCost
    this.budgetLimit = budgetLimit
    this.taskId = taskId
  }
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

/**
 * Persistence Cost Tracker implementation
 */
export class CostTracker implements ICostTracker {
  private entries: (UsageEntry & { userId?: string })[] = []
  private storageFile: string
  private namespace: string

  constructor(projectRoot: string, namespace = 'default') {
    this.namespace = namespace
    const suffix = namespace === 'default' ? '' : `-${namespace}`
    this.storageFile = path.join(projectRoot, `.loopwork-cost-tracking${suffix}.json`)
    this.load()
  }

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

  record(
    taskId: string,
    model: string,
    usage: TokenUsage,
    duration?: number,
    status: 'success' | 'failed' = 'success',
    error?: string,
    iteration?: number,
    userId?: string
  ): UsageEntry {
    const cost = this.calculateCost(model, usage)

    const entry: UsageEntry & { userId?: string } = {
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
      userId,
    }

    this.entries.push(entry)
    this.save()

    return entry
  }

  getTaskSummary(taskId: string): UsageSummary {
    const taskEntries = this.entries.filter(e => e.taskId === taskId)
    return this.summarize(taskEntries)
  }

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

  getRangeSummary(startDate: Date, endDate: Date): UsageSummary {
    const rangeEntries = this.entries.filter(e =>
      e.timestamp >= startDate && e.timestamp <= endDate
    )
    return this.summarize(rangeEntries)
  }

  getAllTimeSummary(): UsageSummary {
    return this.summarize(this.entries)
  }

  getDailySummaries(days: number): DailySummary[] {
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
   * Get usage summaries grouped by user
   */
  getUserSummaries(): Record<string, UsageSummary> {
    const byUser: Record<string, UsageSummary> = {}

    for (const entry of this.entries) {
      const userId = entry.userId || 'anonymous'
      if (!byUser[userId]) {
        byUser[userId] = {
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
          entries: [],
        }
      }

      const summary = byUser[userId]
      summary.totalInputTokens += entry.usage.inputTokens
      summary.totalOutputTokens += entry.usage.outputTokens
      summary.totalCacheReadTokens += entry.usage.cacheReadTokens || 0
      summary.totalCacheWriteTokens += entry.usage.cacheWriteTokens || 0
      summary.totalCost += entry.cost
      summary.taskCount += 1
      summary.successCount += entry.status === 'success' || !entry.status ? 1 : 0
      summary.failureCount += entry.status === 'failed' ? 1 : 0
      summary.entries.push(entry)
    }

    // Calculate averages
    for (const userId of Object.keys(byUser)) {
      const summary = byUser[userId]
      if (summary.taskCount > 0) {
        summary.avgCostPerTask = summary.totalCost / summary.taskCount
      }
    }

    return byUser
  }

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

  /**
   * Parse token usage from CLI output
   */
  parseUsageFromOutput(output: string): TokenUsage | null {
    return parseUsageFromOutput(output)
  }

  /**
   * Check daily budget
   */
  checkDailyBudget(dailyBudget: number): { allowed: boolean; currentCost: number } {
    const todaySummary = this.getTodaySummary()
    return {
      allowed: todaySummary.totalCost < dailyBudget,
      currentCost: todaySummary.totalCost,
    }
  }

  /**
   * Check per-task budget
   */
  checkPerTaskBudget(taskId: string, perTaskBudget: number): { allowed: boolean; currentCost: number } {
    const currentCost = this.getTaskCost(taskId)
    return {
      allowed: currentCost < perTaskBudget,
      currentCost,
    }
  }

  /**
   * Check per-user budget
   */
  checkPerUserBudget(userId: string, perUserBudget: number): { allowed: boolean; currentCost: number } {
    const currentCost = this.getUserCost(userId)
    return {
      allowed: currentCost < perUserBudget,
      currentCost,
    }
  }

  /**
   * Get current cost for a specific task
   */
  getTaskCost(taskId: string): number {
    return this.entries
      .filter(e => e.taskId === taskId)
      .reduce((sum, e) => sum + e.cost, 0)
  }

  /**
   * Get current cost for a specific user
   */
  getUserCost(userId: string): number {
    const userEntries = this.entries.filter(e => (e.userId || 'anonymous') === userId)
    return userEntries.reduce((sum, e) => sum + e.cost, 0)
  }

  /**
   * Validate budget constraints
   */
  validateBudgets(
    taskId: string,
    options: {
      dailyBudget?: number
      perTaskBudget?: number
      perUserBudget?: number
      userId?: string
      budgetAction?: 'warn' | 'block' | 'alert'
    }
  ): { allowed: boolean; warnings: string[] } {
    const warnings: string[] = []
    let allowed = true

    if (options.dailyBudget && options.dailyBudget > 0) {
      const dailyCheck = this.checkDailyBudget(options.dailyBudget)
      if (!dailyCheck.allowed) {
        const message = `Daily budget exceeded: $${dailyCheck.currentCost.toFixed(4)} / $${options.dailyBudget.toFixed(4)}`
        if (options.budgetAction === 'block') {
          throw new BudgetExceededError('daily', dailyCheck.currentCost, options.dailyBudget)
        }
        warnings.push(message)
        if (options.budgetAction === 'warn') allowed = false
      }
    }

    if (options.perTaskBudget && options.perTaskBudget > 0) {
      const taskCheck = this.checkPerTaskBudget(taskId, options.perTaskBudget)
      if (!taskCheck.allowed) {
        const message = `Per-task budget exceeded for ${taskId}: $${taskCheck.currentCost.toFixed(4)} / $${options.perTaskBudget.toFixed(4)}`
        if (options.budgetAction === 'block') {
          throw new BudgetExceededError('perTask', taskCheck.currentCost, options.perTaskBudget, taskId)
        }
        warnings.push(message)
        if (options.budgetAction === 'warn') allowed = false
      }
    }

    if (options.perUserBudget && options.perUserBudget > 0 && options.userId) {
      const userCheck = this.checkPerUserBudget(options.userId, options.perUserBudget)
      if (!userCheck.allowed) {
        const message = `Per-user budget exceeded for ${options.userId}: $${userCheck.currentCost.toFixed(4)} / $${options.perUserBudget.toFixed(4)}`
        if (options.budgetAction === 'block') {
          throw new BudgetExceededError('perUser', userCheck.currentCost, options.perUserBudget)
        }
        warnings.push(message)
        if (options.budgetAction === 'warn') allowed = false
      }
    }

    return { allowed, warnings }
  }

  private correlateErrors(failures: UsageEntry[]): ErrorGroup[] {
    const groups: Record<string, ErrorGroup> = {}

    for (const failure of failures) {
      if (!failure.error) continue

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
        avgTokensPerSecond: 0,
        avgCostPerTask: 0,
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

    if (summary.taskCount > 0) {
      summary.avgCostPerTask = summary.totalCost / summary.taskCount
    }

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

/**
 * Budget Manager implementation
 */
export class BudgetManager implements IBudgetManager {
  private limit: UsageLimit
  private tracker: CostTracker

  constructor(tracker: CostTracker, limit: Partial<UsageLimit> = {}) {
    this.tracker = tracker
    this.limit = {
      dailyBudget: 10.0,
      alertThreshold: 0.8,
      enabled: true,
      ...limit
    }
  }

  hasBudget(): boolean {
    if (!this.limit.enabled) return true
    const today = this.tracker.getTodaySummary()
    return today.totalCost < this.limit.dailyBudget
  }

  canAfford(cost: number): boolean {
    if (!this.limit.enabled) return true
    const today = this.tracker.getTodaySummary()
    return (today.totalCost + cost) <= this.limit.dailyBudget
  }

  consume(cost: number): void {
  }

  getRemainingBudget(): number {
    const today = this.tracker.getTodaySummary()
    return Math.max(0, this.limit.dailyBudget - today.totalCost)
  }

  getTotalConsumption(): number {
    return this.tracker.getTodaySummary().totalCost
  }

  getUsageLimit(): UsageLimit {
    return this.limit
  }

  setUsageLimit(limit: UsageLimit): void {
    this.limit = limit
  }

  isAlertThresholdExceeded(): boolean {
    if (!this.limit.enabled) return false
    const today = this.tracker.getTodaySummary()
    return today.totalCost >= (this.limit.dailyBudget * this.limit.alertThreshold)
  }

  reset(): void {
    this.tracker.clear()
  }

  getBudgetStatus() {
    const consumed = this.getTotalConsumption()
    const total = this.limit.dailyBudget
    return {
      remaining: this.getRemainingBudget(),
      consumed,
      total,
      percentage: total > 0 ? (consumed / total) * 100 : 0,
      isExceeded: consumed >= total,
      isAlertTriggered: this.isAlertThresholdExceeded()
    }
  }

  /**
   * Record usage for a specific task
   */
  record(
    taskId: string,
    model: string,
    usage: TokenUsage,
    duration?: number,
    status?: 'success' | 'failed',
    error?: string,
    iteration?: number,
    userId?: string
  ): UsageEntry {
    return this.tracker.record(taskId, model, usage, duration, status, error, iteration, userId)
  }
}

/**
 * Parse token usage from CLI output
 * Supports various CLI output formats
 */
export function parseUsageFromOutput(output: string): TokenUsage | null {
  const claudeMatch = output.match(/Tokens:\s*(\d+)\s*input,\s*(\d+)\s*output/i)
  if (claudeMatch) {
    return {
      inputTokens: parseInt(claudeMatch[1], 10),
      outputTokens: parseInt(claudeMatch[2], 10),
    }
  }

  const openCodeMatch = output.match(/Usage:\s*(\d+)\s*prompt\s*tokens?,\s*(\d+)\s*completion\s*tokens?/i)
  if (openCodeMatch) {
    return {
      inputTokens: parseInt(openCodeMatch[1], 10),
      outputTokens: parseInt(openCodeMatch[2], 10),
    }
  }

  const genericMatch = output.match(/input[_\s]tokens?:\s*(\d+).*output[_\s]tokens?:\s*(\d+)/i)
  if (genericMatch) {
    return {
      inputTokens: parseInt(genericMatch[1], 10),
      outputTokens: parseInt(genericMatch[2], 10),
    }
  }

  const jsonMatch = output.match(/\{[^}]*"input[_\s]?tokens?":\s*(\d+)[^}]*"output[_\s]?tokens?":\s*(\d+)[^}]*\}/i)
  if (jsonMatch) {
    return {
      inputTokens: parseInt(jsonMatch[1], 10),
      outputTokens: parseInt(jsonMatch[2], 10),
    }
  }

  return null
}

export function createBudgetManager(
  projectRoot: string, 
  namespace = 'default', 
  limit: Partial<UsageLimit> = {}
) {
  const tracker = new CostTracker(projectRoot, namespace)
  return new BudgetManager(tracker, limit)
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

/**
 * Budget Contracts for Loopwork
 *
 * Defines interfaces for managing cost budgets, tracking token usage,
 * and enforcing usage limits across AI CLI operations.
 */

/**
 * Usage limit configuration for controlling resource consumption
 */
export interface UsageLimit {
  /** Maximum daily budget in USD */
  dailyBudget: number

  /** Alert threshold as percentage (0-1) before limit */
  alertThreshold: number

  /** Maximum cost per task */
  maxCostPerTask?: number

  /** Maximum tokens per task */
  maxTokensPerTask?: number

  /** Maximum iterations per task */
  maxIterationsPerTask?: number

  /** Whether limit is currently enforced */
  enabled: boolean
}

/**
 * Token usage metrics
 */
export interface TokenUsage {
  /** Input tokens consumed */
  inputTokens: number

  /** Output tokens generated */
  outputTokens: number

  /** Cache read tokens (optional, for models with caching) */
  cacheReadTokens?: number

  /** Cache write tokens (optional, for models with caching) */
  cacheWriteTokens?: number
}

/**
 * Single cost tracking entry for a task execution
 */
export interface UsageEntry {
  /** Task identifier */
  taskId: string

  /** Model name used */
  model: string

  /** Token usage data */
  usage: TokenUsage

  /** Calculated cost in USD */
  cost: number

  /** Timestamp of the entry */
  timestamp: Date

  /** Execution duration in seconds */
  duration?: number

  /** Execution status */
  status?: 'success' | 'failed'

  /** Error message if failed */
  error?: string

  /** Iteration number */
  iteration?: number

  /** Namespace for multi-project isolation */
  namespace?: string
}

/**
 * Aggregated usage statistics
 */
export interface UsageSummary {
  /** Total input tokens */
  totalInputTokens: number

  /** Total output tokens */
  totalOutputTokens: number

  /** Total cache read tokens */
  totalCacheReadTokens: number

  /** Total cache write tokens */
  totalCacheWriteTokens: number

  /** Total cost in USD */
  totalCost: number

  /** Number of task executions */
  taskCount: number

  /** Number of successful executions */
  successCount: number

  /** Number of failed executions */
  failureCount: number

  /** Average tokens processed per second */
  avgTokensPerSecond: number

  /** Average cost per task */
  avgCostPerTask: number

  /** Individual usage entries */
  entries: UsageEntry[]
}

/**
 * Daily usage summary with date
 */
export interface DailySummary extends UsageSummary {
  /** Date in YYYY-MM-DD format */
  date: string
}

/**
 * Cost tracker interface for recording and querying token usage
 */
export interface ICostTracker {
  /**
   * Calculate cost for given token usage with a specific model
   *
   * @param model - Model identifier (e.g., 'claude-3.5-sonnet')
   * @param usage - Token usage data
   * @returns Calculated cost in USD
   */
  calculateCost(model: string, usage: TokenUsage): number

  /**
   * Record token usage for a task execution
   *
   * @param taskId - Task identifier
   * @param model - Model used
   * @param usage - Token usage data
   * @param duration - Execution duration in seconds
   * @param status - Execution status
   * @param error - Error message if failed
   * @param iteration - Iteration number
   * @returns Recorded usage entry
   */
  record(
    taskId: string,
    model: string,
    usage: TokenUsage,
    duration?: number,
    status?: 'success' | 'failed',
    error?: string,
    iteration?: number
  ): UsageEntry

  /**
   * Get usage summary for a specific task
   *
   * @param taskId - Task identifier
   * @returns Usage summary for the task
   */
  getTaskSummary(taskId: string): UsageSummary

  /**
   * Get usage summary for today
   *
   * @returns Today's daily summary
   */
  getTodaySummary(): DailySummary

  /**
   * Get usage summary for a date range
   *
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Usage summary for the range
   */
  getRangeSummary(startDate: Date, endDate: Date): UsageSummary

  /**
   * Get all-time usage summary
   *
   * @returns Complete usage summary
   */
  getAllTimeSummary(): UsageSummary

  /**
   * Get daily summaries for the last N days
   *
   * @param days - Number of days to retrieve
   * @returns Array of daily summaries
   */
  getDailySummaries(days: number): DailySummary[]

  /**
   * Get cost breakdown by model
   *
   * @returns Record mapping model names to cost and token totals
   */
  getCostByModel(): Record<string, { cost: number; tokens: TokenUsage }>

  /**
   * Clear all recorded usage entries
   */
  clear(): void
}

/**
 * Budget manager interface for enforcing cost limits
 */
export interface IBudgetManager {
  /**
   * Check if the current daily budget is available
   *
   * @returns true if budget is available, false otherwise
   */
  hasBudget(): boolean

  /**
   * Check if a specific cost can be charged against the budget
   *
   * @param cost - Cost in USD
   * @returns true if cost fits within remaining budget
   */
  canAfford(cost: number): boolean

  /**
   * Consume cost from the budget
   *
   * @param cost - Cost in USD to consume
   */
  consume(cost: number): void

  /**
   * Get remaining budget for the current day
   *
   * @returns Remaining budget in USD
   */
  getRemainingBudget(): number

  /**
   * Get total consumption for the current day
   *
   * @returns Total cost consumed in USD
   */
  getTotalConsumption(): number

  /**
   * Get the usage limit configuration
   *
   * @returns Current usage limit settings
   */
  getUsageLimit(): UsageLimit

  /**
   * Update the usage limit configuration
   *
   * @param limit - New usage limit settings
   */
  setUsageLimit(limit: UsageLimit): void

  /**
   * Check if the alert threshold has been exceeded
   *
   * @returns true if consumption exceeds alert threshold
   */
  isAlertThresholdExceeded(): boolean

  /**
   * Reset budget and consumption tracking
   */
  reset(): void

  /**
   * Get budget status with detailed information
   *
   * @returns Budget status including remaining, consumed, and percentage
   */
  getBudgetStatus(): {
    remaining: number
    consumed: number
    total: number
    percentage: number
    isExceeded: boolean
    isAlertTriggered: boolean
  }
}

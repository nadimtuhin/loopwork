/**
 * Retry Budget Management
 *
 * Manages retry budgets for task execution
 */

export interface RetryBudgetConfig {
  maxRetries: number
  resetPeriodMs: number
}

export class RetryBudget {
  private retries: Map<string, number> = new Map()
  private lastReset: number = Date.now()
  private config: RetryBudgetConfig

  constructor(config: Partial<RetryBudgetConfig> = {}) {
    this.config = {
      maxRetries: config.maxRetries ?? 3,
      resetPeriodMs: config.resetPeriodMs ?? 60000 // 1 minute
    }
  }

  canRetry(taskId: string): boolean {
    this.checkReset()
    const currentRetries = this.retries.get(taskId) ?? 0
    return currentRetries < this.config.maxRetries
  }

  recordRetry(taskId: string): void {
    this.checkReset()
    const currentRetries = this.retries.get(taskId) ?? 0
    this.retries.set(taskId, currentRetries + 1)
  }

  reset(): void {
    this.retries.clear()
    this.lastReset = Date.now()
  }

  private checkReset(): void {
    if (Date.now() - this.lastReset > this.config.resetPeriodMs) {
      this.reset()
    }
  }

  getRetryCount(taskId: string): number {
    return this.retries.get(taskId) ?? 0
  }
}

export const retryBudget = new RetryBudget()

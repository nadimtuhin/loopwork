/**
 * Retry Budget Management
 *
 * Tracks retry consumption over a rolling window to prevent runaway costs
 */

export interface RetryBudgetConfig {
  maxRetries: number
  windowMs: number
  enabled?: boolean
}

export class RetryBudget {
  private retryTimestamps: number[] = []
  private maxRetries: number
  private windowMs: number

  constructor(maxRetries: number = 50, windowMs: number = 3600000) {
    this.maxRetries = maxRetries
    this.windowMs = windowMs
  }

  hasBudget(): boolean {
    this.cleanup()
    return this.retryTimestamps.length < this.maxRetries
  }

  consume(): void {
    this.retryTimestamps.push(Date.now())
  }

  getConfig(): { maxRetries: number; windowMs: number } {
    return {
      maxRetries: this.maxRetries,
      windowMs: this.windowMs
    }
  }

  private cleanup(): void {
    const now = Date.now()
    const windowStart = now - this.windowMs
    this.retryTimestamps = this.retryTimestamps.filter(t => t > windowStart)
  }

  getUsage(): number {
    this.cleanup()
    return this.retryTimestamps.length
  }
}

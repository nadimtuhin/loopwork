/**
 * Retry Budget Management
 *
 * Tracks retry consumption over a rolling window to prevent runaway costs
 */

import { loopworkState } from './loopwork-state'

export interface RetryBudgetConfig {
  maxRetries: number
  windowMs: number
  enabled?: boolean
  persistence?: boolean
}

export class RetryBudget {
  private retryTimestamps: number[] = []
  private maxRetries: number
  private windowMs: number
  private persistencePath: string | null = null

  constructor(maxRetries: number = 50, windowMs: number = 3600000, persistence: boolean = false) {
    this.maxRetries = maxRetries
    this.windowMs = windowMs
    if (persistence) {
      this.persistencePath = loopworkState.paths.retryBudget()
      this.load()
    }
  }

  private load(): void {
    if (!this.persistencePath) return
    const data = loopworkState.readJson<{ timestamps: number[] }>(this.persistencePath)
    if (data && Array.isArray(data.timestamps)) {
      this.retryTimestamps = data.timestamps
      this.cleanup()
    }
  }

  private save(): void {
    if (!this.persistencePath) return
    this.cleanup()
    loopworkState.writeJson(this.persistencePath, { timestamps: this.retryTimestamps })
  }

  hasBudget(): boolean {
    this.cleanup()
    return this.retryTimestamps.length < this.maxRetries
  }

  consume(): void {
    this.retryTimestamps.push(Date.now())
    this.save()
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

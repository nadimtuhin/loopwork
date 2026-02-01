/**
 * Internal Service Contracts for Loopwork
 */

export interface RetryBudgetConfig {
  maxRetries: number
  windowMs: number
  enabled?: boolean
  persistence?: boolean
}

/**
 * Interface for Retry Budget management
 */
export interface IRetryBudget {
  hasBudget(): boolean
  consume(): void
  getConfig(): { maxRetries: number; windowMs: number }
  getUsage(): number
}

/**
 * Interface for Checkpoint management
 */
export interface ICheckpointIntegrator {
  shouldCheckpoint(iteration: number): boolean
  checkpoint(data: {
    taskId: string
    iteration: number
    context?: Record<string, unknown>
    memory?: Record<string, unknown>
  }): Promise<void>
}

/**
 * Interface for failure analysis and pattern detection
 */
export interface IFailureState {
  setFailureState(taskId: string, count: number, error: string): void
  clearFailure(taskId: string): void
  getFailureCount(taskId: string): number
}

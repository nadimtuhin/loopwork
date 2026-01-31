/**
 * Failure State Management
 *
 * Tracks and manages failure states for parallel execution
 */

export interface FailureState {
  taskId: string
  error: string
  timestamp: number
  retryCount: number
}

export class FailureStateManager {
  private failures: Map<string, FailureState> = new Map()

  recordFailure(taskId: string, error: string): void {
    const existing = this.failures.get(taskId)
    this.failures.set(taskId, {
      taskId,
      error,
      timestamp: Date.now(),
      retryCount: (existing?.retryCount ?? 0) + 1
    })
  }

  getFailure(taskId: string): FailureState | undefined {
    return this.failures.get(taskId)
  }

  clearFailure(taskId: string): void {
    this.failures.delete(taskId)
  }

  getAllFailures(): FailureState[] {
    return Array.from(this.failures.values())
  }

  clear(): void {
    this.failures.clear()
  }
}

export const failureState = new FailureStateManager()

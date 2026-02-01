import type { JsonEvent } from './output'

/**
 * Logger interface for run command
 * Extracted to prevent circular dependencies between run.tsx and parallel-runner.ts
 */
export interface RunLogger {
  startSpinner(message: string): void
  stopSpinner(message?: string, symbol?: string): void
  info(message: string): void
  success(message: string): void
  warn(message: string): void
  error(message: string): void
  debug(message: string): void
  raw(message: string): void
  setLogFile(filePath: string): void
  jsonEvent?(event: JsonEvent): void
  setOutputFormat?(format: 'human' | 'json'): void
  emitWorkerStatus?(status: {
    totalWorkers: number
    activeWorkers: number
    pendingTasks: number
    runningTasks: number
    completedTasks: number
    failedTasks: number
  }): void
}

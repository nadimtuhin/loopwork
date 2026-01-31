import type { Task } from './task'

export interface ICliExecutor {
  execute(
    prompt: string,
    outputFile: string,
    timeoutSecs: number,
    taskId?: string,
    workerId?: number,
    permissions?: Record<string, string>,
    priority?: string
  ): Promise<number>

  executeTask(
    task: Task,
    prompt: string,
    outputFile: string,
    timeoutSecs: number,
    workerId?: number,
    permissions?: Record<string, string>
  ): Promise<number>

  killCurrent(): void
  resetFallback(): void
  cleanup(): Promise<void>
}

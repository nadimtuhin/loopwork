export interface ICliExecutor {
  execute(prompt: string, outputFile: string, timeoutSecs: number, taskId?: string): Promise<number>
  killCurrent(): void
  resetFallback(): void
  cleanup(): Promise<void>
}

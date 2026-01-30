export interface ICliExecutor {
  execute(prompt: string, outputFile: string, timeoutSecs: number): Promise<number>
  killCurrent(): void
  resetFallback(): void
}

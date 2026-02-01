import { ModelConfig, ExecutionOptions, ITaskMinimal } from './types'

export * from './types'

export interface IModelSelector {
  getNext(): ModelConfig | null
  switchToFallback(): void
  resetToFallback(): void
  isUsingFallback(): boolean
  getTotalModelCount(): number
  getAllModels(): ModelConfig[]
  reset(): void
}

export interface IModelProvider {
  getModels(): ModelConfig[]
  getFallbackModels(): ModelConfig[]
}

export interface ICliExecutor {
  execute(
    prompt: string,
    outputFile: string,
    timeoutSecs: number,
    options?: ExecutionOptions
  ): Promise<number>

  executeTask(
    task: ITaskMinimal,
    prompt: string,
    outputFile: string,
    timeoutSecs: number,
    options?: Omit<ExecutionOptions, 'taskId' | 'priority' | 'feature'>
  ): Promise<number>

  killCurrent(): void
  cleanup(): Promise<void>
}

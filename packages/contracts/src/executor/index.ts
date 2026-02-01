import { ModelConfig, ExecutionOptions, ITaskMinimal } from './types'

export * from './types'
export * from './strategy'

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

  /**
   * Run pre-flight validation on all CLI models
   * Returns information about healthy and unhealthy models
   */
  runPreflightValidation?(
    minimumRequired?: number
  ): Promise<{
    success: boolean
    healthy: unknown[]
    unhealthy: unknown[]
    message: string
  }>

  /**
   * Get current health status of models
   */
  getHealthStatus?(): {
    total: number
    available: number
    disabled: number
    preflightComplete: boolean
  }

  /**
   * Get the next available model configuration
   * Returns null if no models are available
   */
  getNextModel?(): { cli: string; model: string; displayName?: string } | null

  /**
   * Start progressive validation that enables immediate work with available models
   * Returns immediately once minimumRequired models are healthy, continues validating in background
   */
  startProgressiveValidation?(
    minimumRequired?: number
  ): Promise<{
    success: boolean
    initiallyAvailable: number
    message: string
    waitForAll: () => Promise<{ totalHealthy: number; totalUnhealthy: number }>
  }>
}

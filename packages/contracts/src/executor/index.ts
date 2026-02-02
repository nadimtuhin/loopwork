import { ModelConfig, ExecutionOptions, ITaskMinimal } from './types'

export * from './types'
export * from './strategy'
export * from './adapter'

/**
 * Model Selector Interface
 *
 * Defines the contract for selecting which model to use for AI execution.
 */
export interface IModelSelector {
  /**
   * Get the next model configuration for execution.
   * @returns Next model config or null if no models available
   */
  getNext(): ModelConfig | null

  /**
   * Switch to using fallback models only.
   */
  switchToFallback(): void

  /**
   * Reset selector to use primary models.
   */
  resetToFallback(): void

  /**
   * Check if currently using fallback models.
   * @returns True if using fallback models
   */
  isUsingFallback(): boolean

  /**
   * Get total number of available models.
   * @returns Total model count
   */
  getTotalModelCount(): number

  /**
   * Get all configured models.
   * @returns Array of all model configurations
   */
  getAllModels(): ModelConfig[]

  /**
   * Reset selector to initial state.
   */
  reset(): void
}

/**
 * Model Provider Interface
 *
 * Defines the contract for providing model configurations.
 */
export interface IModelProvider {
  /**
   * Get primary models for execution.
   * @returns Array of primary model configurations
   */
  getModels(): ModelConfig[]

  /**
   * Get fallback models for retry scenarios.
   * @returns Array of fallback model configurations
   */
  getFallbackModels(): ModelConfig[]
}

/**
 * CLI Executor Interface
 *
 * Defines the contract for executing AI CLI commands with retry and health management.
 */
export interface ICliExecutor {
  /**
   * Execute a prompt using the configured AI CLI.
   * @param prompt - The prompt to send to the AI
   * @param outputFile - File path to store the AI output
   * @param timeoutSecs - Execution timeout in seconds
   * @param options - Additional execution options
   * @returns Exit code of the execution (0 for success)
   */
  execute(
    prompt: string,
    outputFile: string,
    timeoutSecs: number,
    options?: ExecutionOptions
  ): Promise<number>

  /**
   * Execute a specific task using the configured AI CLI.
   * @param task - Task metadata
   * @param prompt - Prompt to send to the AI
   * @param outputFile - File path to store the AI output
   * @param timeoutSecs - Execution timeout in seconds
   * @param options - Additional execution options
   * @returns Exit code of the execution (0 for success)
   */
  executeTask(
    task: ITaskMinimal,
    prompt: string,
    outputFile: string,
    timeoutSecs: number,
    options?: Omit<ExecutionOptions, 'taskId' | 'priority' | 'feature'>
  ): Promise<number>

  /**
   * Terminate the currently running AI CLI process.
   */
  killCurrent(): void

  /**
   * Cleanup resources before shutdown.
   * @returns Promise resolving when cleanup is complete
   */
  cleanup(): Promise<void>

  /**
   * Run pre-flight validation on all CLI models.
   * Validates that CLI tools are installed and responsive.
   * @param minimumRequired - Minimum number of healthy models required to succeed
   * @returns Validation results including healthy and unhealthy models
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
   * Get current health status of models.
   * @returns Health status summary
   */
  getHealthStatus?(): {
    total: number
    available: number
    disabled: number
    preflightComplete: boolean
  }

  /**
   * Get the next available model configuration without advancing the selector.
   * @returns Model metadata or null if no models available
   */
  getNextModel?(): { cli: string; model: string; displayName?: string } | null

  /**
   * Start progressive validation that enables immediate work with available models.
   * Returns immediately once minimumRequired models are healthy, continues validating in background.
   * @param minimumRequired - Minimum number of healthy models required for initial success
   * @returns Progressive validation status and a promise to wait for all models
   */
  startProgressiveValidation?(
    minimumRequired?: number
  ): Promise<{
    success: boolean
    initiallyAvailable: number
    message: string
    waitForAll: () => Promise<{ totalHealthy: number; totalUnhealthy: number }>
  }>

  /**
   * Update executor configuration at runtime.
   * @param newConfig - New configuration to apply
   */
  updateConfig?(newConfig: unknown): void
}

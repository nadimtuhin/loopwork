import type { ExecutionOptions, ITaskMinimal } from '@loopwork-ai/contracts'
import type { Config } from '../core/config'

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
  resetFallback(): void
  cleanup(): Promise<void>
  getNextModel?(): { cli: string; model: string; displayName?: string } | null
  
  /**
   * Update executor configuration at runtime (for hot reload support).
   * Updates model pool, retry config, process manager settings, etc.
   */
  updateConfig?(newConfig: Config): void
}

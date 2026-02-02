/**
 * Runner Adapter Interfaces
 */

export interface RunnerRunOptions {
  prompt: string
  timeout?: number
  env?: Record<string, string>
  [key: string]: any
}

export interface RunnerRunResult {
  exitCode: number
  output: string
  durationMs: number
  timedOut: boolean
}

/**
 * Interface for CLI execution adapters
 */
export interface IRunnerAdapter {
  run(options: RunnerRunOptions): Promise<RunnerRunResult>
}

/**
 * Interface for Git operations adapters
 */
export interface IGitAdapter {
  diff(args: string[]): Promise<string>
  status(): Promise<string>
}

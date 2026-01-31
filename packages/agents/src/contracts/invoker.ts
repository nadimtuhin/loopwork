/**
 * CLI Invoker Contract
 *
 * Defines how to invoke a specific CLI tool with model preferences.
 */

export interface CliInvokeOptions {
  /** The prompt to send */
  prompt: string
  /** Working directory */
  workDir: string
  /** Model preference (e.g., 'sonnet', 'opus', 'haiku', 'gemini-flash') */
  model?: string
  /** Timeout in seconds */
  timeout?: number
  /** Environment variables */
  env?: Record<string, string>
  /** Allowed tools (for CLIs that support tool restrictions) */
  tools?: readonly string[]
}

export interface CliInvokeResult {
  /** Exit code (0 = success) */
  exitCode: number
  /** Combined stdout/stderr output */
  output: string
  /** Execution duration in milliseconds */
  durationMs: number
  /** Whether execution timed out */
  timedOut: boolean
}

/**
 * CLI Invoker interface - implemented by each CLI plugin
 */
export interface ICliInvoker {
  /** Unique name for this invoker (e.g., 'claude', 'opencode', 'droid') */
  readonly name: string

  /** Human-readable description */
  readonly description: string

  /** Check if this invoker is available (CLI installed) */
  isAvailable(): Promise<boolean>

  /** Get supported models for this CLI */
  getSupportedModels(): string[]

  /** Invoke the CLI with the given options */
  invoke(options: CliInvokeOptions): Promise<CliInvokeResult>

  /** Build the command args for debugging/logging */
  buildArgs(options: CliInvokeOptions): string[]
}

/**
 * Registry of CLI invokers
 */
export interface ICliInvokerRegistry {
  /** Register an invoker */
  register(invoker: ICliInvoker): void

  /** Get invoker by name */
  get(name: string): ICliInvoker | undefined

  /** Get invoker that supports the given model */
  getForModel(model: string): ICliInvoker | undefined

  /** Get the default invoker */
  getDefault(): ICliInvoker | undefined

  /** Set the default invoker */
  setDefault(name: string): void

  /** List all registered invokers */
  list(): readonly ICliInvoker[]

  /** Find first available invoker */
  findAvailable(): Promise<ICliInvoker | undefined>
}

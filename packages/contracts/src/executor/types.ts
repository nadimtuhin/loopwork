export type CliType = 'claude' | 'opencode' | 'gemini' | 'droid' | 'crush' | 'kimi' | 'kilocode'
export type ModelSelectionStrategy = 'round-robin' | 'priority' | 'cost-aware' | 'random'

export interface ModelConfig {
  /**
   * Unique identifier for this model configuration
   * Used for logging and tracking
   */
  name: string

  /**
   * Human-readable display name for logging
   * Falls back to `name` if not provided
   */
  displayName?: string

  /**
   * CLI tool to use for this model
   */
  cli: CliType

  /**
   * Model ID to pass to the CLI
   * e.g., 'sonnet', 'opus', 'google/antigravity-gemini-3-flash'
   */
  model: string

  /**
   * Per-model timeout in seconds
   * Overrides the global timeout for this specific model
   */
  timeout?: number

  /**
   * Additional CLI arguments specific to this model
   */
  args?: string[]

  /**
   * Per-model environment variables
   * Merged with process.env, model-specific takes precedence
   */
  env?: Record<string, string>

  /**
   * Cost weight for cost-aware selection (1-100)
   * Lower values = cheaper/preferred
   */
  costWeight?: number

  /**
   * Whether this model is currently enabled
   */
  enabled?: boolean

  /**
   * Model parameters
   */
  temperature?: number
  maxTokens?: number
  topP?: number
  topK?: number
  stopSequences?: string[]
}

export interface ExecutionOptions {
  taskId?: string
  workerId?: number
  permissions?: Record<string, string>
  priority?: string
  feature?: string
}

export interface ITaskMinimal {
  id: string
  priority?: string
  feature?: string
  [key: string]: any
}

export interface RetryConfig {
  rateLimitWaitMs?: number
  exponentialBackoff?: boolean
  baseDelayMs?: number
  maxDelayMs?: number
  backoffMultiplier?: number
  retrySameModel?: boolean
  maxRetriesPerModel?: number
  /**
   * Delay between model execution attempts in milliseconds.
   * Useful for rate limiting and avoiding resource contention when switching models.
   * @default 2000 (2 seconds)
   */
  delayBetweenModelAttemptsMs?: number
}

export interface CliPathConfig {
  claude?: string
  opencode?: string
  gemini?: string
  droid?: string
  crush?: string
  kimi?: string
  kilocode?: string
}

export interface CliExecutorConfig {
  /**
   * Primary model pool
   * Models are tried in order based on selectionStrategy
   */
  models?: ModelConfig[]

  /**
   * Fallback model pool
   * Used when primary models are exhausted
   */
  fallbackModels?: ModelConfig[]

  /**
   * Custom CLI executable paths
   */
  cliPaths?: CliPathConfig

  /**
   * Retry and rate-limit configuration
   */
  retry?: RetryConfig

  /**
   * Model selection strategy
   * Default: 'round-robin'
   */
  selectionStrategy?: ModelSelectionStrategy

  /**
   * Delay before SIGKILL after SIGTERM (milliseconds)
   * Default: 5000 (5 seconds)
   */
  sigkillDelayMs?: number

  /**
   * Progress bar update interval (milliseconds)
   * Default: 2000 (2 seconds)
   */
  progressIntervalMs?: number

  /**
   * Prefer PTY (pseudo-terminal) for process spawning
   * Default: true
   */
  preferPty?: boolean
}

/**
 * CLI Executor Configuration Types
 *
 * Provides comprehensive configuration for CLI invocation:
 * - Custom model pools with per-model settings
 * - Retry strategies with exponential backoff
 * - Model selection algorithms
 * - CLI path overrides
 */

/**
 * Supported CLI types
 */
export type CliType = 'claude' | 'opencode' | 'gemini'

/**
 * Model selection strategies
 *
 * - round-robin: Cycle through models in order
 * - priority: Always try first available model first
 * - cost-aware: Prefer lower cost models when possible
 * - random: Random selection from available models
 */
export type ModelSelectionStrategy = 'round-robin' | 'priority' | 'cost-aware' | 'random'

/**
 * Configuration for a single model
 */
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
   * Useful for giving opus more time than haiku
   */
  timeout?: number

  /**
   * Additional CLI arguments specific to this model
   * e.g., ['--thinking-mode', 'deep'] for opus
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
   * Default: 50
   */
  costWeight?: number

  /**
   * Whether this model is currently enabled
   * Allows disabling models without removing them from config
   * Default: true
   */
  enabled?: boolean
}

/**
 * Retry and rate-limit handling configuration
 */
export interface RetryConfig {
  /**
   * Wait time when rate limit is detected (milliseconds)
   * Default: 60000 (60 seconds)
   */
  rateLimitWaitMs?: number

  /**
   * Enable exponential backoff for retries
   * When true, delay doubles after each retry: baseDelayMs * 2^attempt
   * Default: false
   */
  exponentialBackoff?: boolean

  /**
   * Base delay for exponential backoff (milliseconds)
   * Default: 1000 (1 second)
   */
  baseDelayMs?: number

  /**
   * Maximum delay cap for exponential backoff (milliseconds)
   * Default: 60000 (60 seconds)
   */
  maxDelayMs?: number

  /**
   * Whether to retry the same model on transient failures
   * When false, immediately moves to next model
   * Default: false
   */
  retrySameModel?: boolean

  /**
   * Maximum retries per model before moving to next
   * Only applies when retrySameModel is true
   * Default: 1
   */
  maxRetriesPerModel?: number
}

/**
 * CLI path overrides
 */
export interface CliPathConfig {
  /**
   * Custom path to claude CLI
   * Overrides auto-detection
   */
  claude?: string

  /**
   * Custom path to opencode CLI
   * Overrides auto-detection
   */
  opencode?: string

  /**
   * Custom path to gemini CLI
   * Overrides auto-detection
   */
  gemini?: string
}

/**
 * Complete CLI executor configuration
 */
export interface CliExecutorConfig {
  /**
   * Primary model pool
   * Models are tried in order based on selectionStrategy
   */
  models?: ModelConfig[]

  /**
   * Fallback model pool
   * Used when primary models are exhausted (quota, persistent failures)
   */
  fallbackModels?: ModelConfig[]

  /**
   * Custom CLI executable paths
   * Overrides auto-detection of CLI locations
   * Can also be set via environment variables:
   * - LOOPWORK_CLAUDE_PATH
   * - LOOPWORK_OPENCODE_PATH
   * - LOOPWORK_GEMINI_PATH
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
   *
   * When true (default), uses node-pty if available for real-time streaming.
   * PTY prevents output buffering that occurs when CLI stdout is piped.
   * Falls back to standard process spawn if node-pty is not available.
   *
   * When false, always uses standard process spawn (child_process).
   *
   * Default: true
   */
  preferPty?: boolean
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  rateLimitWaitMs: 60000,
  exponentialBackoff: false,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  retrySameModel: false,
  maxRetriesPerModel: 1,
}

/**
 * Default CLI executor configuration
 */
export const DEFAULT_CLI_EXECUTOR_CONFIG: Partial<CliExecutorConfig> = {
  selectionStrategy: 'round-robin',
  sigkillDelayMs: 5000,
  progressIntervalMs: 2000,
  retry: DEFAULT_RETRY_CONFIG,
}

/**
 * CLI Strategy Interface
 *
 * Defines the strategy pattern for different CLI tools (claude, opencode, gemini).
 * Each CLI has different argument formats, environment variables, and input handling.
 */

import type { CliType, ModelConfig } from './types'

/**
 * Context passed to CLI strategy methods
 */
export interface ICliStrategyContext {
  /**
   * Model configuration being executed
   */
  modelConfig: ModelConfig

  /**
   * The prompt to execute
   */
  prompt: string

  /**
   * Base environment variables (can be modified by strategy)
   */
  env: Record<string, string>

  /**
   * Optional permissions from execution options
   */
  permissions?: Record<string, string>
}

/**
 * Result from preparing CLI execution
 */
export interface ICliPrepareResult {
  /**
   * Command-line arguments to pass to the CLI
   */
  args: string[]

  /**
   * Modified environment variables
   */
  env: Record<string, string>

  /**
   * Input to write to stdin (if CLI expects it)
   */
  stdinInput?: string

  /**
   * Display name for logging
   */
  displayName: string
}

/**
 * Strategy interface for CLI-specific behavior
 */
export interface ICliStrategy {
  /**
   * The CLI type this strategy handles
   */
  readonly cliType: CliType

  /**
   * Prepare the CLI execution (build args, env, input)
   */
  prepare(context: ICliStrategyContext): ICliPrepareResult

  /**
   * Check if output indicates cache corruption (if applicable)
   * Returns true if the CLI's cache is corrupted and should be cleared
   */
  detectCacheCorruption?(output: string): boolean

  /**
   * Clear the CLI's cache (if applicable)
   * Returns true if cache was successfully cleared
   */
  clearCache?(): boolean

  /**
   * Get CLI-specific rate limit patterns (optional)
   */
  getRateLimitPatterns?(): RegExp[]

  /**
   * Get CLI-specific quota exceeded patterns (optional)
   */
  getQuotaExceededPatterns?(): RegExp[]
}

/**
 * Registry for CLI strategies
 */
export interface ICliStrategyRegistry {
  /**
   * Register a strategy for a CLI type
   */
  register(strategy: ICliStrategy): void

  /**
   * Get the strategy for a CLI type
   * @throws Error if no strategy is registered for the CLI type
   */
  get(cliType: CliType): ICliStrategy

  /**
   * Check if a strategy is registered for a CLI type
   */
  has(cliType: CliType): boolean

  /**
   * Get all registered CLI types
   */
  getRegisteredTypes(): CliType[]
}

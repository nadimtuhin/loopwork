/**
 * CLI Configuration Plugin
 *
 * Provides plugin wrappers for configuring CLI executor behavior:
 * - Custom model pools
 * - Retry strategies
 * - CLI path overrides
 */

import type { ConfigWrapper, LoopworkConfig } from '../contracts'
import type {
  ModelConfig,
  CliExecutorConfig,
  RetryConfig,
  CliPathConfig,
  ModelSelectionStrategy,
} from '../contracts/cli'

/**
 * Options for the withCli plugin
 */
export type WithCliOptions = CliExecutorConfig

/**
 * Configure the CLI executor with custom settings
 *
 * @example
 * ```typescript
 * compose(
 *   withCli({
 *     models: [
 *       { name: 'sonnet', cli: 'claude', model: 'sonnet', timeout: 300 },
 *       { name: 'haiku', cli: 'claude', model: 'haiku', timeout: 120 },
 *     ],
 *     retry: { exponentialBackoff: true },
 *   }),
 * )(defineConfig({}))
 * ```
 */
export function withCli(options: WithCliOptions): ConfigWrapper {
  return (config: LoopworkConfig): LoopworkConfig => ({
    ...config,
    cliConfig: {
      ...config.cliConfig,
      ...options,
      // Deep merge retry config
      retry: {
        ...config.cliConfig?.retry,
        ...options.retry,
      },
      // Deep merge cliPaths
      cliPaths: {
        ...config.cliConfig?.cliPaths,
        ...options.cliPaths,
      },
    },
  })
}

/**
 * Options for the withModels plugin
 */
export interface WithModelsOptions {
  /**
   * Primary model pool
   */
  models: ModelConfig[]

  /**
   * Optional fallback models
   */
  fallbackModels?: ModelConfig[]

  /**
   * Model selection strategy
   * Default: 'round-robin'
   */
  strategy?: ModelSelectionStrategy
}

/**
 * Configure custom model pools
 *
 * @example
 * ```typescript
 * compose(
 *   withModels({
 *     models: [
 *       { name: 'sonnet', cli: 'claude', model: 'sonnet', timeout: 300 },
 *     ],
 *     fallbackModels: [
 *       { name: 'opus', cli: 'claude', model: 'opus', timeout: 900 },
 *     ],
 *     strategy: 'priority',
 *   }),
 * )(defineConfig({}))
 * ```
 */
export function withModels(options: WithModelsOptions): ConfigWrapper {
  return (config: LoopworkConfig): LoopworkConfig => ({
    ...config,
    cliConfig: {
      ...config.cliConfig,
      models: options.models,
      fallbackModels: options.fallbackModels ?? config.cliConfig?.fallbackModels,
      selectionStrategy: options.strategy ?? config.cliConfig?.selectionStrategy,
    },
  })
}

/**
 * Configure retry behavior
 *
 * @example
 * ```typescript
 * compose(
 *   withRetry({
 *     exponentialBackoff: true,
 *     maxDelayMs: 300000, // 5 minutes max
 *     retrySameModel: true,
 *     maxRetriesPerModel: 2,
 *   }),
 * )(defineConfig({}))
 * ```
 */
export function withRetry(options: RetryConfig): ConfigWrapper {
  return (config: LoopworkConfig): LoopworkConfig => ({
    ...config,
    cliConfig: {
      ...config.cliConfig,
      retry: {
        ...config.cliConfig?.retry,
        ...options,
      },
    },
  })
}

/**
 * Configure custom CLI paths
 *
 * @example
 * ```typescript
 * compose(
 *   withCliPaths({
 *     claude: '/custom/path/to/claude',
 *     opencode: '/custom/path/to/opencode',
 *   }),
 * )(defineConfig({}))
 * ```
 */
export function withCliPaths(paths: CliPathConfig): ConfigWrapper {
  return (config: LoopworkConfig): LoopworkConfig => ({
    ...config,
    cliConfig: {
      ...config.cliConfig,
      cliPaths: {
        ...config.cliConfig?.cliPaths,
        ...paths,
      },
    },
  })
}

/**
 * Configure model selection strategy
 *
 * @example
 * ```typescript
 * compose(
 *   withSelectionStrategy('cost-aware'),
 * )(defineConfig({}))
 * ```
 */
export function withSelectionStrategy(strategy: ModelSelectionStrategy): ConfigWrapper {
  return (config: LoopworkConfig): LoopworkConfig => ({
    ...config,
    cliConfig: {
      ...config.cliConfig,
      selectionStrategy: strategy,
    },
  })
}

/**
 * Helper to create a model config with sensible defaults
 *
 * @example
 * ```typescript
 * const sonnet = createModel({
 *   name: 'sonnet',
 *   cli: 'claude',
 *   model: 'sonnet',
 *   timeout: 300,
 * })
 * ```
 */
export function createModel(config: ModelConfig): ModelConfig {
  return {
    enabled: true,
    costWeight: 50,
    ...config,
  }
}

/**
 * Pre-configured model presets
 */
export const ModelPresets = {
  /**
   * Claude Sonnet - balanced performance and cost
   */
  claudeSonnet: (overrides?: Partial<ModelConfig>): ModelConfig => ({
    name: 'claude-sonnet',
    displayName: 'sonnet',
    cli: 'claude',
    model: 'sonnet',
    timeout: 300,
    costWeight: 30,
    ...overrides,
  }),

  /**
   * Claude Opus - highest capability
   */
  claudeOpus: (overrides?: Partial<ModelConfig>): ModelConfig => ({
    name: 'claude-opus',
    displayName: 'opus',
    cli: 'claude',
    model: 'opus',
    timeout: 900,
    costWeight: 100,
    ...overrides,
  }),

  /**
   * Claude Haiku - fast and cheap
   */
  claudeHaiku: (overrides?: Partial<ModelConfig>): ModelConfig => ({
    name: 'claude-haiku',
    displayName: 'haiku',
    cli: 'claude',
    model: 'haiku',
    timeout: 120,
    costWeight: 10,
    ...overrides,
  }),

  /**
   * Gemini Flash via OpenCode - fast
   */
  geminiFlash: (overrides?: Partial<ModelConfig>): ModelConfig => ({
    name: 'gemini-flash',
    displayName: 'gemini-flash',
    cli: 'opencode',
    model: 'google/antigravity-gemini-3-flash',
    timeout: 180,
    costWeight: 15,
    ...overrides,
  }),

  /**
   * Gemini Pro via OpenCode - capable
   */
  geminiPro: (overrides?: Partial<ModelConfig>): ModelConfig => ({
    name: 'gemini-pro',
    displayName: 'gemini-pro',
    cli: 'opencode',
    model: 'google/antigravity-gemini-3-pro',
    timeout: 600,
    costWeight: 60,
    ...overrides,
  }),
}

/**
 * Common retry presets
 */
export const RetryPresets = {
  /**
   * Default: Fixed 60s wait, no backoff
   */
  default: (): RetryConfig => ({
    rateLimitWaitMs: 60000,
    exponentialBackoff: false,
  }),

  /**
   * Aggressive: Exponential backoff with multiple retries per model
   */
  aggressive: (): RetryConfig => ({
    exponentialBackoff: true,
    baseDelayMs: 1000,
    maxDelayMs: 300000,
    retrySameModel: true,
    maxRetriesPerModel: 3,
  }),

  /**
   * Gentle: Long fixed waits, no model retries
   */
  gentle: (): RetryConfig => ({
    rateLimitWaitMs: 120000,
    exponentialBackoff: false,
    retrySameModel: false,
  }),
}

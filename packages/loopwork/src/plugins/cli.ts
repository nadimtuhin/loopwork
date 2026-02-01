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
export function withCli( _options: WithCliOptions): ConfigWrapper {
  return (config: LoopworkConfig): LoopworkConfig => ({
    ...config,
    cliConfig: {
      ...config.cliConfig,
      ..._options,
      // Deep merge retry config
      retry: {
        ...config.cliConfig?.retry,
        ..._options.retry,
      },
      // Deep merge cliPaths
      cliPaths: {
        ...config.cliConfig?.cliPaths,
        ..._options.cliPaths,
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
export function withModels( _options: WithModelsOptions): ConfigWrapper {
  return (config: LoopworkConfig): LoopworkConfig => ({
    ...config,
    cliConfig: {
      ...config.cliConfig,
      models: _options.models,
      fallbackModels: _options.fallbackModels ?? config.cliConfig?.fallbackModels,
      selectionStrategy: _options.strategy ?? config.cliConfig?.selectionStrategy,
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
export function withRetry( _options: RetryConfig): ConfigWrapper {
  return (config: LoopworkConfig): LoopworkConfig => ({
    ...config,
    cliConfig: {
      ...config.cliConfig,
      retry: {
        ...config.cliConfig?.retry,
        ..._options,
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
    name: 'claude-code-sonnet',
    displayName: 'claude-code-sonnet',
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
    name: 'claude-code-opus',
    displayName: 'claude-code-opus',
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
    name: 'claude-code-haiku',
    displayName: 'claude-code-haiku',
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
    name: 'opencode-gemini-flash',
    displayName: 'opencode-gemini-flash',
    cli: 'opencode',
    model: 'google/antigravity-gemini-3-flash',
    timeout: 180,
    costWeight: 15,
    ...overrides,
  }),
  /**
   * Gemini Flash via OpenCode - fast
   */
  opencodeGeminiFlash: (overrides?: Partial<ModelConfig>): ModelConfig => ({
    name: 'opencode-gemini-flash',
    displayName: 'opencode-gemini-flash',
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
    name: 'opencode-gemini-pro-low',
    displayName: 'opencode-gemini-pro-low',
    cli: 'opencode',
    model: 'google/antigravity-gemini-3-pro-low',
    timeout: 600,
    costWeight: 60,
    ...overrides,
  }),
  /**
   * Gemini Pro via OpenCode - capable
   */
  opencodeGeminiProHigh: (overrides?: Partial<ModelConfig>): ModelConfig => ({
    name: 'opencode-gemini-pro-high',
    displayName: 'opencode-gemini-pro-high',
    cli: 'opencode',
    model: 'google/antigravity-gemini-3-pro-high',
    timeout: 600,
    costWeight: 60,
    ...overrides,
  }),
  /**
   * Gemini Pro via OpenCode - capable
   */
  opencodeGeminiProLow: (overrides?: Partial<ModelConfig>): ModelConfig => ({
    name: 'opencode-gemini-pro-low',
    displayName: 'opencode-gemini-pro-low',
    cli: 'opencode',
    model: 'google/antigravity-gemini-3-pro-low',
    timeout: 600,
    costWeight: 60,
    ...overrides,
  }),

  /**
   * High capability model (Architect/Lead)
   * Best for: Complex reasoning, architecture, deep debugging
   */
  capabilityHigh: (overrides?: Partial<ModelConfig>): ModelConfig => ({
    ...ModelPresets.claudeOpus(overrides),
    displayName: 'High Capability (Opus)',
  }),

  /**
   * Medium capability model (Senior Engineer)
   * Best for: Implementation, refactoring, standard tasks
   */
  capabilityMedium: (overrides?: Partial<ModelConfig>): ModelConfig => ({
    ...ModelPresets.claudeSonnet(overrides),
    displayName: 'Medium Capability (Sonnet)',
  }),

  /**
   * Low capability model (Junior Engineer)
   * Best for: Simple fixes, docs, small changes
   */
  capabilityLow: (overrides?: Partial<ModelConfig>): ModelConfig => ({
    ...ModelPresets.claudeHaiku(overrides),
    displayName: 'Low Capability (Haiku)',
  }),

  /**
   * Role: Architect (High Capability)
   */
  roleArchitect: (overrides?: Partial<ModelConfig>): ModelConfig => ({
    ...ModelPresets.capabilityHigh(overrides),
    displayName: 'Role: Architect',
  }),

  /**
   * Role: Senior Engineer (Medium Capability)
   */
  roleEngineer: (overrides?: Partial<ModelConfig>): ModelConfig => ({
    ...ModelPresets.capabilityMedium(overrides),
    displayName: 'Role: Senior Engineer',
  }),

  /**
   * Role: Junior Engineer (Low Capability)
   */
  roleJunior: (overrides?: Partial<ModelConfig>): ModelConfig => ({
    ...ModelPresets.capabilityLow(overrides),
    displayName: 'Role: Junior Engineer',
  }),
}

/**
 * Common retry presets
 */
export const RetryPresets = {
  /**
   * Default: Fixed 30s wait, no backoff
   */
  default: (): RetryConfig => ({
    rateLimitWaitMs: 30000,
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

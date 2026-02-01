/**
 * Simplified Configuration API
 *
 * Provides easy-to-use config presets and helpers for common use cases.
 * All existing configs remain 100% backward compatible.
 *
 * @example
 * // Simple config - just models and parallel count
 * export default defineSimpleConfig({
 *   models: ['claude-sonnet', 'gemini-flash'],
 *   parallel: 3,
 * });
 *
 * @example
 * // Preset-based config
 * export default createPresetConfig(Presets.fastAndCheap, {
 *   parallel: 5,
 * });
 */

import type { LoopworkConfig, ConfigWrapper, LoopworkPlugin } from '../contracts'
import { DEFAULT_CONFIG } from '../contracts'
import { withJSONBackend, withGitHubBackend } from '../backends/plugin'
import { withCli, createModel, ModelPresets } from './cli'
import { withGitAutoCommit } from './git-autocommit'
import { withSmartTestTasks } from './smart-tasks'
import { withTaskRecovery } from './task-recovery'
import { withPlugin } from './index'
import { withDocumentation } from './documentation'

// Re-export for convenience
export { withJSONBackend, withGitHubBackend, withCli, createModel, ModelPresets }

/**
 * Built-in model name shortcuts that map to presets
 */
const MODEL_SHORTCUTS: Record<string, () => ReturnType<typeof createModel>> = {
  // Claude models
  'claude-sonnet': () => ModelPresets.claudeSonnet(),
  'claude-opus': () => ModelPresets.claudeOpus(),
  'claude-haiku': () => ModelPresets.claudeHaiku(),
  'sonnet': () => ModelPresets.claudeSonnet(),
  'opus': () => ModelPresets.claudeOpus(),
  'haiku': () => ModelPresets.claudeHaiku(),
  
  // Gemini models via OpenCode
  'gemini-flash': () => ModelPresets.geminiFlash(),
  'gemini-pro': () => ModelPresets.geminiPro(),
  'gemini-pro-high': () => ModelPresets.opencodeGeminiProHigh(),
  
  // OpenCode variants (explicit)
  'opencode/gemini-flash': () => ModelPresets.geminiFlash(),
  'opencode/gemini-pro': () => ModelPresets.geminiPro(),
  'opencode/gemini-pro-high': () => ModelPresets.opencodeGeminiProHigh(),
  
  // Aliases
  'fast': () => ModelPresets.geminiFlash(),
  'cheap': () => ModelPresets.geminiFlash(),
  'balanced': () => ModelPresets.claudeSonnet(),
  'capable': () => ModelPresets.claudeSonnet(),
  'premium': () => ModelPresets.claudeOpus(),
}

/**
 * Parse a model shortcut string into a ModelConfig
 */
function parseModelShortcut(name: string): ReturnType<typeof createModel> {
  const normalizer = MODEL_SHORTCUTS[name.toLowerCase()]
  if (normalizer) {
    return normalizer()
  }
  
  // If it contains a slash, treat as cli/model
  if (name.includes('/')) {
    const [cli, ...modelParts] = name.split('/')
    const model = modelParts.join('/')
    return createModel({
      name: name.replace(/\//g, '-'),
      cli: cli as 'claude' | 'opencode' | 'gemini',
      model,
      timeout: 600,
      costWeight: 30,
    })
  }
  
  // Unknown - create generic model
  return createModel({
    name: name,
    cli: 'opencode',
    model: name,
    timeout: 600,
    costWeight: 30,
  })
}

/**
 * Simple configuration options
 */
export interface SimpleConfigOptions {
  /** 
   * Model names to use. Can use shortcuts like:
   * - 'claude-sonnet', 'claude-opus', 'claude-haiku'
   * - 'gemini-flash', 'gemini-pro'
   * - 'fast', 'cheap', 'balanced', 'premium'
   * - Full paths like 'opencode/google/gemini-flash'
   */
  models: string[]
  
  /** 
   * Fallback models for retries (optional).
   * Uses same shortcuts as `models`.
   */
  fallbackModels?: string[]
  
  /** 
   * Number of parallel workers. 
   * @default 1
   */
  parallel?: number
  
  /** 
   * Backend configuration. 
   * - String path: Auto-detects JSON backend (e.g., '.specs/tasks/tasks.json')
   * - Object: Full backend config (backward compatible)
   * @default '.specs/tasks/tasks.json'
   */
  backend?: string | LoopworkConfig['backend']
  
  /** 
   * Maximum iterations before stopping.
   * @default 50
   */
  maxIterations?: number
  
  /** 
   * Timeout per task in seconds.
   * @default 600
   */
  timeout?: number
  
  /** 
   * Namespace for running multiple loops.
   * @default 'default'
   */
  namespace?: string
  
  /**
   * Enable automatic git commits after each task.
   * @default false
   */
  autoCommit?: boolean
  
  /**
   * Enable cost tracking.
   * @default false
   */
  costTracking?: boolean
  
  /**
   * Enable smart test task suggestions.
   * @default false
   */
  smartTests?: boolean
  
  /**
   * Enable task recovery on failures.
   * @default false
   */
  taskRecovery?: boolean
  
  /**
   * Enable changelog documentation.
   * @default false
   */
  changelog?: boolean
  
  /**
   * Auto-confirm prompts (non-interactive mode).
   * @default false
   */
  autoConfirm?: boolean
  
  /**
   * Enable debug logging.
   * @default false
   */
  debug?: boolean
  
  /**
   * Model selection strategy.
   * @default 'cost-aware'
   */
  selectionStrategy?: 'cost-aware' | 'random' | 'round-robin' | 'capability'
  
  /**
   * Additional plugins (for advanced use).
   * Maintains backward compatibility with existing configs.
   */
  plugins?: LoopworkPlugin[]
  
  /**
   * Any other LoopworkConfig options (backward compatible).
   */
  [key: string]: unknown
}

/**
 * Create a simple configuration with sensible defaults.
 * 
 * This is the easiest way to get started with Loopwork.
 * All existing configuration methods remain available.
 * 
 * @example
 * ```typescript
 * import { defineSimpleConfig } from '@loopwork-ai/loopwork';
 * 
 * export default defineSimpleConfig({
 *   models: ['claude-sonnet', 'gemini-flash'],
 *   parallel: 3,
 *   autoCommit: true,
 * });
 * ```
 */
export function defineSimpleConfig(options: SimpleConfigOptions): LoopworkConfig {
  // Parse backend
  let backend: LoopworkConfig['backend']
  if (typeof options.backend === 'string') {
    backend = {
      type: 'json',
      tasksFile: options.backend,
    }
  } else if (options.backend) {
    backend = options.backend
  } else {
    backend = {
      type: 'json',
      tasksFile: '.specs/tasks/tasks.json',
    }
  }
  
  // Parse models
  const models = options.models.map(parseModelShortcut)
  const fallbackModels = options.fallbackModels?.map(parseModelShortcut) || []
  
  // Build CLI config
  const cliConfig = withCli({
    models,
    fallbackModels,
    selectionStrategy: options.selectionStrategy || 'cost-aware',
  })
  
  // Build base config
  let config: LoopworkConfig = defineConfig({
    backend,
    parallel: options.parallel ?? 1,
    maxIterations: options.maxIterations ?? 50,
    timeout: options.timeout ?? 600,
    namespace: options.namespace ?? 'default',
    autoConfirm: options.autoConfirm ?? false,
    debug: options.debug ?? false,
    plugins: options.plugins || [],
    // Include any other options for backward compatibility
    ...Object.fromEntries(
      Object.entries(options).filter(([key]) => 
        !['models', 'fallbackModels', 'backend', 'autoCommit', 'costTracking', 
          'smartTests', 'taskRecovery', 'changelog', 'selectionStrategy'].includes(key)
      )
    ),
  })
  
  // Apply CLI wrapper
  config = cliConfig(config)
  
  // Apply optional plugins
  if (options.autoCommit) {
    config = withGitAutoCommit({ enabled: true })(config)
  }
  
  if (options.smartTests) {
    config = withSmartTestTasks({ enabled: true, autoCreate: false })(config)
  }
  
  if (options.taskRecovery) {
    config = withTaskRecovery({ enabled: true, autoRecover: true })(config)
  }
  
  if (options.changelog) {
    config = withDocumentation({ updateChangelog: true })(config)
  }
  
  // Note: costTracking is from external package, add via plugins if needed
  
  return config
}

/**
 * Predefined configuration presets
 */
export const Presets = {
  /**
   * Fast and cheap - prioritizes speed and low cost.
   * Best for: Quick iterations, simple tasks, prototyping
   */
  fastAndCheap: {
    models: ['gemini-flash', 'claude-haiku'],
    fallbackModels: ['gemini-pro'],
    selectionStrategy: 'cost-aware' as const,
  },
  
  /**
   * Balanced - good mix of capability and cost.
   * Best for: General development tasks
   */
  balanced: {
    models: ['claude-sonnet', 'gemini-pro'],
    fallbackModels: ['claude-opus', 'gemini-flash'],
    selectionStrategy: 'cost-aware' as const,
  },
  
  /**
   * High quality - prioritizes best results.
   * Best for: Complex tasks, critical code, production
   */
  highQuality: {
    models: ['claude-opus', 'claude-sonnet'],
    fallbackModels: ['gemini-pro-high'],
    selectionStrategy: 'capability' as const,
  },
  
  /**
   * Free tier only - uses only free models.
   * Best for: Cost-conscious testing, open source projects
   */
  freeTier: {
    models: ['gemini-flash'],
    fallbackModels: [],
    selectionStrategy: 'round-robin' as const,
  },
  
  /**
   * Parallel processing - optimized for speed with multiple workers.
   * Best for: Batch processing, large task queues
   */
  parallel: {
    models: ['gemini-flash', 'claude-haiku', 'gemini-pro'],
    fallbackModels: ['claude-sonnet'],
    selectionStrategy: 'random' as const,
    parallel: 5,
  },
}

/**
 * Create configuration from a preset with optional overrides.
 * 
 * @example
 * ```typescript
 * import { createPresetConfig, Presets } from '@loopwork-ai/loopwork';
 * 
 * export default createPresetConfig(Presets.balanced, {
 *   parallel: 3,
 *   autoCommit: true,
 * });
 * ```
 */
export function createPresetConfig(
  preset: typeof Presets[keyof typeof Presets],
  overrides?: Partial<SimpleConfigOptions>
): LoopworkConfig {
  return defineSimpleConfig({
    models: preset.models,
    fallbackModels: preset.fallbackModels,
    selectionStrategy: preset.selectionStrategy,
    parallel: (preset as { parallel?: number }).parallel ?? 1,
    ...overrides,
  })
}

/**
 * Enhanced defineConfig that accepts simple model names.
 * Maintains 100% backward compatibility.
 * 
 * @example
 * ```typescript
 * import { defineEasyConfig } from '@loopwork-ai/loopwork';
 * 
 * export default defineEasyConfig({
 *   models: ['claude-sonnet', 'gemini-flash'],  // Simple names!
 *   parallel: 3,
 *   backend: '.specs/tasks/tasks.json',  // String shorthand
 * });
 * ```
 */
export function defineEasyConfig(
  config: Omit<SimpleConfigOptions, 'autoCommit' | 'costTracking' | 'smartTests' | 'taskRecovery' | 'changelog'> &
    Pick<LoopworkConfig, 'cli' | 'model' | 'maxRetries' | 'circuitBreakerThreshold'>
): LoopworkConfig {
  const { models, fallbackModels, backend, selectionStrategy, ...rest } = config
  
  // Parse backend if string
  let backendConfig: LoopworkConfig['backend']
  if (typeof backend === 'string') {
    backendConfig = { type: 'json', tasksFile: backend }
  } else {
    backendConfig = backend || { type: 'json', tasksFile: '.specs/tasks/tasks.json' }
  }
  
  // Parse models
  const parsedModels = models?.map(parseModelShortcut) || []
  const parsedFallbackModels = fallbackModels?.map(parseModelShortcut) || []
  
  // Build using simple config base
  const simpleConfig = defineSimpleConfig({
    models: models || ['claude-sonnet'],
    fallbackModels,
    backend: backendConfig,
    selectionStrategy,
    ...rest,
  })
  
  // Merge with any additional LoopworkConfig properties
  return {
    ...simpleConfig,
    ...rest,
    backend: backendConfig,
  }
}

// Keep original defineConfig for full backward compatibility
import { defineConfig } from './index'
export { defineConfig, withPlugin }
export default defineSimpleConfig

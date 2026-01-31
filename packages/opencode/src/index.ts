/**
 * OpenCode Integration for Loopwork
 *
 * Provides auto-discovery and configuration of OpenCode models
 */

import { execSync } from 'child_process'
import type { LoopworkConfig, ModelConfig } from '../../loopwork/src/contracts'

export interface OpenCodeIntegrationOptions {
  /** Whether to auto-discover available models from opencode CLI */
  autoDiscover?: boolean
  /** Filter models by provider (e.g., 'google', 'anthropic', 'openrouter') */
  providers?: string[]
  /** Exclude specific model IDs */
  exclude?: string[]
  /** Default timeout for model execution (ms) */
  defaultTimeout?: number
  /** Model selection strategy */
  selectionStrategy?: 'round-robin' | 'cost-aware' | 'random'
}

/**
 * Discover available OpenCode models
 */
export function discoverOpenCodeModels(): string[] {
  try {
    const output = execSync('opencode models', { encoding: 'utf-8' })
    return output.trim().split('\n').filter(Boolean)
  } catch (error) {
    console.warn('Failed to discover OpenCode models:', error)
    return []
  }
}

/**
 * Convert OpenCode model ID to Loopwork ModelConfig
 */
export function createOpenCodeModel(
  modelId: string,
  options: { timeout?: number } = {}
): ModelConfig {
  // Extract display name from model ID
  const displayName = modelId.split('/').pop() || modelId

  return {
    name: displayName,
    cli: 'opencode' as const,
    model: modelId,
    timeout: options.timeout || 300,
  }
}

/**
 * Filter models by provider prefix
 */
export function filterByProvider(models: string[], providers: string[]): string[] {
  if (!providers || providers.length === 0) return models

  return models.filter(modelId => {
    const provider = modelId.split('/')[0]
    return providers.includes(provider)
  })
}

/**
 * Main plugin: withOpenCode
 *
 * Automatically discovers and configures OpenCode models for Loopwork
 *
 * @example
 * ```ts
 * export default compose(
 *   withJSONBackend(),
 *   withOpenCode({
 *     autoDiscover: true,
 *     providers: ['google', 'anthropic'],
 *     defaultTimeout: 300
 *   })
 * )(defineConfig({ maxIterations: 100 }))
 * ```
 */
export function withOpenCode(options: OpenCodeIntegrationOptions = {}) {
  const {
    autoDiscover = true,
    providers = [],
    exclude = [],
    defaultTimeout = 300,
    selectionStrategy = 'round-robin',
  } = options

  return (config: LoopworkConfig): LoopworkConfig => {
    if (!autoDiscover) {
      return config
    }

    // Discover available models
    let availableModels = discoverOpenCodeModels()

    // Apply filters
    if (providers.length > 0) {
      availableModels = filterByProvider(availableModels, providers)
    }

    if (exclude.length > 0) {
      availableModels = availableModels.filter(id => !exclude.includes(id))
    }

    // Convert to ModelConfig
    const models = availableModels.map(id => createOpenCodeModel(id, { timeout: defaultTimeout }))

    // Merge with existing config
    return {
      ...config,
      cliConfig: {
        ...config.cliConfig,
        models: [...(config.cliConfig?.models || []), ...models],
        selectionStrategy: config.cliConfig?.selectionStrategy || selectionStrategy,
      },
    }
  }
}

/**
 * Export individual provider helpers
 */
export const OpenCodeProviders = {
  /** Google models (Gemini, Antigravity) */
  google: () => withOpenCode({ providers: ['google'] }),

  /** Anthropic models (Claude) */
  anthropic: () => withOpenCode({ providers: ['anthropic'] }),

  /** OpenRouter models (many providers) */
  openrouter: () => withOpenCode({ providers: ['openrouter'] }),

  /** GitHub Copilot models */
  githubCopilot: () => withOpenCode({ providers: ['github-copilot'] }),

  /** OpenCode native models */
  opencode: () => withOpenCode({ providers: ['opencode'] }),

  /** Cerebras models */
  cerebras: () => withOpenCode({ providers: ['cerebras'] }),

  /** ZAI models */
  zai: () => withOpenCode({ providers: ['zai-coding-plan'] }),

  /** All free models (OpenRouter free tier + others) */
  freeModels: () =>
    withOpenCode({
      autoDiscover: true,
      // Filter logic to be implemented based on model naming conventions
    }),
}

export default withOpenCode

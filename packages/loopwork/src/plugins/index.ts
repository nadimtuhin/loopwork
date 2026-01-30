/**
 * Plugin System
 *
 * Config wrappers and plugin utilities
 */

import type {
  LoopworkConfig,
  LoopworkPlugin,
  ConfigWrapper,
} from '../contracts'
import { DEFAULT_CONFIG } from '../contracts'
import { withJSONBackend, withGitHubBackend } from '../backends/plugin'
import { logger } from '../core/utils'

// ============================================================================
// Re-exports from backends
// ============================================================================

export { withJSONBackend, withGitHubBackend }

// ============================================================================
// Re-exports from bundled plugins
// ============================================================================

export { createClaudeCodePlugin, withClaudeCode } from './claude-code'
export { createIPCPlugin, withIPC } from './ipc'
export { createAIMonitor, withAIMonitor } from '../ai-monitor'
export type { IPCMessage, IPCEventType, IPCPluginOptions } from './ipc'

// CLI configuration plugins
export {
  withCli,
  withModels,
  withRetry,
  withCliPaths,
  withSelectionStrategy,
  createModel,
  ModelPresets,
  RetryPresets,
} from './cli'
export type { WithCliOptions, WithModelsOptions } from './cli'

// ============================================================================
// Config Helpers
// ============================================================================

/**
 * Define a type-safe config
 */
export function defineConfig(config: LoopworkConfig): LoopworkConfig {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    plugins: config.plugins || [],
  }
}

/**
 * Define async/dynamic config
 */
export function defineConfigAsync(
  fn: () => Promise<LoopworkConfig> | LoopworkConfig
): () => Promise<LoopworkConfig> {
  return async () => {
    const config = await fn()
    return defineConfig(config)
  }
}

/**
 * Compose multiple wrappers
 *
 * @example
 * export default compose(
 *   withPlugin(myPlugin),
 *   withJSONBackend(),
 * )(defineConfig({ ... }))
 */
export function compose(...wrappers: ConfigWrapper[]): ConfigWrapper {
  return (config) => wrappers.reduce((cfg, wrapper) => wrapper(cfg), config)
}

// ============================================================================
// Plugin Wrappers
// ============================================================================

/**
 * Add a custom plugin
 */
export function withPlugin(plugin: LoopworkPlugin): ConfigWrapper {
  return (config) => ({
    ...config,
    plugins: [...(config.plugins || []), plugin],
  })
}

// ============================================================================
// Plugin Registry
// ============================================================================

class PluginRegistry {
  private plugins: LoopworkPlugin[] = []

  register(plugin: LoopworkPlugin): void {
    const existing = this.plugins.findIndex((p) => p.name === plugin.name)
    if (existing >= 0) {
      this.plugins[existing] = plugin
    } else {
      this.plugins.push(plugin)
    }
  }

  unregister(name: string): void {
    this.plugins = this.plugins.filter((p) => p.name !== name)
  }

  getAll(): LoopworkPlugin[] {
    return [...this.plugins]
  }

  get(name: string): LoopworkPlugin | undefined {
    return this.plugins.find((p) => p.name === name)
  }

  clear(): void {
    this.plugins = []
  }

  /**
   * Run a lifecycle hook on all registered plugins
   */
  async runHook(hookName: keyof LoopworkPlugin, ...args: unknown[]): Promise<void> {
    for (const plugin of this.plugins) {
      const hook = plugin[hookName]
      if (typeof hook === 'function') {
        try {
          await (hook as Function).apply(plugin, args)
        } catch (error) {
          logger.error(`Plugin ${plugin.name} error in ${hookName}: ${error}`)
        }
      }
    }
  }
}

export const plugins = new PluginRegistry()

// ============================================================================
// Re-exports
// ============================================================================

export type { LoopworkPlugin, ConfigWrapper } from '../contracts'
export { DEFAULT_CONFIG as defaults } from '../contracts'

/**
 * Plugin System
 *
 * Config wrappers and plugin utilities
 */

import type {
  LoopworkConfig,
  LoopworkPlugin,
  ConfigWrapper,
  CapabilityRegistry,
} from '../contracts'
import { DEFAULT_CONFIG } from '../contracts'
import { withJSONBackend, withGitHubBackend } from '../backends/plugin'
import { logger } from '../core/utils'
import { createCapabilityRegistry } from '../core/capability-registry'

// ============================================================================
// Re-exports from backends
// ============================================================================

export { withJSONBackend, withGitHubBackend }

// ============================================================================
// Re-exports from bundled plugins
// ============================================================================

export { createClaudeCodePlugin, withClaudeCode } from './claude-code'
export { createIPCPlugin, withIPC } from './ipc'
export { createAIMonitor, withAIMonitor } from '@loopwork-ai/ai-monitor'
export { createDynamicTasksPlugin, withDynamicTasks } from './dynamic-tasks'
export { createRollbackPlugin, withRollback } from './rollback'
export {
  createDocumentationPlugin,
  withDocumentation,
  withChangelogOnly,
  withFullDocumentation,
} from './documentation'
export type { DocumentationPluginConfig } from './documentation'
export {
  createSmartTasksPlugin,
  withSmartTasks,
  withSmartTasksConservative,
  withSmartTasksAggressive,
  withSmartTestTasks,
} from './smart-tasks'
export type { SmartTasksConfig } from './smart-tasks'
export {
  createTaskRecoveryPlugin,
  withTaskRecovery,
  withAutoRecovery,
  withConservativeRecovery,
} from './task-recovery'
export type { TaskRecoveryConfig } from './task-recovery'
export { createChaosPlugin, withChaos } from './chaos'
export { withSafety } from './safety'
export { withFeatureFlags } from './feature-flags'
export { withAgents } from './agents'
export { createGitAutoCommitPlugin, withGitAutoCommit } from './git-autocommit'
export {
  createGovernancePlugin,
  withGovernance,
  GovernanceError,
  PolicyEngine,
} from '@loopwork-ai/governance'
export type {
  GovernanceConfig,
  PolicyRule,
  PolicyAction,
  PolicyResult,
  PolicyRules,
} from '@loopwork-ai/governance'

export type { IPCMessage, IPCEventType, IPCPluginOptions } from './ipc'
export type { DynamicTasksOptions } from './dynamic-tasks'
export type { RollbackPluginOptions } from './rollback'
export type { GitAutoCommitOptions } from './git-autocommit'

// Embedding and Vector Store plugins
export {
  OpenAIEmbeddingProvider,
  createOpenAIEmbeddingProvider,
} from './openai-embedding'
export {
  GeminiEmbeddingProvider,
  createGeminiEmbeddingProvider,
} from './gemini-embedding'
export {
  createEmbeddingProvider,
  createVectorStore,
  withEmbeddings,
  withVectorStore,
  withEmbeddingAndVectorStore,
} from './embeddings'

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
  private disabledPlugins: Set<string> = new Set()
  private pluginFailureCount: Map<string, number> = new Map()
  private capabilityRegistry: CapabilityRegistry = createCapabilityRegistry()
  private readonly MAX_FAILURES = 3

  register(plugin: LoopworkPlugin): void {
    // Set default classification if missing
    if (!plugin.classification) {
      Object.defineProperty(plugin, 'classification', {
        value: plugin.essential === true ? 'critical' : 'enhancement',
        writable: false,
        enumerable: true,
        configurable: true
      })
    }

    const existing = this.plugins.findIndex((p) => p.name === plugin.name)
    if (existing >= 0) {
      this.plugins[existing] = plugin
    } else {
      this.plugins.push(plugin)
    }

    // Register plugin capabilities if provided
    this.registerCapabilities(plugin)
  }

  /**
   * Register capabilities from a plugin
   */
  private registerCapabilities(plugin: LoopworkPlugin): void {
    try {
      // Handle capabilities property (preferred method)
      if (plugin.capabilities) {
        const capabilities = typeof plugin.capabilities === 'function'
          ? plugin.capabilities()
          : plugin.capabilities

        this.capabilityRegistry.register(plugin.name, capabilities)
      }

      // Handle registerCapabilities method (deprecated but still supported)
      if (typeof plugin.registerCapabilities === 'function') {
        plugin.registerCapabilities(this.capabilityRegistry)
      }
    } catch (error) {
      logger.error(`Failed to register capabilities for plugin ${plugin.name}: ${error}`)
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
    this.disabledPlugins.clear()
    this.pluginFailureCount.clear()
  }

  /**
   * Manually disable a plugin
   */
  disable(name: string): void {
    this.disabledPlugins.add(name)
  }

  /**
   * Manually enable a disabled plugin
   */
  enable(name: string): void {
    this.disabledPlugins.delete(name)
    this.pluginFailureCount.delete(name)
  }

  /**
   * Check if a plugin should be skipped
   */
  private shouldSkipPlugin(
    plugin: LoopworkPlugin,
    hookName: keyof LoopworkPlugin,
    flags?: import('../contracts/config').FeatureFlags
  ): boolean {
    // Always skip manually disabled plugins
    if (this.disabledPlugins.has(plugin.name)) {
      return true
    }

    // Critical/Essential plugins are never skipped
    const isCritical = plugin.classification === 'critical' || plugin.essential === true
    if (isCritical) {
      return false
    }

    // In reduced functionality mode, skip non-essential plugins for non-critical hooks
    if (flags?.reducedFunctionality) {
      const nonCriticalHooks: Array<keyof LoopworkPlugin> = [
        'onConfigLoad',
        'onTaskComplete',
        'onTaskFailed',
        'onLoopEnd',
        'onTaskStart',
        'onBackendReady',
        'onLoopStart',
      ]
      if (nonCriticalHooks.includes(hookName)) {
        return true
      }
    }

    // In offline mode, skip plugins that require network
    if (flags?.offlineMode && plugin.requiresNetwork) {
      return true
    }

    return false
  }

  /**
   * Record a plugin failure and auto-disable if threshold exceeded
   */
  private recordFailure(pluginName: string): void {
    const currentCount = this.pluginFailureCount.get(pluginName) || 0
    const newCount = currentCount + 1
    this.pluginFailureCount.set(pluginName, newCount)

    if (newCount >= this.MAX_FAILURES) {
      this.disabledPlugins.add(pluginName)
      logger.warn(
        `Plugin ${pluginName} has failed ${this.MAX_FAILURES} times and has been automatically disabled`
      )
    }
  }

  /**
   * Run a lifecycle hook on all registered plugins
   */
  async runHook(hookName: keyof LoopworkPlugin, ...args: unknown[]): Promise<void> {
    // Extract flags from context if available
    let flags: import('../contracts/config').FeatureFlags | undefined
    for (const arg of args) {
      if (typeof arg === 'object' && arg !== null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyArg = arg as any
        flags = anyArg.flags || anyArg.config?.flags
        if (flags) break
      }
    }

    for (const plugin of this.plugins) {
      // Check if plugin should be skipped
      if (this.shouldSkipPlugin(plugin, hookName, flags)) {
        logger.debug(`Skipping plugin ${plugin.name} for ${hookName} (disabled or reduced mode)`)
        continue
      }

      const hook = plugin[hookName]
      if (typeof hook === 'function') {
        try {
          await (hook as Function).apply(plugin, args)
        } catch (error) {
          const isCritical = plugin.classification === 'critical' || plugin.essential === true
          
          // Record failure for non-essential plugins
          if (!isCritical) {
            this.recordFailure(plugin.name)
          }

          // Interceptor hooks should bubble up errors to stop execution
          // (e.g. Chaos injection, Governance block)
          if (isCritical && (hookName === 'onTaskStart' || hookName === 'onBackendReady')) {
            throw error
          }
          logger.error(`Plugin ${plugin.name} error in ${hookName}: ${error}`)
        }
      }
    }
  }

  /**
   * Apply onConfigLoad hook to a config, threading it through all plugins.
   * This is a special hook that can modify the configuration.
   */
  async applyConfigHooks(config: LoopworkConfig): Promise<LoopworkConfig> {
    let currentConfig = config
    const flags = currentConfig.flags

    for (const plugin of this.plugins) {
      // Respect reduced functionality mode for config loading too
      if (this.shouldSkipPlugin(plugin, 'onConfigLoad', flags)) {
        continue
      }

      if (typeof plugin.onConfigLoad === 'function') {
        try {
          const result = await plugin.onConfigLoad(currentConfig)
          if (result) {
            currentConfig = result
          }
        } catch (error) {
          const isCritical = plugin.classification === 'critical' || plugin.essential === true
          
          if (!isCritical) {
            this.recordFailure(plugin.name)
          }

          if (isCritical) {
            throw error
          }
          logger.error(`Plugin ${plugin.name} error in onConfigLoad: ${error}`)
        }
      }
    }
    return currentConfig
  }

  /**
   * Get list of currently disabled plugins
   */
  getDisabledPlugins(): string[] {
    return Array.from(this.disabledPlugins)
  }

  /**
   * Get failure count for a specific plugin
   */
  getFailureCount(name: string): number {
    return this.pluginFailureCount.get(name) || 0
  }

  /**
   * Get a status report of disabled plugins with reasons
   */
  getDisabledPluginsReport(): Array<{ name: string; reason: 'auto-disabled' | 'manually-disabled' }> {
    const report: Array<{ name: string; reason: 'auto-disabled' | 'manually-disabled' }> = []

    for (const disabledName of this.disabledPlugins) {
      const failureCount = this.pluginFailureCount.get(disabledName) || 0
      const reason = failureCount >= this.MAX_FAILURES ? 'auto-disabled' : 'manually-disabled'
      report.push({ name: disabledName, reason })
    }

    return report
  }

  /**
   * Get names of auto-disabled plugins (failed threshold exceeded)
   */
  getAutoDisabledPlugins(): string[] {
    const autoDisabled: string[] = []

    for (const pluginName of this.disabledPlugins) {
      const failureCount = this.pluginFailureCount.get(pluginName) || 0
      if (failureCount >= this.MAX_FAILURES) {
        autoDisabled.push(pluginName)
      }
    }

    return autoDisabled
  }

  /**
   * Check if the system is running in degraded mode
   */
  isDegradedMode(flags?: import('../contracts/config').FeatureFlags): boolean {
    return (
      (flags?.reducedFunctionality ?? false) ||
      this.getDisabledPlugins().length > 0
    )
  }

  /**
   * Get list of currently active (non-disabled) plugin names
   */
  getActivePlugins(): string[] {
    return this.plugins
      .filter((p) => !this.disabledPlugins.has(p.name))
      .map((p) => p.name)
  }

  /**
   * Get detailed report of active plugins
   */
  getActivePluginsReport(): Array<{
    name: string
    classification: 'critical' | 'enhancement'
    requiresNetwork: boolean
  }> {
    return this.plugins
      .filter((p) => !this.disabledPlugins.has(p.name))
      .map((p) => ({
        name: p.name,
        classification: (p.classification === 'critical' || p.essential === true) ? 'critical' : 'enhancement',
        requiresNetwork: p.requiresNetwork ?? false,
      }))
  }

  /**
   * Get the capability registry for managing plugin capabilities
   */
  getCapabilityRegistry(): CapabilityRegistry {
    return this.capabilityRegistry
  }
}

export const plugins = new PluginRegistry()

// ============================================================================
// Re-exports
// ============================================================================

export type { LoopworkPlugin, ConfigWrapper } from '../contracts'
export type { CliCommand, AiSkill, PluginCapabilities, CapabilityRegistry } from '../contracts/capability'
export { DEFAULT_CONFIG as defaults } from '../contracts'
export { createCapabilityRegistry } from '../core/capability-registry'

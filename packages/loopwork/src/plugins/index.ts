import type {
  LoopworkConfig,
  LoopworkPlugin,
  ConfigWrapper,
  CapabilityRegistry,
} from '../contracts'
import { withJSONBackend, withGitHubBackend } from '../backends/plugin'
import { logger } from '../core/utils'
import { createCapabilityRegistry } from '../core/capability-registry'

export { withJSONBackend, withGitHubBackend }

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
  createTaskRecoveryPlugin,
  withTaskRecovery,
  withAutoRecovery,
  withConservativeRecovery,
} from './task-recovery'
export type { TaskRecoveryConfig } from './task-recovery'
export {
  withSmartTasks,
  withSmartTasksConservative,
  withSmartTasksAggressive,
  withSmartTestTasks,
  createSmartTasksPlugin,
} from '@loopwork-ai/plugin-smart-tasks'
export type { SmartTasksConfig } from '@loopwork-ai/plugin-smart-tasks'
export { createChaosPlugin, withChaos } from './chaos'
export { withSafety } from './safety'
export { withFeatureFlags } from './feature-flags'
export { withAgents } from './agents'
export { createGitAutoCommitPlugin, withGitAutoCommit } from '@loopwork-ai/plugin-git-autocommit'
export { createProjectSummaryPlugin, withProjectSummary } from './project-summary'
export { createSystemMonitoringPlugin, withSystemMonitoring } from '@loopwork-ai/proactive-health-monitoring'
export { createTelemetryPlugin, withTelemetry } from './telemetry'
export { createDebuggerPlugin, withDebugger } from './debugger'
export { withDynamicPlugins } from './loader'
export type { DebuggerConfig } from './debugger'
export {
  createGovernancePlugin,
  withGovernance,
  GovernanceError,
  PolicyEngine,
} from '@loopwork-ai/governance'

export type {
  PolicyRule,
  PolicyAction,
  PolicyResult,
  GovernanceConfig,
  PolicyRules,
} from '@loopwork-ai/governance'

export {
  createAuditLoggingPlugin,
  withAuditLogging,
  AuditLogManager,
} from '@loopwork-ai/governance'

export type {
  AuditConfig,
  AuditEvent,
} from '@loopwork-ai/governance'

export {
  createAuditQueryManager,
  queryAuditLogs,
  exportAuditLogs,
} from '@loopwork-ai/governance'

export type {
  AuditQuery,
  AuditExportOptions,
  AuditReport,
} from '@loopwork-ai/governance'

export type { IPCMessage, IPCEventType, IPCPluginOptions } from './ipc'
export type { SystemMonitoringOptions } from '@loopwork-ai/proactive-health-monitoring'
export type { DynamicTasksOptions } from './dynamic-tasks'
export type { RollbackPluginOptions } from './rollback'
export type { GitAutoCommitOptions } from '@loopwork-ai/plugin-git-autocommit'
export type { ProjectSummaryConfig } from './project-summary'
export {
  withAnalyzerConfig,
  withGLMAnalyzer,
  withZaiGLM47,
  withOpenCodeGLM47,
  createErrorAnalyzerFromConfig,
  configureAnalyzer,
} from './analyzer-config'
export type { AnalyzerConfigOptions } from './analyzer-config'

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
  type EmbeddingPluginOptions,
  type VectorStorePluginOptions,
} from './embeddings'

export {
  createSemanticCodeIndexerPlugin,
  withSemanticCodeIndexer,
  getSemanticCodeIndexer,
  type SemanticIndexerPluginOptions,
  type CodeIndexState,
} from './semantic-indexer'

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

export {
  defineConfig,
  defineConfigAsync,
  compose,
  withPlugin,
  DEFAULT_CONFIG,
} from '@loopwork-ai/config-engine'

import { LoopworkRunner } from '../core/runner'

class PluginRegistry {
  private plugins: LoopworkPlugin[] = []
  private disabledPlugins: Set<string> = new Set()
  private pluginFailureCount: Map<string, number> = new Map()
  private capabilityRegistry: CapabilityRegistry = createCapabilityRegistry()
  private readonly MAX_FAILURES = 3
  private runner: LoopworkRunner = new LoopworkRunner()

  register(plugin: LoopworkPlugin): void {
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

    this.registerCapabilities(plugin)
    this.runner.registerPlugin(plugin as any)
  }

  private registerCapabilities(plugin: LoopworkPlugin): void {
    try {
      if (plugin.capabilities) {
        const capabilities = typeof plugin.capabilities === 'function'
          ? plugin.capabilities()
          : plugin.capabilities

        this.capabilityRegistry.register(plugin.name, capabilities)
      }

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

  disable(name: string): void {
    this.disabledPlugins.add(name)
    this.runner.disablePlugin(name)
  }

  enable(name: string): void {
    this.disabledPlugins.delete(name)
    this.pluginFailureCount.delete(name)
    this.runner.enablePlugin(name)
  }

  async runHook(hookName: keyof LoopworkPlugin, ...args: unknown[]): Promise<void> {
    await this.runner.runHook(hookName as string, ...args)
  }

  async applyConfigHooks(config: LoopworkConfig): Promise<LoopworkConfig> {
    return await this.runner.applyConfigHooks(config)
  }

  clear(): void {
    this.plugins = []
    this.disabledPlugins.clear()
    this.pluginFailureCount.clear()
    this.runner = new LoopworkRunner()
  }

  getDisabledPlugins(): string[] {
    return Array.from(this.disabledPlugins)
  }

  getFailureCount(name: string): number {
    return this.pluginFailureCount.get(name) || 0
  }

  getDisabledPluginsReport(): Array<{ name: string; reason: 'auto-disabled' | 'manually-disabled' }> {
    const report: Array<{ name: string; reason: 'auto-disabled' | 'manually-disabled' }> = []

    for (const disabledName of this.disabledPlugins) {
      const failureCount = this.pluginFailureCount.get(disabledName) || 0
      const reason = failureCount >= this.MAX_FAILURES ? 'auto-disabled' : 'manually-disabled'
      report.push({ name: disabledName, reason })
    }

    return report
  }

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

  isDegradedMode(flags?: import('../contracts/config').FeatureFlags): boolean {
    return (
      (flags?.reducedFunctionality ?? false) ||
      this.getDisabledPlugins().length > 0
    )
  }

  getActivePlugins(): string[] {
    return this.plugins
      .filter((p) => !this.disabledPlugins.has(p.name))
      .map((p) => p.name)
  }

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

  getCapabilityRegistry(): CapabilityRegistry {
    return this.capabilityRegistry
  }
}

export const plugins = new PluginRegistry()

export type { LoopworkPlugin, ConfigWrapper } from '../contracts'
export type { CliCommand, AiSkill, PluginCapabilities, CapabilityRegistry } from '../contracts/capability'
export { DEFAULT_CONFIG as defaults } from '../contracts'
export { createCapabilityRegistry } from '../core/capability-registry'


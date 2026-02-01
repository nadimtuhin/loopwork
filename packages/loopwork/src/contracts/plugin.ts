/**
 * Plugin Interface Contract
 */

import type {
  Task,
  SchedulingMetadata,
  TaskMetadata,
  PluginTaskResult,
  LoopStats,
  StepEvent,
  ToolCallEvent,
  AgentResponseEvent,
  CliResultEvent,
  FeatureFlags,
  TaskBackend,
} from './types'
import type { PluginCapabilities, CapabilityRegistry } from './capability'
import type { RetryPolicy } from '../core/retry'

/**
 * Forward reference to LoopworkConfig to avoid circular dependency
 * The actual type is imported dynamically where needed
 */
export interface PluginContext {
  task: PluginTask
  config: unknown
  namespace: string
  iteration: number
  flags?: FeatureFlags
}

/**
 * Task object passed to plugin hooks
 */
export interface PluginTask {
  id: string
  title: string
  metadata?: TaskMetadata
}

/**
 * Task context for execution
 */
export interface TaskContext {
  task: Task
  config: unknown
  iteration: number
  startTime: Date
  namespace: string
  flags?: FeatureFlags
  permissions?: Record<string, string>
  retryAttempt?: number
  retryPolicy?: RetryPolicy
  lastError?: string
  getPluginState?: <T = unknown>(pluginName: string) => T | null
  setPluginState?: <T = unknown>(pluginName: string, state: T) => void
  /**
   * CLI tool being used for this task (e.g., 'claude', 'opencode', 'gemini')
   */
  cli?: string
  /**
   * Model being used for this task (e.g., 'claude-sonnet-4-5', 'gpt-4')
   */
  model?: string
  /**
   * Display name for the CLI/model combination
   */
  modelDisplayName?: string
  /**
   * Worker ID for parallel execution (0, 1, 2, etc.)
   */
  workerId?: number
}

export type LoopworkContext = TaskContext

/**
 * Plugin interface - implement to extend Loopwork
 */
export interface LoopworkPlugin {
  readonly name: string
  readonly classification?: 'critical' | 'enhancement'
  readonly essential?: boolean
  readonly requiresNetwork?: boolean
  readonly capabilities?: PluginCapabilities | (() => PluginCapabilities)
  registerCapabilities?: (registry: CapabilityRegistry) => void | Promise<void>
  onConfigLoad?: (config: unknown) => unknown | Promise<unknown>
  onBackendReady?: (backend: TaskBackend) => void | Promise<void>
  onLoopStart?: (namespace: string) => void | Promise<void>
  onLoopEnd?: (stats: LoopStats) => void | Promise<void>
  onTaskStart?: (context: TaskContext) => void | Promise<void>
  onTaskComplete?: (context: TaskContext, result: PluginTaskResult) => void | Promise<void>
  onTaskFailed?: (context: TaskContext, error: string) => void | Promise<void>
  onTaskQuarantined?: (context: TaskContext, reason: string) => void | Promise<void>
  onTaskRetry?: (context: TaskContext, error: string) => void | Promise<void>
  onTaskAbort?: (context: TaskContext) => void | Promise<void>
  onStep?: (event: StepEvent) => void | Promise<void>
  onToolCall?: (event: ToolCallEvent) => void | Promise<void>
  onAgentResponse?: (event: AgentResponseEvent) => void | Promise<void>
  onCliResult?: (event: CliResultEvent) => void | Promise<void>
}

export type { SchedulingMetadata, TaskMetadata, PluginTaskResult, LoopStats, StepEvent, ToolCallEvent, AgentResponseEvent, CliResultEvent }

/**
 * Config wrapper function type
 */
export type ConfigWrapper = (config: unknown) => unknown

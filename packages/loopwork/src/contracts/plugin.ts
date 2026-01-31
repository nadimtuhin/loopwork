/**
 * Plugin Interface Contract
 */

import type { LoopworkConfig } from './config'
import type { Task } from './task'
import type { TaskBackend } from './backend'

/**
 * Task metadata for external integrations
 */
export interface TaskMetadata {
  asanaGid?: string
  everhourId?: string
  todoistId?: string
  [key: string]: unknown
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
 * Context passed to plugin hooks
 */
export interface PluginContext {
  task: PluginTask
  config: LoopworkConfig
  namespace: string
  iteration: number
  flags?: import('./config').FeatureFlags
}

/**
 * Task context for execution
 */
export interface TaskContext {
  task: Task
  config: import('./config').LoopworkConfig
  iteration: number
  startTime: Date
  namespace: string
  flags?: import('./config').FeatureFlags
  /** Dynamic permission flags for CLI tools */
  permissions?: Record<string, string>
  /** Current retry attempt (0 = first attempt) */
  retryAttempt?: number
  /** Active retry policy for this task */
  retryPolicy?: import('../core/retry').RetryPolicy
  /** Last error that triggered retry */
  lastError?: string
  /** Get plugin-specific state */
  getPluginState?: <T = unknown>(pluginName: string) => T | null
  /** Set plugin-specific state */
  setPluginState?: <T = unknown>(pluginName: string, state: T) => void
}

/**
 * Alias for TaskContext, used in loop execution
 */
export type LoopworkContext = TaskContext

/**
 * Result passed to onTaskComplete
 */
export interface PluginTaskResult {
  duration: number
  success: boolean
  output?: string
}

/**
 * Loop statistics passed to onLoopEnd
 */
export interface LoopStats {
  completed: number
  failed: number
  duration: number
  /** Whether the loop ran in reduced functionality or degraded mode */
  isDegraded?: boolean
  /** List of plugins that were automatically or manually disabled during the run */
  disabledPlugins?: string[]
}

/**
 * Execution step event passed to onStep
 */
export interface StepEvent {
  /** Step identifier (e.g., 'cli_execution', 'output_parsing', 'task_processing') */
  stepId: string
  /** Human-readable step description */
  description: string
  /** Step phase: 'start' or 'end' */
  phase: 'start' | 'end'
  /** Execution duration in milliseconds (only populated on 'end' phase) */
  durationMs?: number
  /** Additional context data */
  context?: Record<string, unknown>
}

/**
 * Tool call event passed to onToolCall
 */
export interface ToolCallEvent {
  /** Name of the tool being called */
  toolName: string
  /** Arguments passed to the tool */
  arguments: Record<string, unknown>
  /** Task ID if available */
  taskId?: string
  /** Timestamp of the call */
  timestamp: number
  /** Additional metadata */
  metadata?: Record<string, unknown>
}

/**
 * Agent response event passed to onAgentResponse
 */
export interface AgentResponseEvent {
  /** Response text from the AI agent */
  responseText: string
  /** Model/CLI that generated the response */
  model?: string
  /** Task ID if available */
  taskId?: string
  /** Timestamp of the response */
  timestamp: number
  /** Whether response is partial or complete */
  isPartial?: boolean
  /** Additional metadata */
  metadata?: Record<string, unknown>
}

/**
 * Plugin interface - implement to extend Loopwork
 */
export interface LoopworkPlugin {
  /** Unique plugin name */
  readonly name: string

  /**
   * Plugin classification
   * - 'critical': Core plugins required for task execution (task backends)
   * - 'enhancement': Optional plugins that enhance functionality (notifications, analytics)
   * @default 'enhancement'
   */
  readonly classification?: 'critical' | 'enhancement'

  /**
   * Whether this plugin is essential (alias for classification === 'critical')
   * @deprecated use classification instead
   */
  readonly essential?: boolean

  /**
   * Whether this plugin requires network connectivity
   * @default false
   */
  readonly requiresNetwork?: boolean

  /**
   * Capabilities (commands and skills) provided by this plugin
   * Can be a static object or a function that returns capabilities
   */
  readonly capabilities?: import('./capability').PluginCapabilities | (() => import('./capability').PluginCapabilities)

  /**
   * Register custom CLI commands and AI skills
   * Called during plugin initialization to register capabilities
   * @deprecated Use `capabilities` property instead
   */
  registerCapabilities?: (registry: import('./capability').CapabilityRegistry) => void | Promise<void>

  /** Called when config is loaded */
  onConfigLoad?: (config: LoopworkConfig) => LoopworkConfig | Promise<LoopworkConfig>

  /** Called when backend is initialized */
  onBackendReady?: (backend: TaskBackend) => void | Promise<void>

  /** Called when loop starts */
  onLoopStart?: (namespace: string) => void | Promise<void>

  /** Called when loop ends */
  onLoopEnd?: (stats: LoopStats) => void | Promise<void>

  /** Called when task starts */
  onTaskStart?: (context: TaskContext) => void | Promise<void>

  /** Called when task completes */
  onTaskComplete?: (context: TaskContext, result: PluginTaskResult) => void | Promise<void>

  /** Called when task fails */
  onTaskFailed?: (context: TaskContext, error: string) => void | Promise<void>

  /** Called at execution loop steps for fine-grained monitoring */
  onStep?: (event: StepEvent) => void | Promise<void>

  /** Called when AI tools are invoked */
  onToolCall?: (event: ToolCallEvent) => void | Promise<void>

  onAgentResponse?: (event: AgentResponseEvent) => void | Promise<void>

  onCliResult?: (event: CliResultEvent) => void | Promise<void>
}

export interface CliResultEvent {
  taskId?: string
  model: string
  cli: string
  exitCode: number
  durationMs: number
  output: string
  timedOut: boolean
  iteration?: number
}

/**
 * Config wrapper function type
 */
export type ConfigWrapper = (config: LoopworkConfig) => LoopworkConfig

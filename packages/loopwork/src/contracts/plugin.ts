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
}

/**
 * Task context for execution
 */
export interface TaskContext {
  task: Task
  iteration: number
  startTime: Date
  namespace: string
}

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
}

/**
 * Plugin interface - implement to extend Loopwork
 */
export interface LoopworkPlugin {
  /** Unique plugin name */
  readonly name: string

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
}

/**
 * Config wrapper function type
 */
export type ConfigWrapper = (config: LoopworkConfig) => LoopworkConfig

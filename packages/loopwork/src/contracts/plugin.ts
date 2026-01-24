/**
 * Plugin Interface Contract
 */

import type { LoopworkConfig } from './config'

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
 * Result passed to onTaskComplete
 */
export interface PluginTaskResult {
  duration: number
  success: boolean
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
  name: string

  /** Called when config is loaded */
  onConfigLoad?: (config: LoopworkConfig) => LoopworkConfig | Promise<LoopworkConfig>

  /** Called when loop starts */
  onLoopStart?: (namespace: string) => void | Promise<void>

  /** Called when loop ends */
  onLoopEnd?: (stats: LoopStats) => void | Promise<void>

  /** Called when task starts */
  onTaskStart?: (task: PluginTask) => void | Promise<void>

  /** Called when task completes */
  onTaskComplete?: (task: PluginTask, result: PluginTaskResult) => void | Promise<void>

  /** Called when task fails */
  onTaskFailed?: (task: PluginTask, error: string) => void | Promise<void>
}

/**
 * Config wrapper function type
 */
export type ConfigWrapper = (config: LoopworkConfig) => LoopworkConfig

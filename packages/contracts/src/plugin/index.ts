/**
 * Plugin Registry Interface
 *
 * Defines the contract for managing plugins and their lifecycle hooks.
 * Plugins extend Loopwork's functionality through a composable architecture.
 */
export interface IPluginRegistry {
  /**
   * Execute a specific hook across all registered plugins.
   * @param hookName - Name of the hook to execute (e.g., 'onLoopStart', 'onTaskComplete')
   * @param data - Data to pass to the hook handler
   * @returns Promise resolving when all hooks complete
   */
  runHook(hookName: string, data: any): Promise<void>

  /**
   * Retrieve the capability registry for prompt injection.
   * @returns Capability registry instance
   */
  getCapabilityRegistry(): import('../capability').ICapabilityRegistry

  /**
   * Determine if the system is operating in degraded mode.
   * @param flags - Optional flags to check for specific degraded conditions
   * @returns True if degraded mode is active
   */
  isDegradedMode(flags?: { [key: string]: boolean | undefined }): boolean

  /**
   * Generate a report of all currently disabled plugins.
   * @returns Array of disabled plugin information with names and reasons
   */
  getDisabledPluginsReport(): Array<{ name: string; reason: 'auto-disabled' | 'manually-disabled' }>

  /**
   * Generate a report of all active plugins.
   * @returns Array of active plugin details including classification and network requirements
   */
  getActivePluginsReport(): Array<{ name: string; classification: 'critical' | 'enhancement'; requiresNetwork: boolean }>

  /**
   * Get list of all disabled plugin names.
   * @returns Array of disabled plugin names
   */
  getDisabledPlugins(): string[]
}

/**
 * Task context for execution
 */
export interface TaskContext {
  task: any
  config: unknown
  iteration: number
  startTime: Date
  namespace: string
  flags?: any
  permissions?: Record<string, string>
  retryAttempt?: number
  retryPolicy?: any
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

/**
 * Result of a task execution passed to plugins
 */
export interface PluginTaskResult {
  duration: number
  success: boolean
  output?: string
  exitCode?: number
  error?: string
  [key: string]: any
}

/**
 * Statistics for a task loop
 */
export interface LoopStats {
  completed: number
  failed: number
  total: number
  duration?: number
}

/**
 * Base interface for all Loopwork plugins.
 *
 * Plugins are the primary extension mechanism for Loopwork. They can hook into
 * various lifecycle events and modify configuration at runtime.
 */
export interface LoopworkPlugin {
  /** Unique identifier for the plugin */
  readonly name: string

  /** Classification of the plugin for prioritization */
  readonly classification?: 'critical' | 'enhancement'

  /** Lifecycle hooks */
  onConfigLoad?: (config: any) => any | Promise<any>
  onBackendReady?: (backend: any) => void | Promise<void>
  onLoopStart?: (namespace: string) => void | Promise<void>
  onLoopEnd?: (stats: LoopStats) => void | Promise<void>
  onTaskStart?: (context: TaskContext) => void | Promise<void>
  onTaskComplete?: (context: TaskContext, result: PluginTaskResult) => void | Promise<void>
  onTaskFailed?: (context: TaskContext, error: string) => void | Promise<void>

  /** Allow arbitrary properties for plugin-specific data */
  [key: string]: any
}

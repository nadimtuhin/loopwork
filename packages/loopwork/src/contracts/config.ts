/**
 * Configuration Types
 */

import type { LoopworkPlugin } from './plugin'
import type { BackendConfig } from './backend'
import type { CliExecutorConfig } from './cli'
import type { TaskAnalyzer } from './analysis'

/**
 * Log levels for controlling output verbosity
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent'

/**
 * Failure mode for parallel execution
 * - 'continue': Keep running other workers on task failure
 * - 'abort-all': Stop all workers when any task fails
 */
export type ParallelFailureMode = 'continue' | 'abort-all'

/**
 * Configuration for automatic orphan process monitoring and cleanup.
 *
 * Orphan processes are child processes spawned by loopwork (e.g., CLI tools,
 * test runners) that persist after their parent process exits abnormally.
 *
 * @example
 * ```typescript
 * orphanWatch: {
 *   enabled: true,
 *   interval: 60000,      // Check every minute
 *   maxAge: 1800000,      // Kill processes older than 30 minutes
 *   autoKill: true,       // Automatically kill confirmed orphans
 *   patterns: ['my-cli'], // Additional process patterns to watch
 * }
 * ```
 */
export interface OrphanWatchConfig {
  /**
   * Enable automatic orphan monitoring
   * @default false
   */
  enabled?: boolean

  /**
   * How often to scan for orphan processes (in milliseconds)
   * @default 60000 (1 minute)
   */
  interval?: number

  /**
   * Only kill orphans older than this age (in milliseconds)
   * Prevents killing recently spawned processes that may still be starting up
   * @default 1800000 (30 minutes)
   */
  maxAge?: number

  /**
   * Automatically kill confirmed orphan processes
   * - true: Kill confirmed orphans automatically
   * - false: Only detect and log orphans (manual cleanup required)
   * @default false
   */
  autoKill?: boolean

  /**
   * Additional process name patterns to watch for orphans.
   * These are added to the default patterns: ['claude', 'opencode', 'bun test', 'tail -f']
   * @default []
   */
  patterns?: string[]
}

/**
 * Main Loopwork configuration
 */
/**
 * Configuration for dynamic task creation
 */
export interface DynamicTasksConfig {
  /**
   * Enable automatic task creation based on analysis
   * @default true
   */
  enabled?: boolean

  /**
   * Task analyzer to use: 'pattern' for pattern-based, 'llm' for LLM-based analysis,
   * or provide a custom TaskAnalyzer instance
   * @default 'pattern'
   */
  analyzer?: 'pattern' | 'llm' | TaskAnalyzer

  /**
   * Create generated tasks as sub-tasks of the completed task
   * @default true
   */
  createSubTasks?: boolean

  /**
   * Maximum number of new tasks to create per task execution
   * @default 5
   */
  maxTasksPerExecution?: number

  /**
   * Automatically create tasks (true) or queue for approval (false)
   * @default true
   */
  autoApprove?: boolean
}

export interface LoopworkConfig {
  // Backend
  backend: BackendConfig

  // CLI settings (legacy - prefer cliConfig for new configs)
  cli?: 'claude' | 'opencode' | 'gemini'
  model?: string

  // Advanced CLI configuration
  cliConfig?: CliExecutorConfig

  // Execution settings
  maxIterations?: number
  timeout?: number
  namespace?: string
  autoConfirm?: boolean
  dryRun?: boolean
  debug?: boolean
  logLevel?: LogLevel

  // Parallel execution settings
  /**
   * Number of parallel workers (1 = sequential mode)
   * Default: 1 (sequential)
   * Recommended: 2-3 for parallel mode
   */
  parallel?: number

  /**
   * How to handle task failures in parallel mode
   * Default: 'continue' (other workers keep running)
   */
  parallelFailureMode?: ParallelFailureMode

  // Task filtering
  feature?: string
  defaultPriority?: number

  // Retry/resilience
  maxRetries?: number
  circuitBreakerThreshold?: number
  taskDelay?: number
  retryDelay?: number

  /**
   * Cooldown delay after self-healing (in milliseconds)
   * Gives APIs time to recover after rate limit detection
   * @default 30000 (30 seconds)
   */
  selfHealingCooldown?: number

  /**
   * Dynamic task creation configuration
   * Automatically generates follow-up tasks based on completed task analysis
   */
  dynamicTasks?: DynamicTasksConfig

  // Registered plugins
  plugins?: LoopworkPlugin[]

  /**
   * Orphan process monitoring configuration
   * Automatically detects and optionally kills orphan processes
   */
  orphanWatch?: OrphanWatchConfig

  [key: string]: unknown
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Partial<LoopworkConfig> = {
  cli: 'claude',
  maxIterations: 50,
  timeout: 600,
  namespace: 'default',
  autoConfirm: false,
  dryRun: false,
  debug: false,
  logLevel: 'info',
  maxRetries: 3,
  circuitBreakerThreshold: 5,
  taskDelay: 2000,
  retryDelay: 3000,
  selfHealingCooldown: 30000, // 30 seconds
  parallel: 1,
  parallelFailureMode: 'continue',
  dynamicTasks: {
    enabled: true,
    analyzer: 'pattern',
    createSubTasks: true,
    maxTasksPerExecution: 5,
    autoApprove: true,
  },
  orphanWatch: {
    enabled: false,
    interval: 60000,       // 1 minute
    maxAge: 1800000,       // 30 minutes
    autoKill: false,
    patterns: [],
  },
}

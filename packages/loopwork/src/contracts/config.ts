/**
 * Configuration Types
 */

import type { LoopworkPlugin } from './plugin'
import type { BackendConfig } from './backend'
import type { CliExecutorConfig } from './cli'
import type {
  LogLevel,
  OutputMode,
  ParallelFailureMode,
  OrphanWatchConfig,
  FeatureFlags,
  DynamicTasksConfig,
} from './types'

export type { TaskAnalyzer } from './analysis'
export type { LogLevel, OutputMode, ParallelFailureMode, OrphanWatchConfig, FeatureFlags, DynamicTasksConfig }

/**
 * Main Loopwork configuration
 */
export interface LoopworkConfig {
  backend: BackendConfig
  cli?: 'claude' | 'opencode' | 'gemini'
  model?: string
  cliConfig?: CliExecutorConfig
  maxIterations?: number
  timeout?: number
  namespace?: string
  autoConfirm?: boolean
  dryRun?: boolean
  debug?: boolean
  logLevel?: LogLevel
  outputMode?: OutputMode
  parallel?: number
  parallelFailureMode?: ParallelFailureMode
  feature?: string
  defaultPriority?: number
  maxRetries?: number
  circuitBreakerThreshold?: number
  taskDelay?: number
  retryDelay?: number
  maxRetryDelay?: number
  backoffMultiplier?: number
  jitter?: boolean
  retryStrategy?: 'linear' | 'exponential'
  selfHealingCooldown?: number
  dynamicTasks?: DynamicTasksConfig
  dynamicPlugins?: string[]
  plugins?: LoopworkPlugin[]
  orphanWatch?: OrphanWatchConfig
  retryBudget?: {
    enabled?: boolean
    maxRetries?: number
    windowMs?: number
  }
  checkpoint?: import('../core/checkpoint-integrator').CheckpointConfig
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
  outputMode: 'human',
  maxRetries: 3,
  circuitBreakerThreshold: 5,
  taskDelay: 2000,
  retryDelay: 3000,
  selfHealingCooldown: 30000,
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
    interval: 60000,
    maxAge: 1800000,
    autoKill: false,
    patterns: [],
  },
}

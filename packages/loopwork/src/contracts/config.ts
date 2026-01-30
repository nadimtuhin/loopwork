/**
 * Configuration Types
 */

import type { LoopworkPlugin } from './plugin'
import type { BackendConfig } from './backend'
import type { CliExecutorConfig } from './cli'

/**
 * Log levels for controlling output verbosity
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent'

/**
 * Main Loopwork configuration
 */
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

  // Task filtering
  feature?: string
  defaultPriority?: number

  // Retry/resilience
  maxRetries?: number
  circuitBreakerThreshold?: number
  taskDelay?: number
  retryDelay?: number

  // Registered plugins
  plugins?: LoopworkPlugin[]

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
}

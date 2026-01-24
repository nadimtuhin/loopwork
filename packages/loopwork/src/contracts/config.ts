/**
 * Configuration Types
 */

import type { LoopworkPlugin } from './plugin'
import type { BackendConfig } from './backend'

/**
 * Main Loopwork configuration
 */
export interface LoopworkConfig {
  // Backend
  backend: BackendConfig

  // CLI settings
  cli?: 'claude' | 'opencode' | 'gemini'
  model?: string

  // Execution settings
  maxIterations?: number
  timeout?: number
  namespace?: string
  autoConfirm?: boolean
  dryRun?: boolean
  debug?: boolean

  // Task filtering
  feature?: string

  // Retry/resilience
  maxRetries?: number
  circuitBreakerThreshold?: number
  taskDelay?: number
  retryDelay?: number

  // Registered plugins
  plugins?: LoopworkPlugin[]

  [key: string]: any
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
  maxRetries: 3,
  circuitBreakerThreshold: 5,
  taskDelay: 2000,
  retryDelay: 3000,
}

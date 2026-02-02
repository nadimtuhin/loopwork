import type { LoopworkPlugin } from '@loopwork-ai/contracts'
import { LoopworkConfig } from './validator'
import { logger } from '@loopwork-ai/common'

// Config wrapper function type
export type ConfigWrapper = (config: LoopworkConfig) => LoopworkConfig

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
  deadletter: {
    enabled: true,
    threshold: 3,
    retryCooldownMs: 60000,
    autoRetry: false,
    autoRetryDelayMs: 3600000,
  },
  orphanWatch: {
    enabled: false,
    interval: 60000,
    maxAge: 1800000,
    autoKill: false,
    patterns: [],
  },
}

/**
 * Define a type-safe config
 */
export function defineConfig(config: LoopworkConfig): LoopworkConfig {
  const merged = {
    ...DEFAULT_CONFIG,
    ...config,
    plugins: config.plugins || [],
  } as LoopworkConfig
  
  return merged
}

/**
 * Define async/dynamic config
 */
export function defineConfigAsync(
  fn: () => Promise<LoopworkConfig> | LoopworkConfig
): () => Promise<LoopworkConfig> {
  return async () => {
    const config = await fn()
    return defineConfig(config)
  }
}

/**
 * Compose multiple wrappers
 */
export function compose(...wrappers: ConfigWrapper[]): ConfigWrapper {
  return (config) => wrappers.reduce((cfg, wrapper) => wrapper(cfg), config)
}

/**
 * Add a custom plugin
 */
export function withPlugin(plugin: LoopworkPlugin): ConfigWrapper {
  return (config) => ({
    ...config,
    plugins: [...(config.plugins || []), plugin],
  })
}

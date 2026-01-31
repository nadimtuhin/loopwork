/**
 * Rollback Plugin
 *
 * Provides task rollback capabilities
 */

import type { LoopworkPlugin, ConfigWrapper } from '../contracts'

export interface RollbackPluginOptions {
  enabled?: boolean
}

export function createRollbackPlugin( _options: RollbackPluginOptions = {}): LoopworkPlugin {
  return {
    name: 'rollback',
    essential: false,
  }
}

export function withRollback( _options: RollbackPluginOptions = {}): ConfigWrapper {
  return (config) => ({
    ...config,
    plugins: [...(config.plugins || []), createRollbackPlugin(_options)],
  })
}

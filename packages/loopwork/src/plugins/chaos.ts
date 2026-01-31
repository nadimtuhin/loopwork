/**
 * Chaos Plugin
 *
 * Provides chaos engineering capabilities for testing
 */

import type { LoopworkPlugin, ConfigWrapper } from '../contracts'

export interface ChaosPluginOptions {
  enabled?: boolean
}

export function createChaosPlugin( _options: ChaosPluginOptions = {}): LoopworkPlugin {
  return {
    name: 'chaos',
    essential: false,
  }
}

export function withChaos( _options: ChaosPluginOptions = {}): ConfigWrapper {
  return (config) => ({
    ...config,
    plugins: [...(config.plugins || []), createChaosPlugin(_options)],
  })
}

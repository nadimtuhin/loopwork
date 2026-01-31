/**
 * Safety Plugin
 *
 * Provides safety checks and constraints
 */

import type { LoopworkPlugin, ConfigWrapper } from '../contracts'

export interface SafetyPluginOptions {
  enabled?: boolean
}

export function createSafetyPlugin( _options: SafetyPluginOptions = {}): LoopworkPlugin {
  return {
    name: 'safety',
    essential: false,
  }
}

export function withSafety( _options: SafetyPluginOptions = {}): ConfigWrapper {
  return (config) => ({
    ...config,
    plugins: [...(config.plugins || []), createSafetyPlugin(_options)],
  })
}

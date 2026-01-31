/**
 * Feature Flags Plugin
 *
 * Provides feature flag management
 */

import type { LoopworkPlugin, ConfigWrapper } from '../contracts'

export interface FeatureFlagsOptions {
  enabled?: boolean
}

export function createFeatureFlagsPlugin( _options: FeatureFlagsOptions = {}): LoopworkPlugin {
  return {
    name: 'feature-flags',
    essential: false,
  }
}

export function withFeatureFlags( _options: FeatureFlagsOptions = {}): ConfigWrapper {
  return (config) => ({
    ...config,
    plugins: [...(config.plugins || []), createFeatureFlagsPlugin(_options)],
  })
}

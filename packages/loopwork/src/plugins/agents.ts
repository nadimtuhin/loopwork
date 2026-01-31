/**
 * Agents Plugin
 *
 * Provides AI agent management
 */

import type { LoopworkPlugin, ConfigWrapper } from '../contracts'

export interface AgentsPluginOptions {
  enabled?: boolean
}

export function createAgentsPlugin( _options: AgentsPluginOptions = {}): LoopworkPlugin {
  return {
    name: 'agents',
    essential: false,
  }
}

export function withAgents( _options: AgentsPluginOptions = {}): ConfigWrapper {
  return (config) => ({
    ...config,
    plugins: [...(config.plugins || []), createAgentsPlugin(_options)],
  })
}

/**
 * Governance Plugin
 *
 * Provides policy enforcement and governance capabilities
 */

import type { LoopworkPlugin, ConfigWrapper, LoopworkConfig } from '@loopwork-ai/loopwork/contracts'

export class GovernanceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GovernanceError'
  }
}

export interface PolicyRule {
  name: string
  description: string
  enabled: boolean
}

export interface PolicyAction {
  type: string
  params?: Record<string, unknown>
}

export interface PolicyResult {
  allowed: boolean
  reason?: string
}

export interface GovernanceConfig {
  enabled?: boolean
  rules?: PolicyRule[]
}

export class PolicyEngine {
  private rules: Map<string, PolicyRule> = new Map()

  addRule(rule: PolicyRule): void {
    this.rules.set(rule.name, rule)
  }

  evaluate(action: PolicyAction): PolicyResult {
    // Default: allow all actions
    return { allowed: true }
  }
}

export type PolicyRules = {
  maxConcurrentTasks?: number
  allowedClis?: string[]
}

export function createGovernancePlugin(config: GovernanceConfig = {}): LoopworkPlugin {
  return {
    name: 'governance',
    essential: false,
  }
}

export function withGovernance(config: GovernanceConfig = {}): ConfigWrapper {
  return (baseConfig: LoopworkConfig) => ({
    ...baseConfig,
    plugins: [...(baseConfig.plugins || []), createGovernancePlugin(config)],
  })
}

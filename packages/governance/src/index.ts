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
  description?: string
  priority?: number
  condition?: (context: unknown) => boolean | Promise<boolean>
}

export interface PolicyAction {
  type: string
  payload?: Record<string, unknown>
  [key: string]: unknown
}

export interface PolicyResult {
  allowed: boolean
  reason?: string
  modifications?: Record<string, unknown>
}

export type PolicyRules = {
  maxConcurrentTasks?: number
  allowedClis?: string[]
}

export interface GovernanceConfig {
  enabled?: boolean
  rules?: PolicyRules
}

export class PolicyEngine {
  private rules: Map<string, PolicyRule> = new Map()

  addRule(rule: PolicyRule): void {
    this.rules.set(rule.name, rule)
  }

  evaluate(action: PolicyAction): PolicyResult {
    return { allowed: true }
  }
}

export function createGovernancePlugin(config: GovernanceConfig = {}): LoopworkPlugin {
  return {
    name: 'governance',
    classification: 'enhancement',
  }
}

export function withGovernance(config: GovernanceConfig = {}): ConfigWrapper {
  return (baseConfig: LoopworkConfig) => ({
    ...baseConfig,
    plugins: [...(baseConfig.plugins || []), createGovernancePlugin(config)],
  })
}

export { 
  createAuditLoggingPlugin, 
  withAuditLogging, 
  type AuditConfig, 
  type AuditEvent, 
  AuditLogManager 
} from './audit-logging'

export { 
  createAuditQueryManager, 
  queryAuditLogs, 
  exportAuditLogs, 
  type AuditQuery, 
  type AuditExportOptions, 
  type AuditReport 
} from './audit-query'

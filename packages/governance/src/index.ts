/**
 * Governance Plugin
 *
 * Provides policy enforcement and governance capabilities
 */

import type { LoopworkPlugin, ConfigWrapper, LoopworkConfig, TaskContext, PluginTaskResult } from '@loopwork-ai/loopwork/contracts'
import { logger } from '@loopwork-ai/common'

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

export interface PolicyContext {
  /** Task being executed */
  task: {
    id: string
    title: string
    priority?: string
    feature?: string
  }
  /** Current namespace */
  namespace: string
  /** CLI tool being used */
  cli?: string
  /** Active task IDs */
  activeTasks: Set<string>
  /** Iteration number */
  iteration: number
}

export class PolicyEngine {
  private rules: Map<string, PolicyRule> = new Map()
  private config: PolicyRules
  private activeTasks: Set<string> = new Set()

  constructor(config: PolicyRules = {}) {
    this.config = {
      maxConcurrentTasks: Infinity,
      ...config,
    }
  }

  addRule(rule: PolicyRule): void {
    this.rules.set(rule.name, rule)
  }

  /** Track a task as started */
  trackTaskStart(taskId: string): void {
    this.activeTasks.add(taskId)
  }

  /** Track a task as completed or failed */
  trackTaskEnd(taskId: string): void {
    this.activeTasks.delete(taskId)
  }

  /** Get current count of active tasks */
  getActiveTaskCount(): number {
    return this.activeTasks.size
  }

  /** Get list of active task IDs */
  getActiveTasks(): string[] {
    return Array.from(this.activeTasks)
  }

  async evaluate(context: PolicyContext): Promise<PolicyResult> {
    // 1. Check maxConcurrentTasks policy
    if (this.config.maxConcurrentTasks && this.config.maxConcurrentTasks > 0) {
      const currentCount = this.activeTasks.size
      if (currentCount >= this.config.maxConcurrentTasks) {
        return {
          allowed: false,
          reason: `Maximum concurrent tasks limit reached (${currentCount}/${this.config.maxConcurrentTasks})`,
        }
      }
    }

    // 2. Check allowedClis policy
    if (this.config.allowedClis && this.config.allowedClis.length > 0) {
      if (!context.cli || !this.config.allowedClis.includes(context.cli)) {
        return {
          allowed: false,
          reason: `CLI tool '${context.cli || 'unknown'}' not in allowed list: ${this.config.allowedClis.join(', ')}`,
        }
      }
    }

    // 3. Evaluate custom policy rules
    for (const [name, rule] of this.rules.entries()) {
      if (rule.priority !== undefined && rule.priority <= 0) {
        continue
      }

      try {
        const result = rule.condition ? await rule.condition(context) : true
        if (!result) {
          return {
            allowed: false,
            reason: `Policy '${name}' was violated: ${rule.description || 'No description'}`,
          }
        }
      } catch (error) {
        console.warn(`Policy rule '${name}' evaluation error:`, error)
      }
    }

    // All policies passed
    return {
      allowed: true,
    }
  }
}

export function createGovernancePlugin(config: GovernanceConfig = {}): LoopworkPlugin {
  const enabled = config.enabled !== false

  if (!enabled) {
    return {
      name: 'governance',
      classification: 'enhancement',
    }
  }

  const engine = new PolicyEngine(config.rules)

  let namespace = 'default'

  return {
    name: 'governance',
    classification: 'enhancement',

    async onConfigLoad(loopworkConfig: LoopworkConfig): Promise<LoopworkConfig> {
      return loopworkConfig
    },

    async onLoopStart(ns: string): Promise<void> {
      namespace = ns
      logger.debug(`Governance plugin initialized for namespace: ${namespace}`)

      if (config.rules?.maxConcurrentTasks) {
        logger.info(`Max concurrent tasks policy: ${config.rules.maxConcurrentTasks}`)
      }

      if (config.rules?.allowedClis && config.rules.allowedClis.length > 0) {
        logger.info(`Allowed CLIs: ${config.rules.allowedClis.join(', ')}`)
      }

      if (engine.rules.size > 0) {
        logger.info(`Custom policy rules: ${Array.from(engine.rules.keys()).join(', ')}`)
      }
    },

    async onTaskStart(context: TaskContext): Promise<void> {
      if (!enabled) return

      const { task, config: loopworkConfig } = context
      const cli = loopworkConfig?.cli

      logger.debug(`Governance check for task ${task.id}`)

      const result = await engine.evaluate({
        task: {
          id: task.id,
          title: task.title,
          priority: task.priority,
          feature: task.metadata?.feature as string,
        },
        namespace,
        cli,
        activeTasks: new Set(engine.getActiveTasks()),
        iteration: context.iteration,
      })

      if (!result.allowed) {
        const error = new GovernanceError(
          `Task ${task.id} blocked by governance policy: ${result.reason}`
        )
        logger.error(`🚫 ${error.message}`)
        throw error
      }

      logger.debug(`Task ${task.id} passed governance checks`)
      engine.trackTaskStart(task.id)
    },

    async onTaskComplete(context: TaskContext, _result: PluginTaskResult): Promise<void> {
      if (!enabled) return
      engine.trackTaskEnd(context.task.id)
      logger.debug(`Task ${context.task.id} removed from active tracking`)
    },

    async onTaskFailed(context: TaskContext, _error: string): Promise<void> {
      if (!enabled) return
      engine.trackTaskEnd(context.task.id)
      logger.debug(`Task ${context.task.id} removed from active tracking (failed)`)
    },
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

import type { LoopworkPlugin, ConfigWrapper, TaskContext, PluginTaskResult } from '@loopwork-ai/loopwork/contracts'
import { RiskLevel } from '@loopwork-ai/loopwork/contracts'
import { logger } from '@loopwork-ai/common'
import { ApprovalGate, type ApprovalOptions } from './approval-gate'

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
  condition?: (context: PolicyContext) => boolean | Promise<boolean>
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
  requiresApproval?: boolean
}

export type PolicyRules = {
  maxConcurrentTasks?: number
  allowedClis?: string[]
  approvalRequired?: boolean
  highPriorityApproval?: boolean
}

export interface GovernanceConfig {
  enabled?: boolean
  rules?: PolicyRules
  approval?: ApprovalOptions
}

export interface PolicyContext {
  task: {
    id: string
    title: string
    priority?: string
    feature?: string
  }
  namespace: string
  cli?: string
  activeTasks: Set<string>
  iteration: number
}

export class PolicyEngine {
  public readonly rules: Map<string, PolicyRule> = new Map()
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

  trackTaskStart(taskId: string): void {
    this.activeTasks.add(taskId)
  }

  trackTaskEnd(taskId: string): void {
    this.activeTasks.delete(taskId)
  }

  getActiveTaskCount(): number {
    return this.activeTasks.size
  }

  getActiveTasks(): string[] {
    return Array.from(this.activeTasks)
  }

  async evaluate(context: PolicyContext): Promise<PolicyResult> {
    if (this.config.maxConcurrentTasks && this.config.maxConcurrentTasks > 0) {
      const currentCount = this.activeTasks.size
      if (currentCount >= this.config.maxConcurrentTasks) {
        return {
          allowed: false,
          reason: `Maximum concurrent tasks limit reached (${currentCount}/${this.config.maxConcurrentTasks})`,
        }
      }
    }

    if (this.config.allowedClis && this.config.allowedClis.length > 0) {
      if (!context.cli || !this.config.allowedClis.includes(context.cli)) {
        return {
          allowed: false,
          reason: `CLI tool '${context.cli || 'unknown'}' not in allowed list: ${this.config.allowedClis.join(', ')}`,
        }
      }
    }

    if (this.config.approvalRequired) {
      return {
        allowed: true,
        requiresApproval: true,
        reason: 'Manual approval required by policy',
      }
    }

    if (this.config.highPriorityApproval && context.task.priority === 'high') {
      return {
        allowed: true,
        requiresApproval: true,
        reason: 'Manual approval required for high priority task',
      }
    }

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
  const gate = new ApprovalGate(config.approval)

  let namespace = 'default'

  return {
    name: 'governance',
    classification: 'enhancement',

    async onConfigLoad(loopworkConfig: unknown): Promise<unknown> {
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

      const { task } = context
      const cli = context.cli

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

      if (result.requiresApproval) {
        const approval = await gate.askApproval({
          taskId: task.id,
          title: task.title,
          riskLevel: task.priority === 'high' ? RiskLevel.HIGH : RiskLevel.MEDIUM,
          reasons: [result.reason || 'Manual approval required'],
        })

        if (!approval.confirmed) {
          const error = new GovernanceError(
            `Task ${task.id} rejected by user: ${approval.timedOut ? 'Timed out' : 'Denied'}`
          )
          logger.error(`🚫 ${error.message}`)
          throw error
        }
        
        logger.info(`✅ Task ${task.id} approved by user`)
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
  return (baseConfig: unknown) => {
    const cfg = baseConfig as any
    return {
      ...cfg,
      plugins: [...(cfg.plugins || []), createGovernancePlugin(config)],
    }
  }
}

export * from './audit-logging'
export * from './audit-query'
export { ApprovalGate, type ApprovalOptions } from './approval-gate'

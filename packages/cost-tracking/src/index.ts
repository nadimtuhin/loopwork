/**
 * Cost Tracking for Loopwork
 *
 * Tracks token usage and costs for AI CLI tools as a wrapper around budget-manager.
 */

import { 
  createBudgetManager, 
  parseUsageFromOutput, 
  BudgetExceededError,
  CostTracker,
  MODEL_PRICING
} from '@loopwork-ai/budget-manager'

import type { 
  LoopworkPlugin, 
  LoopStats, 
  TaskContext, 
  PluginTaskResult 
} from '@loopwork-ai/contracts'

export { 
  BudgetExceededError, 
  CostTracker, 
  parseUsageFromOutput,
  MODEL_PRICING,
  formatCost,
  formatTokens,
  formatUsageSummary,
  formatTelemetryReport
} from '@loopwork-ai/budget-manager'

export type { 
  TokenUsage, 
  UsageEntry, 
  UsageSummary, 
  DailySummary,
  ModelPricing,
  ErrorGroup,
  TelemetryReport
} from '@loopwork-ai/budget-manager'

/**
 * Configuration wrapper for Loopwork
 */
export type ConfigWrapper = (config: any) => any

export interface CostTrackingConfig {
  enabled?: boolean
  defaultModel?: string
  dailyBudget?: number
  alertThreshold?: number
  /** Maximum cost per individual task (in USD) */
  perTaskBudget?: number
  /** Maximum cost per user session (in USD) */
  perUserBudget?: number
  /** User identifier for tracking per-user budgets */
  userId?: string
  /** Action to take when budget is exceeded: 'warn' | 'block' | 'alert' */
  budgetAction?: 'warn' | 'block' | 'alert'
}

/**
 * Add cost tracking wrapper
 */
export function withCostTracking(options: CostTrackingConfig = {}): ConfigWrapper {
  return (config: any) => {
    const baseConfig = config as Record<string, unknown>
    return {
      ...baseConfig,
      costTracking: {
        enabled: true,
        defaultModel: 'claude-3.5-sonnet',
        classification: 'enhancement',
        ...options,
      },
    }
  }
}

export function createCostTrackingPlugin(
  projectRoot: string,
  namespace = 'default',
  config: CostTrackingConfig = {}
): LoopworkPlugin {
  const {
    dailyBudget = 10.0,
    alertThreshold = 0.8,
    budgetAction = 'warn',
  } = config

  const manager = createBudgetManager(projectRoot, namespace, {
    dailyBudget,
    alertThreshold,
    enabled: config.enabled !== false
  })

  return {
    name: 'cost-tracking',
    classification: 'enhancement',

    async onTaskStart(context: TaskContext) {
      const status = manager.getBudgetStatus()
      
      if (status.isExceeded) {
        const message = `Daily budget exceeded: $${status.consumed.toFixed(4)} / $${status.total.toFixed(4)}`
        if (budgetAction === 'block') {
          throw new BudgetExceededError('daily', status.consumed, status.total)
        }
        console.warn(`⚠️  COST TRACKING: ${message}`)
      } else if (status.isAlertTriggered) {
        console.warn(`⚠️  COST TRACKING: Daily budget at ${status.percentage.toFixed(0)}% threshold: $${status.consumed.toFixed(4)} / $${status.total.toFixed(4)}`)
      }
    },

    async onTaskComplete(context: TaskContext, result: PluginTaskResult) {
      if (result.output) {
        const usage = parseUsageFromOutput(result.output)
        if (usage) {
          manager.record(
            context.task.id,
            context.model || 'unknown',
            usage,
            result.duration / 1000,
            result.success ? 'success' : 'failed',
            result.error,
            context.iteration
          )
        }
      }
    },

    async onCliResult(event: any) {
      const usage = parseUsageFromOutput(event.output)
      if (usage) {
        manager.record(
          event.taskId || 'unknown',
          event.model,
          usage,
          event.durationMs / 1000,
          event.exitCode === 0 ? 'success' : 'failed',
          event.exitCode !== 0 ? event.output.slice(-500) : undefined,
          event.iteration
        )
      }
    },

    async onLoopEnd(stats: LoopStats) {
      const status = manager.getBudgetStatus()
      console.log(`\n📊 Cost and Performance Summary for today:`)
      console.log(`   Tasks: ${stats.completed} success, ${stats.failed} failed`)
      console.log(`   Cost: $${status.consumed.toFixed(4)} / $${status.total.toFixed(4)}`)
      
      if (status.isExceeded) {
        console.log(`   Status: ❌ EXCEEDED`)
      } else if (status.isAlertTriggered) {
        console.log(`   Status: ⚠️  WARNING`)
      } else {
        console.log(`   Status: ✅ OK`)
      }
    },
  }
}

export {
  CostTrackingTelemetryProvider,
  createCostTelemetryProvider,
  type CostTelemetryProviderOptions,
} from './provider'

/**
 * Safety Plugin
 *
 * Provides safety checks and constraints for task execution
 * - Risk assessment based on task content
 * - Interactive confirmation for high-risk tasks
 * - Configurable risk thresholds
 */

import type { LoopworkPlugin, ConfigWrapper, TaskContext } from '../contracts'
import type { SafetyConfig } from '../contracts/safety'
import { DEFAULT_SAFETY_CONFIG, RiskLevel } from '../contracts/safety'
import { RiskAnalysisEngine } from '../safety/risk-analysis'
import { InteractiveConfirmation } from '../safety/interactive-confirmation'
import { logger } from '../core/utils'

/**
 * Safety plugin options
 */
export interface SafetyPluginOptions {
  /** Enable safety checks */
  enabled?: boolean

  /** Maximum risk level to allow without confirmation */
  maxRiskLevel?: RiskLevel

  /** Auto-reject tasks exceeding max risk level */
  autoReject?: boolean

  /** Confirmation timeout in milliseconds */
  confirmTimeout?: number
}

const DEFAULT_OPTIONS: Required<SafetyPluginOptions> = {
  enabled: true,
  maxRiskLevel: RiskLevel.HIGH,
  autoReject: false,
  confirmTimeout: 30000,
}

/**
 * Create safety plugin
 *
 * @example
 * ```typescript
 * import { withSafety } from 'loopwork'
 *
 * export default compose(
 *   withSafety({
 *     enabled: true,
 *     maxRiskLevel: RiskLevel.HIGH,
 *     autoReject: false,
 *     confirmTimeout: 30000
 *   }),
 * )(defineConfig({ cli: 'claude' }))
 * ```
 */
export function createSafetyPlugin(
  userOptions: SafetyPluginOptions = {}
): LoopworkPlugin {
  const options: Required<SafetyPluginOptions> = {
    ...DEFAULT_OPTIONS,
    ...userOptions,
  }

  const riskEngine = new RiskAnalysisEngine()
  const confirmation = new InteractiveConfirmation(options.confirmTimeout)

  let namespace = 'default'

  return {
    name: 'safety',
    essential: false,

    async onLoopStart(ns: string) {
      namespace = ns
      if (options.enabled) {
        logger.debug(`Safety plugin initialized for namespace: ${namespace}`)
        logger.debug(`Max risk level: ${options.maxRiskLevel}`)
        logger.debug(`Auto-reject: ${options.autoReject}`)
      }
    },

    async onTaskStart(context: TaskContext) {
      if (!options.enabled) {
        return undefined
      }

      const { task, iteration } = context

      logger.debug(`Safety check for task ${task.id} (iteration ${iteration})`)

      try {
        // Assess risk level
        const assessment = await riskEngine.assessRisk({
          task: {
            id: task.id,
            title: task.title,
            description: task.description,
            metadata: task.metadata,
          },
          namespace,
          nonInteractive: confirmation.isNonInteractiveMode(),
        })

        const { riskLevel, reasons } = assessment

        logger.debug(`Task ${task.id} risk level: ${riskLevel}`)
        logger.debug(`Risk reasons: ${reasons.join(', ')}`)

        // Check if risk exceeds maximum allowed
        const exceedsMaxRisk = riskEngine.exceedsMaxRisk(
          riskLevel,
          options.maxRiskLevel
        )

        if (exceedsMaxRisk) {
          // Risk level exceeds threshold
          if (options.autoReject) {
            const error = `Task ${task.id} blocked by safety policy: risk level ${riskLevel} exceeds maximum ${options.maxRiskLevel}`
            logger.error(`🚫 ${error}`)
            logger.error(`Reasons: ${reasons.join(', ')}`)
            throw new Error(error)
          }

          // Request interactive confirmation
          const confirmResult = await confirmation.confirm({
            taskId: task.id,
            title: task.title,
            riskLevel,
            reasons,
            timeout: options.confirmTimeout,
          })

          if (!confirmResult.confirmed) {
            const reason = confirmResult.timedOut
              ? 'confirmation timed out'
              : 'user declined confirmation'

            logger.warn(`⚠️  Task ${task.id} not confirmed (${reason})`)
            throw new Error(
              `Task ${task.id} requires confirmation: ${reason}`
            )
          }

          logger.info(`✓ Task ${task.id} confirmed by user`)
          return undefined
        } else {
          // Risk level acceptable
          logger.debug(
            `Task ${task.id} risk level ${riskLevel} within acceptable range`
          )
          return undefined
        }
      } catch (error) {
        // Re-throw safety errors to block task execution
        if (
          error instanceof Error &&
          (error.message.includes('blocked by safety policy') ||
            error.message.includes('requires confirmation'))
        ) {
          throw error
        }
        // Log but don't block on other errors
        logger.warn(`Safety check error for task ${task.id}: ${error}`)
        return undefined
      }
    },
  }
}

/**
 * Convenience wrapper for safety plugin
 */
export function withSafety(
  options: SafetyPluginOptions = {}
): ConfigWrapper {
  return (config) => ({
    ...config,
    safety: {
      ...DEFAULT_SAFETY_CONFIG,
      ...options,
    } as SafetyConfig,
    plugins: [...(config.plugins || []), createSafetyPlugin(options)],
  })
}

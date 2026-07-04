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
import { DEFAULT_SAFETY_CONFIG } from '../contracts/safety'
import { RiskEvaluator, InteractiveConfirmation } from '@loopwork-ai/safety'
import { logger } from '../core/utils'
import { LoopworkError } from '../core/errors'
import type { OperationCategory, RiskLevel } from '@loopwork-ai/contracts'

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
  maxRiskLevel: 'high',
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

  const riskEngine = new RiskEvaluator()
  const confirmation = new InteractiveConfirmation()

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
        const assessment = await riskEngine.evaluate(
          `${task.title} ${task.description}`,
          'unknown',
          task.metadata as Record<string, unknown>
        )

        const { level: riskLevel, concerns: reasons } = assessment

        logger.debug(`Task ${task.id} risk level: ${riskLevel}`)
        logger.debug(`Risk reasons: ${reasons.join(', ')}`)

        // Check if risk exceeds maximum allowed
        const levels: RiskLevel[] = ['low', 'medium', 'high', 'critical']
        const exceedsMaxRisk = levels.indexOf(riskLevel) > levels.indexOf(options.maxRiskLevel)

        if (exceedsMaxRisk) {
          // Risk level exceeds threshold
          if (options.autoReject) {
            const message = `Task ${task.id} blocked by safety policy: risk level ${riskLevel} exceeds maximum ${options.maxRiskLevel}`
            logger.error(`🚫 ${message}`)
            logger.error(`Reasons: ${reasons.join(', ')}`)
            throw new LoopworkError('ERR_SAFETY_VIOLATION', message, [
              'Review the task description for high-risk keywords',
              'Reduce the task scope to lower the risk level',
              'Increase maxRiskLevel in your safety plugin configuration',
              'Set autoReject to false to allow interactive confirmation',
            ])
          }

          // Request interactive confirmation
          const confirmResult = await confirmation.requestConfirmation(
            task.title,
            'unknown',
            assessment,
            options.confirmTimeout
          )

          if (confirmResult.status !== 'approved') {
            const reason = confirmResult.status === 'timeout'
              ? 'confirmation timed out'
              : 'user declined confirmation'

            const message = `Task ${task.id} requires confirmation: ${reason}`
            logger.warn(`⚠️  Task ${task.id} not confirmed (${reason})`)
            throw new LoopworkError('ERR_SAFETY_VIOLATION', message, [
              'Ensure you are available to confirm high-risk tasks',
              'Increase confirmTimeout in your safety plugin configuration',
              'Run in non-interactive mode (-y) to auto-confirm (use with caution)',
            ])
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
        const errorStr = String(error)
        const isSafetyError =
          error instanceof LoopworkError && error.code === 'ERR_SAFETY_VIOLATION'
        const isLegacySafetyError =
          error instanceof Error &&
          (error.message.includes('blocked by safety policy') ||
            error.message.includes('requires confirmation'))
        const isNonErrorSafetyError =
          !(error instanceof Error) &&
          (errorStr.includes('blocked by safety policy') ||
            errorStr.includes('requires confirmation'))

        if (isSafetyError || isLegacySafetyError || isNonErrorSafetyError) {
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
  return (config: any) => ({
    ...config,
    safety: {
      ...DEFAULT_SAFETY_CONFIG,
      ...options,
    } as SafetyConfig,
    plugins: [...(config.plugins || []), createSafetyPlugin(options)],
  })
}

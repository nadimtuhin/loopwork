/**
 * Action Framework - Execute corrective actions based on detected patterns
 */

import type { PatternMatch } from '../patterns'
import { logger } from '../utils'
import { executeCreatePRD } from './create-prd'
import { executePauseLoop } from './pause-loop'
import { executeNotify } from './notify'
import { executeAnalyze } from './analyze'

export type ActionType = 'auto-fix' | 'pause' | 'skip' | 'notify' | 'analyze'

export interface MonitorAction {
  type: ActionType
  pattern: string
  context: Record<string, string>
}

export interface AutoFixAction extends MonitorAction {
  type: 'auto-fix'
  fn: () => Promise<void>
}

export interface PauseAction extends MonitorAction {
  type: 'pause'
  reason: string
  duration: number
}

export interface SkipAction extends MonitorAction {
  type: 'skip'
  target: 'task' | 'plugin'
  name?: string
}

export interface NotifyAction extends MonitorAction {
  type: 'notify'
  channel: 'telegram' | 'discord' | 'log'
  message: string
}

export interface AnalyzeAction extends MonitorAction {
  type: 'analyze'
  prompt: string
}

export type Action = AutoFixAction | PauseAction | SkipAction | NotifyAction | AnalyzeAction

/**
 * Action result with status and metadata
 */
export interface ActionResult {
  success: boolean
  action: Action
  error?: string
  timestamp: Date
  details?: Record<string, unknown>
}

/**
 * Action executor statistics
 */
export interface ActionStats {
  totalActions: number
  successfulActions: number
  failedActions: number
  actionsByType: Record<ActionType, number>
  actionsByPattern: Record<string, number>
}

/**
 * Throttle state for LLM calls
 */
export interface ThrottleState {
  llmCallCount: number
  lastLLMCall: number
  llmCooldown: number
  llmMaxPerSession: number
}

/**
 * Action executor - decides and executes actions based on pattern matches
 */
export class ActionExecutor {
  private actionHistory: ActionResult[] = []
  private namespace?: string
  private llmModel?: string
  private anthropicApiKey?: string
  private projectRoot?: string
  private throttleState: ThrottleState

  constructor(config?: { namespace?: string; llmModel?: string; anthropicApiKey?: string; projectRoot?: string; llmCooldown?: number; llmMaxPerSession?: number }) {
    this.namespace = config?.namespace
    this.llmModel = config?.llmModel || 'haiku'
    this.anthropicApiKey = config?.anthropicApiKey
    this.projectRoot = config?.projectRoot
    this.throttleState = {
      llmCallCount: 0,
      lastLLMCall: 0,
      llmCooldown: config?.llmCooldown ?? 5 * 60 * 1000, // 5 minutes default
      llmMaxPerSession: config?.llmMaxPerSession ?? 10
    }
  }

  /**
   * Set throttle state (useful for restoring from saved state)
   */
  setThrottleState(state: ThrottleState): void {
    this.throttleState = state
  }

  /**
   * Get current throttle state
   */
  getThrottleState(): ThrottleState {
    return { ...this.throttleState }
  }

  /**
   * Determine action to take for a pattern match
   * @param match - Pattern match to handle
   * @returns Action to execute or null if no action needed
   */
  determineAction(match: PatternMatch): Action | null {
    switch (match.pattern) {
      case 'prd-not-found':
        return {
          type: 'auto-fix',
          pattern: match.pattern,
          context: match.context,
          fn: async () => {
            await executeCreatePRD({
              type: 'auto-fix',
              pattern: match.pattern,
              context: match.context,
              fn: async () => {}
            }, this.projectRoot)
          }
        } as AutoFixAction

      case 'rate-limit':
        return {
          type: 'pause',
          pattern: match.pattern,
          context: match.context,
          reason: 'Rate limit detected',
          duration: 60 * 1000 // 60 seconds
        } as PauseAction

      case 'env-var-required':
        return {
          type: 'notify',
          pattern: match.pattern,
          context: match.context,
          channel: 'log',
          message: `Missing required environment variable: ${match.context.envVar}`
        } as NotifyAction

      case 'task-failed':
      case 'circuit-breaker':
        return {
          type: 'notify',
          pattern: match.pattern,
          context: match.context,
          channel: 'log',
          message: `Critical: ${match.pattern} - ${match.rawLine}`
        } as NotifyAction

      case 'timeout':
        return {
          type: 'notify',
          pattern: match.pattern,
          context: match.context,
          channel: 'log',
          message: 'Task timeout - will retry with next model'
        } as NotifyAction

      case 'file-not-found':
      case 'permission-denied':
      case 'network-error':
      case 'plugin-error':
        return {
          type: 'notify',
          pattern: match.pattern,
          context: match.context,
          channel: 'log',
          message: `${match.pattern}: ${match.rawLine}`
        } as NotifyAction

      case 'no-pending-tasks':
        return null // Clean exit, no action needed

      default:
        // Unknown pattern - trigger LLM analysis
        return {
          type: 'analyze',
          pattern: match.pattern,
          context: match.context,
          prompt: `Analyze this error: ${match.rawLine}`
        } as AnalyzeAction
    }
  }

  /**
   * Execute an action
   * @param action - Action to execute
   * @returns Action result
   */
  async executeAction(action: Action): Promise<ActionResult> {
    const result: ActionResult = {
      success: false,
      action,
      timestamp: new Date()
    }

    try {
      switch (action.type) {
        case 'auto-fix':
          await action.fn()
          result.success = true
          logger.debug(`Auto-fix action completed for pattern: ${action.pattern}`)
          break

        case 'pause':
          await executePauseLoop(action)
          result.success = true
          logger.debug(`Pause action completed for pattern: ${action.pattern}`)
          break

        case 'skip':
          // Skip action is a marker - actual skip logic handled by main loop
          result.success = true
          logger.debug(`Skip action registered for pattern: ${action.pattern}`)
          break

        case 'notify':
          await executeNotify(action, this.namespace)
          result.success = true
          logger.debug(`Notify action completed for pattern: ${action.pattern}`)
          break

        case 'analyze':
          const analysisResult = await executeAnalyze(action, this.llmModel, this.anthropicApiKey, this.projectRoot, this.throttleState)
          result.success = true
          result.details = analysisResult as unknown as Record<string, unknown>
          logger.debug(`Analyze action completed for pattern: ${action.pattern}`)
          break

        default:
          result.error = `Unknown action type: ${(action as Action).type}`
      }
    } catch (error) {
      result.success = false
      result.error = error instanceof Error ? error.message : String(error)
      logger.error(`Action execution failed: ${result.error}`)
    }

    this.actionHistory.push(result)
    return result
  }

  /**
   * Get action history
   * @returns Array of action results
   */
  getHistory(): ActionResult[] {
    return [...this.actionHistory]
  }

  /**
   * Clear action history
   */
  clearHistory(): void {
    this.actionHistory = []
  }

  /**
   * Get recent actions for a specific pattern
   * @param pattern - Pattern name to filter by
   * @param limit - Maximum number of results
   * @returns Recent action results for the pattern
   */
  getRecentActions(pattern: string, limit: number = 10): ActionResult[] {
    return this.actionHistory
      .filter(r => r.action.pattern === pattern)
      .slice(-limit)
  }

  /**
   * Get action statistics
   * @returns Statistics about executed actions
   */
  getStats(): ActionStats {
    const stats: ActionStats = {
      totalActions: this.actionHistory.length,
      successfulActions: this.actionHistory.filter(r => r.success).length,
      failedActions: this.actionHistory.filter(r => !r.success).length,
      actionsByType: {
        'auto-fix': 0,
        'pause': 0,
        'skip': 0,
        'notify': 0,
        'analyze': 0
      },
      actionsByPattern: {}
    }

    for (const result of this.actionHistory) {
      // Count by type
      stats.actionsByType[result.action.type]++

      // Count by pattern
      const pattern = result.action.pattern
      stats.actionsByPattern[pattern] = (stats.actionsByPattern[pattern] || 0) + 1
    }

    return stats
  }
}

// Re-export action executors for direct use
export { executeCreatePRD } from './create-prd'
export { executePauseLoop, resumeLoop, isLoopPaused, waitForPauseCompletion } from './pause-loop'
export { executeNotify } from './notify'
export { executeAnalyze, cleanupCache, shouldThrottleLLM } from './analyze'
export type { ThrottleState as AnalyzeThrottleState } from './analyze'

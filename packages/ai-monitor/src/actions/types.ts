/**
 * AI Monitor Action Types
 * Extracted to prevent circular dependencies
 */

export type ActionType = 'auto-fix' | 'pause' | 'skip' | 'notify' | 'analyze' | 'enhance-task'

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

export interface EnhanceTaskAction extends MonitorAction {
  type: 'enhance-task'
  target: 'prd' | 'tests' | 'docs'
  taskId: string
  enhancementType: 'vague_prd' | 'missing_tests' | 'missing_context' | 'scope_large' | 'wrong_approach'
}

export type Action = AutoFixAction | PauseAction | SkipAction | NotifyAction | AnalyzeAction | EnhanceTaskAction

export interface ActionResult {
  success: boolean
  action: Action
  error?: string
  timestamp: Date
  details?: Record<string, unknown>
}

export interface ActionStats {
  totalActions: number
  successfulActions: number
  failedActions: number
  actionsByType: Record<ActionType, number>
  actionsByPattern: Record<string, number>
}

export interface ThrottleState {
  llmCallCount: number
  lastLLMCall: number
  llmCooldown: number
  llmMaxPerSession: number
}

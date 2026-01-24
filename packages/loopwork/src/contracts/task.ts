/**
 * Task Types and Constants
 */

export type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'failed'
export type Priority = 'high' | 'medium' | 'low'

/**
 * Unified task representation across all backends
 */
export interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: Priority
  feature?: string
  parentId?: string
  dependsOn?: string[]
  metadata?: Record<string, unknown>
}

/**
 * Task result after execution
 */
export interface TaskResult {
  success: boolean
  output: string
  duration: number
  error?: string
}

/**
 * GitHub-specific types (for GitHub backend)
 */
export interface GitHubLabel {
  name: string
  color?: string
  description?: string
}

export interface GitHubIssue {
  number: number
  title: string
  body: string
  state: 'open' | 'closed'
  labels: GitHubLabel[]
  url: string
  createdAt: string
  updatedAt: string
}

/**
 * Label constants for GitHub backend
 */
export const LABELS = {
  LOOPWORK_TASK: 'loopwork-task',
  STATUS_PENDING: 'loopwork:pending',
  STATUS_IN_PROGRESS: 'loopwork:in-progress',
  STATUS_FAILED: 'loopwork:failed',
  PRIORITY_HIGH: 'priority:high',
  PRIORITY_MEDIUM: 'priority:medium',
  PRIORITY_LOW: 'priority:low',
  SUB_TASK: 'loopwork:sub-task',
  BLOCKED: 'loopwork:blocked',
} as const

export const STATUS_LABELS = [
  LABELS.STATUS_PENDING,
  LABELS.STATUS_IN_PROGRESS,
  LABELS.STATUS_FAILED,
] as const

export const PRIORITY_LABELS = [
  LABELS.PRIORITY_HIGH,
  LABELS.PRIORITY_MEDIUM,
  LABELS.PRIORITY_LOW,
] as const

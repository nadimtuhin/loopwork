/**
 * Task Types and Constants
 */

export type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'failed' | 'quarantined' | 'cancelled'
export type Priority = 'high' | 'medium' | 'low' | 'background'

export type TaskEventType = 
  | 'created' 
  | 'started' 
  | 'completed' 
  | 'failed' 
  | 'cancelled' 
  | 'paused' 
  | 'resumed' 
  | 'quarantined'
  | 'reset'
  | 'rescheduled'
  | 'status_change'
  | 'log'
  | 'tool_call'

/**
 * Task event for logging history
 */
export interface TaskEvent {
  id?: string
  taskId?: string
  timestamp: string
  type: TaskEventType | string
  level?: 'info' | 'warn' | 'error' | 'debug'
  actor?: 'system' | 'user' | 'ai'
  message: string
  metadata?: Record<string, unknown>
}

export interface EventLog {
  taskId: string
  events: TaskEvent[]
}

/**
 * Task timestamps for tracking lifecycle
 */
export interface TaskTimestamps {
  createdAt: string
  updatedAt?: string
  startedAt?: string
  completedAt?: string
  failedAt?: string
  resumedAt?: string
  quarantinedAt?: string
  cancelledAt?: string
}

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
  failureCount?: number
  lastError?: string
  scheduledFor?: string | null
  timestamps?: TaskTimestamps
  events?: TaskEvent[]
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
  STATUS_QUARANTINED: 'loopwork:quarantined',
  PRIORITY_HIGH: 'priority:high',
  PRIORITY_MEDIUM: 'priority:medium',
  PRIORITY_LOW: 'priority:low',
  PRIORITY_BACKGROUND: 'priority:background',
  SUB_TASK: 'loopwork:sub-task',
  BLOCKED: 'loopwork:blocked',
} as const

export const STATUS_LABELS = [
  LABELS.STATUS_PENDING,
  LABELS.STATUS_IN_PROGRESS,
  LABELS.STATUS_FAILED,
  LABELS.STATUS_QUARANTINED,
] as const

export const PRIORITY_LABELS = [
  LABELS.PRIORITY_HIGH,
  LABELS.PRIORITY_MEDIUM,
  LABELS.PRIORITY_LOW,
  LABELS.PRIORITY_BACKGROUND,
] as const

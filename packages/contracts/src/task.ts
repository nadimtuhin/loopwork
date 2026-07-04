/**
 * Task Types and Constants
 *
 * This file re-exports types from types.ts for backward compatibility.
 * New code should import directly from './types'.
 */

export type {
  TaskStatus,
  Priority,
  TaskEventType,
  TaskEvent,
  EventLog,
  TaskTimestamps,
  Task,
  TaskResult,
} from './types'

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

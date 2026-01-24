import type { PluginTask, PluginTaskResult, LoopStats } from 'loopwork/contracts'

export interface DashboardConfig {
  port?: number
  host?: string
  enabled?: boolean
  autoOpen?: boolean
}

export type DashboardEventType =
  | 'loop_start'
  | 'task_start'
  | 'task_complete'
  | 'task_failed'
  | 'loop_end'
  | 'state_update'

export interface DashboardEvent {
  type: DashboardEventType
  namespace: string
  timestamp: string
  data?: any
}

export interface LoopStartEvent extends DashboardEvent {
  type: 'loop_start'
}

export interface TaskStartEvent extends DashboardEvent {
  type: 'task_start'
  data: PluginTask
}

export interface TaskCompleteEvent extends DashboardEvent {
  type: 'task_complete'
  data: {
    task: PluginTask
    result: PluginTaskResult
  }
}

export interface TaskFailedEvent extends DashboardEvent {
  type: 'task_failed'
  data: {
    task: PluginTask
    error: string
  }
}

export interface LoopEndEvent extends DashboardEvent {
  type: 'loop_end'
  data: LoopStats
}

export interface StateUpdateEvent extends DashboardEvent {
  type: 'state_update'
  data: any
}

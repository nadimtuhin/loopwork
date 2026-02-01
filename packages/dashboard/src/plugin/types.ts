// Minimal types to avoid cross-package import issues
interface PluginTask {
  id: string
  title: string
  status: string
  [key: string]: any
}

interface PluginTaskResult {
  success: boolean
  output?: string
  [key: string]: any
}

interface LoopStats {
  completed: number
  failed: number
  [key: string]: any
}

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

export interface TaskListResponse {
  tasks: PluginTask[]
  total: number
}

export interface CurrentTaskResponse {
  task: PluginTask | null
}

export interface NextTaskResponse {
  task: PluginTask | null
}

export interface TaskStatsResponse {
  total: number
  pending: number
  inProgress: number
  completed: number
  failed: number
  successRate: number
}

export type LoopState = 'running' | 'paused' | 'stopped'

export interface TaskBackend {
  listPendingTasks(): Promise<any[]>
  findNextTask(): Promise<any | null>
  getTask(id: string): Promise<any | null>
  createTask?(input: any): Promise<any>
  listCompletedTasks?(): Promise<any[]>
  listFailedTasks?(): Promise<any[]>
}

export interface IDashboardServer {
  backend?: TaskBackend
  currentTaskId?: string
  startLoop(): void
  stopLoop(): void
  pauseLoop(): void
  getLoopStatus(): any
}

export interface LoopStatusResponse {
  state: LoopState
  isRunning: boolean
  isPaused: boolean
  uptime?: number
  startedAt?: string
  metrics?: {
    tasksCompleted: number
    tasksFailed: number
    iterations: number
    successRate: number
  }
}

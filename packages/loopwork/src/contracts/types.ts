export type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'failed' | 'quarantined' | 'cancelled'
export type Priority = 'high' | 'medium' | 'low' | 'background'

export interface FindTaskOptions {
  feature?: string
  priority?: Priority
  status?: TaskStatus | TaskStatus[]
  startFrom?: string
  parentId?: string
  includeBlocked?: boolean
  topLevelOnly?: boolean
  retryCooldown?: number
}

export interface UpdateResult {
  success: boolean
  error?: string
  queued?: boolean
  scheduledFor?: string
}

export interface PingResult {
  ok: boolean
  latencyMs: number
  error?: string
}

export interface ApiQuotaInfo {
  limit: number
  remaining: number
  reset: Date
  resource?: string
}

export interface SchedulingMetadata {
  scheduledFor?: string
  notBefore?: string
  deadline?: string
  timezone?: string
  autoReschedule?: boolean
  rescheduleDelay?: number
}

export interface TaskMetadata {
  asanaGid?: string
  everhourId?: string
  todoistId?: string
  scheduling?: SchedulingMetadata
  [key: string]: unknown
}

export interface PluginTask {
  id: string
  title: string
  metadata?: TaskMetadata
}

export interface PluginTaskResult {
  duration: number
  success: boolean
  output?: string
}

export interface LoopStats {
  completed: number
  failed: number
  duration: number
  isDegraded?: boolean
  disabledPlugins?: string[]
}

export interface StepEvent {
  stepId: string
  description: string
  phase: 'start' | 'end'
  durationMs?: number
  context?: Record<string, unknown>
}

export interface ToolCallEvent {
  toolName: string
  arguments: Record<string, unknown>
  taskId?: string
  timestamp: number
  metadata?: Record<string, unknown>
}

export interface AgentResponseEvent {
  responseText: string
  model?: string
  taskId?: string
  timestamp: number
  isPartial?: boolean
  metadata?: Record<string, unknown>
}

export interface CliResultEvent {
  taskId?: string
  model: string
  cli: string
  exitCode: number
  durationMs: number
  output: string
  timedOut: boolean
  iteration?: number
}

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'success' | 'silent'
export type OutputMode = 'human' | 'ink' | 'json' | 'silent'
export type ParallelFailureMode = 'continue' | 'abort-all'

export interface OrphanWatchConfig {
  enabled?: boolean
  interval?: number
  maxAge?: number
  autoKill?: boolean
  patterns?: string[]
}

export interface FeatureFlags {
  reducedFunctionality?: boolean
  offlineMode?: boolean
  [key: string]: boolean | undefined
}

export interface DynamicTasksConfig {
  enabled?: boolean
  analyzer?: 'pattern' | 'llm' | unknown
  createSubTasks?: boolean
  maxTasksPerExecution?: number
  autoApprove?: boolean
}

export interface JsonBackendConfig {
  type: 'json'
  tasksFile: string
  tasksDir?: string
  flags?: Record<string, boolean>
}

export interface GithubBackendConfig {
  type: 'github'
  repo: string
  flags?: Record<string, boolean>
}

export interface FallbackBackendConfig {
  type: 'fallback'
  flags?: Record<string, boolean>
}

export interface LooseBackendConfig {
  type: string
  repo?: string
  tasksFile?: string
  tasksDir?: string
  flags?: Record<string, boolean>
  [key: string]: unknown
}

export type BackendConfig =
  | JsonBackendConfig
  | GithubBackendConfig
  | FallbackBackendConfig
  | LooseBackendConfig

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

export interface TaskResult {
  success: boolean
  output: string
  duration: number
  error?: string
}

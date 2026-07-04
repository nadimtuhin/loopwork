export type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'failed' | 'quarantined' | 'cancelled' | 'blocked'
export type Priority = 'high' | 'medium' | 'low' | 'background'

export interface TaskTimestamps {
  createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string
  failedAt?: string
  quarantinedAt?: string
  cancelledAt?: string
  resumedAt?: string
}

export type TaskEventType = 'created' | 'started' | 'completed' | 'failed' | 'cancelled' | 'quarantined' | 'resumed' | 'status_change' | 'reset' | 'rescheduled' | 'comment' | 'log'

export interface TaskEvent {
  taskId: string
  timestamp: string
  type: string | TaskEventType
  message: string
  level: 'info' | 'warn' | 'error' | 'debug'
  actor?: string
  metadata?: Record<string, unknown>
}

export interface EventLog {
  events: TaskEvent[]
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
  taskId: string
  success: boolean
  output?: string
  error?: string
  durationMs: number
}

export interface BackendConfig {
  type: string
  [key: string]: unknown
}

export interface JsonBackendConfig extends BackendConfig {
  type: 'json'
  tasksFile?: string
  tasksDir?: string
}

export interface GithubBackendConfig extends BackendConfig {
  type: 'github'
  repo: string
  token?: string
  apiUrl?: string
  labels?: {
    task?: string
    pending?: string
    inProgress?: string
    failed?: string
    quarantined?: string
    blocked?: string
  }
}

export interface FallbackBackendConfig extends BackendConfig {
  type: 'fallback'
  primary: unknown
  fallback: unknown
}

export interface LooseBackendConfig extends BackendConfig {}


export interface FindTaskOptions {
  status?: TaskStatus | TaskStatus[]
  feature?: string
  priority?: Priority
  parentId?: string
  topLevelOnly?: boolean
  includeBlocked?: boolean
  retryCooldown?: number
  deadletterPolicy?: {
    autoRetry: boolean
    autoRetryDelayMs: number
  }
  startFrom?: string
}

export interface UpdateResult {
  success: boolean
  error?: string
  scheduledFor?: string
  [key: string]: unknown
}

export interface PingResult {
  ok: boolean
  latencyMs: number
  error?: string
}

export interface ApiQuotaInfo {
  remaining: number
  limit: number
  reset: number
  used: number
}

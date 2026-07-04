import type { Task, TaskStatus, Priority, TaskEvent, TaskTimestamps } from '@loopwork-ai/contracts'

export interface BackendConfig {
  type: string
  [key: string]: unknown
}

export interface JsonBackendConfig extends BackendConfig {
  type: 'json'
  tasksFile: string
  tasksDir?: string
}

export interface GitHubBackendConfig extends BackendConfig {
  type: 'github'
  repo: string
  token?: string
}

export interface FallbackBackendConfig extends BackendConfig {
  type: 'fallback'
  primary: TaskBackend
  fallback: TaskBackend
}

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
}

export interface TaskBackend {
  readonly name: string
  
  findNextTask(options?: FindTaskOptions): Promise<Task | null>
  getTask(taskId: string): Promise<Task | null>
  listTasks(options?: FindTaskOptions): Promise<Task[]>
  listPendingTasks(options?: FindTaskOptions): Promise<Task[]>
  countPending(options?: FindTaskOptions): Promise<number>
  
  markInProgress(taskId: string): Promise<UpdateResult>
  markCompleted(taskId: string, comment?: string): Promise<UpdateResult>
  markFailed(taskId: string, error: string): Promise<UpdateResult>
  markQuarantined(taskId: string, reason: string): Promise<UpdateResult>
  resetToPending(taskId: string): Promise<UpdateResult>
  rescheduleCompleted(taskId: string, scheduledFor?: string): Promise<UpdateResult>
  
  createTask(task: Omit<Task, 'id' | 'status'>): Promise<Task>
  createSubTask(parentId: string, task: Omit<Task, 'id' | 'parentId' | 'status'>): Promise<Task>
  updateTask(taskId: string, updates: Partial<Task>): Promise<UpdateResult>
  
  addDependency(taskId: string, dependsOnId: string): Promise<UpdateResult>
  removeDependency(taskId: string, dependsOnId: string): Promise<UpdateResult>
  areDependenciesMet(taskId: string): Promise<boolean>
  
  getSubTasks(taskId: string): Promise<Task[]>
  getDependencies(taskId: string): Promise<Task[]>
  getDependents(taskId: string): Promise<Task[]>
  
  ping(): Promise<{ ok: boolean; latencyMs: number; error?: string }>
}

export { Task, TaskStatus, Priority, TaskEvent, TaskTimestamps }

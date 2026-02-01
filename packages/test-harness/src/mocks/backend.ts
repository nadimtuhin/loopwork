type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'failed' | 'quarantined' | 'cancelled'
type Priority = 'high' | 'medium' | 'low' | 'background'

interface FindTaskOptions {
  feature?: string
  priority?: Priority
  status?: TaskStatus | TaskStatus[]
  startFrom?: string
  parentId?: string
  includeBlocked?: boolean
  topLevelOnly?: boolean
  retryCooldown?: number
}

interface UpdateResult {
  success: boolean
  error?: string
  queued?: boolean
  scheduledFor?: string
}

interface PingResult {
  ok: boolean
  latencyMs: number
  error?: string
}

interface ApiQuotaInfo {
  limit: number
  remaining: number
  reset: Date
  resource?: string
}

interface TaskTimestamps {
  createdAt: string
  updatedAt?: string
  startedAt?: string
  completedAt?: string
  failedAt?: string
  resumedAt?: string
  quarantinedAt?: string
  cancelledAt?: string
}

interface TaskEvent {
  id?: string
  taskId?: string
  timestamp: string
  type: string
  level?: 'info' | 'warn' | 'error' | 'debug'
  actor?: 'system' | 'user' | 'ai'
  message: string
  metadata?: Record<string, unknown>
}

interface Task {
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

interface TaskBackend {
  readonly name: string
  findNextTask(options?: FindTaskOptions): Promise<Task | null>
  claimTask?(options?: FindTaskOptions): Promise<Task | null>
  getTask(taskId: string): Promise<Task | null>
  listPendingTasks(options?: FindTaskOptions): Promise<Task[]>
  listTasks(options?: FindTaskOptions): Promise<Task[]>
  countPending(options?: FindTaskOptions): Promise<number>
  markInProgress(taskId: string): Promise<UpdateResult>
  markCompleted(taskId: string, comment?: string): Promise<UpdateResult>
  markFailed(taskId: string, error: string): Promise<UpdateResult>
  markQuarantined(taskId: string, reason: string): Promise<UpdateResult>
  resetToPending(taskId: string): Promise<UpdateResult>
  updateTask?(taskId: string, updates: Partial<Task>): Promise<UpdateResult>
  resetAllInProgress?(): Promise<UpdateResult>
  addComment?(taskId: string, comment: string): Promise<UpdateResult>
  ping(): Promise<PingResult>
  getQuotaInfo?(): Promise<ApiQuotaInfo>
  getSubTasks(taskId: string): Promise<Task[]>
  getDependencies(taskId: string): Promise<Task[]>
  getDependents(taskId: string): Promise<Task[]>
  areDependenciesMet(taskId: string): Promise<boolean>
  createTask?(task: Omit<Task, 'id' | 'status'>): Promise<Task>
  createSubTask?(parentId: string, task: Omit<Task, 'id' | 'parentId' | 'status'>): Promise<Task>
  addDependency?(taskId: string, dependsOnId: string): Promise<UpdateResult>
  removeDependency?(taskId: string, dependsOnId: string): Promise<UpdateResult>
  rescheduleCompleted?(taskId: string, scheduledFor?: string): Promise<UpdateResult>
}

interface MemoryTaskEntry {
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

export class MemoryTaskBackend implements TaskBackend {
  readonly name = 'memory'
  private tasks: Map<string, MemoryTaskEntry>
  private nextId = 1

  constructor(initialTasks: Task[] = []) {
    this.tasks = new Map()
    for (const task of initialTasks) {
      this.tasks.set(task.id, { ...task })
    }
  }

  addTask(task: Task): void {
    this.tasks.set(task.id, { ...task })
  }

  clear(): void {
    this.tasks.clear()
    this.nextId = 1
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values())
  }

  async findNextTask(options?: FindTaskOptions): Promise<Task | null> {
    const tasks = await this.listPendingTasks(options)

    if (options?.startFrom) {
      const startIdx = tasks.findIndex(t => t.id === options.startFrom)
      if (startIdx >= 0) {
        return tasks[startIdx] ?? null
      }
    }

    return tasks[0] ?? null
  }

  async claimTask(options?: FindTaskOptions): Promise<Task | null> {
    const task = await this.findNextTask(options)
    if (!task) return null

    await this.markInProgress(task.id)
    return this.getTask(task.id)
  }

  async getTask(taskId: string): Promise<Task | null> {
    const entry = this.tasks.get(taskId)
    return entry ? { ...entry } : null
  }

  async listPendingTasks(options?: FindTaskOptions): Promise<Task[]> {
    return this.listTasks({ ...options, status: 'pending' })
  }

  async listTasks(options?: FindTaskOptions): Promise<Task[]> {
    let entries = Array.from(this.tasks.values())

    if (options?.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status]
      entries = entries.filter(t => statuses.includes(t.status))

      if (statuses.includes('failed') && options.retryCooldown !== undefined) {
        entries = entries.filter(t => {
          if (t.status !== 'failed') return true
          const failedAt = t.timestamps?.failedAt
          if (!failedAt) return false
          const elapsed = Date.now() - new Date(failedAt).getTime()
          return elapsed > options.retryCooldown!
        })
      }
    } else {
      entries = entries.filter(t => {
        if (t.status === 'pending') return true
        if (t.status === 'failed' && options?.retryCooldown !== undefined) {
          const failedAt = t.timestamps?.failedAt
          if (!failedAt) return false
          const elapsed = Date.now() - new Date(failedAt).getTime()
          return elapsed > options.retryCooldown
        }
        return false
      })
    }

    if (options?.feature) {
      entries = entries.filter(t => t.feature === options.feature)
    }

    if (options?.priority) {
      entries = entries.filter(t => (t.priority || 'medium') === options.priority)
    }

    if (options?.parentId) {
      entries = entries.filter(t => t.parentId === options.parentId)
    }

    if (options?.topLevelOnly) {
      entries = entries.filter(t => !t.parentId)
    }

    entries = entries.filter(t => {
      if (!t.scheduledFor) return true
      const scheduledDate = new Date(t.scheduledFor)
      if (isNaN(scheduledDate.getTime())) return true
      return scheduledDate <= new Date()
    })

    const priorityOrder: Record<Priority, number> = { high: 0, medium: 1, low: 2, background: 3 }
    entries.sort((a, b) => {
      const pa = priorityOrder[a.priority || 'medium']
      const pb = priorityOrder[b.priority || 'medium']
      return pa - pb
    })

    if (!options?.includeBlocked) {
      entries = entries.filter(entry => {
        if (!entry.dependsOn || entry.dependsOn.length === 0) return true
        return this.areDependenciesMetSync(entry.dependsOn)
      })
    }

    return entries.map(e => ({ ...e }))
  }

  async countPending(options?: FindTaskOptions): Promise<number> {
    const tasks = await this.listPendingTasks(options)
    return tasks.length
  }

  async markInProgress(taskId: string): Promise<UpdateResult> {
    return this.updateTaskStatus(taskId, 'in-progress')
  }

  async markCompleted(taskId: string, comment?: string): Promise<UpdateResult> {
    return this.updateTaskStatus(taskId, 'completed', comment)
  }

  async markFailed(taskId: string, error: string): Promise<UpdateResult> {
    return this.updateTaskStatus(taskId, 'failed', `Failed: ${error}`, { error })
  }

  async markQuarantined(taskId: string, reason: string): Promise<UpdateResult> {
    return this.updateTaskStatus(taskId, 'quarantined', `Quarantined: ${reason}`, { reason })
  }

  async resetToPending(taskId: string): Promise<UpdateResult> {
    const entry = this.tasks.get(taskId)
    if (!entry) {
      return { success: false, error: `Task ${taskId} not found` }
    }

    const now = new Date().toISOString()
    const oldStatus = entry.status
    entry.status = 'pending'

    if (entry.timestamps) {
      const { createdAt } = entry.timestamps
      entry.timestamps = { createdAt, updatedAt: now }
    }

    if (!entry.events) entry.events = []
    entry.events.push({
      taskId: entry.id,
      timestamp: now,
      type: 'reset',
      message: `Task reset from ${oldStatus} to pending`,
      level: 'info',
      actor: 'system',
      metadata: { oldStatus, newStatus: 'pending' },
    })

    return { success: true }
  }

  async updateTask(taskId: string, updates: Partial<Task>): Promise<UpdateResult> {
    const entry = this.tasks.get(taskId)
    if (!entry) {
      return { success: false, error: `Task ${taskId} not found` }
    }

    const now = new Date().toISOString()

    if (updates.status) {
      this.updateTaskLifecycle(entry, updates.status, 'Updated via updateTask', updates.metadata)
    } else {
      if (!entry.timestamps) {
        entry.timestamps = { createdAt: now }
      }
      entry.timestamps.updatedAt = now
    }

    if (updates.title !== undefined) entry.title = updates.title
    if (updates.description !== undefined) entry.description = updates.description
    if (updates.priority !== undefined) entry.priority = updates.priority
    if (updates.feature !== undefined) entry.feature = updates.feature
    if (updates.parentId !== undefined) entry.parentId = updates.parentId
    if (updates.dependsOn !== undefined) entry.dependsOn = updates.dependsOn
    if (updates.metadata) {
      entry.metadata = { ...entry.metadata, ...updates.metadata }
    }

    return { success: true }
  }

  async resetAllInProgress(): Promise<UpdateResult> {
    let resetCount = 0
    for (const entry of this.tasks.values()) {
      if (entry.status === 'in-progress') {
        entry.status = 'pending'
        resetCount++
      }
    }
    return { success: true }
  }

  async addComment(taskId: string, comment: string): Promise<UpdateResult> {
    const entry = this.tasks.get(taskId)
    if (!entry) {
      return { success: false, error: `Task ${taskId} not found` }
    }

    const now = new Date().toISOString()
    if (!entry.events) entry.events = []
    entry.events.push({
      taskId: entry.id,
      timestamp: now,
      type: 'log',
      message: comment,
      level: 'info',
      actor: 'system',
    })

    return { success: true }
  }

  async ping(): Promise<PingResult> {
    const start = Date.now()
    return { ok: true, latencyMs: Date.now() - start }
  }

  async getQuotaInfo(): Promise<ApiQuotaInfo> {
    return {
      limit: 1000,
      remaining: 1000,
      reset: new Date(Date.now() + 3600000),
    }
  }

  async getSubTasks(taskId: string): Promise<Task[]> {
    return Array.from(this.tasks.values())
      .filter(t => t.parentId === taskId)
      .map(e => ({ ...e }))
  }

  async getDependencies(taskId: string): Promise<Task[]> {
    const entry = this.tasks.get(taskId)
    if (!entry || !entry.dependsOn || entry.dependsOn.length === 0) return []

    const deps: Task[] = []
    for (const depId of entry.dependsOn) {
      const depEntry = this.tasks.get(depId)
      if (depEntry) {
        deps.push({ ...depEntry })
      }
    }

    return deps
  }

  async getDependents(taskId: string): Promise<Task[]> {
    return Array.from(this.tasks.values())
      .filter(t => t.dependsOn?.includes(taskId))
      .map(e => ({ ...e }))
  }

  async areDependenciesMet(taskId: string): Promise<boolean> {
    const entry = this.tasks.get(taskId)
    if (!entry || !entry.dependsOn || entry.dependsOn.length === 0) return true

    return this.areDependenciesMetSync(entry.dependsOn)
  }

  async createTask(task: Omit<Task, 'id' | 'status'>): Promise<Task> {
    const id = `TASK-${String(this.nextId++).padStart(3, '0')}`
    const now = new Date().toISOString()

    const newTask: Task = {
      ...task,
      id,
      status: 'pending',
      timestamps: task.timestamps || { createdAt: now, updatedAt: now },
      events: task.events || [{
        taskId: id,
        timestamp: now,
        type: 'created',
        message: 'Task created',
        level: 'info',
        actor: 'system',
        metadata: {
          priority: task.priority || 'medium',
          feature: task.feature,
        },
      }],
    }

    this.tasks.set(id, newTask)
    return { ...newTask }
  }

  async createSubTask(
    parentId: string,
    task: Omit<Task, 'id' | 'parentId' | 'status'>
  ): Promise<Task> {
    const parent = this.tasks.get(parentId)
    if (!parent) {
      throw new Error(`Parent task ${parentId} not found`)
    }

    const existingSubtasks = Array.from(this.tasks.values()).filter(t => t.parentId === parentId)
    const suffix = String.fromCharCode(97 + existingSubtasks.length)
    const id = `${parentId}${suffix}`

    const now = new Date().toISOString()
    const newTask: Task = {
      ...task,
      id,
      parentId,
      status: 'pending',
      timestamps: task.timestamps || { createdAt: now, updatedAt: now },
      events: task.events || [{
        taskId: id,
        timestamp: now,
        type: 'created',
        message: `Sub-task created under ${parentId}`,
        level: 'info',
        actor: 'system',
        metadata: {
          priority: task.priority || 'medium',
          feature: task.feature,
          parentId,
        },
      }],
    }

    this.tasks.set(id, newTask)
    return { ...newTask }
  }

  async addDependency(taskId: string, dependsOnId: string): Promise<UpdateResult> {
    const entry = this.tasks.get(taskId)
    if (!entry) {
      return { success: false, error: `Task ${taskId} not found` }
    }

    const depEntry = this.tasks.get(dependsOnId)
    if (!depEntry) {
      return { success: false, error: `Dependency ${dependsOnId} not found` }
    }

    if (!entry.dependsOn) entry.dependsOn = []
    if (!entry.dependsOn.includes(dependsOnId)) {
      entry.dependsOn.push(dependsOnId)
    }

    return { success: true }
  }

  async removeDependency(taskId: string, dependsOnId: string): Promise<UpdateResult> {
    const entry = this.tasks.get(taskId)
    if (!entry) {
      return { success: false, error: `Task ${taskId} not found` }
    }

    if (entry.dependsOn) {
      entry.dependsOn = entry.dependsOn.filter(d => d !== dependsOnId)
      if (entry.dependsOn.length === 0) {
        delete entry.dependsOn
      }
    }

    return { success: true }
  }

  async rescheduleCompleted(taskId: string, scheduledFor?: string): Promise<UpdateResult> {
    const entry = this.tasks.get(taskId)
    if (!entry) {
      return { success: false, error: `Task ${taskId} not found` }
    }

    if (entry.status !== 'completed') {
      return {
        success: false,
        error: `Task ${taskId} is not completed (current status: ${entry.status})`,
      }
    }

    const now = new Date().toISOString()
    const oldStatus = entry.status
    entry.status = 'pending'

    if (entry.timestamps) {
      if (entry.timestamps.completedAt) delete entry.timestamps.completedAt
      entry.timestamps.updatedAt = now
    }

    entry.scheduledFor = scheduledFor || null

    if (!entry.events) entry.events = []
    entry.events.push({
      taskId: entry.id,
      timestamp: now,
      type: 'rescheduled',
      message: `Task rescheduled from ${oldStatus} to pending${scheduledFor ? ` for ${scheduledFor}` : ''}`,
      level: 'info',
      actor: 'system',
      metadata: {
        oldStatus,
        newStatus: 'pending',
        scheduledFor: scheduledFor || null,
      },
    })

    const result: UpdateResult = { success: true }
    if (scheduledFor) {
      result.scheduledFor = scheduledFor
    }
    return result
  }

  private areDependenciesMetSync(dependsOn: string[]): boolean {
    for (const depId of dependsOn) {
      const depEntry = this.tasks.get(depId)
      if (!depEntry || depEntry.status !== 'completed') {
        return false
      }
    }
    return true
  }

  private updateTaskLifecycle(
    entry: MemoryTaskEntry,
    status: TaskStatus,
    comment?: string,
    metadata?: Record<string, unknown>
  ) {
    const now = new Date().toISOString()
    const oldStatus = entry.status
    entry.status = status

    if (!entry.timestamps) {
      entry.timestamps = { createdAt: now }
    }
    entry.timestamps.updatedAt = now

    let eventType = 'status_change'
    let eventMessage = comment || `Status changed from ${oldStatus} to ${status}`

    if (status === 'in-progress') {
      if (!entry.timestamps.startedAt) {
        entry.timestamps.startedAt = now
        eventType = 'started'
        eventMessage = comment || 'Task started'
      } else {
        entry.timestamps.resumedAt = now
        eventType = 'resumed'
        eventMessage = comment || 'Task resumed'
      }
    } else if (status === 'failed') {
      entry.timestamps.failedAt = now
      eventType = 'failed'
      eventMessage = comment || 'Task failed'
      entry.failureCount = (entry.failureCount || 0) + 1
      entry.lastError = (metadata?.error as string) || comment || 'Unknown error'
    } else if (status === 'quarantined') {
      entry.timestamps.quarantinedAt = now
      eventType = 'quarantined'
      eventMessage = comment || 'Task quarantined'
      entry.lastError = (metadata?.reason as string) || comment || 'Task moved to DLQ'
    } else if (status === 'completed') {
      entry.timestamps.completedAt = now
      eventType = 'completed'
      eventMessage = comment || 'Task completed'
      entry.failureCount = 0
      delete entry.lastError
    } else if (status === 'pending') {
      if (oldStatus !== 'in-progress') {
        entry.failureCount = 0
        delete entry.lastError
      }
    } else if (status === 'cancelled') {
      entry.timestamps.cancelledAt = now
      eventType = 'cancelled'
      eventMessage = comment || 'Task cancelled'
    }

    if (!entry.events) entry.events = []
    entry.events.push({
      taskId: entry.id,
      timestamp: now,
      type: eventType,
      message: eventMessage,
      level: status === 'failed' ? 'error' : 'info',
      actor: 'system',
      metadata: {
        oldStatus,
        newStatus: status,
        ...metadata,
      },
    })
  }

  private updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    comment?: string,
    metadata?: Record<string, unknown>
  ): UpdateResult {
    const entry = this.tasks.get(taskId)
    if (!entry) {
      return { success: false, error: `Task ${taskId} not found` }
    }

    this.updateTaskLifecycle(entry, status, comment, metadata)
    return { success: true }
  }
}

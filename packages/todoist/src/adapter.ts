import { TodoistClient, type TodoistTask } from './index'
import type {
  TaskBackend,
  Task,
  Priority,
  TaskStatus,
  FindTaskOptions,
  UpdateResult,
  PingResult,
} from '@loopwork-ai/loopwork/contracts'

export interface TodoistBackendOptions {
  client: TodoistClient
  projectId?: string
}

export class TodoistTaskBackend implements TaskBackend {
  readonly name = 'todoist'
  private client: TodoistClient
  private projectId?: string

  constructor(options: TodoistBackendOptions) {
    this.client = options.client
    this.projectId = options.projectId
  }

  /**
   * Map Todoist priority (1-4) to Loopwork priority (low, medium, high)
   * Todoist: 1=natural, 2=low, 3=medium, 4=urgent
   */
  private mapPriority(p: number): Priority {
    switch (p) {
      case 4:
        return 'high'
      case 3:
        return 'medium'
      case 2:
      case 1:
      default:
        return 'low'
    }
  }

  private reverseMapPriority(p: Priority): 1 | 2 | 3 | 4 {
    switch (p) {
      case 'high':
        return 4
      case 'medium':
        return 3
      case 'low':
      case 'background':
      default:
        return 2
    }
  }

  private toLoopworkTask(t: TodoistTask): Task {
    let status: TaskStatus = t.is_completed ? 'completed' : 'pending'
    let failedAt: string | undefined

    if (!t.is_completed) {
      if (t.labels.includes('loopwork:in-progress')) {
        status = 'in-progress'
      } else if (t.labels.some(l => l.startsWith('loopwork:failed'))) {
        status = 'failed'
        // Try to parse timestamp from label like loopwork:failed:2026-01-31T11-00-00Z
        const failedLabel = t.labels.find(l => l.startsWith('loopwork:failed:'))
        if (failedLabel) {
          const ts = failedLabel.replace('loopwork:failed:', '').replace(/-/g, ':')
          if (!isNaN(Date.parse(ts))) {
            failedAt = ts
          }
        }
      } else if (t.labels.includes('loopwork:quarantined')) {
        status = 'quarantined'
      }
    }

    return {
      id: t.id,
      title: t.content,
      description: t.description || '',
      status,
      priority: this.mapPriority(t.priority),
      parentId: t.parent_id,
      metadata: {
        todoistId: t.id,
        labels: t.labels,
        projectId: t.project_id,
      },
      timestamps: {
        createdAt: t.created_at,
        failedAt,
      }
    }
  }

  async findNextTask(options?: FindTaskOptions): Promise<Task | null> {
    const tasks = await this.listPendingTasks(options)
    return tasks.length > 0 ? tasks[0] : null
  }

  async getTask(taskId: string): Promise<Task | null> {
    try {
      const task = await this.client.getTask(taskId)
      return this.toLoopworkTask(task)
    } catch {
      return null
    }
  }

  async listPendingTasks(options?: FindTaskOptions): Promise<Task[]> {
    if (!this.projectId) {
      throw new Error('TodoistTaskBackend: projectId is required for listing tasks')
    }

    try {
      const todoistTasks = await this.client.getProjectTasks(this.projectId)
      let tasks = todoistTasks
        .filter((t) => !t.is_completed)
        .map((t) => this.toLoopworkTask(t))

      if (options?.feature) {
        tasks = tasks.filter((t: Task) => 
          (t.metadata?.labels as string[])?.includes(`feature:${options.feature}`)
        )
      }

      if (options?.priority) {
        tasks = tasks.filter((t: Task) => t.priority === options.priority)
      }

      if (options?.parentId) {
        tasks = tasks.filter((t: Task) => t.parentId === options.parentId)
      } else if (options?.topLevelOnly) {
        tasks = tasks.filter((t: Task) => !t.parentId)
      }

      // Handle retry cooldown for failed tasks
      tasks = tasks.filter((t: Task) => {
        if (t.status === 'pending') return true
        if (t.status === 'failed' && options?.retryCooldown !== undefined) {
          const failedAt = t.timestamps?.failedAt
          if (!failedAt) return false // Cannot verify cooldown without timestamp
          const elapsed = Date.now() - new Date(failedAt).getTime()
          return elapsed > options.retryCooldown
        }
        return false
      })

      const priorityOrder = { high: 0, medium: 1, low: 2, background: 3 }
      tasks.sort((a, b) => (priorityOrder as any)[a.priority] - (priorityOrder as any)[b.priority])

      return tasks
    } catch (e: any) {
      console.error(`Todoist: Failed to list tasks: ${e.message}`)
      return []
    }
  }

  async countPending(options?: FindTaskOptions): Promise<number> {
    const tasks = await this.listPendingTasks(options)
    return tasks.length
  }

  async markInProgress(taskId: string): Promise<UpdateResult> {
    try {
      // Todoist doesn't have an in-progress state, use a label
      const task = await this.client.getTask(taskId)
      const labels = task.labels.filter(l => !l.startsWith('loopwork:'))
      labels.push('loopwork:in-progress')
      await this.client.updateTask(taskId, { labels })
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async markCompleted(taskId: string, comment?: string): Promise<UpdateResult> {
    try {
      await this.client.completeTask(taskId)
      if (comment) {
        await this.client.addComment(taskId, comment)
      }
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async markFailed(taskId: string, error: string): Promise<UpdateResult> {
    try {
      await this.client.addComment(taskId, `❌ Task failed: ${error}`)
      const task = await this.client.getTask(taskId)
      const now = new Date().toISOString().replace(/:/g, '-')
      const labels = task.labels.filter(l => !l.startsWith('loopwork:'))
      labels.push(`loopwork:failed:${now}`)
      await this.client.updateTask(taskId, { labels })
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async markQuarantined(taskId: string, reason: string): Promise<UpdateResult> {
    try {
      await this.client.addComment(taskId, `⚠️ Task quarantined: ${reason}`)
      const task = await this.client.getTask(taskId)
      const labels = task.labels.filter(l => !l.startsWith('loopwork:'))
      labels.push('loopwork:quarantined')
      await this.client.updateTask(taskId, { labels })
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async resetToPending(taskId: string): Promise<UpdateResult> {
    try {
      const task = await this.client.getTask(taskId)
      if (task.is_completed) {
        await this.client.reopenTask(taskId)
      }
      
      const labels = task.labels.filter((l) => !l.startsWith('loopwork:'))
      await this.client.updateTask(taskId, { labels })
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async addComment(taskId: string, comment: string): Promise<UpdateResult> {
    try {
      await this.client.addComment(taskId, comment)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async ping(): Promise<PingResult> {
    const start = Date.now()
    try {
      await this.client.getProjects()
      return { ok: true, latencyMs: Date.now() - start }
    } catch (e: any) {
      return { ok: false, latencyMs: Date.now() - start, error: e.message }
    }
  }

  async getSubTasks(taskId: string): Promise<Task[]> {
    if (!this.projectId) return []
    try {
      const tasks = await this.client.getProjectTasks(this.projectId)
      return tasks
        .filter((t) => t.parent_id === taskId)
        .map((t) => this.toLoopworkTask(t))
    } catch {
      return []
    }
  }

  async getDependencies(taskId: string): Promise<Task[]> {
    return []
  }

  async getDependents(taskId: string): Promise<Task[]> {
    return []
  }

  async areDependenciesMet(taskId: string): Promise<boolean> {
    return true
  }

  async createTask(task: Omit<Task, 'id' | 'status'>): Promise<Task> {
    const labels = task.feature ? [`feature:${task.feature}`] : []
    const todoistTask = await this.client.createTask(task.title, {
      description: task.description,
      projectId: this.projectId,
      priority: this.reverseMapPriority(task.priority),
      labels,
    })
    return this.toLoopworkTask(todoistTask)
  }

  async createSubTask(
    parentId: string,
    task: Omit<Task, 'id' | 'parentId' | 'status'>
  ): Promise<Task> {
    const labels = task.feature ? [`feature:${task.feature}`] : []
    const todoistTask = await this.client.createTask(task.title, {
      description: task.description,
      projectId: this.projectId,
      parentId,
      priority: this.reverseMapPriority(task.priority),
      labels,
    })
    return this.toLoopworkTask(todoistTask)
  }
}

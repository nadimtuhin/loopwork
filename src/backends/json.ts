import fs from 'fs'
import path from 'path'
import type {
  TaskBackend,
  Task,
  TaskStatus,
  Priority,
  FindTaskOptions,
  UpdateResult,
  BackendConfig,
} from './types'

/**
 * JSON task file schema
 */
interface JsonTaskEntry {
  id: string
  status: TaskStatus
  priority?: Priority
  feature?: string
  parentId?: string       // Parent task ID (for sub-tasks)
  dependsOn?: string[]    // Task IDs this task depends on
}

interface JsonTasksFile {
  tasks: JsonTaskEntry[]
  features?: Record<string, { name: string; priority?: Priority }>
}

/**
 * JSON File Adapter
 *
 * Adapts JSON task files + markdown PRDs to the TaskBackend interface.
 *
 * File structure:
 *   .specs/tasks/
 *   ├── tasks.json          # Task registry
 *   ├── TASK-001-01.md      # PRD files
 *   └── TASK-001-02.md
 *
 * Uses file locking to prevent concurrent access issues.
 */
export class JsonTaskAdapter implements TaskBackend {
  readonly name = 'json'
  private tasksFile: string
  private tasksDir: string
  private lockFile: string
  private lockTimeout = 5000 // 5 seconds
  private lockRetryDelay = 100 // 100ms between retries

  constructor(config: BackendConfig) {
    this.tasksFile = config.tasksFile || '.specs/tasks/tasks.json'
    this.tasksDir = config.tasksDir || path.dirname(this.tasksFile)
    this.lockFile = `${this.tasksFile}.lock`
  }

  /**
   * Acquire file lock for write operations
   */
  private async acquireLock(timeout = this.lockTimeout): Promise<boolean> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      try {
        // Try to create lock file exclusively
        fs.writeFileSync(this.lockFile, String(process.pid), { flag: 'wx' })
        return true
      } catch (e: any) {
        if (e.code === 'EEXIST') {
          // Lock exists, check if stale
          try {
            const lockContent = fs.readFileSync(this.lockFile, 'utf-8')
            const lockPid = parseInt(lockContent, 10)
            const lockStat = fs.statSync(this.lockFile)
            const lockAge = Date.now() - lockStat.mtimeMs

            // If lock is older than 30 seconds, consider it stale
            if (lockAge > 30000) {
              fs.unlinkSync(this.lockFile)
              continue
            }

            // Check if process is still alive (only works for same-machine processes)
            try {
              process.kill(lockPid, 0)
            } catch {
              // Process doesn't exist, remove stale lock
              fs.unlinkSync(this.lockFile)
              continue
            }
          } catch {
            // Error reading lock, try to remove it
            try { fs.unlinkSync(this.lockFile) } catch {}
            continue
          }

          // Wait before retry
          await new Promise(r => setTimeout(r, this.lockRetryDelay))
        } else {
          // Other error (e.g., directory doesn't exist)
          return false
        }
      }
    }

    return false
  }

  /**
   * Release file lock
   */
  private releaseLock(): void {
    try {
      // Only remove if we own the lock
      const content = fs.readFileSync(this.lockFile, 'utf-8')
      if (parseInt(content, 10) === process.pid) {
        fs.unlinkSync(this.lockFile)
      }
    } catch {
      // Ignore errors during cleanup
    }
  }

  /**
   * Execute a function with file lock
   */
  private async withLock<T>(fn: () => T): Promise<T> {
    const acquired = await this.acquireLock()
    if (!acquired) {
      throw new Error('Failed to acquire file lock')
    }

    try {
      return fn()
    } finally {
      this.releaseLock()
    }
  }

  async findNextTask(options?: FindTaskOptions): Promise<Task | null> {
    const tasks = await this.listPendingTasks(options)

    if (options?.startFrom) {
      const startIdx = tasks.findIndex(t => t.id === options.startFrom)
      if (startIdx >= 0) {
        return tasks[startIdx]
      }
    }

    return tasks[0] || null
  }

  async getTask(taskId: string): Promise<Task | null> {
    const data = this.loadTasksFile()
    if (!data) return null

    const entry = data.tasks.find(t => t.id === taskId)
    if (!entry) return null

    return this.loadFullTask(entry, data)
  }

  async listPendingTasks(options?: FindTaskOptions): Promise<Task[]> {
    const data = this.loadTasksFile()
    if (!data) return []

    let entries = data.tasks.filter(t => t.status === 'pending')

    if (options?.feature) {
      entries = entries.filter(t => t.feature === options.feature)
    }

    if (options?.priority) {
      entries = entries.filter(t => (t.priority || 'medium') === options.priority)
    }

    // Filter by parent
    if (options?.parentId) {
      entries = entries.filter(t => t.parentId === options.parentId)
    }

    // Filter to top-level only (no parent)
    if (options?.topLevelOnly) {
      entries = entries.filter(t => !t.parentId)
    }

    // Sort by priority: high > medium > low
    const priorityOrder = { high: 0, medium: 1, low: 2 }
    entries.sort((a, b) => {
      const pa = priorityOrder[a.priority || 'medium']
      const pb = priorityOrder[b.priority || 'medium']
      return pa - pb
    })

    const tasks: Task[] = []
    for (const entry of entries) {
      const task = await this.loadFullTask(entry, data)
      if (task) {
        // Check if task dependencies are met
        if (!options?.includeBlocked && task.dependsOn && task.dependsOn.length > 0) {
          const depsMet = await this.areDependenciesMetInternal(task.dependsOn, data)
          if (!depsMet) continue // Skip blocked tasks
        }
        tasks.push(task)
      }
    }

    return tasks
  }

  /**
   * Internal method to check if dependencies are met
   */
  private areDependenciesMetInternal(dependsOn: string[], data: JsonTasksFile): boolean {
    for (const depId of dependsOn) {
      const depEntry = data.tasks.find(t => t.id === depId)
      if (!depEntry || depEntry.status !== 'completed') {
        return false
      }
    }
    return true
  }

  async countPending(options?: FindTaskOptions): Promise<number> {
    const tasks = await this.listPendingTasks(options)
    return tasks.length
  }

  async markInProgress(taskId: string): Promise<UpdateResult> {
    return this.updateTaskStatus(taskId, 'in-progress')
  }

  async markCompleted(taskId: string, _comment?: string): Promise<UpdateResult> {
    return this.updateTaskStatus(taskId, 'completed')
  }

  async markFailed(taskId: string, error: string): Promise<UpdateResult> {
    const result = await this.updateTaskStatus(taskId, 'failed')
    if (result.success) {
      // Append error to a log file
      const logFile = path.join(this.tasksDir, `${taskId}.log`)
      const timestamp = new Date().toISOString()
      const entry = `\n[${timestamp}] FAILED: ${error}\n`
      try {
        fs.appendFileSync(logFile, entry)
      } catch {
        // Ignore log write errors
      }
    }
    return result
  }

  async resetToPending(taskId: string): Promise<UpdateResult> {
    return this.updateTaskStatus(taskId, 'pending')
  }

  async setPriority(taskId: string, priority: Task['priority']): Promise<UpdateResult> {
    return this.withLock(async () => {
      const data = this.loadTasksFile()
      if (!data) return { success: false, error: 'Tasks file not found' }

      const taskIndex = data.tasks.findIndex((t) => t.id === taskId)
      if (taskIndex === -1) return { success: false, error: 'Task not found' }

      data.tasks[taskIndex].priority = priority
      if (!this.saveTasksFile(data)) {
        return { success: false, error: 'Failed to save tasks file' }
      }

      return { success: true }
    })
  }

  async addComment(taskId: string, comment: string): Promise<UpdateResult> {
    const logFile = path.join(this.tasksDir, `${taskId}.log`)
    const timestamp = new Date().toISOString()
    const entry = `\n[${timestamp}] ${comment}\n`
    try {
      fs.appendFileSync(logFile, entry)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async ping(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now()
    try {
      // Check if tasks file exists and is readable
      if (!fs.existsSync(this.tasksFile)) {
        return { ok: false, latencyMs: Date.now() - start, error: 'Tasks file not found' }
      }

      // Try to read and parse the file
      const content = fs.readFileSync(this.tasksFile, 'utf-8')
      JSON.parse(content)

      return { ok: true, latencyMs: Date.now() - start }
    } catch (e: any) {
      return { ok: false, latencyMs: Date.now() - start, error: e.message }
    }
  }

  private loadTasksFile(): JsonTasksFile | null {
    try {
      if (!fs.existsSync(this.tasksFile)) {
        return null
      }
      const content = fs.readFileSync(this.tasksFile, 'utf-8')
      return JSON.parse(content)
    } catch {
      return null
    }
  }

  private saveTasksFile(data: JsonTasksFile): boolean {
    try {
      const content = JSON.stringify(data, null, 2)
      fs.writeFileSync(this.tasksFile, content)
      return true
    } catch {
      return false
    }
  }

  private async loadFullTask(entry: JsonTaskEntry, data: JsonTasksFile): Promise<Task | null> {
    // Load PRD from markdown file
    const prdFile = path.join(this.tasksDir, `${entry.id}.md`)
    let description = ''
    let title = entry.id

    try {
      if (fs.existsSync(prdFile)) {
        const content = fs.readFileSync(prdFile, 'utf-8')
        description = content

        // Extract title from first heading
        const titleMatch = content.match(/^#\s+(.+)$/m)
        if (titleMatch) {
          title = titleMatch[1]
        }
      }
    } catch {
      // Use empty description if file not found
    }

    // Get feature info
    const featureInfo = entry.feature && data.features?.[entry.feature]

    return {
      id: entry.id,
      title,
      description,
      status: entry.status,
      priority: entry.priority || 'medium',
      feature: entry.feature,
      parentId: entry.parentId,
      dependsOn: entry.dependsOn,
      metadata: {
        prdFile,
        featureName: featureInfo?.name,
      },
    }
  }

  // Sub-task and dependency methods

  async getSubTasks(taskId: string): Promise<Task[]> {
    const data = this.loadTasksFile()
    if (!data) return []

    const subEntries = data.tasks.filter(t => t.parentId === taskId)
    const tasks: Task[] = []

    for (const entry of subEntries) {
      const task = await this.loadFullTask(entry, data)
      if (task) tasks.push(task)
    }

    return tasks
  }

  async getDependencies(taskId: string): Promise<Task[]> {
    const data = this.loadTasksFile()
    if (!data) return []

    const entry = data.tasks.find(t => t.id === taskId)
    if (!entry || !entry.dependsOn || entry.dependsOn.length === 0) return []

    const deps: Task[] = []
    for (const depId of entry.dependsOn) {
      const depEntry = data.tasks.find(t => t.id === depId)
      if (depEntry) {
        const task = await this.loadFullTask(depEntry, data)
        if (task) deps.push(task)
      }
    }

    return deps
  }

  async getDependents(taskId: string): Promise<Task[]> {
    const data = this.loadTasksFile()
    if (!data) return []

    const dependents = data.tasks.filter(t => t.dependsOn?.includes(taskId))
    const tasks: Task[] = []

    for (const entry of dependents) {
      const task = await this.loadFullTask(entry, data)
      if (task) tasks.push(task)
    }

    return tasks
  }

  async areDependenciesMet(taskId: string): Promise<boolean> {
    const data = this.loadTasksFile()
    if (!data) return true

    const entry = data.tasks.find(t => t.id === taskId)
    if (!entry || !entry.dependsOn || entry.dependsOn.length === 0) return true

    return this.areDependenciesMetInternal(entry.dependsOn, data)
  }

  async createTask(task: Omit<Task, 'id' | 'status'>): Promise<Task> {
    return await this.withLock(() => {
      const data = this.loadTasksFile()
      if (!data) throw new Error('Tasks file not found')

      // Generate new task ID based on existing tasks
      const existingIds = data.tasks.map(t => t.id)
      const prefix = task.feature ? task.feature.toUpperCase() : 'TASK'

      // Find the next available number
      let num = 1
      while (existingIds.includes(`${prefix}-${String(num).padStart(3, '0')}`)) {
        num++
      }
      const newId = `${prefix}-${String(num).padStart(3, '0')}`

      const newEntry: JsonTaskEntry = {
        id: newId,
        status: 'pending',
        priority: task.priority || 'medium',
        feature: task.feature,
        parentId: task.parentId,
        dependsOn: task.dependsOn,
      }

      data.tasks.push(newEntry)
      this.saveTasksFile(data)

      // Create PRD file
      const prdFile = path.join(this.tasksDir, `${newId}.md`)
      const prdContent = `# ${task.title}\n\n${task.description || ''}`
      fs.writeFileSync(prdFile, prdContent)

      return {
        id: newId,
        title: task.title,
        description: task.description || '',
        status: 'pending',
        priority: task.priority || 'medium',
        feature: task.feature,
        parentId: task.parentId,
        dependsOn: task.dependsOn,
        metadata: { prdFile },
      }
    })
  }

  async createSubTask(
    parentId: string,
    task: Omit<Task, 'id' | 'parentId' | 'status'>
  ): Promise<Task> {
    return await this.withLock(() => {
      const data = this.loadTasksFile()
      if (!data) throw new Error('Tasks file not found')

      // Check parent exists
      const parent = data.tasks.find(t => t.id === parentId)
      if (!parent) throw new Error(`Parent task ${parentId} not found`)

      // Generate sub-task ID (parent-01a, parent-01b, etc.)
      const existingSubtasks = data.tasks.filter(t => t.parentId === parentId)
      const suffix = String.fromCharCode(97 + existingSubtasks.length) // a, b, c...
      const newId = `${parentId}${suffix}`

      const newEntry: JsonTaskEntry = {
        id: newId,
        status: 'pending',
        priority: task.priority,
        feature: task.feature,
        parentId,
        dependsOn: task.dependsOn,
      }

      data.tasks.push(newEntry)
      this.saveTasksFile(data)

      // Create PRD file
      const prdFile = path.join(this.tasksDir, `${newId}.md`)
      const prdContent = `# ${task.title}\n\n${task.description}`
      fs.writeFileSync(prdFile, prdContent)

      return {
        id: newId,
        title: task.title,
        description: task.description,
        status: 'pending',
        priority: task.priority,
        feature: task.feature,
        parentId,
        dependsOn: task.dependsOn,
        metadata: { prdFile },
      }
    })
  }

  async addDependency(taskId: string, dependsOnId: string): Promise<UpdateResult> {
    try {
      return await this.withLock(() => {
        const data = this.loadTasksFile()
        if (!data) return { success: false, error: 'Tasks file not found' }

        const entry = data.tasks.find(t => t.id === taskId)
        if (!entry) return { success: false, error: `Task ${taskId} not found` }

        // Check dependency exists
        const depEntry = data.tasks.find(t => t.id === dependsOnId)
        if (!depEntry) return { success: false, error: `Dependency ${dependsOnId} not found` }

        // Add dependency
        if (!entry.dependsOn) entry.dependsOn = []
        if (!entry.dependsOn.includes(dependsOnId)) {
          entry.dependsOn.push(dependsOnId)
        }

        this.saveTasksFile(data)
        return { success: true }
      })
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async removeDependency(taskId: string, dependsOnId: string): Promise<UpdateResult> {
    try {
      return await this.withLock(() => {
        const data = this.loadTasksFile()
        if (!data) return { success: false, error: 'Tasks file not found' }

        const entry = data.tasks.find(t => t.id === taskId)
        if (!entry) return { success: false, error: `Task ${taskId} not found` }

        if (entry.dependsOn) {
          entry.dependsOn = entry.dependsOn.filter(d => d !== dependsOnId)
          if (entry.dependsOn.length === 0) {
            delete entry.dependsOn
          }
        }

        this.saveTasksFile(data)
        return { success: true }
      })
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  private async updateTaskStatus(taskId: string, status: TaskStatus): Promise<UpdateResult> {
    try {
      return await this.withLock(() => {
        const data = this.loadTasksFile()
        if (!data) {
          return { success: false, error: 'Tasks file not found' }
        }

        const entry = data.tasks.find(t => t.id === taskId)
        if (!entry) {
          return { success: false, error: `Task ${taskId} not found` }
        }

        entry.status = status

        if (this.saveTasksFile(data)) {
          return { success: true }
        }

        return { success: false, error: 'Failed to save tasks file' }
      })
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }
}

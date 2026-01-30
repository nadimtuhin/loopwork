import fs from 'fs'
import path from 'path'
import { logger } from '../core/utils'
import { LoopworkError } from '../core/errors'
import { DEFAULT_LOCK_TIMEOUT_MS, LOCK_STALE_TIMEOUT_MS, LOCK_RETRY_DELAY_MS } from '../core/constants'
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
 * Type guard for Node.js file system errors
 */
interface NodeJSError extends Error {
  code?: string
}

function isNodeJSError(error: unknown): error is NodeJSError {
  return error instanceof Error && 'code' in error
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

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
  private lockTimeout = DEFAULT_LOCK_TIMEOUT_MS
  private lockRetryDelay = LOCK_RETRY_DELAY_MS

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
      } catch (e: unknown) {
        if (isNodeJSError(e) && e.code === 'EEXIST') {
          // Lock exists, check if stale
          try {
            const lockContent = fs.readFileSync(this.lockFile, 'utf-8')
            const lockPid = parseInt(lockContent, 10)
            const lockStat = fs.statSync(this.lockFile)
            const lockAge = Date.now() - lockStat.mtimeMs

            // If lock is older than LOCK_STALE_TIMEOUT_MS, consider it stale
            if (lockAge > LOCK_STALE_TIMEOUT_MS) {
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
          } catch (e: unknown) {
            // Error reading lock, try to remove it
            logger.warn(`Failed to read lock file: ${getErrorMessage(e)}`)
            try {
              fs.unlinkSync(this.lockFile)
            } catch (unlinkError: unknown) {
              logger.warn(`Failed to remove stale lock file: ${getErrorMessage(unlinkError)}`)
            }
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
    } catch (e: unknown) {
      // Log but don't throw during cleanup - lock may have been removed by another process
      logger.warn(`Failed to release lock file: ${getErrorMessage(e)}`)
    }
  }

  /**
   * Execute a function with file lock
   */
  private async withLock<T>(fn: () => T): Promise<T> {
    const acquired = await this.acquireLock()
    if (!acquired) {
      throw new LoopworkError(
        'Failed to acquire file lock',
        [
          'Another process may be accessing the tasks file',
          `Check if a stale lock exists: ${this.lockFile}`,
          'Manually remove the lock file if safe',
        ]
      )
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
        return this.getTask(tasks[startIdx].id)
      }
    }

    if (!tasks[0]) return null
    return this.getTask(tasks[0].id)
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
      // Check if task dependencies are met
      if (!options?.includeBlocked && entry.dependsOn && entry.dependsOn.length > 0) {
        const depsMet = await this.areDependenciesMetInternal(entry.dependsOn, data)
        if (!depsMet) continue // Skip blocked tasks
      }

      const task = this.loadTaskSummary(entry, data)
      tasks.push(task)
    }

    return tasks
  }

  private loadTaskSummary(entry: JsonTaskEntry, data: JsonTasksFile): Task {
    const featureInfo = entry.feature && data.features?.[entry.feature]

    return {
      id: entry.id,
      title: entry.id,
      description: '',
      status: entry.status,
      priority: entry.priority || 'medium',
      feature: entry.feature,
      parentId: entry.parentId,
      dependsOn: entry.dependsOn,
      metadata: {
        featureName: featureInfo?.name,
      },
    }
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
      } catch (e: unknown) {
        // Log write failures are non-critical, just warn
        logger.warn(`Failed to write error log for ${taskId}: ${getErrorMessage(e)}`)
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
    } catch (e: unknown) {
      return { success: false, error: getErrorMessage(e) }
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
    } catch (e: unknown) {
      return { ok: false, latencyMs: Date.now() - start, error: getErrorMessage(e) }
    }
  }

  private loadTasksFile(): JsonTasksFile | null {
    try {
      if (!fs.existsSync(this.tasksFile)) {
        return null
      }
      const content = fs.readFileSync(this.tasksFile, 'utf-8')
      return JSON.parse(content)
    } catch (e: unknown) {
      logger.error(`Failed to load tasks file ${this.tasksFile}: ${getErrorMessage(e)}`)
      throw new LoopworkError(
        `Cannot read or parse tasks file: ${this.tasksFile}`,
        [
          'Check that the file exists and contains valid JSON',
          'Verify file permissions allow reading',
          'Review the file format matches the expected schema',
        ]
      )
    }
  }

  private saveTasksFile(data: JsonTasksFile): boolean {
    try {
      const content = JSON.stringify(data, null, 2)
      fs.writeFileSync(this.tasksFile, content)
      return true
    } catch (e: unknown) {
      logger.error(`Failed to save tasks file ${this.tasksFile}: ${getErrorMessage(e)}`)
      throw new LoopworkError(
        `Cannot write to tasks file: ${this.tasksFile}`,
        [
          'Check file permissions allow writing',
          'Verify the directory exists',
          'Ensure disk space is available',
        ]
      )
    }
  }

  private async loadFullTask(entry: JsonTaskEntry, data: JsonTasksFile): Promise<Task | null> {
    const prdFile = path.join(this.tasksDir, `${entry.id}.md`)
    let description = ''
    let title = entry.id
    let prdWarning: string | undefined

    try {
      if (fs.existsSync(prdFile)) {
        const content = fs.readFileSync(prdFile, 'utf-8')
        description = content

        const titleMatch = content.match(/^#\s+(.+)$/m)
        if (titleMatch) {
          title = titleMatch[1]
        }

        if (!content.trim() || content.trim().length < 10) {
          prdWarning = `PRD file is empty or too short: ${prdFile}`
        }
      } else {
        prdWarning = `PRD file not found: ${prdFile}`
      }
    } catch (e: unknown) {
      prdWarning = `Error reading PRD file: ${getErrorMessage(e)}`
    }

    const featureInfo = entry.feature && data.features?.[entry.feature]

    if (prdWarning) {
      logger.warn(prdWarning)
      logger.info('💡 Create or update the PRD file with task requirements')
      logger.info(`💡 Expected location: ${prdFile}`)
    }

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
        prdWarning,
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
    } catch (e: unknown) {
      return { success: false, error: getErrorMessage(e) }
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
    } catch (e: unknown) {
      return { success: false, error: getErrorMessage(e) }
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
    } catch (e: unknown) {
      return { success: false, error: getErrorMessage(e) }
    }
  }
}

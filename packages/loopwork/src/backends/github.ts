import { $ } from 'bun'
import type { TaskBackend, Task, FindTaskOptions, UpdateResult, BackendConfig } from './types'
import { LABELS } from '../contracts/task'
import { GITHUB_RETRY_BASE_DELAY_MS, GITHUB_MAX_RETRIES } from '../core/constants'
import { LoopworkError } from '../core/errors'

/**
 * Patterns for parsing dependencies and parent references from issue body
 * Enhanced to support GitHub issue references (#123, owner/repo#123)
 */
const PARENT_PATTERN = /(?:^|\n)\s*(?:Parent|parent):\s*(?:#?(\d+)|([A-Z]+-\d+-\d+[a-z]?)|(?:[\w-]+\/[\w-]+)?#(\d+))/i
const DEPENDS_PATTERN = /(?:^|\n)\s*(?:Depends on|depends on|Dependencies|dependencies):\s*(.+?)(?:\n|$)/i

interface GitHubIssue {
  number: number
  title: string
  body?: string
  state: 'open' | 'closed'
  labels: { name: string }[]
  url: string
}

/**
 * GitHub Issues Adapter
 *
 * Adapts GitHub Issues API (via gh CLI) to the TaskBackend interface.
 */
export class GitHubTaskAdapter implements TaskBackend {
  readonly name = 'github'
  private repo?: string
  private maxRetries = GITHUB_MAX_RETRIES
  private baseDelayMs = GITHUB_RETRY_BASE_DELAY_MS

  constructor(config: BackendConfig) {
    this.repo = config.repo
  }

  private repoFlag(): string {
    return this.repo ? `--repo ${this.repo}` : ''
  }

  private async withRetry<T>(fn: () => Promise<T>, retries = this.maxRetries): Promise<T> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn()
      } catch (e: unknown) {
        lastError = e instanceof Error ? e : new Error(String(e))
        const isRetryable = this.isRetryableError(e)
        if (!isRetryable || attempt === retries) throw e
        const delay = this.baseDelayMs * Math.pow(2, attempt)
        await new Promise(r => setTimeout(r, delay))
      }
    }

    throw lastError || new Error('Retry failed')
  }

  private isRetryableError(error: unknown): boolean {
    const message = String(error?.message || error || '').toLowerCase()
    if (message.includes('network') || message.includes('timeout')) return true
    if (message.includes('econnreset') || message.includes('econnrefused')) return true
    if (message.includes('socket hang up')) return true
    if (message.includes('rate limit') || message.includes('429')) return true
    if (message.includes('502') || message.includes('503') || message.includes('504')) return true
    return false
  }

  private extractIssueNumber(taskId: string): number | null {
    if (taskId.startsWith('GH-')) return parseInt(taskId.slice(3), 10)
    const num = parseInt(taskId, 10)
    if (!isNaN(num)) return num
    const hashMatch = taskId.match(/#(\d+)/)
    if (hashMatch) return parseInt(hashMatch[1], 10)
    return null
  }

  async findNextTask(options?: FindTaskOptions): Promise<Task | null> {
    const tasks = await this.listPendingTasks(options)
    const task = tasks[0] || null
    if (!task) return null

    return this.getTask(task.id)
  }

  async getTask(taskId: string): Promise<Task | null> {
    const issueNumber = this.extractIssueNumber(taskId)
    if (!issueNumber) return null

    try {
      return await this.withRetry(async () => {
        const result = await $`gh issue view ${issueNumber} ${this.repoFlag()} --json number,title,body,labels,url,state`.quiet()
        const issue: GitHubIssue = JSON.parse(result.stdout.toString())
        return this.adaptIssue(issue)
      })
    } catch {
      return null
    }
  }

  async listPendingTasks(options?: FindTaskOptions): Promise<Task[]> {
    const labels = [LABELS.LOOPWORK_TASK, LABELS.STATUS_PENDING]
    if (options?.feature) labels.push(`feat:${options.feature}`)
    if (options?.priority) labels.push(`priority:${options.priority}`)

    try {
      return await this.withRetry(async () => {
        const labelArg = labels.join(',')
        const result = await $`gh issue list ${this.repoFlag()} --label "${labelArg}" --state open --json number,title,labels,url --limit 100`.quiet()
        const issues: GitHubIssue[] = JSON.parse(result.stdout.toString())
        return issues.map(issue => this.adaptIssue(issue))
      })
    } catch {
      return []
    }
  }

  async countPending(options?: FindTaskOptions): Promise<number> {
    const tasks = await this.listPendingTasks(options)
    return tasks.length
  }

  async markInProgress(taskId: string): Promise<UpdateResult> {
    const issueNumber = this.extractIssueNumber(taskId)
    if (!issueNumber) return { success: false, error: 'Invalid task ID' }

    try {
      await this.withRetry(async () => {
        await $`gh issue edit ${issueNumber} ${this.repoFlag()} --remove-label "${LABELS.STATUS_PENDING}"`.quiet().nothrow()
        await $`gh issue edit ${issueNumber} ${this.repoFlag()} --remove-label "${LABELS.STATUS_FAILED}"`.quiet().nothrow()
        await $`gh issue edit ${issueNumber} ${this.repoFlag()} --add-label "${LABELS.STATUS_IN_PROGRESS}"`.quiet()
      })
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  async markCompleted(taskId: string, comment?: string): Promise<UpdateResult> {
    const issueNumber = this.extractIssueNumber(taskId)
    if (!issueNumber) return { success: false, error: 'Invalid task ID' }

    try {
      await this.withRetry(async () => {
        const msg = comment || 'Completed by Loopwork'
        await $`gh issue close ${issueNumber} ${this.repoFlag()} --comment "${msg}"`.quiet()
      })
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  async markFailed(taskId: string, error: string): Promise<UpdateResult> {
    const issueNumber = this.extractIssueNumber(taskId)
    if (!issueNumber) return { success: false, error: 'Invalid task ID' }

    try {
      await this.withRetry(async () => {
        await $`gh issue edit ${issueNumber} ${this.repoFlag()} --remove-label "${LABELS.STATUS_IN_PROGRESS}"`.quiet().nothrow()
        await $`gh issue edit ${issueNumber} ${this.repoFlag()} --add-label "${LABELS.STATUS_FAILED}"`.quiet()
        const commentText = `**Loopwork Failed**\n\n\`\`\`\n${error}\n\`\`\``
        await $`gh issue comment ${issueNumber} ${this.repoFlag()} --body "${commentText}"`.quiet()
      })
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  async resetToPending(taskId: string): Promise<UpdateResult> {
    const issueNumber = this.extractIssueNumber(taskId)
    if (!issueNumber) return { success: false, error: 'Invalid task ID' }

    try {
      await this.withRetry(async () => {
        await $`gh issue edit ${issueNumber} ${this.repoFlag()} --remove-label "${LABELS.STATUS_FAILED}"`.quiet().nothrow()
        await $`gh issue edit ${issueNumber} ${this.repoFlag()} --remove-label "${LABELS.STATUS_IN_PROGRESS}"`.quiet().nothrow()
        await $`gh issue edit ${issueNumber} ${this.repoFlag()} --add-label "${LABELS.STATUS_PENDING}"`.quiet()
      })
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  async addComment(taskId: string, comment: string): Promise<UpdateResult> {
    const issueNumber = this.extractIssueNumber(taskId)
    if (!issueNumber) return { success: false, error: 'Invalid task ID' }

    try {
      await this.withRetry(async () => {
        await $`gh issue comment ${issueNumber} ${this.repoFlag()} --body "${comment}"`.quiet()
      })
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  async ping(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now()
    try {
      const result = await $`gh auth status`.quiet()
      return { ok: result.exitCode === 0, latencyMs: Date.now() - start }
    } catch (e: unknown) {
      return { ok: false, latencyMs: Date.now() - start, error: e.message }
    }
  }

  async getSubTasks(taskId: string): Promise<Task[]> {
    const allTasks = await this.listAllTasks()
    const parentIssueNum = this.extractIssueNumber(taskId)
    if (!parentIssueNum) return []

    return allTasks.filter(task => {
      if (!task.parentId) return false
      const parentNum = this.extractIssueNumber(task.parentId)
      return parentNum === parentIssueNum || task.parentId === taskId
    })
  }

  async getDependencies(taskId: string): Promise<Task[]> {
    const task = await this.getTask(taskId)
    if (!task || !task.dependsOn || task.dependsOn.length === 0) return []

    const deps: Task[] = []
    for (const depId of task.dependsOn) {
      const depTask = await this.getTask(depId)
      if (depTask) deps.push(depTask)
    }
    return deps
  }

  async getDependents(taskId: string): Promise<Task[]> {
    const allTasks = await this.listAllTasks()
    return allTasks.filter(task => task.dependsOn?.includes(taskId))
  }

  async areDependenciesMet(taskId: string): Promise<boolean> {
    const deps = await this.getDependencies(taskId)
    return deps.every(dep => dep.status === 'completed')
  }

  async createSubTask(parentId: string, task: Omit<Task, 'id' | 'parentId' | 'status'>): Promise<Task> {
    const parentNum = this.extractIssueNumber(parentId)
    if (!parentNum) {
      throw new LoopworkError(
        'ERR_TASK_INVALID',
        'Invalid parent task ID',
        [
          `Parent ID "${parentId}" cannot be parsed`,
          'Expected format: #123 or FEATURE-001',
        ]
      )
    }

    const body = `Parent: #${parentNum}\n\n${task.description}`
    const labels = [
      LABELS.LOOPWORK_TASK,
      LABELS.STATUS_PENDING,
      LABELS.SUB_TASK,
      `priority:${task.priority}`,
    ]
    if (task.feature) labels.push(`feat:${task.feature}`)

    const result = await this.withRetry(async () => {
      const r = await $`gh issue create ${this.repoFlag()} --title "${task.title}" --body "${body}" --label "${labels.join(',')}" --json number,title,body,labels,url`.quiet()
      return JSON.parse(r.stdout.toString())
    })

    return this.adaptIssue(result)
  }

  async addDependency(taskId: string, dependsOnId: string): Promise<UpdateResult> {
    const task = await this.getTask(taskId)
    if (!task) return { success: false, error: 'Task not found' }

    const issueNumber = this.extractIssueNumber(taskId)
    if (!issueNumber) return { success: false, error: 'Invalid task ID' }

    const currentDeps = task.dependsOn || []
    if (currentDeps.includes(dependsOnId)) return { success: true }

    const newDeps = [...currentDeps, dependsOnId]
    const depsLine = `Depends on: ${newDeps.join(', ')}`

    let newBody = task.description
    if (DEPENDS_PATTERN.test(newBody)) {
      newBody = newBody.replace(DEPENDS_PATTERN, `\nDepends on: ${newDeps.join(', ')}\n`)
    } else {
      newBody = `${depsLine}\n\n${newBody}`
    }

    try {
      await this.withRetry(async () => {
        await $`gh issue edit ${issueNumber} ${this.repoFlag()} --body "${newBody}"`.quiet()
      })
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  async removeDependency(taskId: string, dependsOnId: string): Promise<UpdateResult> {
    const task = await this.getTask(taskId)
    if (!task) return { success: false, error: 'Task not found' }

    const issueNumber = this.extractIssueNumber(taskId)
    if (!issueNumber) return { success: false, error: 'Invalid task ID' }

    const currentDeps = task.dependsOn || []
    const newDeps = currentDeps.filter(d => d !== dependsOnId)

    let newBody = task.description
    if (newDeps.length > 0) {
      newBody = newBody.replace(DEPENDS_PATTERN, `\nDepends on: ${newDeps.join(', ')}\n`)
    } else {
      newBody = newBody.replace(DEPENDS_PATTERN, '\n')
    }

    try {
      await this.withRetry(async () => {
        await $`gh issue edit ${issueNumber} ${this.repoFlag()} --body "${newBody}"`.quiet()
      })
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  /**
   * Create a new task (GitHub issue)
   */
  async createTask(task: Omit<Task, 'id' | 'status'>): Promise<Task> {
    const labels = [
      LABELS.LOOPWORK_TASK,
      LABELS.STATUS_PENDING,
      `priority:${task.priority}`,
    ]
    if (task.feature) labels.push(`feat:${task.feature}`)

    // If this is a sub-task, add the sub-task label
    if (task.parentId) {
      labels.push(LABELS.SUB_TASK)
    }

    // Build the issue body with parent and dependencies references
    let body = task.description

    // Add parent reference if present
    if (task.parentId) {
      const parentNum = this.extractIssueNumber(task.parentId)
      if (parentNum) {
        body = `Parent: #${parentNum}\n\n${body}`
      } else {
        // Handle non-numeric parent IDs (like TASK-001-01)
        body = `Parent: ${task.parentId}\n\n${body}`
      }
    }

    // Add dependencies to body if present
    if (task.dependsOn && task.dependsOn.length > 0) {
      const depsRefs = task.dependsOn.map(dep => {
        const num = this.extractIssueNumber(dep)
        return num ? `#${num}` : dep
      })
      const depsLine = `Depends on: ${depsRefs.join(', ')}`
      body = task.parentId ? body.replace(task.description, `${depsLine}\n\n${task.description}`) : `${depsLine}\n\n${body}`
    }

    const result = await this.withRetry(async () => {
      const r = await $`gh issue create ${this.repoFlag()} --title "${task.title}" --body "${body}" --label "${labels.join(',')}" --json number,title,body,labels,url`.quiet()
      return JSON.parse(r.stdout.toString())
    })

    return this.adaptIssue(result)
  }

  /**
   * Set task priority by updating labels
   */
  async setPriority(taskId: string, priority: Task['priority']): Promise<UpdateResult> {
    const issueNumber = this.extractIssueNumber(taskId)
    if (!issueNumber) return { success: false, error: 'Invalid task ID' }

    try {
      await this.withRetry(async () => {
        // Remove existing priority labels
        await $`gh issue edit ${issueNumber} ${this.repoFlag()} --remove-label "${LABELS.PRIORITY_HIGH}"`.quiet().nothrow()
        await $`gh issue edit ${issueNumber} ${this.repoFlag()} --remove-label "${LABELS.PRIORITY_MEDIUM}"`.quiet().nothrow()
        await $`gh issue edit ${issueNumber} ${this.repoFlag()} --remove-label "${LABELS.PRIORITY_LOW}"`.quiet().nothrow()

        // Add new priority label
        const priorityLabel = `priority:${priority}`
        await $`gh issue edit ${issueNumber} ${this.repoFlag()} --add-label "${priorityLabel}"`.quiet()
      })
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  private async listAllTasks(): Promise<Task[]> {
    try {
      return await this.withRetry(async () => {
        const result = await $`gh issue list ${this.repoFlag()} --label "${LABELS.LOOPWORK_TASK}" --state open --json number,title,body,labels,url --limit 200`.quiet()
        const issues: GitHubIssue[] = JSON.parse(result.stdout.toString())
        return issues.map(issue => this.adaptIssue(issue))
      })
    } catch {
      return []
    }
  }

  private adaptIssue(issue: GitHubIssue): Task {
    const labels = issue.labels.map(l => l.name)
    const body = issue.body || ''

    const taskIdMatch = issue.title.match(/TASK-\d+-\d+[a-z]?/i)
    const id = taskIdMatch ? taskIdMatch[0].toUpperCase() : `GH-${issue.number}`

    let status: Task['status'] = 'pending'
    if (labels.includes(LABELS.STATUS_IN_PROGRESS)) status = 'in-progress'
    else if (labels.includes(LABELS.STATUS_FAILED)) status = 'failed'
    else if (issue.state === 'closed') status = 'completed'

    let priority: Task['priority'] = 'medium'
    if (labels.includes(LABELS.PRIORITY_HIGH)) priority = 'high'
    else if (labels.includes(LABELS.PRIORITY_LOW)) priority = 'low'

    const featureLabel = labels.find(l => l.startsWith('feat:'))
    const feature = featureLabel?.replace('feat:', '')

    let parentId: string | undefined
    const parentMatch = body.match(PARENT_PATTERN)
    if (parentMatch) {
      // Group 1: #123 or 123 format
      // Group 2: TASK-001-01 format
      // Group 3: owner/repo#123 format
      if (parentMatch[1]) {
        parentId = `GH-${parentMatch[1]}`
      } else if (parentMatch[2]) {
        parentId = parentMatch[2]
      } else if (parentMatch[3]) {
        parentId = `GH-${parentMatch[3]}`
      }
    }

    let dependsOn: string[] | undefined
    const depsMatch = body.match(DEPENDS_PATTERN)
    if (depsMatch) {
      const depsStr = depsMatch[1]
      dependsOn = depsStr.split(/[,\s]+/).filter(Boolean).map(d => {
        // Handle various formats:
        // - #123 -> GH-123
        // - 123 -> GH-123
        // - TASK-001-01 -> TASK-001-01
        // - owner/repo#123 -> GH-123

        // Check for GitHub issue reference format
        const repoIssueMatch = d.match(/(?:[\w-]+\/[\w-]+)?#(\d+)/)
        if (repoIssueMatch) {
          return `GH-${repoIssueMatch[1]}`
        }

        // Check for plain number
        const num = d.replace('#', '')
        if (/^\d+$/.test(num)) {
          return `GH-${num}`
        }

        // Otherwise keep as-is (like TASK-001-01)
        return d
      })
    }

    return {
      id,
      title: issue.title,
      description: body,
      status,
      priority,
      feature,
      parentId,
      dependsOn,
      metadata: { issueNumber: issue.number, url: issue.url, labels },
    }
  }
}

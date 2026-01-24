import { 
  TaskBackend, 
  BackendPlugin,
  FindTaskOptions, 
  UpdateResult, 
  PingResult, 
  Task, 
  Priority, 
  TaskStatus 
} from 'loopwork/contracts'
import { NotionClient } from './client'
import { NotionBackendConfig } from './types'

export class NotionTaskAdapter implements BackendPlugin {
  readonly name = 'notion-backend'
  readonly backendType = 'notion'
  private client: NotionClient
  private config: NotionBackendConfig

  constructor(config: NotionBackendConfig) {
    this.config = config
    this.client = new NotionClient(config.apiKey, config.databaseId)
  }

  async findNextTask(options?: FindTaskOptions): Promise<Task | null> {
    const statusProp = this.config.properties?.status || 'Status'
    const pendingValue = this.config.statusValues?.pending || 'Pending'
    const priorityProp = this.config.properties?.priority || 'Priority'

    const response = await this.client.queryTasks({
      status: {
        property: statusProp,
        value: pendingValue,
      },
      sortByPriority: {
        property: priorityProp,
        direction: 'descending',
      },
    })

    if (!response || response.results.length === 0) {
      return null
    }

    let tasks = response.results.map((page: any) => this.mapNotionPageToTask(page))

    if (options?.feature) {
      tasks = tasks.filter((t) => t.feature === options.feature)
    }

    if (options?.parentId) {
      tasks = tasks.filter((t) => t.parentId === options.parentId)
    }

    return tasks[0] || null
  }

  async getTask(taskId: string): Promise<Task | null> {
    const page = await this.client.getTask(taskId)
    if (!page) return null
    return this.mapNotionPageToTask(page)
  }

  async listPendingTasks(options?: FindTaskOptions): Promise<Task[]> {
    const statusProp = this.config.properties?.status || 'Status'
    const pendingValue = this.config.statusValues?.pending || 'Pending'
    const priorityProp = this.config.properties?.priority || 'Priority'

    const response = await this.client.queryTasks({
      status: {
        property: statusProp,
        value: pendingValue,
      },
      sortByPriority: {
        property: priorityProp,
        direction: 'descending',
      },
    })

    if (!response) return []

    let tasks = response.results.map((page: any) => this.mapNotionPageToTask(page))

    if (options?.feature) {
      tasks = tasks.filter((t) => t.feature === options.feature)
    }

    return tasks
  }

  async countPending(options?: FindTaskOptions): Promise<number> {
    const tasks = await this.listPendingTasks(options)
    return tasks.length
  }

  async markInProgress(taskId: string): Promise<UpdateResult> {
    return this.updateStatus(taskId, 'inProgress')
  }

  async markCompleted(taskId: string, comment?: string): Promise<UpdateResult> {
    if (comment) {
      await this.addComment(taskId, comment)
    }
    return this.updateStatus(taskId, 'completed')
  }

  async markFailed(taskId: string, error: string): Promise<UpdateResult> {
    await this.addComment(taskId, `Failed: ${error}`)
    return this.updateStatus(taskId, 'failed')
  }

  async resetToPending(taskId: string): Promise<UpdateResult> {
    return this.updateStatus(taskId, 'pending')
  }

  async addComment(taskId: string, comment: string): Promise<UpdateResult> {
    try {
      await this.client.addComment(taskId, comment)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  async ping(): Promise<PingResult> {
    const start = Date.now()
    try {
      await this.client.queryTasks({
        status: {
          property: this.config.properties?.status || 'Status',
          value: 'PING_CHECK',
        },
      })
      return { ok: true, latencyMs: Date.now() - start }
    } catch (error: any) {
      if (error.message.includes('Notion API Error')) {
         if (error.message.includes('unauthorized') || error.message.includes('not_found')) {
            return { ok: false, latencyMs: Date.now() - start, error: error.message }
         }
         return { ok: true, latencyMs: Date.now() - start }
      }
      return { ok: false, latencyMs: Date.now() - start, error: error.message }
    }
  }

  async getSubTasks(taskId: string): Promise<Task[]> {
    return []
  }

  async getDependencies(taskId: string): Promise<Task[]> {
    const task = await this.getTask(taskId)
    if (!task || !task.dependsOn || task.dependsOn.length === 0) return []
    
    const deps = await Promise.all(task.dependsOn.map(id => this.getTask(id)))
    return deps.filter((t): t is Task => t !== null)
  }

  async getDependents(taskId: string): Promise<Task[]> {
    return []
  }

  async areDependenciesMet(taskId: string): Promise<boolean> {
    const deps = await this.getDependencies(taskId)
    return deps.every(t => t.status === 'completed')
  }

  private async updateStatus(taskId: string, statusKey: keyof NonNullable<NotionBackendConfig['statusValues']>): Promise<UpdateResult> {
    const statusProp = this.config.properties?.status || 'Status'
    const statusValue = this.config.statusValues?.[statusKey] || this.getDefaultStatusValue(statusKey)

    try {
      await this.client.updateTask(taskId, {
        [statusProp]: {
          status: {
            name: statusValue
          }
        }
      })
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  private getDefaultStatusValue(key: string): string {
    switch (key) {
      case 'pending': return 'Pending'
      case 'inProgress': return 'In Progress'
      case 'completed': return 'Completed'
      case 'failed': return 'Failed'
      default: return key
    }
  }

  private mapNotionPageToTask(page: any): Task {
    const props = page.properties
    const config = this.config.properties || {}

    const titleProp = props[config.title || 'Title']
    const statusProp = props[config.status || 'Status']
    const priorityProp = props[config.priority || 'Priority']
    const descriptionProp = props[config.description || 'Description']
    const featureProp = props[config.feature || 'Feature']
    const parentIdProp = props[config.parentId || 'Parent']
    const dependsOnProp = props[config.dependsOn || 'Depends On']

    return {
      id: page.id,
      title: this.getRichText(titleProp) || 'Untitled',
      description: this.getRichText(descriptionProp) || '',
      status: this.mapNotionStatusToTaskStatus(this.getStatus(statusProp)),
      priority: this.mapNotionPriorityToTaskPriority(this.getSelect(priorityProp)),
      feature: this.getSelect(featureProp) || this.getRichText(featureProp),
      parentId: this.getRelation(parentIdProp)?.[0],
      dependsOn: this.getRelation(dependsOnProp),
      metadata: {
        notionUrl: page.url,
      },
    }
  }

  private getRichText(prop: any): string {
    if (!prop) return ''
    const richText = prop.rich_text || prop.title
    if (!richText || !Array.isArray(richText)) return ''
    return richText.map((t: any) => t.plain_text).join('')
  }

  private getStatus(prop: any): string {
    if (!prop || !prop.status) return ''
    return prop.status.name
  }

  private getSelect(prop: any): string {
    if (!prop || !prop.select) return ''
    return prop.select.name
  }

  private getRelation(prop: any): string[] {
    if (!prop || !prop.relation || !Array.isArray(prop.relation)) return []
    return prop.relation.map((r: any) => r.id)
  }

  private mapNotionStatusToTaskStatus(status: string): TaskStatus {
    const values = this.config.statusValues || {}
    if (status === (values.completed || 'Completed')) return 'completed'
    if (status === (values.inProgress || 'In Progress')) return 'in-progress'
    if (status === (values.failed || 'Failed')) return 'failed'
    return 'pending'
  }

  private mapNotionPriorityToTaskPriority(priority: string): Priority {
    const p = (priority || '').toLowerCase()
    if (p.includes('high')) return 'high'
    if (p.includes('low')) return 'low'
    return 'medium'
  }
}

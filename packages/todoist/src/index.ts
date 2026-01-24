/**
 * Todoist Plugin for Loopwork
 *
 * Syncs task status with Todoist projects.
 * Tasks should have metadata.todoistId set to the Todoist task ID.
 *
 * Setup:
 * 1. Get API token from Todoist Settings > Integrations > Developer
 * 2. Set TODOIST_API_TOKEN env var
 * 3. Add todoistId to task metadata in your tasks file
 */

import type { LoopworkPlugin, PluginTask, ConfigWrapper, TaskContext, PluginTaskResult } from '../../loopwork/src/contracts'

export interface TodoistConfig {
  apiToken?: string
  projectId?: string
  /** Sync status changes to Todoist (complete tasks) */
  syncStatus?: boolean
  /** Add comments to tasks on events */
  addComments?: boolean
}

export interface TodoistTask {
  id: string
  content: string
  description: string
  is_completed: boolean
  project_id: string
  parent_id?: string
  priority: number
  labels: string[]
}

interface TodoistComment {
  id: string
  task_id: string
  content: string
  posted_at: string
}

export class TodoistClient {
  private baseUrl = 'https://api.todoist.com/rest/v2'
  private apiToken: string

  constructor(apiToken: string) {
    this.apiToken = apiToken
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Todoist API error: ${response.status} - ${error}`)
    }

    // Some endpoints return empty response (204)
    if (response.status === 204) {
      return {} as T
    }

    return response.json() as Promise<T>
  }

  /**
   * Get a task by ID
   */
  async getTask(taskId: string): Promise<TodoistTask> {
    return this.request('GET', `/tasks/${taskId}`)
  }

  /**
   * Create a new task
   */
  async createTask(content: string, options?: {
    description?: string
    projectId?: string
    parentId?: string
    priority?: 1 | 2 | 3 | 4
    labels?: string[]
  }): Promise<TodoistTask> {
    return this.request('POST', '/tasks', {
      content,
      description: options?.description,
      project_id: options?.projectId,
      parent_id: options?.parentId,
      priority: options?.priority,
      labels: options?.labels,
    })
  }

  /**
   * Update a task
   */
  async updateTask(taskId: string, updates: {
    content?: string
    description?: string
    priority?: 1 | 2 | 3 | 4
    labels?: string[]
  }): Promise<TodoistTask> {
    return this.request('POST', `/tasks/${taskId}`, updates)
  }

  /**
   * Complete (close) a task
   */
  async completeTask(taskId: string): Promise<void> {
    await this.request('POST', `/tasks/${taskId}/close`)
  }

  /**
   * Reopen a completed task
   */
  async reopenTask(taskId: string): Promise<void> {
    await this.request('POST', `/tasks/${taskId}/reopen`)
  }

  /**
   * Delete a task
   */
  async deleteTask(taskId: string): Promise<void> {
    await this.request('DELETE', `/tasks/${taskId}`)
  }

  /**
   * Get all tasks in a project
   */
  async getProjectTasks(projectId: string): Promise<TodoistTask[]> {
    return this.request('GET', `/tasks?project_id=${projectId}`)
  }

  /**
   * Add a comment to a task
   */
  async addComment(taskId: string, content: string): Promise<TodoistComment> {
    return this.request('POST', '/comments', {
      task_id: taskId,
      content,
    })
  }

  /**
   * Get comments for a task
   */
  async getComments(taskId: string): Promise<TodoistComment[]> {
    return this.request('GET', `/comments?task_id=${taskId}`)
  }

  /**
   * Get all projects
   */
  async getProjects(): Promise<Array<{ id: string; name: string }>> {
    return this.request('GET', '/projects')
  }
}

/**
 * Create Todoist plugin wrapper
 */
export function withTodoist(config: TodoistConfig = {}): ConfigWrapper {
  const apiToken = config.apiToken || process.env.TODOIST_API_TOKEN

  return (baseConfig) => ({
    ...baseConfig,
    todoist: {
      apiToken,
      projectId: config.projectId || process.env.TODOIST_PROJECT_ID,
      syncStatus: config.syncStatus ?? true,
      addComments: config.addComments ?? true,
    },
  })
}

/** Helper to get Todoist ID from task metadata */
function getTodoistId(task: PluginTask): string | undefined {
  return task.metadata?.todoistId as string | undefined
}

/**
 * Create Todoist hook plugin
 *
 * Tasks should have metadata.todoistId set for Todoist integration.
 */
export function createTodoistPlugin(config: TodoistConfig = {}): LoopworkPlugin {
  const apiToken = config.apiToken || process.env.TODOIST_API_TOKEN || ''
  const addComments = config.addComments ?? true

  if (!apiToken) {
    return {
      name: 'todoist',
      onConfigLoad: (cfg) => {
        console.warn('Todoist plugin: Missing TODOIST_API_TOKEN')
        return cfg
      },
    }
  }

  const client = new TodoistClient(apiToken)

  return {
    name: 'todoist',

    async onTaskStart(context: TaskContext) {
      const todoistId = getTodoistId(context.task)
      if (!todoistId || !addComments) return

      try {
        await client.addComment(todoistId, `🔄 Loopwork started working on this task`)
      } catch (e: any) {
        console.warn(`Todoist: Failed to add comment: ${e.message}`)
      }
    },

    async onTaskComplete(context: TaskContext, result: PluginTaskResult) {
      const todoistId = getTodoistId(context.task)
      if (!todoistId) return

      try {
        if (config.syncStatus !== false) {
          await client.completeTask(todoistId)
        }
        if (addComments) {
          await client.addComment(
            todoistId,
            `✅ Completed by Loopwork in ${Math.round(result.duration)}s`
          )
        }
      } catch (e: any) {
        console.warn(`Todoist: Failed to update task: ${e.message}`)
      }
    },

    async onTaskFailed(context: TaskContext, error: string) {
      const todoistId = getTodoistId(context.task)
      if (!todoistId || !addComments) return

      try {
        await client.addComment(
          todoistId,
          `❌ Loopwork failed: ${error.slice(0, 200)}`
        )
      } catch (e: any) {
        console.warn(`Todoist: Failed to add comment: ${e.message}`)
      }
    },

    async onLoopEnd(stats) {
      console.log(`📋 Todoist sync: ${stats.completed} tasks synced`)
    },
  }
}

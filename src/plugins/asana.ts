/**
 * Asana Plugin for Loopwork
 *
 * Syncs task status with Asana projects.
 * Tasks should have metadata.asanaGid set to the Asana task GID.
 *
 * Setup:
 * 1. Get Personal Access Token from Asana Developer Console
 * 2. Set ASANA_ACCESS_TOKEN env var
 * 3. Set ASANA_PROJECT_ID env var (from project URL)
 * 4. Add asanaGid to task metadata in your tasks file
 */

import type { LoopworkPlugin, PluginTask } from '../contracts'

export interface AsanaConfig {
  accessToken?: string
  projectId?: string
  workspaceId?: string
  /** Create Asana tasks for new Loopwork tasks */
  autoCreate?: boolean
  /** Sync status changes to Asana */
  syncStatus?: boolean
}

interface AsanaTask {
  gid: string
  name: string
  completed: boolean
  notes?: string
}

interface AsanaResponse<T> {
  data: T
}

export class AsanaClient {
  private baseUrl = 'https://app.asana.com/api/1.0'
  private accessToken: string

  constructor(accessToken: string) {
    this.accessToken = accessToken
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
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify({ data: body }) : undefined,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Asana API error: ${response.status} - ${error}`)
    }

    const result = await response.json() as AsanaResponse<T>
    return result.data
  }

  async getTask(taskGid: string): Promise<AsanaTask> {
    return this.request('GET', `/tasks/${taskGid}`)
  }

  async createTask(projectId: string, name: string, notes?: string): Promise<AsanaTask> {
    return this.request('POST', '/tasks', {
      name,
      notes,
      projects: [projectId],
    })
  }

  async updateTask(taskGid: string, updates: Partial<{ name: string; notes: string; completed: boolean }>): Promise<AsanaTask> {
    return this.request('PUT', `/tasks/${taskGid}`, updates)
  }

  async completeTask(taskGid: string): Promise<AsanaTask> {
    return this.updateTask(taskGid, { completed: true })
  }

  async addComment(taskGid: string, text: string): Promise<void> {
    await this.request('POST', `/tasks/${taskGid}/stories`, { text })
  }

  async getProjectTasks(projectId: string): Promise<AsanaTask[]> {
    return this.request('GET', `/projects/${projectId}/tasks?opt_fields=gid,name,completed,notes`)
  }
}

/**
 * Create Asana plugin wrapper
 */
export function withAsana(config: AsanaConfig = {}) {
  const accessToken = config.accessToken || process.env.ASANA_ACCESS_TOKEN
  const projectId = config.projectId || process.env.ASANA_PROJECT_ID

  return (baseConfig: any) => ({
    ...baseConfig,
    asana: {
      accessToken,
      projectId,
      autoCreate: config.autoCreate ?? false,
      syncStatus: config.syncStatus ?? true,
    },
  })
}

/** Helper to get Asana GID from task metadata */
function getAsanaGid(task: PluginTask): string | undefined {
  return task.metadata?.asanaGid as string | undefined
}

/**
 * Create Asana hook plugin
 *
 * Tasks should have metadata.asanaGid set for Asana integration.
 */
export function createAsanaPlugin(config: AsanaConfig = {}): LoopworkPlugin {
  const accessToken = config.accessToken || process.env.ASANA_ACCESS_TOKEN || ''
  const projectId = config.projectId || process.env.ASANA_PROJECT_ID || ''

  if (!accessToken || !projectId) {
    return {
      name: 'asana',
      onConfigLoad: (cfg) => {
        console.warn('Asana plugin: Missing ASANA_ACCESS_TOKEN or ASANA_PROJECT_ID')
        return cfg
      },
    }
  }

  const client = new AsanaClient(accessToken)

  return {
    name: 'asana',

    async onTaskStart(task) {
      const asanaGid = getAsanaGid(task)
      if (!asanaGid) return

      try {
        await client.addComment(asanaGid, `🔄 Loopwork started working on this task`)
      } catch (e: any) {
        console.warn(`Asana: Failed to add comment: ${e.message}`)
      }
    },

    async onTaskComplete(task, result) {
      const asanaGid = getAsanaGid(task)
      if (!asanaGid) return

      try {
        if (config.syncStatus !== false) {
          await client.completeTask(asanaGid)
        }
        await client.addComment(
          asanaGid,
          `✅ Completed by Loopwork in ${Math.round(result.duration)}s`
        )
      } catch (e: any) {
        console.warn(`Asana: Failed to update task: ${e.message}`)
      }
    },

    async onTaskFailed(task, error) {
      const asanaGid = getAsanaGid(task)
      if (!asanaGid) return

      try {
        await client.addComment(
          asanaGid,
          `❌ Loopwork failed: ${error.slice(0, 200)}`
        )
      } catch (e: any) {
        console.warn(`Asana: Failed to add comment: ${e.message}`)
      }
    },

    async onLoopEnd(stats) {
      // Could post a summary to a specific task or project
      console.log(`📊 Asana sync: ${stats.completed} tasks synced`)
    },
  }
}

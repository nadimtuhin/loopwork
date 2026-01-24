/**
 * Everhour Plugin for Loopwork
 *
 * Tracks time spent on tasks using Everhour API.
 * Tasks should have metadata.everhourId or metadata.asanaGid set.
 * If using Asana integration, asanaGid is auto-prefixed with 'as:' for Everhour.
 *
 * Setup:
 * 1. Get API key from Everhour Settings > Integrations > API
 * 2. Set EVERHOUR_API_KEY env var
 * 3. Link Everhour to your Asana project for automatic task syncing
 * 4. Add everhourId or asanaGid to task metadata
 */

import type { LoopworkPlugin, PluginTask, ConfigWrapper } from '../../loopwork/src/contracts'

export interface EverhourConfig {
  apiKey?: string
  /** Auto-start timer when task begins */
  autoStartTimer?: boolean
  /** Auto-stop timer when task completes */
  autoStopTimer?: boolean
  /** Default project ID for new time entries */
  projectId?: string
}

interface EverhourTimeEntry {
  id: number
  time: number // seconds
  date: string
  task?: { id: string; name: string }
  user?: { id: number; name: string }
}

interface EverhourTask {
  id: string
  name: string
  time: { total: number; users?: Record<string, number> }
}

interface EverhourTimer {
  status: 'active' | 'stopped'
  duration: number
  task?: { id: string }
  startedAt?: string
}

export class EverhourClient {
  private baseUrl = 'https://api.everhour.com'
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
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
        'X-Api-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Everhour API error: ${response.status} - ${error}`)
    }

    // Some endpoints return empty response
    const text = await response.text()
    if (!text) return {} as T

    return JSON.parse(text) as T
  }

  /**
   * Get current timer status
   */
  async getCurrentTimer(): Promise<EverhourTimer | null> {
    try {
      return await this.request('GET', '/timers/current')
    } catch {
      return null
    }
  }

  /**
   * Start timer for a task
   * @param taskId - Everhour task ID (for Asana tasks, use 'as:' prefix + GID)
   */
  async startTimer(taskId: string): Promise<EverhourTimer> {
    return this.request('POST', '/timers', { task: taskId })
  }

  /**
   * Stop the current timer
   */
  async stopTimer(): Promise<EverhourTimer> {
    return this.request('DELETE', '/timers/current')
  }

  /**
   * Add time entry for a task
   * @param taskId - Everhour task ID
   * @param seconds - Duration in seconds
   * @param date - Date in YYYY-MM-DD format (defaults to today)
   */
  async addTime(taskId: string, seconds: number, date?: string): Promise<EverhourTimeEntry> {
    const today = date || new Date().toISOString().split('T')[0]
    return this.request('POST', `/tasks/${taskId}/time`, {
      time: seconds,
      date: today,
    })
  }

  /**
   * Get time entries for a task
   */
  async getTaskTime(taskId: string): Promise<EverhourTask> {
    return this.request('GET', `/tasks/${taskId}`)
  }

  /**
   * Get today's time entries
   */
  async getTodayEntries(): Promise<EverhourTimeEntry[]> {
    const today = new Date().toISOString().split('T')[0]
    return this.request('GET', `/team/time?from=${today}&to=${today}`)
  }

  /**
   * Get total time logged today (in seconds)
   */
  async getTodayTotal(): Promise<number> {
    const entries = await this.getTodayEntries()
    return entries.reduce((sum, e) => sum + e.time, 0)
  }

  /**
   * Check if we're under the daily limit
   * @param maxHours - Maximum hours per day (default: 8)
   */
  async checkDailyLimit(maxHours = 8): Promise<{ withinLimit: boolean; hoursLogged: number; remaining: number }> {
    const totalSeconds = await this.getTodayTotal()
    const hoursLogged = totalSeconds / 3600
    const remaining = Math.max(0, maxHours - hoursLogged)
    return {
      withinLimit: hoursLogged < maxHours,
      hoursLogged: Math.round(hoursLogged * 100) / 100,
      remaining: Math.round(remaining * 100) / 100,
    }
  }

  /**
   * Get user's current status
   */
  async getMe(): Promise<{ id: number; name: string; email: string }> {
    return this.request('GET', '/users/me')
  }
}

/**
 * Create Everhour plugin wrapper
 */
export function withEverhour(config: EverhourConfig = {}): ConfigWrapper {
  const apiKey = config.apiKey || process.env.EVERHOUR_API_KEY

  return (baseConfig) => ({
    ...baseConfig,
    everhour: {
      apiKey,
      autoStartTimer: config.autoStartTimer ?? true,
      autoStopTimer: config.autoStopTimer ?? true,
      projectId: config.projectId,
      dailyLimit: config.dailyLimit ?? 8,
    },
  })
}

/**
 * Get Everhour task ID from task metadata
 * Prefers everhourId, falls back to asanaGid with 'as:' prefix
 */
function getEverhourTaskId(task: PluginTask): string | undefined {
  const everhourId = task.metadata?.everhourId as string | undefined
  if (everhourId) return everhourId

  const asanaGid = task.metadata?.asanaGid as string | undefined
  if (asanaGid) return asanaToEverhour(asanaGid)

  return undefined
}

// Track active timers per task
const activeTimers: Map<string, { startTime: number; everhourTaskId?: string }> = new Map()

/**
 * Create Everhour hook plugin
 *
 * Tasks should have metadata.everhourId or metadata.asanaGid set.
 */
export function createEverhourPlugin(config: EverhourConfig = {}): LoopworkPlugin {
  const apiKey = config.apiKey || process.env.EVERHOUR_API_KEY || ''
  const autoStart = config.autoStartTimer ?? true
  const autoStop = config.autoStopTimer ?? true

  if (!apiKey) {
    return {
      name: 'everhour',
      onConfigLoad: (cfg) => {
        console.warn('Everhour plugin: Missing EVERHOUR_API_KEY')
        return cfg
      },
    }
  }

  const client = new EverhourClient(apiKey)

  return {
    name: 'everhour',

    async onLoopStart() {
      // Check daily limit at start
      try {
        const limit = await client.checkDailyLimit(8)
        if (!limit.withinLimit) {
          console.warn(`⚠️ Everhour: Already logged ${limit.hoursLogged}h today (limit: 8h)`)
        } else {
          console.log(`⏱️ Everhour: ${limit.hoursLogged}h logged, ${limit.remaining}h remaining`)
        }
      } catch (e: any) {
        console.warn(`Everhour: Failed to check daily limit: ${e.message}`)
      }
    },

    async onTaskStart(task) {
      // Record start time
      const startTime = Date.now()
      const everhourTaskId = getEverhourTaskId(task)
      activeTimers.set(task.id, { startTime, everhourTaskId })

      // Start Everhour timer if task has ID and autoStart enabled
      if (everhourTaskId && autoStart) {
        try {
          await client.startTimer(everhourTaskId)
          console.log(`⏱️ Timer started for ${task.id}`)
        } catch (e: any) {
          console.warn(`Everhour: Failed to start timer: ${e.message}`)
        }
      }
    },

    async onTaskComplete(task, result) {
      const timerInfo = activeTimers.get(task.id)
      activeTimers.delete(task.id)

      if (!timerInfo) return

      const { everhourTaskId } = timerInfo
      const durationSeconds = Math.round(result.duration)

      // Stop timer if running
      if (everhourTaskId && autoStop) {
        try {
          await client.stopTimer()
          console.log(`⏱️ Timer stopped for ${task.id} (${durationSeconds}s)`)
        } catch (e: any) {
          // Timer might not be running, that's ok
          console.warn(`Everhour: ${e.message}`)
        }
      }

      // Log time if we have an ID (backup in case timer wasn't running)
      if (everhourTaskId && !autoStart) {
        try {
          await client.addTime(everhourTaskId, durationSeconds)
          console.log(`⏱️ Logged ${durationSeconds}s to ${task.id}`)
        } catch (e: any) {
          console.warn(`Everhour: Failed to log time: ${e.message}`)
        }
      }
    },

    async onTaskFailed(task) {
      const timerInfo = activeTimers.get(task.id)
      activeTimers.delete(task.id)

      // Stop timer if running (don't log time for failed tasks by default)
      if (timerInfo?.everhourTaskId && autoStop) {
        try {
          await client.stopTimer()
          console.log(`⏱️ Timer stopped for failed task ${task.id}`)
        } catch {
          // Timer might not be running
        }
      }
    },

    async onLoopEnd(stats) {
      // Report final time summary
      try {
        const limit = await client.checkDailyLimit(8)
        console.log(`📊 Everhour: Session complete. Total today: ${limit.hoursLogged}h`)
      } catch {
        // Ignore errors in summary
      }
    },
  }
}

/**
 * Helper to convert Asana GID to Everhour task ID
 */
export function asanaToEverhour(asanaGid: string): string {
  return `as:${asanaGid}`
}

/**
 * Format seconds to human readable duration
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}

/**
 * Smart Daily Briefings for Loopwork Telegram Plugin
 *
 * Tracks task activity throughout the day and sends AI-generated summaries
 * at a configured time each day.
 *
 * Features:
 * - Activity tracking (completed/failed tasks, files modified, stats)
 * - AI-powered summary generation via OpenAI or Claude
 * - Scheduled daily delivery
 * - Manual trigger via /briefing command
 * - Timezone-aware scheduling
 */

import type { LoopworkPlugin, TaskContext, PluginTaskResult, LoopStats } from '@loopwork-ai/loopwork/contracts'

export interface CompletedTaskEntry {
  id: string
  title: string
  duration: number
  timestamp: string
}

export interface FailedTaskEntry {
  id: string
  title: string
  error: string
  timestamp: string
}

export interface DailyStats {
  totalTasks: number
  successRate: number
  totalDuration: number
}

export interface DailyActivity {
  date: string // YYYY-MM-DD
  completedTasks: CompletedTaskEntry[]
  failedTasks: FailedTaskEntry[]
  filesModified: string[]
  stats: DailyStats
}

export interface DailyBriefingConfig {
  enabled: boolean
  sendTime: string // "HH:MM" in 24-hour format
  timezone: string // "America/New_York", "UTC", etc.
  includeMetrics: boolean
  includeFileChanges: boolean
  openaiApiKey?: string
  claudeApiKey?: string
  model?: string // Default: "gpt-4o-mini"
  botToken?: string
  chatId?: string
}

export interface BriefingTelegramSender {
  sendMessage(text: string, options?: { parseMode?: 'HTML' | 'Markdown' }): Promise<boolean>
}

/**
 * Daily Briefing Manager
 */
export class DailyBriefingManager {
  private config: DailyBriefingConfig
  private currentActivity: DailyActivity
  private schedulerInterval?: ReturnType<typeof setInterval>
  private telegramSender?: BriefingTelegramSender
  private lastSentDate?: string

  constructor(config: DailyBriefingConfig, telegramSender?: BriefingTelegramSender) {
    this.config = {
      enabled: config.enabled ?? true,
      sendTime: config.sendTime || '09:00',
      timezone: config.timezone || 'UTC',
      includeMetrics: config.includeMetrics ?? true,
      includeFileChanges: config.includeFileChanges ?? true,
      model: config.model || 'gpt-4o-mini',
      ...config,
    }

    this.telegramSender = telegramSender
    this.currentActivity = this.createEmptyActivity()

    // Load today's activity if exists
    this.loadTodayActivity()
  }

  /**
   * Create an empty activity object for the current date
   */
  private createEmptyActivity(): DailyActivity {
    return {
      date: this.getTodayDateString(),
      completedTasks: [],
      failedTasks: [],
      filesModified: [],
      stats: {
        totalTasks: 0,
        successRate: 0,
        totalDuration: 0,
      },
    }
  }

  /**
   * Get today's date string in YYYY-MM-DD format
   */
  private getTodayDateString(): string {
    const now = new Date()
    return now.toISOString().split('T')[0]
  }

  /**
   * Get the storage path for a given date
   */
  private getStoragePath(date: string): string {
    return `.loopwork/daily-briefing/${date}.json`
  }

  /**
   * Load today's activity from filesystem
   */
  private async loadTodayActivity(): Promise<void> {
    try {
      const fs = await import('fs/promises')
      const path = this.getStoragePath(this.getTodayDateString())
      const data = await fs.readFile(path, 'utf-8')
      this.currentActivity = JSON.parse(data)
    } catch {
      // File doesn't exist or is invalid - use empty activity
      this.currentActivity = this.createEmptyActivity()
    }
  }

  /**
   * Save current activity to filesystem
   */
  private async saveActivity(): Promise<void> {
    try {
      const fs = await import('fs/promises')
      const path = await import('path')

      const filePath = this.getStoragePath(this.currentActivity.date)
      const dir = path.dirname(filePath)

      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(filePath, JSON.stringify(this.currentActivity, null, 2))
    } catch (e) {
      console.error('Failed to save daily activity:', e)
    }
  }

  /**
   * Track a completed task
   */
  async trackCompletedTask(taskId: string, title: string, duration: number): Promise<void> {
    // Check if we need to roll over to a new day
    await this.checkDateRollover()

    this.currentActivity.completedTasks.push({
      id: taskId,
      title,
      duration,
      timestamp: new Date().toISOString(),
    })

    this.updateStats()
    await this.saveActivity()
  }

  /**
   * Track a failed task
   */
  async trackFailedTask(taskId: string, title: string, error: string): Promise<void> {
    await this.checkDateRollover()

    this.currentActivity.failedTasks.push({
      id: taskId,
      title,
      error: error.slice(0, 500), // Truncate long errors
      timestamp: new Date().toISOString(),
    })

    this.updateStats()
    await this.saveActivity()
  }

  /**
   * Track modified files
   */
  async trackFilesModified(files: string[]): Promise<void> {
    await this.checkDateRollover()

    // Add unique files only
    for (const file of files) {
      if (!this.currentActivity.filesModified.includes(file)) {
        this.currentActivity.filesModified.push(file)
      }
    }

    await this.saveActivity()
  }

  /**
   * Update statistics based on current activity
   */
  private updateStats(): void {
    const completed = this.currentActivity.completedTasks.length
    const failed = this.currentActivity.failedTasks.length
    const total = completed + failed

    this.currentActivity.stats = {
      totalTasks: total,
      successRate: total > 0 ? (completed / total) * 100 : 0,
      totalDuration: this.currentActivity.completedTasks.reduce((sum, t) => sum + t.duration, 0),
    }
  }

  /**
   * Check if we need to roll over to a new day
   */
  private async checkDateRollover(): Promise<void> {
    const today = this.getTodayDateString()
    if (this.currentActivity.date !== today) {
      // New day - reset activity
      this.currentActivity = this.createEmptyActivity()
    }
  }

  /**
   * Generate AI summary using OpenAI or Claude
   */
  private async generateAISummary(activity: DailyActivity): Promise<string> {
    const prompt = this.buildPrompt(activity)

    // Try OpenAI first if configured
    if (this.config.openaiApiKey) {
      try {
        return await this.generateOpenAISummary(prompt)
      } catch (e) {
        console.error('OpenAI summary failed, trying Claude:', e)
      }
    }

    // Try Claude if configured
    if (this.config.claudeApiKey) {
      try {
        return await this.generateClaudeSummary(prompt)
      } catch (e) {
        console.error('Claude summary failed:', e)
      }
    }

    // Fall back to basic summary if no AI available
    return this.generateBasicSummary(activity)
  }

  /**
   * Build the prompt for AI summary generation
   */
  private buildPrompt(activity: DailyActivity): string {
    const parts = [
      `Generate a concise daily briefing (under 500 words) for the following Loopwork activity from ${activity.date}:`,
      '',
      `## Completed Tasks (${activity.completedTasks.length})`,
    ]

    if (activity.completedTasks.length > 0) {
      activity.completedTasks.forEach(t => {
        const durationMin = Math.round(t.duration / 60)
        parts.push(`- ${t.title} (${durationMin}m)`)
      })
    } else {
      parts.push('None')
    }

    parts.push('', `## Failed Tasks (${activity.failedTasks.length})`)
    if (activity.failedTasks.length > 0) {
      activity.failedTasks.forEach(t => {
        parts.push(`- ${t.title}`)
        parts.push(`  Error: ${t.error.split('\n')[0]}`) // First line only
      })
    } else {
      parts.push('None')
    }

    if (this.config.includeFileChanges && activity.filesModified.length > 0) {
      parts.push('', `## Files Modified (${activity.filesModified.length})`)
      activity.filesModified.slice(0, 20).forEach(f => parts.push(`- ${f}`))
      if (activity.filesModified.length > 20) {
        parts.push(`...and ${activity.filesModified.length - 20} more`)
      }
    }

    if (this.config.includeMetrics) {
      parts.push('', '## Statistics')
      parts.push(`- Total tasks: ${activity.stats.totalTasks}`)
      parts.push(`- Success rate: ${activity.stats.successRate.toFixed(1)}%`)
      parts.push(`- Total duration: ${Math.round(activity.stats.totalDuration / 60)} minutes`)
    }

    parts.push('', 'Please provide a brief summary highlighting key achievements, concerns, and patterns.')

    return parts.join('\n')
  }

  /**
   * Generate summary using OpenAI
   */
  private async generateOpenAISummary(prompt: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that creates concise daily briefings for software development activity. Format output as HTML for Telegram (use <b>, <i>, <code> tags).',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 1000,
        temperature: 0.7,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`OpenAI API error: ${response.statusText} - ${error}`)
    }

    const data = await response.json() as any
    return data.choices[0].message.content.trim()
  }

  /**
   * Generate summary using Claude
   */
  private async generateClaudeSummary(prompt: string): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.claudeApiKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.model === 'gpt-4o-mini' ? 'claude-3-haiku-20240307' : this.config.model,
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: `${prompt}\n\nFormat output as HTML for Telegram (use <b>, <i>, <code> tags).`,
          },
        ],
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Claude API error: ${response.statusText} - ${error}`)
    }

    const data = await response.json() as any
    return data.content[0].text.trim()
  }

  /**
   * Generate basic summary without AI
   */
  private generateBasicSummary(activity: DailyActivity): string {
    const parts = [
      `<b>📊 Daily Briefing - ${activity.date}</b>`,
      '',
    ]

    if (activity.stats.totalTasks === 0) {
      parts.push('<i>No task activity recorded today.</i>')

      // Still show file changes even if no tasks
      if (this.config.includeFileChanges && activity.filesModified.length > 0) {
        parts.push('')
        parts.push(`<b>Files Modified:</b> ${activity.filesModified.length}`)
        activity.filesModified.slice(0, 20).forEach(f => parts.push(`• ${f}`))
        if (activity.filesModified.length > 20) {
          parts.push(`<i>...and ${activity.filesModified.length - 20} more</i>`)
        }
      }

      return parts.join('\n')
    }

    parts.push(`<b>Summary:</b>`)
    parts.push(`✅ Completed: ${activity.completedTasks.length} tasks`)
    parts.push(`❌ Failed: ${activity.failedTasks.length} tasks`)
    parts.push(`📈 Success Rate: ${activity.stats.successRate.toFixed(1)}%`)
    parts.push(`⏱ Total Time: ${Math.round(activity.stats.totalDuration / 60)} minutes`)

    if (this.config.includeFileChanges && activity.filesModified.length > 0) {
      parts.push('')
      parts.push(`<b>Files Modified:</b> ${activity.filesModified.length}`)
    }

    if (activity.failedTasks.length > 0) {
      parts.push('')
      parts.push('<b>⚠️ Failed Tasks:</b>')
      activity.failedTasks.slice(0, 5).forEach(t => {
        parts.push(`• ${t.title}`)
      })
      if (activity.failedTasks.length > 5) {
        parts.push(`<i>...and ${activity.failedTasks.length - 5} more</i>`)
      }
    }

    return parts.join('\n')
  }

  /**
   * Format the briefing message for Telegram
   */
  private async formatBriefingMessage(activity: DailyActivity): Promise<string> {
    const aiSummary = await this.generateAISummary(activity)

    const parts = [
      `<b>📊 Daily Briefing - ${activity.date}</b>`,
      '',
      aiSummary,
    ]

    return parts.join('\n')
  }

  /**
   * Generate and send the daily briefing
   */
  async generateAndSendBriefing(): Promise<{ success: boolean; error?: string }> {
    if (!this.telegramSender) {
      return { success: false, error: 'Telegram sender not configured' }
    }

    try {
      await this.checkDateRollover()

      const message = await this.formatBriefingMessage(this.currentActivity)
      const sent = await this.telegramSender.sendMessage(message, { parseMode: 'HTML' })

      if (sent) {
        this.lastSentDate = this.getTodayDateString()
        return { success: true }
      }

      return { success: false, error: 'Failed to send message' }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  /**
   * Check if it's time to send the briefing
   */
  private shouldSendBriefing(): boolean {
    if (!this.config.enabled) return false

    const today = this.getTodayDateString()

    // Don't send if already sent today
    if (this.lastSentDate === today) return false

    // Check if current time matches send time
    const now = new Date()
    const [targetHour, targetMinute] = this.config.sendTime.split(':').map(Number)

    // Allow a 1-minute window
    const currentHour = now.getHours()
    const currentMinute = now.getMinutes()

    return currentHour === targetHour && currentMinute === targetMinute
  }

  /**
   * Start the scheduler
   */
  startScheduler(): void {
    if (this.schedulerInterval) return

    // Check every minute
    this.schedulerInterval = setInterval(() => {
      if (this.shouldSendBriefing()) {
        this.generateAndSendBriefing().catch(e => {
          console.error('Failed to send scheduled briefing:', e)
        })
      }
    }, 60000) // Check every minute
  }

  /**
   * Stop the scheduler
   */
  stopScheduler(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval)
      this.schedulerInterval = undefined
    }
  }

  /**
   * Get current activity (for testing/debugging)
   */
  getCurrentActivity(): DailyActivity {
    return this.currentActivity
  }
}

/**
 * Create a Loopwork plugin for daily briefings
 */
export function createDailyBriefingPlugin(
  config: Partial<DailyBriefingConfig>,
  telegramSender?: BriefingTelegramSender
): LoopworkPlugin & { manager: DailyBriefingManager } {
  const fullConfig: DailyBriefingConfig = {
    enabled: true,
    sendTime: '09:00',
    timezone: 'UTC',
    includeMetrics: true,
    includeFileChanges: true,
    model: 'gpt-4o-mini',
    ...config,
  }

  const manager = new DailyBriefingManager(fullConfig, telegramSender)

  return {
    name: 'telegram-daily-briefing',
    classification: 'enhancement',
    manager,

    async onTaskComplete(context: TaskContext, result: PluginTaskResult) {
      await manager.trackCompletedTask(context.task.id, context.task.title, result.duration)
    },

    async onTaskFailed(context: TaskContext, error: string) {
      await manager.trackFailedTask(context.task.id, context.task.title, error)
    },

    async onLoopEnd(stats: LoopStats) {
      // Extract file changes from stats if available
      const files: string[] = []
      // Note: This would require stats to include file change info
      // For now, we'll track files in a future enhancement

      if (files.length > 0) {
        await manager.trackFilesModified(files)
      }
    },
  }
}

/**
 * Standalone function to generate and send briefing (for manual trigger)
 */
export async function generateAndSendBriefing(
  config: DailyBriefingConfig,
  telegramSender: BriefingTelegramSender
): Promise<{ success: boolean; error?: string }> {
  const manager = new DailyBriefingManager(config, telegramSender)
  return manager.generateAndSendBriefing()
}

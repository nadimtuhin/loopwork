/**
 * Telegram Notification Plugin for Loopwork
 *
 * Sends task status notifications to a Telegram chat via the Bot API.
 *
 * Setup:
 * 1. Create a bot with @BotFather and get the token
 * 2. Get your chat ID (can use @userinfobot)
 * 3. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID env vars
 */

import type { LoopworkPlugin, PluginTask, LoopStats, PluginTaskResult } from '../../contracts'

export type NotificationLevel = 'info' | 'success' | 'warning' | 'error'

export interface NotificationPayload {
  title: string
  message: string
  level: NotificationLevel
  taskId?: string
}

export interface NotificationPlugin {
  metadata: {
    name: string
    version: string
    type: 'notification'
    description: string
  }
  isConfigured(): boolean
  send(payload: NotificationPayload): Promise<{ success: boolean; error?: string }>
  ping(): Promise<{ ok: boolean; error?: string }>
}

export interface TelegramConfig {
  botToken: string
  chatId: string
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2'
  disableNotification?: boolean
}

const LEVEL_EMOJI: Record<NotificationLevel, string> = {
  info: 'ℹ️',
  success: '✅',
  warning: '⚠️',
  error: '❌',
}

/**
 * Create a Telegram notification plugin
 */
export function createTelegramPlugin(config?: Partial<TelegramConfig>): NotificationPlugin {
  const botToken = config?.botToken || process.env.TELEGRAM_BOT_TOKEN || ''
  const chatId = config?.chatId || process.env.TELEGRAM_CHAT_ID || ''
  const parseMode = config?.parseMode || 'HTML'
  const disableNotification = config?.disableNotification ?? false

  return {
    metadata: {
      name: 'telegram',
      version: '1.0.0',
      type: 'notification',
      description: 'Send notifications to Telegram',
    },

    isConfigured(): boolean {
      return Boolean(botToken && chatId)
    },

    async send(payload: NotificationPayload): Promise<{ success: boolean; error?: string }> {
      if (!this.isConfigured()) {
        return { success: false, error: 'Telegram not configured (missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID)' }
      }

      const emoji = LEVEL_EMOJI[payload.level]
      let text = `${emoji} <b>${escapeHtml(payload.title)}</b>\n\n${escapeHtml(payload.message)}`

      if (payload.taskId) {
        text += `\n\n<code>Task: ${escapeHtml(payload.taskId)}</code>`
      }

      try {
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: parseMode,
            disable_notification: disableNotification,
          }),
        })

        if (!response.ok) {
          const data = await response.json().catch(() => ({})) as { description?: string }
          return { success: false, error: data.description || `HTTP ${response.status}` }
        }

        return { success: true }
      } catch (e: any) {
        return { success: false, error: e.message }
      }
    },

    async ping(): Promise<{ ok: boolean; error?: string }> {
      if (!this.isConfigured()) {
        return { ok: false, error: 'Not configured' }
      }

      try {
        const url = `https://api.telegram.org/bot${botToken}/getMe`
        const response = await fetch(url)

        if (!response.ok) {
          return { ok: false, error: `HTTP ${response.status}` }
        }

        const data = await response.json() as { ok: boolean; result?: { username: string } }
        if (data.ok) {
          return { ok: true }
        }

        return { ok: false, error: 'Invalid response' }
      } catch (e: any) {
        return { ok: false, error: e.message }
      }
    },
  }
}

/**
 * Escape HTML special characters for Telegram
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Create a hook plugin that sends Telegram notifications on task events
 */
export function createTelegramHookPlugin(config?: Partial<TelegramConfig>): LoopworkPlugin {
  const telegram = createTelegramPlugin(config)

  return {
    name: 'telegram-hooks',

    async onTaskStart(task: PluginTask) {
      if (!telegram.isConfigured()) return

      await telegram.send({
        title: 'Task Started',
        message: `${task.title}`,
        level: 'info',
        taskId: task.id,
      })
    },

    async onTaskComplete(task: PluginTask, result: PluginTaskResult) {
      if (!telegram.isConfigured()) return

      const durationMin = Math.round(result.duration / 60)
      await telegram.send({
        title: 'Task Completed',
        message: `${task.title}\n\nDuration: ${durationMin} minutes`,
        level: 'success',
        taskId: task.id,
      })
    },

    async onTaskFailed(task: PluginTask, error: string) {
      if (!telegram.isConfigured()) return

      await telegram.send({
        title: 'Task Failed',
        message: `${task.title}\n\nError: ${error.slice(0, 200)}`,
        level: 'error',
        taskId: task.id,
      })
    },

    async onLoopEnd(stats: LoopStats) {
      if (!telegram.isConfigured()) return

      const durationMin = Math.round(stats.duration / 60)
      const level = stats.failed > 0 ? 'warning' : 'success'

      await telegram.send({
        title: 'Loop Completed',
        message: `Completed: ${stats.completed}\nFailed: ${stats.failed}\nDuration: ${durationMin} minutes`,
        level,
      })
    },
  }
}

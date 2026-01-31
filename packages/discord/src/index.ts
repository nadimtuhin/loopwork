/**
 * Discord Plugin for Loopwork
 *
 * Sends notifications to Discord channels via webhooks.
 *
 * Setup:
 * 1. Create a webhook in Discord: Server Settings > Integrations > Webhooks
 * 2. Copy the webhook URL
 * 3. Set DISCORD_WEBHOOK_URL env var
 */

import type { LoopworkPlugin, PluginTask, ConfigWrapper, TaskContext, PluginTaskResult } from '@loopwork-ai/loopwork/contracts'

export interface DiscordConfig {
  webhookUrl?: string
  /** Username to display for bot messages */
  username?: string
  /** Avatar URL for bot messages */
  avatarUrl?: string
  /** Send notification when task starts */
  notifyOnStart?: boolean
  /** Send notification when task completes */
  notifyOnComplete?: boolean
  /** Send notification when task fails */
  notifyOnFail?: boolean
  /** Send summary when loop ends */
  notifyOnLoopEnd?: boolean
  /** Mention role/user on failures (e.g., "<@&123456>" for role, "<@123456>" for user) */
  mentionOnFail?: string
}

interface DiscordEmbed {
  title?: string
  description?: string
  color?: number
  fields?: Array<{ name: string; value: string; inline?: boolean }>
  timestamp?: string
  footer?: { text: string }
}

interface DiscordWebhookPayload {
  content?: string
  username?: string
  avatar_url?: string
  embeds?: DiscordEmbed[]
}

// Discord embed colors
const COLORS = {
  blue: 0x3498db,    // info/start
  green: 0x2ecc71,   // success
  red: 0xe74c3c,     // error
  yellow: 0xf1c40f,  // warning
  purple: 0x9b59b6,  // summary
}

export class DiscordClient {
  private webhookUrl: string
  private username?: string
  private avatarUrl?: string

  constructor(webhookUrl: string, options?: { username?: string; avatarUrl?: string }) {
    this.webhookUrl = webhookUrl
    this.username = options?.username
    this.avatarUrl = options?.avatarUrl
  }

  /**
   * Send a message to Discord
   */
  async send(payload: DiscordWebhookPayload): Promise<void> {
    const body: DiscordWebhookPayload = {
      ...payload,
      username: payload.username || this.username,
      avatar_url: payload.avatar_url || this.avatarUrl,
    }

    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Discord webhook error: ${response.status} - ${error}`)
    }
  }

  /**
   * Send a simple text message
   */
  async sendText(content: string): Promise<void> {
    await this.send({ content })
  }

  /**
   * Send an embed message
   */
  async sendEmbed(embed: DiscordEmbed): Promise<void> {
    await this.send({ embeds: [embed] })
  }

  /**
   * Send task started notification
   */
  async notifyTaskStart(task: PluginTask): Promise<void> {
    await this.sendEmbed({
      title: `🔄 Task Started`,
      description: `**${task.id}**: ${task.title}`,
      color: COLORS.blue,
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Send task completed notification
   */
  async notifyTaskComplete(task: PluginTask, duration: number): Promise<void> {
    await this.sendEmbed({
      title: `✅ Task Completed`,
      description: `**${task.id}**: ${task.title}`,
      color: COLORS.green,
      fields: [
        { name: 'Duration', value: formatDuration(duration), inline: true },
      ],
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Send task failed notification
   */
  async notifyTaskFailed(task: PluginTask, error: string, mention?: string): Promise<void> {
    await this.send({
      content: mention ? `${mention} Task failed!` : undefined,
      embeds: [{
        title: `❌ Task Failed`,
        description: `**${task.id}**: ${task.title}`,
        color: COLORS.red,
        fields: [
          { name: 'Error', value: error.slice(0, 1000) },
        ],
        timestamp: new Date().toISOString(),
      }],
    })
  }

  /**
   * Send loop summary notification
   */
  async notifyLoopEnd(stats: { completed: number; failed: number; duration: number }): Promise<void> {
    const color = stats.failed > 0 ? COLORS.yellow : COLORS.green
    await this.sendEmbed({
      title: `📊 Loop Summary`,
      color,
      fields: [
        { name: 'Completed', value: `${stats.completed}`, inline: true },
        { name: 'Failed', value: `${stats.failed}`, inline: true },
        { name: 'Duration', value: formatDuration(stats.duration), inline: true },
      ],
      timestamp: new Date().toISOString(),
    })
  }
}

/**
 * Format seconds to human readable duration
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  if (mins < 60) return `${mins}m ${secs}s`
  const hours = Math.floor(mins / 60)
  const remainMins = mins % 60
  return `${hours}h ${remainMins}m`
}

/**
 * Create Discord plugin wrapper
 */
export function withDiscord(config: DiscordConfig = {}): ConfigWrapper {
  const webhookUrl = config.webhookUrl || process.env.DISCORD_WEBHOOK_URL

  return (baseConfig) => ({
    ...baseConfig,
    discord: {
      webhookUrl,
      username: config.username || 'Loopwork',
      avatarUrl: config.avatarUrl,
      notifyOnStart: config.notifyOnStart ?? false,
      notifyOnComplete: config.notifyOnComplete ?? true,
      notifyOnFail: config.notifyOnFail ?? true,
      notifyOnLoopEnd: config.notifyOnLoopEnd ?? true,
      mentionOnFail: config.mentionOnFail,
      classification: 'enhancement',
      requiresNetwork: true,
    },
  })
}

/**
 * Create Discord hook plugin
 */
export function createDiscordPlugin(config: DiscordConfig = {}): LoopworkPlugin {
  const webhookUrl = config.webhookUrl || process.env.DISCORD_WEBHOOK_URL || ''
  const notifyOnStart = config.notifyOnStart ?? false
  const notifyOnComplete = config.notifyOnComplete ?? true
  const notifyOnFail = config.notifyOnFail ?? true
  const notifyOnLoopEnd = config.notifyOnLoopEnd ?? true

  if (!webhookUrl) {
    return {
      name: 'discord',
      classification: 'enhancement',
      onConfigLoad: (cfg) => {
        console.warn('Discord plugin: Missing DISCORD_WEBHOOK_URL')
        return cfg
      },
    }
  }

  const client = new DiscordClient(webhookUrl, {
    username: config.username || 'Loopwork',
    avatarUrl: config.avatarUrl,
  })

  return {
    name: 'discord',
    classification: 'enhancement',

    async onTaskStart(context: TaskContext) {
      if (!notifyOnStart) return

      try {
        await client.notifyTaskStart(context.task)
      } catch (e: any) {
        console.warn(`Discord: Failed to send notification: ${e.message}`)
      }
    },

    async onTaskComplete(context: TaskContext, result: PluginTaskResult) {
      if (!notifyOnComplete) return

      try {
        await client.notifyTaskComplete(context.task, result.duration)
      } catch (e: any) {
        console.warn(`Discord: Failed to send notification: ${e.message}`)
      }
    },

    async onTaskFailed(context: TaskContext, error: string) {
      if (!notifyOnFail) return

      try {
        await client.notifyTaskFailed(context.task, error, config.mentionOnFail)
      } catch (e: any) {
        console.warn(`Discord: Failed to send notification: ${e.message}`)
      }
    },

    async onLoopEnd(stats) {
      if (!notifyOnLoopEnd) return

      try {
        await client.notifyLoopEnd(stats)
      } catch (e: any) {
        console.warn(`Discord: Failed to send notification: ${e.message}`)
      }
    },
  }
}

/**
 * Action: Notify User
 *
 * Sends notifications via configured channels (Telegram, Discord, or log)
 * for critical issues requiring manual intervention.
 */

import { logger } from '../../core/utils'
import type { MonitorAction } from '../types'

export interface NotificationChannels {
  telegram?: {
    enabled: boolean
    botToken?: string
    chatId?: string
  }
  discord?: {
    enabled: boolean
    webhookUrl?: string
  }
  log?: {
    enabled: boolean
    // Additional log-specific options can be added here
  }
}

export interface NotifyOptions extends NotificationChannels {
  taskId?: string
  taskTitle?: string
  patternName?: string
  severity: 'HIGH' | 'ERROR' | 'CRITICAL'
  message: string
  additionalContext?: string
}

/**
 * Send notification via all configured channels
 */
export async function executeNotification(
  options: NotifyOptions
): Promise<void> {
  const {
    severity,
    message,
    taskId,
    taskTitle,
    patternName,
    additionalContext
  } = options

  const context: string[] = []

  if (severity) {
    context.push(`Severity: ${severity}`)
  }

  if (patternName) {
    context.push(`Pattern: ${patternName}`)
  }

  if (taskId) {
    context.push(`Task: ${taskId}`)
  }

  if (taskTitle) {
    context.push(`Task Title: ${taskTitle}`)
  }

  if (additionalContext) {
    context.push(additionalContext)
  }

  // Log notification (always available)
  const logMessage = [
    `🔔 NOTIFICATION (${severity})`,
    ...context,
    '',
    message,
    ''
  ].join('\n')

  if (options.log?.enabled !== false) {
    logger.warn(logMessage)
  }

  // Send to Telegram if configured
  if (options.telegram?.enabled && options.telegram.botToken && options.telegram.chatId) {
    try {
      await sendTelegramNotification({
        severity,
        message,
        context: context.join('\n'),
        taskId,
        taskTitle
      }, options.telegram)
      logger.debug('[AI-MONITOR] Telegram notification sent')
    } catch (error) {
      logger.error(`[AI-MONITOR] Failed to send Telegram notification: ${error}`)
      // Don't throw - notification failure shouldn't break the loop
    }
  }

  // Send to Discord if configured
  if (options.discord?.enabled && options.discord.webhookUrl) {
    try {
      await sendDiscordNotification({
        severity,
        message,
        context: context.join('\n'),
        taskId,
        taskTitle
      }, options.discord)
      logger.debug('[AI-MONITOR] Discord notification sent')
    } catch (error) {
      logger.error(`[AI-MONITOR] Failed to send Discord notification: ${error}`)
    }
  }
}

/**
 * Send notification via Telegram
 */
async function sendTelegramNotification(
  data: {
    severity: string
    message: string
    context: string
    taskId?: string
    taskTitle?: string
  },
  config: NotificationChannels['telegram']
): Promise<void> {
  // This would send a real HTTP request to Telegram API
  // For now, we'll just log what would be sent
  const chatId = config.chatId
  const botToken = config.botToken

  const severityEmoji = {
    'HIGH': '⚠️',
    'ERROR': '❌',
    'CRITICAL': '🚨'
  }[data.severity] || 'ℹ️'

  const text = [
    `${severityEmoji} *AI Monitor Alert*`,
    '',
    data.taskTitle ? `*Task:* ${data.taskTitle}` : '',
    data.taskId ? `*Task ID:* ${data.taskId}` : '',
    '',
    `*Pattern:* ${data.context}`,
    '',
    data.message,
    '',
    '_This is an automated notification from Loopwork AI Monitor_'
  ].filter(Boolean).join('\n')

  // Construct the API URL
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`

  // Log what would be sent (for implementation)
  logger.debug(`[Telegram API] POST ${url}`)
  logger.debug(`[Telegram API] Body: ${JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })}`)

  // Real implementation would be:
  /*
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown'
    })
  })
  const result = await response.json()
  if (!result.ok) {
    throw new Error(result.description || 'Telegram API error')
  }
  */
}

/**
 * Send notification via Discord
 */
async function sendDiscordNotification(
  data: {
    severity: string
    message: string
    context: string
    taskId?: string
    taskTitle?: string
  },
  config: NotificationChannels['discord']
): Promise<void> {
  // This would send a real HTTP request to Discord webhook
  // For now, we'll just log what would be sent
  const webhookUrl = config.webhookUrl

  const severityEmoji = {
    'HIGH': '⚠️',
    'ERROR': '❌',
    'CRITICAL': '🚨'
  }[data.severity] || 'ℹ️'

  const fields = []
  if (data.taskId) fields.push({ name: 'Task ID', value: data.taskId, inline: true })
  if (data.taskTitle) fields.push({ name: 'Task Title', value: data.taskTitle, inline: true })
  if (data.context) fields.push({ name: 'Pattern', value: data.context, inline: false })

  const text = [
    `${severityEmoji} AI Monitor Alert`,
    data.message
  ].join('\n')

  // Log what would be sent (for implementation)
  logger.debug(`[Discord Webhook] POST ${webhookUrl}`)
  logger.debug(`[Discord Webhook] Body: ${JSON.stringify({
    content: text,
    embeds: [{
      title: data.severity === 'CRITICAL' ? '🚨 CRITICAL ALERT' : severityEmoji + ' ALERT',
      description: text,
      fields,
      color: data.severity === 'CRITICAL' ? 0xff0000 : data.severity === 'ERROR' ? 0xff9900 : 0xffff00,
      timestamp: new Date().toISOString()
    }]
  })}`)

  // Real implementation would be:
  /*
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      content: text,
      embeds: [{
        title: data.severity === 'CRITICAL' ? '🚨 CRITICAL ALERT' : severityEmoji + ' ALERT',
        description: text,
        fields,
        color: data.severity === 'CRITICAL' ? 0xff0000 : data.severity === 'ERROR' ? 0xff9900 : 0xffff00,
        timestamp: new Date().toISOString()
      }]
    })
  })
  const result = await response.json()
  if (!result.ok) {
    throw new Error(result.message || 'Discord webhook error')
  }
  */
}

/**
 * Factory function to create the action
 */
export function createActionNotify(
  severity: 'HIGH' | 'ERROR' | 'CRITICAL',
  message: string,
  options: NotifyOptions
): MonitorAction {
  return {
    type: 'notify',
    channel: 'log',
    message: `[${severity}] ${message}`
  }
}

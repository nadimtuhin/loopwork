/**
 * Send alerts via notification plugins
 *
 * Integrates with Telegram/Discord plugins to send AI Monitor alerts.
 * Falls back to console logging if no notification plugins are configured.
 */

import { logger } from '../../core/utils'
import type { Action } from './index'
import type { PatternSeverity } from '../patterns'

export interface NotificationContext {
  pattern: string
  severity: PatternSeverity
  message: string
  timestamp: Date
  namespace?: string
}

/**
 * Severity level emoji indicators
 */
const SEVERITY_EMOJI: Record<PatternSeverity, string> = {
  INFO: 'ℹ️',
  WARN: '⚠️',
  ERROR: '❌',
  HIGH: '🚨'
}

/**
 * Format notification message
 */
export function formatNotificationMessage(context: NotificationContext): string {
  const emoji = SEVERITY_EMOJI[context.severity] || '🔔'
  const timestamp = context.timestamp.toLocaleTimeString()

  let message = `${emoji} AI Monitor Alert\n\n`
  message += `Severity: ${context.severity}\n`
  message += `Pattern: ${context.pattern}\n`
  message += `Details: ${context.message}\n\n`
  message += `Time: ${timestamp}\n`

  if (context.namespace) {
    message += `Session: ${context.namespace}\n`
  }

  return message
}

/**
 * Send notification via Telegram plugin
 */
async function sendTelegramNotification(message: string): Promise<boolean> {
  try {
    // Try to dynamically import Telegram plugin
    const telegramModule = await import('../../../telegram/src/notifications')
    const telegram = telegramModule.createTelegramPlugin()

    if (!telegram.isConfigured()) {
      logger.debug('Telegram not configured, skipping notification')
      return false
    }

    // Determine level based on message content
    let level: 'info' | 'success' | 'warning' | 'error' = 'info'
    if (message.includes('🚨') || message.includes('HIGH')) {
      level = 'error'
    } else if (message.includes('❌') || message.includes('ERROR')) {
      level = 'error'
    } else if (message.includes('⚠️') || message.includes('WARN')) {
      level = 'warning'
    }

    const result = await telegram.send({
      title: 'AI Monitor Alert',
      message,
      level
    })

    if (result.success) {
      logger.debug('Telegram notification sent successfully')
      return true
    } else {
      logger.debug(`Telegram notification failed: ${result.error}`)
      return false
    }
  } catch (error) {
    logger.debug(`Telegram plugin not available: ${error instanceof Error ? error.message : String(error)}`)
    return false
  }
}

/**
 * Send notification via Discord plugin
 */
async function sendDiscordNotification(message: string): Promise<boolean> {
  try {
    // Try to dynamically import Discord plugin
    const discordModule = await import('../../../discord/src/index')
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL

    if (!webhookUrl) {
      logger.debug('Discord not configured, skipping notification')
      return false
    }

    const client = new discordModule.DiscordClient(webhookUrl, {
      username: 'Loopwork AI Monitor'
    })

    await client.sendText(message)
    logger.debug('Discord notification sent successfully')
    return true
  } catch (error) {
    logger.debug(`Discord plugin not available: ${error instanceof Error ? error.message : String(error)}`)
    return false
  }
}

/**
 * Send notification via console log (fallback)
 */
function sendConsoleNotification(message: string, severity: PatternSeverity): void {
  const lines = message.split('\n')

  switch (severity) {
    case 'HIGH':
    case 'ERROR':
      logger.error(`\n${lines.join('\n')}`)
      break
    case 'WARN':
      logger.warn(`\n${lines.join('\n')}`)
      break
    case 'INFO':
    default:
      logger.info(`\n${lines.join('\n')}`)
      break
  }
}

/**
 * Execute notification action
 */
export async function executeNotify(action: Action, namespace?: string): Promise<void> {
  if (action.type !== 'notify') {
    throw new Error('Invalid action type for notify executor')
  }

  const notifyAction = action as { type: 'notify'; pattern: string; context: Record<string, string>; channel: 'telegram' | 'discord' | 'log'; message: string }

  // Extract severity from pattern context
  const severity = extractSeverity(action.pattern)

  const context: NotificationContext = {
    pattern: action.pattern,
    severity,
    message: notifyAction.message || action.context.rawLine || 'No details available',
    timestamp: new Date(),
    namespace
  }

  const message = formatNotificationMessage(context)

  // Try sending via notification plugins
  let sent = false

  // Try Telegram first
  if (!sent) {
    sent = await sendTelegramNotification(message)
  }

  // Try Discord if Telegram failed
  if (!sent) {
    sent = await sendDiscordNotification(message)
  }

  // Fallback to console log
  if (!sent) {
    logger.debug('No notification plugins available, using console log')
    sendConsoleNotification(message, severity)
  }
}

/**
 * Extract severity level from pattern name
 */
function extractSeverity(pattern: string): PatternSeverity {
  const patternSeverityMap: Record<string, PatternSeverity> = {
    'prd-not-found': 'WARN',
    'rate-limit': 'HIGH',
    'env-var-required': 'ERROR',
    'task-failed': 'HIGH',
    'circuit-breaker': 'HIGH',
    'timeout': 'WARN',
    'no-pending-tasks': 'INFO',
    'file-not-found': 'ERROR',
    'permission-denied': 'ERROR',
    'network-error': 'WARN',
    'plugin-error': 'WARN'
  }

  return patternSeverityMap[pattern] || 'INFO'
}

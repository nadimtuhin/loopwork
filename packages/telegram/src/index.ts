/**
 * Telegram Plugin for Loopwork
 */

import type { ConfigWrapper } from '@loopwork-ai/loopwork/contracts'
import type { TelegramConfig } from './notifications'

/**
 * Add Telegram notifications wrapper
 */
export function withTelegram(options: TelegramConfig = {}): ConfigWrapper {
  return (config) => ({
    ...config,
    telegram: {
      notifications: true,
      silent: false,
      ...options,
      botToken: options.botToken || process.env.TELEGRAM_BOT_TOKEN,
      chatId: options.chatId || process.env.TELEGRAM_CHAT_ID,
    },
  })
}

export * from './notifications'
export * from './bot'
export * from './daily-briefing'

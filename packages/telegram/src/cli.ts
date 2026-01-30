#!/usr/bin/env bun
/**
 * Telegram Bot CLI Entry Point
 *
 * Run the Telegram bot standalone:
 *   bun run packages/telegram/src/cli.ts
 */

import { TelegramTaskBot } from './bot'

const bot = new TelegramTaskBot()
bot.start().catch(console.error)

process.on('SIGINT', () => {
  bot.stop()
  process.exit(0)
})

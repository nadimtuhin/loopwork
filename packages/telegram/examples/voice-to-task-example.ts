/**
 * Voice-to-Task Example
 *
 * This example demonstrates how to enable voice-to-task creation
 * in the Telegram bot using OpenAI Whisper API.
 *
 * Setup:
 * 1. Set TELEGRAM_BOT_TOKEN environment variable
 * 2. Set TELEGRAM_CHAT_ID environment variable
 * 3. Set OPENAI_API_KEY environment variable
 * 4. Run: bun run examples/voice-to-task-example.ts
 *
 * Usage:
 * - Send a voice note to the bot
 * - The bot will transcribe it and create a task automatically
 * - Priority keywords are detected: "urgent", "asap", "low priority", etc.
 */

import { TelegramTaskBot } from '../src/bot'

// Create bot with voice-to-task enabled
const bot = new TelegramTaskBot({
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  chatId: process.env.TELEGRAM_CHAT_ID,
  whisperApiKey: process.env.OPENAI_API_KEY,
  enableVoiceNotes: true,
  whisperModel: 'whisper-1', // Optional: Use different Whisper model
  whisperLanguage: undefined, // Optional: Force specific language (e.g., 'en', 'es')
})

console.log('🤖 Telegram bot with voice-to-task enabled!')
console.log('📝 Voice notes will be transcribed using OpenAI Whisper')
console.log('🎤 Try sending a voice note like:')
console.log('   - "Urgent: fix the login bug"')
console.log('   - "Add user profile page with avatar upload"')
console.log('   - "Low priority: update documentation"')
console.log('')

bot.start().catch(console.error)

process.on('SIGINT', () => {
  console.log('\n👋 Stopping bot...')
  bot.stop()
  process.exit(0)
})

/**
 * Telegram Bot for Loopwork Task Management
 *
 * Provides interactive task management through Telegram commands.
 *
 * Commands:
 *   /tasks - List pending tasks
 *   /task <id> - Get task details
 *   /complete <id> - Mark task as completed
 *   /fail <id> <reason> - Mark task as failed
 *   /reset <id> - Reset task to pending
 *   /status - Get loop status
 *   /help - Show available commands
 *
 * Setup:
 *   1. Create a bot with @BotFather
 *   2. Set TELEGRAM_BOT_TOKEN env var
 *   3. Set TELEGRAM_CHAT_ID env var (your chat ID)
 *   4. Run: bun run src/telegram-bot.ts
 */

import { createBackend, type TaskBackend, type Task } from '../../backends'
import type { BackendConfig } from '../../backends/types'

interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    from: { id: number; username?: string }
    chat: { id: number }
    text?: string
    date: number
  }
}

interface TelegramResponse {
  ok: boolean
  result?: TelegramUpdate[]
  description?: string
}

export class TelegramTaskBot {
  private botToken: string
  private allowedChatId: string
  private backend: TaskBackend
  private lastUpdateId = 0
  private running = false

  constructor(config: {
    botToken?: string
    chatId?: string
    backend?: BackendConfig
  } = {}) {
    this.botToken = config.botToken || process.env.TELEGRAM_BOT_TOKEN || ''
    this.allowedChatId = config.chatId || process.env.TELEGRAM_CHAT_ID || ''

    if (!this.botToken) {
      throw new Error('TELEGRAM_BOT_TOKEN is required')
    }
    if (!this.allowedChatId) {
      throw new Error('TELEGRAM_CHAT_ID is required')
    }

    // Auto-detect backend
    const backendConfig: BackendConfig = config.backend || {
      type: 'json',
      tasksFile: '.specs/tasks/tasks.json',
    }
    this.backend = createBackend(backendConfig)
  }

  /**
   * Send a message to the configured chat
   */
  async sendMessage(text: string, parseMode: 'HTML' | 'Markdown' = 'HTML'): Promise<boolean> {
    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.allowedChatId,
          text,
          parse_mode: parseMode,
        }),
      })
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Get updates from Telegram
   */
  private async getUpdates(): Promise<TelegramUpdate[]> {
    try {
      const url = `https://api.telegram.org/bot${this.botToken}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=30`
      const response = await fetch(url)
      const data = await response.json() as TelegramResponse

      if (data.ok && data.result) {
        return data.result
      }
      return []
    } catch {
      return []
    }
  }

  /**
   * Handle a command
   */
  private async handleCommand(chatId: number, text: string): Promise<string> {
    // Security check - only allow configured chat
    if (String(chatId) !== this.allowedChatId) {
      return '⛔ Unauthorized'
    }

    const parts = text.trim().split(/\s+/)
    const command = parts[0].toLowerCase()

    switch (command) {
      case '/tasks':
      case '/list':
        return this.handleListTasks()

      case '/task':
        return this.handleGetTask(parts[1])

      case '/complete':
      case '/done':
        return this.handleCompleteTask(parts[1])

      case '/fail':
        return this.handleFailTask(parts[1], parts.slice(2).join(' '))

      case '/reset':
        return this.handleResetTask(parts[1])

      case '/status':
        return this.handleStatus()

      case '/new':
      case '/create':
        return this.handleCreateTask(parts.slice(1).join(' '))

      case '/subtask':
        return this.handleCreateSubTask(parts[1], parts.slice(2).join(' '))

      case '/priority':
        return this.handleSetPriority(parts[1], parts[2] as 'high' | 'medium' | 'low')

      case '/help':
      case '/start':
        return this.handleHelp()

      default:
        return `Unknown command: ${command}\nUse /help for available commands.`
    }
  }

  private async handleListTasks(): Promise<string> {
    const tasks = await this.backend.listPendingTasks()

    if (tasks.length === 0) {
      return '✅ No pending tasks!'
    }

    const priorityEmoji: Record<string, string> = {
      high: '🔴',
      medium: '🟡',
      low: '🟢',
    }

    const lines = tasks.slice(0, 10).map(t => {
      const emoji = priorityEmoji[t.priority] || '⚪'
      const title = t.title.length > 40 ? t.title.slice(0, 37) + '...' : t.title
      return `${emoji} <code>${t.id}</code>\n   ${escapeHtml(title)}`
    })

    let response = `📋 <b>Pending Tasks (${tasks.length})</b>\n\n${lines.join('\n\n')}`

    if (tasks.length > 10) {
      response += `\n\n<i>...and ${tasks.length - 10} more</i>`
    }

    return response
  }

  private async handleGetTask(taskId?: string): Promise<string> {
    if (!taskId) {
      return '❌ Usage: /task <task-id>'
    }

    const task = await this.backend.getTask(taskId)

    if (!task) {
      return `❌ Task not found: ${taskId}`
    }

    const statusEmoji: Record<string, string> = {
      pending: '⏳',
      'in-progress': '🔄',
      completed: '✅',
      failed: '❌',
    }

    const lines = [
      `${statusEmoji[task.status] || '❓'} <b>${escapeHtml(task.title)}</b>`,
      '',
      `<b>ID:</b> <code>${task.id}</code>`,
      `<b>Status:</b> ${task.status}`,
      `<b>Priority:</b> ${task.priority}`,
    ]

    if (task.feature) {
      lines.push(`<b>Feature:</b> ${escapeHtml(task.feature)}`)
    }

    if (task.parentId) {
      lines.push(`<b>Parent:</b> <code>${task.parentId}</code>`)
    }

    if (task.dependsOn && task.dependsOn.length > 0) {
      lines.push(`<b>Depends on:</b> ${task.dependsOn.map(d => `<code>${d}</code>`).join(', ')}`)
    }

    // Show truncated description
    if (task.description) {
      const desc = task.description.length > 500
        ? task.description.slice(0, 497) + '...'
        : task.description
      lines.push('', '<b>Description:</b>', escapeHtml(desc))
    }

    return lines.join('\n')
  }

  private async handleCompleteTask(taskId?: string): Promise<string> {
    if (!taskId) {
      return '❌ Usage: /complete <task-id>'
    }

    const task = await this.backend.getTask(taskId)
    if (!task) {
      return `❌ Task not found: ${taskId}`
    }

    const result = await this.backend.markCompleted(taskId, 'Completed via Telegram')

    if (result.success) {
      return `✅ Task ${taskId} marked as completed!`
    }

    return `❌ Failed to complete task: ${result.error || 'Unknown error'}`
  }

  private async handleFailTask(taskId?: string, reason?: string): Promise<string> {
    if (!taskId) {
      return '❌ Usage: /fail <task-id> [reason]'
    }

    const task = await this.backend.getTask(taskId)
    if (!task) {
      return `❌ Task not found: ${taskId}`
    }

    const result = await this.backend.markFailed(taskId, reason || 'Marked failed via Telegram')

    if (result.success) {
      return `❌ Task ${taskId} marked as failed`
    }

    return `❌ Failed to update task: ${result.error || 'Unknown error'}`
  }

  private async handleResetTask(taskId?: string): Promise<string> {
    if (!taskId) {
      return '❌ Usage: /reset <task-id>'
    }

    const task = await this.backend.getTask(taskId)
    if (!task) {
      return `❌ Task not found: ${taskId}`
    }

    const result = await this.backend.resetToPending(taskId)

    if (result.success) {
      return `🔄 Task ${taskId} reset to pending`
    }

    return `❌ Failed to reset task: ${result.error || 'Unknown error'}`
  }

  private async handleStatus(): Promise<string> {
    const ping = await this.backend.ping()
    const pending = await this.backend.countPending()

    const lines = [
      '📊 <b>Loopwork Status</b>',
      '',
      `<b>Backend:</b> ${this.backend.name}`,
      `<b>Health:</b> ${ping.ok ? '✅ OK' : '❌ Error'}`,
      `<b>Latency:</b> ${ping.latencyMs}ms`,
      `<b>Pending Tasks:</b> ${pending}`,
    ]

    if (ping.error) {
      lines.push(`<b>Error:</b> ${escapeHtml(ping.error)}`)
    }

    return lines.join('\n')
  }

  private async handleCreateTask(titleAndDesc: string): Promise<string> {
    if (!titleAndDesc.trim()) {
      return `❌ Usage: /new <title>

Or with description:
/new <title>
<description on next lines>

Example:
/new Add user authentication
Implement login/logout with JWT tokens`
    }

    if (!this.backend.createTask) {
      return '❌ This backend does not support task creation'
    }

    // Parse title and description (first line is title, rest is description)
    const lines = titleAndDesc.split('\n')
    const title = lines[0].trim()
    const description = lines.slice(1).join('\n').trim()

    try {
      const task = await this.backend.createTask({
        title,
        description: description || title,
        priority: 'medium',
      })

      return `✅ Task created!

<b>ID:</b> <code>${task.id}</code>
<b>Title:</b> ${escapeHtml(task.title)}
<b>Priority:</b> ${task.priority}

Use /task ${task.id} to view details`
    } catch (e: any) {
      return `❌ Failed to create task: ${escapeHtml(e.message)}`
    }
  }

  private async handleCreateSubTask(parentId: string | undefined, titleAndDesc: string): Promise<string> {
    if (!parentId || !titleAndDesc.trim()) {
      return `❌ Usage: /subtask <parent-id> <title>

Example:
/subtask TASK-001 Add login form validation`
    }

    if (!this.backend.createSubTask) {
      return '❌ This backend does not support sub-task creation'
    }

    // Check parent exists
    const parent = await this.backend.getTask(parentId)
    if (!parent) {
      return `❌ Parent task not found: ${parentId}`
    }

    const lines = titleAndDesc.split('\n')
    const title = lines[0].trim()
    const description = lines.slice(1).join('\n').trim()

    try {
      const task = await this.backend.createSubTask(parentId, {
        title,
        description: description || title,
        priority: parent.priority,
        feature: parent.feature,
      })

      return `✅ Sub-task created!

<b>ID:</b> <code>${task.id}</code>
<b>Parent:</b> <code>${parentId}</code>
<b>Title:</b> ${escapeHtml(task.title)}

Use /task ${task.id} to view details`
    } catch (e: any) {
      return `❌ Failed to create sub-task: ${escapeHtml(e.message)}`
    }
  }

  private async handleSetPriority(taskId: string | undefined, priority: 'high' | 'medium' | 'low' | undefined): Promise<string> {
    if (!taskId || !priority) {
      return `❌ Usage: /priority <task-id> <high|medium|low>

Example:
/priority TASK-001 high`
    }

    if (!['high', 'medium', 'low'].includes(priority)) {
      return `❌ Invalid priority: ${priority}\nUse: high, medium, or low`
    }

    const task = await this.backend.getTask(taskId)
    if (!task) {
      return `❌ Task not found: ${taskId}`
    }

    if (!this.backend.setPriority) {
      return '❌ This backend does not support priority changes'
    }

    const oldPriority = task.priority
    const result = await this.backend.setPriority(taskId, priority)

    if (result.success) {
      const priorityEmoji: Record<string, string> = {
        high: '🔴',
        medium: '🟡',
        low: '🟢',
      }
      return `✅ Priority updated!

<b>Task:</b> <code>${taskId}</code>
<b>Old:</b> ${priorityEmoji[oldPriority] || '⚪'} ${oldPriority}
<b>New:</b> ${priorityEmoji[priority] || '⚪'} ${priority}`
    }

    return `❌ Failed to update priority: ${result.error || 'Unknown error'}`
  }

  private handleHelp(): string {
    return `🤖 <b>Loopwork Task Bot</b>

<b>View Tasks:</b>
/tasks - List pending tasks
/task &lt;id&gt; - Get task details
/status - Get backend status

<b>Create Tasks:</b>
/new &lt;title&gt; - Create new task
/subtask &lt;parent&gt; &lt;title&gt; - Create sub-task

<b>Update Tasks:</b>
/complete &lt;id&gt; - Mark complete
/fail &lt;id&gt; [reason] - Mark failed
/reset &lt;id&gt; - Reset to pending
/priority &lt;id&gt; &lt;high|medium|low&gt; - Set priority

<b>Backend:</b> ${this.backend.name}`
  }

  /**
   * Start the bot polling loop
   */
  async start(): Promise<void> {
    if (this.running) return

    this.running = true
    console.log('🤖 Telegram bot started')
    await this.sendMessage('🤖 Loopwork bot is now online!\n\nUse /help for commands.')

    while (this.running) {
      try {
        const updates = await this.getUpdates()

        for (const update of updates) {
          this.lastUpdateId = update.update_id

          if (update.message?.text) {
            const response = await this.handleCommand(
              update.message.chat.id,
              update.message.text
            )
            await this.sendMessage(response)
          }
        }
      } catch (e: any) {
        console.error('Bot error:', e.message)
        await new Promise(r => setTimeout(r, 5000))
      }
    }
  }

  /**
   * Stop the bot
   */
  stop(): void {
    this.running = false
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// CLI entry point
if (import.meta.main) {
  const bot = new TelegramTaskBot()
  bot.start().catch(console.error)

  process.on('SIGINT', () => {
    bot.stop()
    process.exit(0)
  })
}

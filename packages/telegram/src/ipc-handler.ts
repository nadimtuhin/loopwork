/**
 * IPC Handler for Telegram Bot
 *
 * Parses and handles structured IPC messages from loopwork subprocess
 * to enable interactive approvals, structured questions, and rich notifications.
 */

import type { TelegramTaskBot } from './types'

/**
 * IPC message types supported by the protocol
 */
export type IPCEventType =
  | 'task_start'
  | 'task_complete'
  | 'task_failed'
  | 'question'
  | 'approval_request'
  | 'progress_update'
  | 'log'

/**
 * Core IPC message structure
 */
export interface IPCMessage {
  type: 'ipc'
  version: string
  event: IPCEventType
  data: any
  timestamp: number
  messageId: string
}

/**
 * Question IPC event data
 */
export interface QuestionData {
  question: string
  options: Array<{
    id: string
    label: string
  }>
  timeout: number
}

/**
 * Approval request IPC event data
 */
export interface ApprovalData {
  action: string
  description: string
  severity: 'low' | 'medium' | 'high'
  timeout: number
}

/**
 * Task lifecycle event data
 */
export interface TaskEventData {
  taskId: string
  title: string
  result?: any
  error?: string
}

/**
 * Progress update event data
 */
export interface ProgressData {
  taskId: string
  progress: number
  message: string
}

/**
 * Pending request tracking for correlation
 */
interface PendingRequest {
  resolve: (value: string) => void
  reject: (error: Error) => void
  timer: Timer
}

/**
 * IPC Handler for parsing and routing IPC messages
 */
export class IPCHandler {
  private pendingRequests = new Map<string, PendingRequest>()

  constructor(private bot: TelegramTaskBot) {}

  /**
   * Parse IPC messages from stdout chunk
   *
   * Extracts structured IPC messages using __IPC_START__...__IPC_END__ delimiters
   * and separates them from regular log output.
   */
  parseOutput(chunk: string): { ipcMessages: IPCMessage[], logs: string } {
    const ipcPattern = /__IPC_START__(.*?)__IPC_END__/g
    const messages: IPCMessage[] = []
    let logs = chunk

    let match
    while ((match = ipcPattern.exec(chunk)) !== null) {
      try {
        const msg = JSON.parse(match[1]) as IPCMessage
        if (msg.type === 'ipc') {
          messages.push(msg)
          logs = logs.replace(match[0], '')
        }
      } catch (e) {
        // Invalid JSON, treat as log
      }
    }

    // Clean up multiple consecutive newlines left after IPC message removal
    logs = logs.replace(/\n\n+/g, '\n')

    return { ipcMessages: messages, logs: logs.trim() }
  }

  /**
   * Route IPC message to appropriate handler based on event type
   */
  async handleMessage(msg: IPCMessage): Promise<void> {
    switch (msg.event) {
      case 'question':
        await this.handleQuestion(msg)
        break
      case 'approval_request':
        await this.handleApprovalRequest(msg)
        break
      case 'task_start':
        await this.handleTaskStart(msg)
        break
      case 'task_complete':
        await this.handleTaskComplete(msg)
        break
      case 'task_failed':
        await this.handleTaskFailed(msg)
        break
      case 'progress_update':
        await this.handleProgressUpdate(msg)
        break
      case 'log':
        await this.handleLog(msg)
        break
    }
  }

  /**
   * Handle question event with inline keyboard options
   */
  private async handleQuestion(msg: IPCMessage): Promise<void> {
    const data = msg.data as QuestionData
    const { question, options, timeout } = data

    // Create inline keyboard with one option per row
    const keyboard = options.map(opt => [{
      text: opt.label,
      callback_data: `ipc:${msg.messageId}:${opt.id}`
    }])

    await this.bot.sendMessage(question, {
      reply_markup: { inline_keyboard: keyboard }
    })

    // Start waiting for response (non-blocking)
    this.waitForResponse(msg.messageId, timeout).catch(() => {
      // Timeout handled silently - message already sent
    })
  }

  /**
   * Handle approval request with approve/deny buttons
   */
  private async handleApprovalRequest(msg: IPCMessage): Promise<void> {
    const data = msg.data as ApprovalData
    const { action, description, severity, timeout } = data

    const emoji = severity === 'high' ? '⚠️' : severity === 'medium' ? '⚡' : 'ℹ️'
    const text = `${emoji} <b>Approval Required</b>\n\n${escapeHtml(description)}\n\n<b>Action:</b> ${escapeHtml(action)}`

    await this.bot.sendMessage(text, {
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Approve', callback_data: `ipc:${msg.messageId}:approve` },
          { text: '❌ Deny', callback_data: `ipc:${msg.messageId}:deny` }
        ]]
      }
    })

    // Start waiting for response (non-blocking)
    this.waitForResponse(msg.messageId, timeout).catch(async () => {
      // Timeout - deny by default for safety
      await this.bot.sendMessage('⏱️ Approval timeout - request denied for safety')
    })
  }

  /**
   * Handle task start notification
   */
  private async handleTaskStart(msg: IPCMessage): Promise<void> {
    const data = msg.data as TaskEventData
    await this.bot.sendMessage(
      `🚀 <b>Task Started</b>\n\n<code>${escapeHtml(data.taskId)}</code>\n${escapeHtml(data.title)}`
    )
  }

  /**
   * Handle task completion notification
   */
  private async handleTaskComplete(msg: IPCMessage): Promise<void> {
    const data = msg.data as TaskEventData
    let text = `✅ <b>Task Completed</b>\n\n<code>${escapeHtml(data.taskId)}</code>\n${escapeHtml(data.title)}`

    if (data.result) {
      text += `\n\n<b>Result:</b> ${escapeHtml(JSON.stringify(data.result, null, 2).slice(0, 200))}`
    }

    await this.bot.sendMessage(text)
  }

  /**
   * Handle task failure notification
   */
  private async handleTaskFailed(msg: IPCMessage): Promise<void> {
    const data = msg.data as TaskEventData
    let text = `❌ <b>Task Failed</b>\n\n<code>${escapeHtml(data.taskId)}</code>\n${escapeHtml(data.title)}`

    if (data.error) {
      const errorPreview = data.error.length > 200 ? data.error.slice(0, 197) + '...' : data.error
      text += `\n\n<b>Error:</b> ${escapeHtml(errorPreview)}`
    }

    await this.bot.sendMessage(text)
  }

  /**
   * Handle progress update notification
   */
  private async handleProgressUpdate(msg: IPCMessage): Promise<void> {
    const data = msg.data as ProgressData
    const progressBar = this.createProgressBar(data.progress)

    await this.bot.sendMessage(
      `⚙️ <b>Progress Update</b>\n\n<code>${escapeHtml(data.taskId)}</code>\n${progressBar} ${data.progress}%\n\n${escapeHtml(data.message)}`
    )
  }

  /**
   * Handle structured log message
   */
  private async handleLog(msg: IPCMessage): Promise<void> {
    const { level, message } = msg.data
    const emoji = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : 'ℹ️'

    await this.bot.sendMessage(`${emoji} ${escapeHtml(message)}`)
  }

  /**
   * Wait for user response to IPC request
   *
   * Creates a promise that resolves when the user clicks a button
   * or rejects on timeout.
   */
  private waitForResponse(messageId: string, timeout: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(messageId)
        reject(new Error('Response timeout'))
      }, timeout * 1000)

      this.pendingRequests.set(messageId, { resolve, reject, timer })
    })
  }

  /**
   * Resolve a pending request with user's response
   *
   * Called when a callback query is received from Telegram.
   */
  resolveRequest(messageId: string, response: string): void {
    const pending = this.pendingRequests.get(messageId)
    if (pending) {
      clearTimeout(pending.timer)
      pending.resolve(response)
      this.pendingRequests.delete(messageId)
    }
  }

  /**
   * Create a visual progress bar
   */
  private createProgressBar(progress: number): string {
    const total = 10
    const filled = Math.floor((progress / 100) * total)
    const empty = total - filled
    return '█'.repeat(filled) + '░'.repeat(empty)
  }

  /**
   * Clean up all pending requests
   */
  cleanup(): void {
    for (const [messageId, pending] of this.pendingRequests) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Handler cleanup'))
    }
    this.pendingRequests.clear()
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

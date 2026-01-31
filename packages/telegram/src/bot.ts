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

import { createBackend } from '@loopwork-ai/loopwork/backends'
import type { TaskBackend, Task, BackendConfig } from '@loopwork-ai/loopwork/contracts'
import { SessionManager, type UserSession } from './session'
import { IPCHandler } from './ipc-handler'
import { DailyBriefingManager, type DailyBriefingConfig } from './daily-briefing'

interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    from: { id: number; username?: string; first_name?: string }
    chat: { id: number }
    text?: string
    caption?: string
    voice?: {
      file_id: string
      duration: number
      mime_type?: string
    }
    audio?: {
      file_id: string
      duration: number
      title?: string
      mime_type?: string
    }
    photo?: Array<{
      file_id: string
      file_unique_id: string
      width: number
      height: number
      file_size?: number
    }>
    date: number
  }
  callback_query?: {
    id: string
    from: { id: number; username?: string; first_name?: string }
    message?: {
      message_id: number
      chat: { id: number }
    }
    data?: string
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
  private sessionManager: SessionManager
  private loopProcess: any = null // Subprocess
  private loopCommand: string[]
  private ipcHandler: IPCHandler
  private whisperApiKey?: string
  private enableVoiceNotes: boolean
  private whisperModel: string
  private whisperLanguage?: string
  private briefingManager?: DailyBriefingManager

  constructor(config: {
    botToken?: string
    chatId?: string
    backend?: BackendConfig
    loopCommand?: string[]
    whisperApiKey?: string
    enableVoiceNotes?: boolean
    whisperModel?: string
    whisperLanguage?: string
    dailyBriefing?: Partial<DailyBriefingConfig>
  } = {}) {
    this.botToken = config.botToken || process.env.TELEGRAM_BOT_TOKEN || ''
    this.allowedChatId = config.chatId || process.env.TELEGRAM_CHAT_ID || ''
    this.sessionManager = new SessionManager()
    this.loopCommand = config.loopCommand || ['loopwork', 'run']
    this.ipcHandler = new IPCHandler(this)

    // Whisper configuration
    this.whisperApiKey = config.whisperApiKey || process.env.OPENAI_API_KEY
    this.enableVoiceNotes = config.enableVoiceNotes ?? (!!this.whisperApiKey)
    this.whisperModel = config.whisperModel || 'whisper-1'
    this.whisperLanguage = config.whisperLanguage

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

    // Initialize daily briefing if configured
    if (config.dailyBriefing) {
      const briefingConfig: DailyBriefingConfig = {
        enabled: true,
        sendTime: '09:00',
        timezone: 'UTC',
        includeMetrics: true,
        includeFileChanges: true,
        model: 'gpt-4o-mini',
        ...config.dailyBriefing,
        openaiApiKey: config.dailyBriefing.openaiApiKey || this.whisperApiKey,
      }

      this.briefingManager = new DailyBriefingManager(briefingConfig, {
        sendMessage: this.sendMessage.bind(this),
      })

      if (briefingConfig.enabled) {
        this.briefingManager.startScheduler()
      }
    }
  }

  /**
   * Send a message to the configured chat
   */
  async sendMessage(text: string, options?: { parseMode?: 'HTML' | 'Markdown', reply_markup?: any }): Promise<boolean> {
    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.allowedChatId,
          text,
          parse_mode: options?.parseMode || 'HTML',
          ...(options?.reply_markup && { reply_markup: options.reply_markup }),
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
   * Handle an update
   */
  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    if (!update.message) return

    const chatId = update.message.chat.id
    const userId = update.message.from.id

    // Security check - only allow configured chat
    if (String(chatId) !== this.allowedChatId) {
      return
    }

    const session = this.sessionManager.getSession(userId, chatId)

    // Handle voice messages
    if (update.message.voice && this.enableVoiceNotes) {
      await this.handleVoiceMessage(session, update.message.voice.file_id, update.message.voice.duration)
      return
    }

    // Handle audio messages
    if (update.message.audio && this.enableVoiceNotes) {
      await this.handleVoiceMessage(session, update.message.audio.file_id, update.message.audio.duration)
      return
    }

    // Handle photo messages
    if (update.message.photo && update.message.photo.length > 0) {
      const caption = update.message.caption || ''
      await this.handlePhotoMessage(session, update.message.photo, caption)
      return
    }

    // Text message handling
    if (!update.message.text) return
    const text = update.message.text.trim()

    // Handle cancel anytime
    if (text.toLowerCase() === '/cancel') {
      this.sessionManager.clearSession(userId)
      await this.sendMessage('🚫 Operation cancelled.')
      return
    }

    // Handle commands regardless of state (unless drafting description?)
    if (text.startsWith('/')) {
      const response = await this.handleCommand(chatId, text)
      await this.sendMessage(response)
      return
    }

    // State machine
    switch (session.state) {
      case 'DRAFTING_TASK':
        await this.handleDraftingState(session, text)
        break
      case 'CONFIRM_TASK':
        await this.handleConfirmState(session, text)
        break
      default:
        // Treat as new task request or chat
        await this.startTaskDraft(session, text)
        break
    }
  }

  private async startTaskDraft(session: UserSession, text: string) {
    this.sessionManager.updateSession(session.userId, {
      state: 'DRAFTING_TASK',
      draft: { title: text }
    })
    
    await this.sendMessage(
      `📝 <b>Drafting Task:</b> ${escapeHtml(text)}\n\n` +
      `Please provide a description for this task, or type "skip" to use the title as description.`
    )
  }

  private async handleDraftingState(session: UserSession, text: string) {
    if (!session.draft) {
      this.sessionManager.clearSession(session.userId)
      return
    }

    const description = text.toLowerCase() === 'skip' ? session.draft.title : text
    
    this.sessionManager.updateSession(session.userId, {
      state: 'CONFIRM_TASK',
      draft: { ...session.draft, description }
    })

    await this.sendMessage(
      `📋 <b>Confirm Task Creation?</b>\n\n` +
      `<b>Title:</b> ${escapeHtml(session.draft.title || '')}\n` +
      `<b>Description:</b> ${escapeHtml(description || '')}\n\n` +
      `Type <b>yes</b> to create, or <b>no</b> to cancel.`
    )
  }

  private async handleConfirmState(session: UserSession, text: string) {
    if (['yes', 'y', 'ok', 'confirm'].includes(text.toLowerCase())) {
      await this.createTaskFromDraft(session)
    } else {
      this.sessionManager.clearSession(session.userId)
      await this.sendMessage('🚫 Task creation cancelled.')
    }
  }

  private async createTaskFromDraft(session: UserSession) {
    if (!session.draft || !this.backend.createTask) {
      await this.sendMessage('❌ Error: Backend does not support task creation or draft lost.')
      this.sessionManager.clearSession(session.userId)
      return
    }

    try {
      const task = await this.backend.createTask({
        title: session.draft.title!,
        description: session.draft.description || session.draft.title!,
        priority: 'medium',
      })

      await this.sendMessage(
        `✅ <b>Task Created!</b>\n\n` +
        `<b>ID:</b> <code>${task.id}</code>\n` +
        `<b>Title:</b> ${escapeHtml(task.title)}`
      )
    } catch (e: any) {
      await this.sendMessage(`❌ Failed to create task: ${escapeHtml(e.message)}`)
    } finally {
      this.sessionManager.clearSession(session.userId)
    }
  }

  /**
   * Handle a command
   */
  private async handleCommand(chatId: number, text: string): Promise<string> {

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

      case '/run':
        return this.handleRunLoop()

      case '/stop':
        return this.handleStopLoop()

      case '/input':
        return this.handleInput(parts.slice(1).join(' '))

      case '/briefing':
        return this.handleBriefing()

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

    const backend = this.backend as any
    if (!backend.setPriority) {
      return '❌ This backend does not support priority changes'
    }

    const oldPriority = task.priority
    const result = await backend.setPriority(taskId, priority)

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

  private async handleRunLoop(): Promise<string> {
    if (this.loopProcess) {
      return '⚠️ Loop is already running!'
    }

    try {
      await this.sendMessage('🚀 Starting Loopwork...')
      
      this.loopProcess = Bun.spawn(this.loopCommand, {
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          ...process.env,
          LOOPWORK_IPC: 'true',
          LOOPWORK_NON_INTERACTIVE: 'false', // Ensure it doesn't auto-confirm
        },
        onExit: (proc, exitCode, signalCode, error) => {
          this.loopProcess = null
          this.sendMessage(`🏁 Loop finished (Exit code: ${exitCode})`)
        }
      })
      
      this.streamOutput(this.loopProcess.stdout)
      this.streamOutput(this.loopProcess.stderr)

      return '✅ Loop started successfully!'
    } catch (e: any) {
      this.loopProcess = null
      return `❌ Failed to start loop: ${e.message}`
    }
  }

  private async handleStopLoop(): Promise<string> {
    if (!this.loopProcess) {
      return '⚠️ No loop running.'
    }

    this.loopProcess.kill()
    this.loopProcess = null
    return '🛑 Loop stopped.'
  }

  private async streamOutput(readable: any) {
    if (!readable) return
    const reader = readable.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let lastSendTime = Date.now()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)

        // Parse IPC messages from chunk
        const { ipcMessages, logs } = this.ipcHandler.parseOutput(chunk)

        // Handle structured IPC messages
        for (const msg of ipcMessages) {
          await this.ipcHandler.handleMessage(msg)
        }

        // Add remaining logs to buffer
        buffer += logs

        if (buffer.length > 2000 || (Date.now() - lastSendTime > 2000 && buffer.length > 0)) {
          if (buffer.trim()) {
            await this.sendMessage(`<pre>${escapeHtml(buffer)}</pre>`)
          }
          buffer = ''
          lastSendTime = Date.now()
        }
      }

      if (buffer.trim().length > 0) {
        await this.sendMessage(`<pre>${escapeHtml(buffer)}</pre>`)
      }
    } catch (e) {
      console.error('Error streaming output:', e)
    }
  }

  private async handleInput(text: string): Promise<string> {
    if (!this.loopProcess || !this.loopProcess.stdin) {
      return '⚠️ No running loop to send input to.'
    }

    try {
      const writer = this.loopProcess.stdin.getWriter()
      const encoder = new TextEncoder()
      await writer.write(encoder.encode(text + '\n'))
      writer.releaseLock()
      return '📤 Input sent.'
    } catch (e: any) {
      return `❌ Failed to send input: ${e.message}`
    }
  }

  private async handleBriefing(): Promise<string> {
    if (!this.briefingManager) {
      return '⚠️ Daily briefing is not configured. Please enable it in bot configuration.'
    }

    const result = await this.briefingManager.generateAndSendBriefing()

    if (result.success) {
      return '✅ Daily briefing sent!'
    }

    return `❌ Failed to send briefing: ${result.error || 'Unknown error'}`
  }

  private handleHelp(): string {
    const voiceNoteInfo = this.enableVoiceNotes
      ? '\n🎤 Send a voice note to create tasks hands-free!'
      : ''

    const briefingInfo = this.briefingManager
      ? '\n/briefing - Generate and send daily briefing'
      : ''

    return `🤖 <b>Loopwork Teleloop Agent</b>

<b>Loop Control:</b>
/run - Start the automation loop
/stop - Stop the running loop
/input &lt;text&gt; - Send input to running loop
/status - Get backend status${briefingInfo}

<b>Task Management:</b>
Simply type "Create a task..." to start drafting!${voiceNoteInfo}
📸 Send an image to create a bug report with visual context!

<b>Commands:</b>
/tasks - List pending tasks
/task &lt;id&gt; - Get task details
/complete &lt;id&gt; - Mark complete
/fail &lt;id&gt; [reason] - Mark failed
/reset &lt;id&gt; - Reset to pending
/priority &lt;id&gt; &lt;high|medium|low&gt; - Set priority

<b>Backend:</b> ${this.backend.name}`
  }

  /**
   * Handle voice message
   */
  private async handleVoiceMessage(session: UserSession, fileId: string, duration: number): Promise<void> {
    if (!this.whisperApiKey) {
      await this.sendMessage('⚠️ Voice notes are not configured. Please set OPENAI_API_KEY.')
      return
    }

    if (duration > 300) { // 5 minutes
      await this.sendMessage('⚠️ Voice note too long. Please keep it under 5 minutes.')
      return
    }

    try {
      await this.sendMessage('🎤 Processing voice note...')

      // Download voice file
      const filePath = await this.downloadVoiceFile(fileId)

      // Transcribe audio
      const transcript = await this.transcribeAudio(filePath)

      if (!transcript || transcript.trim().length === 0) {
        await this.sendMessage('⚠️ Could not transcribe audio. Please try again or speak more clearly.')
        return
      }

      // Show transcript to user
      await this.sendMessage(`🎤 <b>Transcript:</b>\n${escapeHtml(transcript)}`)

      // Parse intent and create task
      const intent = this.parseTranscriptIntent(transcript)

      // Handle based on current state
      if (session.state === 'DRAFTING_TASK' && session.draft) {
        // Append to existing draft description
        const currentDesc = session.draft.description || ''
        const newDesc = currentDesc ? `${currentDesc}\n${intent.description}` : intent.description

        this.sessionManager.updateSession(session.userId, {
          draft: { ...session.draft, description: newDesc }
        })

        await this.sendMessage('📝 Voice note added to task description.\n\nType "done" when ready to confirm, or send more voice notes to add more details.')
      } else {
        // Create new task from voice
        await this.startTaskDraft(session, intent.title)
      }
    } catch (error: any) {
      console.error('Voice message error:', error)
      await this.sendMessage(`❌ Failed to process voice note: ${escapeHtml(error.message)}`)
    }
  }

  /**
   * Handle photo message (Vision Bug Reporting)
   */
  private async handlePhotoMessage(
    session: UserSession,
    photos: Array<{ file_id: string; width: number; height: number; file_size?: number }>,
    caption: string
  ): Promise<void> {
    try {
      await this.sendMessage('📸 Processing image...')

      // Get the largest photo (last in array)
      const largestPhoto = photos[photos.length - 1]

      // Download photo file
      const imagePath = await this.downloadPhotoFile(largestPhoto.file_id)

      // Create task with image reference
      if (!this.backend.createTask) {
        await this.sendMessage('❌ This backend does not support task creation')
        return
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const title = caption ? `Bug Report: ${caption}` : `Bug Report: ${timestamp}`
      const description = caption
        ? `${caption}\n\nImage: ${imagePath}`
        : `Visual bug report\n\nImage: ${imagePath}`

      const task = await this.backend.createTask({
        title,
        description,
        priority: 'medium',
        feature: 'bug-report',
        metadata: {
          imagePath,
          timestamp,
          userId: session.userId,
          username: session.chatId.toString()
        }
      })

      await this.sendMessage(
        `✅ <b>Bug Report Created!</b>\n\n` +
        `<b>ID:</b> <code>${task.id}</code>\n` +
        `<b>Title:</b> ${escapeHtml(task.title)}\n` +
        `<b>Image:</b> ${escapeHtml(imagePath)}\n\n` +
        `The task is queued for AI analysis.`
      )
    } catch (error: any) {
      console.error('Photo message error:', error)
      await this.sendMessage(`❌ Failed to process image: ${escapeHtml(error.message)}`)
    }
  }

  /**
   * Download voice file from Telegram
   */
  private async downloadVoiceFile(fileId: string): Promise<string> {
    const fs = await import('fs/promises')
    const path = await import('path')

    // Get file info
    const fileInfoUrl = `https://api.telegram.org/bot${this.botToken}/getFile?file_id=${fileId}`
    const fileInfoResponse = await fetch(fileInfoUrl)
    const fileInfo = await fileInfoResponse.json() as any

    if (!fileInfo.ok || !fileInfo.result?.file_path) {
      throw new Error('Failed to get file info from Telegram')
    }

    const filePath = fileInfo.result.file_path
    const fileUrl = `https://api.telegram.org/file/bot${this.botToken}/${filePath}`

    // Create temp directory
    const tempDir = path.join(process.cwd(), '.loopwork', 'tmp', 'voice')
    await fs.mkdir(tempDir, { recursive: true })

    // Download file
    const localPath = path.join(tempDir, `${fileId}.ogg`)
    const response = await fetch(fileUrl)

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    await fs.writeFile(localPath, buffer)

    return localPath
  }

  /**
   * Download photo file from Telegram
   */
  private async downloadPhotoFile(fileId: string): Promise<string> {
    const fs = await import('fs/promises')
    const path = await import('path')

    // Get file info
    const fileInfoUrl = `https://api.telegram.org/bot${this.botToken}/getFile?file_id=${fileId}`
    const fileInfoResponse = await fetch(fileInfoUrl)
    const fileInfo = await fileInfoResponse.json() as any

    if (!fileInfo.ok || !fileInfo.result?.file_path) {
      throw new Error('Failed to get file info from Telegram')
    }

    const filePath = fileInfo.result.file_path
    const fileUrl = `https://api.telegram.org/file/bot${this.botToken}/${filePath}`

    // Create attachments directory
    const attachmentsDir = path.join(process.cwd(), '.specs', 'attachments')
    await fs.mkdir(attachmentsDir, { recursive: true })

    // Generate unique filename with timestamp
    const timestamp = Date.now()
    const extension = path.extname(filePath) || '.jpg'
    const localFilename = `${timestamp}-${fileId}${extension}`
    const localPath = path.join(attachmentsDir, localFilename)

    // Download file
    const response = await fetch(fileUrl)

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    await fs.writeFile(localPath, buffer)

    // Return relative path for storage
    return `.specs/attachments/${localFilename}`
  }

  /**
   * Transcribe audio using OpenAI Whisper API
   */
  private async transcribeAudio(filePath: string): Promise<string> {
    const fs = await import('fs/promises')
    const path = await import('path')

    const file = await fs.readFile(filePath)
    const fileName = path.basename(filePath)

    // Create FormData
    const formData = new FormData()
    const blob = new Blob([file], { type: 'audio/ogg' })
    formData.append('file', blob, fileName)
    formData.append('model', this.whisperModel)
    if (this.whisperLanguage) {
      formData.append('language', this.whisperLanguage)
    }

    // Call Whisper API
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.whisperApiKey}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Whisper API error: ${response.statusText} - ${error}`)
    }

    const result = await response.json() as { text: string }

    // Clean up temp file
    try {
      await fs.unlink(filePath)
    } catch (e) {
      console.error('Failed to delete temp file:', e)
    }

    return result.text.trim()
  }

  /**
   * Parse transcript intent for task creation
   */
  private parseTranscriptIntent(transcript: string): { title: string; description: string; priority?: 'high' | 'medium' | 'low' } {
    const text = transcript.trim()

    // Detect priority keywords
    const urgentRegex = /\b(urgent|asap|critical|high priority|important)\b/i
    const lowRegex = /\b(low priority|minor|whenever|someday)\b/i

    let priority: 'high' | 'medium' | 'low' | undefined
    if (urgentRegex.test(text)) {
      priority = 'high'
    } else if (lowRegex.test(text)) {
      priority = 'low'
    }

    // Remove priority keywords from text
    let cleanText = text
      .replace(/\b(urgent|asap|critical|high priority|low priority|minor|important)\b:?\s*/gi, '')
      .trim()

    // Split into title and description
    // First sentence is title, rest is description
    const sentences = cleanText.split(/[.!?]+/)
    const title = sentences[0].trim() || cleanText
    const description = sentences.length > 1
      ? sentences.slice(1).join('. ').trim()
      : cleanText

    return {
      title: title.slice(0, 100), // Limit title length
      description: description || title,
      priority
    }
  }

  /**
   * Handle callback query from inline keyboard button clicks
   */
  private async handleCallbackQuery(query: TelegramUpdate['callback_query']): Promise<void> {
    if (!query || !query.data) return

    const data = query.data

    // Handle IPC-related callback queries
    if (data.startsWith('ipc:')) {
      const [_, messageId, response] = data.split(':')

      // Send response to loopwork via stdin
      if (this.loopProcess && this.loopProcess.stdin) {
        try {
          const writer = this.loopProcess.stdin.getWriter()
          await writer.write(new TextEncoder().encode(`${response}\n`))
          await writer.releaseLock()
        } catch (e) {
          console.error('Error sending response to loopwork:', e)
        }
      }

      // Resolve pending request in IPC handler
      this.ipcHandler.resolveRequest(messageId, response)

      // Answer callback query to remove loading state
      await this.answerCallbackQuery(query.id)

      // Edit message to remove buttons
      if (query.message) {
        await this.editMessageReplyMarkup(query.message.message_id, { inline_keyboard: [] })
      }
    }
  }

  /**
   * Answer a callback query
   */
  private async answerCallbackQuery(queryId: string, text?: string): Promise<boolean> {
    try {
      const url = `https://api.telegram.org/bot${this.botToken}/answerCallbackQuery`
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: queryId,
          text,
        }),
      })
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Edit message reply markup (buttons)
   */
  private async editMessageReplyMarkup(messageId: number, replyMarkup: any): Promise<boolean> {
    try {
      const url = `https://api.telegram.org/bot${this.botToken}/editMessageReplyMarkup`
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.allowedChatId,
          message_id: messageId,
          reply_markup: replyMarkup,
        }),
      })
      return response.ok
    } catch {
      return false
    }
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

          // Handle callback queries (button clicks)
          if (update.callback_query) {
            await this.handleCallbackQuery(update.callback_query)
          }

          // Handle text messages, voice notes, audio files, and photos
          if (update.message?.text || update.message?.voice || update.message?.audio || update.message?.photo) {
            await this.handleUpdate(update)
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
    if (this.briefingManager) {
      this.briefingManager.stopScheduler()
    }
  }

  /**
   * Get the daily briefing manager (for external access)
   */
  getBriefingManager(): DailyBriefingManager | undefined {
    return this.briefingManager
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

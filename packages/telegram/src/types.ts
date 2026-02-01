/**
 * Telegram Bot Types
 * Extracted to prevent circular dependencies between bot.ts and ipc-handler.ts
 */

import type { Task, TaskBackend, BackendConfig } from '@loopwork-ai/loopwork/contracts'
import type { UserSession } from './session'

export interface TelegramUpdate {
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
    }>
    document?: {
      file_id: string
      file_name?: string
      mime_type?: string
    }
  }
  callback_query?: {
    id: string
    from: { id: number }
    message?: { chat: { id: number }; message_id: number }
    data?: string
  }
}

export interface TelegramTaskBotConfig {
  botToken?: string
  chatId?: string
  loopCommand?: string[]
  whisperApiKey?: string
  enableVoiceNotes?: boolean
  whisperModel?: string
  whisperLanguage?: string
  attachmentsDir?: string
  dailyBriefing?: {
    enabled?: boolean
    time?: string
    timezone?: string
    llmProvider?: 'openai' | 'anthropic'
  }
}

export interface TelegramTaskBot {
  config: TelegramTaskBotConfig
  backend: TaskBackend
  sessionManager: unknown
  ipcHandler: unknown
  dailyBriefingManager: unknown | null
  start(): Promise<void>
  stop(): void
  sendMessage(text: string, options?: { parseMode?: 'HTML' | 'Markdown' }): Promise<void>
  sendPhoto(photoPath: string, caption?: string): Promise<void>
  handleUpdate(update: TelegramUpdate): Promise<void>
  setWebhook(url: string): Promise<void>
  deleteWebhook(): Promise<void>
  getPendingTasks(): Promise<Task[]>
  getTask(taskId: string): Promise<Task | null>
  completeTask(taskId: string): Promise<boolean>
  failTask(taskId: string, reason?: string): Promise<boolean>
  resetTask(taskId: string): Promise<boolean>
  runLoop(): Promise<void>
  stopLoop(): void
  sendInputToLoop(input: string): boolean
  getLoopStatus(): { running: boolean; pid?: number; startTime?: Date }
  transcribeVoice(fileId: string): Promise<string | null>
  createTaskFromVoice(transcription: string): Promise<Task | null>
  handlePhoto(photoFileId: string, caption?: string, mimeType?: string): Promise<void>
  downloadFile(fileId: string, destPath: string): Promise<boolean>
  generateDailyBriefing(): Promise<string>
  sendDailyBriefing(): Promise<void>
}

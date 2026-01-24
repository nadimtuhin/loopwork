/**
 * Configuration Types
 */

import type { LoopworkPlugin } from './plugin'
import type { BackendConfig } from './backend'

/**
 * Telegram plugin configuration
 */
export interface TelegramConfig {
  botToken?: string
  chatId?: string
  notifications?: boolean
  silent?: boolean
}

/**
 * Discord plugin configuration
 */
export interface DiscordConfig {
  webhookUrl?: string
  username?: string
  avatarUrl?: string
  notifyOnStart?: boolean
  notifyOnComplete?: boolean
  notifyOnFail?: boolean
  notifyOnLoopEnd?: boolean
  mentionOnFail?: string
}

/**
 * Asana plugin configuration
 */
export interface AsanaConfig {
  accessToken?: string
  projectId?: string
  workspaceId?: string
  autoCreate?: boolean
  syncStatus?: boolean
}

/**
 * Everhour plugin configuration
 */
export interface EverhourConfig {
  apiKey?: string
  autoStartTimer?: boolean
  autoStopTimer?: boolean
  projectId?: string
  dailyLimit?: number
}

/**
 * Todoist plugin configuration
 */
export interface TodoistConfig {
  apiToken?: string
  projectId?: string
  syncStatus?: boolean
  addComments?: boolean
}

/**
 * Cost tracking configuration
 */
export interface CostTrackingConfig {
  enabled?: boolean
  defaultModel?: string
  dailyBudget?: number
  alertThreshold?: number
}

/**
 * Main Loopwork configuration
 */
export interface LoopworkConfig {
  // Backend
  backend: BackendConfig

  // CLI settings
  cli?: 'claude' | 'opencode' | 'gemini'
  model?: string

  // Execution settings
  maxIterations?: number
  timeout?: number
  namespace?: string
  autoConfirm?: boolean
  dryRun?: boolean
  debug?: boolean

  // Task filtering
  feature?: string

  // Retry/resilience
  maxRetries?: number
  circuitBreakerThreshold?: number
  taskDelay?: number
  retryDelay?: number

  // Plugin configs
  telegram?: TelegramConfig
  discord?: DiscordConfig
  asana?: AsanaConfig
  everhour?: EverhourConfig
  todoist?: TodoistConfig
  costTracking?: CostTrackingConfig

  // Registered plugins
  plugins?: LoopworkPlugin[]
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Partial<LoopworkConfig> = {
  cli: 'opencode',
  maxIterations: 50,
  timeout: 600,
  namespace: 'default',
  autoConfirm: false,
  dryRun: false,
  debug: false,
  maxRetries: 3,
  circuitBreakerThreshold: 5,
  taskDelay: 2000,
  retryDelay: 3000,
}

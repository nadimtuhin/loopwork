/**
 * Plugin System
 *
 * Config wrappers and plugin utilities
 */

import type {
  LoopworkConfig,
  LoopworkPlugin,
  ConfigWrapper,
  TelegramConfig,
  DiscordConfig,
  AsanaConfig,
  EverhourConfig,
  TodoistConfig,
  CostTrackingConfig,
} from '../contracts'
import { DEFAULT_CONFIG } from '../contracts'

// ============================================================================
// Config Helpers
// ============================================================================

/**
 * Define a type-safe config
 */
export function defineConfig(config: LoopworkConfig): LoopworkConfig {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    plugins: config.plugins || [],
  }
}

/**
 * Define async/dynamic config
 */
export function defineConfigAsync(
  fn: () => Promise<LoopworkConfig> | LoopworkConfig
): () => Promise<LoopworkConfig> {
  return async () => {
    const config = await fn()
    return defineConfig(config)
  }
}

/**
 * Compose multiple wrappers
 *
 * @example
 * export default compose(
 *   withTelegram(),
 *   withCostTracking(),
 * )(defineConfig({ ... }))
 */
export function compose(...wrappers: ConfigWrapper[]): ConfigWrapper {
  return (config) => wrappers.reduce((cfg, wrapper) => wrapper(cfg), config)
}

// ============================================================================
// Plugin Wrappers
// ============================================================================

/**
 * Add a custom plugin
 */
export function withPlugin(plugin: LoopworkPlugin): ConfigWrapper {
  return (config) => ({
    ...config,
    plugins: [...(config.plugins || []), plugin],
  })
}

/**
 * Add Telegram notifications
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

/**
 * Add Discord notifications
 */
export function withDiscord(options: DiscordConfig = {}): ConfigWrapper {
  return (config) => ({
    ...config,
    discord: {
      webhookUrl: options.webhookUrl || process.env.DISCORD_WEBHOOK_URL,
      username: options.username || 'Loopwork',
      avatarUrl: options.avatarUrl,
      notifyOnStart: options.notifyOnStart ?? false,
      notifyOnComplete: options.notifyOnComplete ?? true,
      notifyOnFail: options.notifyOnFail ?? true,
      notifyOnLoopEnd: options.notifyOnLoopEnd ?? true,
      mentionOnFail: options.mentionOnFail,
    },
  })
}

/**
 * Add Asana integration
 */
export function withAsana(options: AsanaConfig = {}): ConfigWrapper {
  return (config) => ({
    ...config,
    asana: {
      accessToken: options.accessToken || process.env.ASANA_ACCESS_TOKEN,
      projectId: options.projectId || process.env.ASANA_PROJECT_ID,
      workspaceId: options.workspaceId,
      autoCreate: options.autoCreate ?? false,
      syncStatus: options.syncStatus ?? true,
    },
  })
}

/**
 * Add Everhour time tracking
 */
export function withEverhour(options: EverhourConfig = {}): ConfigWrapper {
  return (config) => ({
    ...config,
    everhour: {
      apiKey: options.apiKey || process.env.EVERHOUR_API_KEY,
      autoStartTimer: options.autoStartTimer ?? true,
      autoStopTimer: options.autoStopTimer ?? true,
      projectId: options.projectId,
      dailyLimit: options.dailyLimit ?? 8,
    },
  })
}

/**
 * Add Todoist integration
 */
export function withTodoist(options: TodoistConfig = {}): ConfigWrapper {
  return (config) => ({
    ...config,
    todoist: {
      apiToken: options.apiToken || process.env.TODOIST_API_TOKEN,
      projectId: options.projectId || process.env.TODOIST_PROJECT_ID,
      syncStatus: options.syncStatus ?? true,
      addComments: options.addComments ?? true,
    },
  })
}

/**
 * Add cost tracking
 */
export function withCostTracking(options: CostTrackingConfig = {}): ConfigWrapper {
  return (config) => ({
    ...config,
    costTracking: {
      enabled: true,
      defaultModel: 'claude-3.5-sonnet',
      ...options,
    },
  })
}

/**
 * Use GitHub Issues as backend
 */
export function withGitHub(options: { repo?: string } = {}): ConfigWrapper {
  return (config) => ({
    ...config,
    backend: {
      type: 'github',
      repo: options.repo,
    },
  })
}

/**
 * Use JSON files as backend
 */
export function withJSON(options: { tasksFile?: string; tasksDir?: string } = {}): ConfigWrapper {
  return (config) => ({
    ...config,
    backend: {
      type: 'json',
      tasksFile: options.tasksFile || '.specs/tasks/tasks.json',
      tasksDir: options.tasksDir,
    },
  })
}

// ============================================================================
// Plugin Registry
// ============================================================================

class PluginRegistry {
  private plugins: LoopworkPlugin[] = []

  register(plugin: LoopworkPlugin): void {
    const existing = this.plugins.findIndex((p) => p.name === plugin.name)
    if (existing >= 0) {
      this.plugins[existing] = plugin
    } else {
      this.plugins.push(plugin)
    }
  }

  unregister(name: string): void {
    this.plugins = this.plugins.filter((p) => p.name !== name)
  }

  getAll(): LoopworkPlugin[] {
    return [...this.plugins]
  }

  get(name: string): LoopworkPlugin | undefined {
    return this.plugins.find((p) => p.name === name)
  }

  clear(): void {
    this.plugins = []
  }

  /**
   * Run a lifecycle hook on all registered plugins
   */
  async runHook(hookName: keyof LoopworkPlugin, ...args: any[]): Promise<void> {
    for (const plugin of this.plugins) {
      const hook = plugin[hookName]
      if (typeof hook === 'function') {
        try {
          await (hook as Function).apply(plugin, args)
        } catch (error) {
          console.error(`Plugin ${plugin.name} error in ${hookName}:`, error)
        }
      }
    }
  }
}

export const plugins = new PluginRegistry()

// ============================================================================
// Re-exports
// ============================================================================

export type { LoopworkPlugin, ConfigWrapper } from '../contracts'
export { DEFAULT_CONFIG as defaults } from '../contracts'

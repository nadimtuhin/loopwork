import {
  defineConfig,
  withTelegram,
  withCostTracking,
  withJSON,
  withGitHub,
  withPlugin,
  withAsana,
  withEverhour,
  withTodoist,
  withDiscord,
  compose,
} from './src/loopwork-config-types'
import { withJSONBackend, withGitHubBackend } from './src/backend-plugin'

/**
 * Loopwork Configuration
 *
 * This file configures the Loopwork task runner.
 * Similar to next.config.js, you can use plugin wrappers to add functionality.
 *
 * Backends are now plugins:
 * - withJSONBackend({ tasksFile: 'tasks.json' })
 * - withGitHubBackend({ repo: 'owner/repo' })
 */

// =============================================================================
// Full Example with All Plugins
// =============================================================================

export default compose(
  // Backend plugins (choose one)
  withJSONBackend({ tasksFile: '.specs/tasks/tasks.json' }),
  // withGitHubBackend({ repo: 'owner/repo' }),

  // Legacy backend config (still supported)
  // withJSON({ tasksFile: '.specs/tasks/tasks.json' }),
  // withGitHub({ repo: 'owner/repo' }),

  // Telegram notifications on task events
  withTelegram({
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
    silent: false,
  }),

  // Asana integration: sync task status to Asana project
  // Tasks should have metadata.asanaGid set in the tasks file
  // withAsana({
  //   projectId: process.env.ASANA_PROJECT_ID,
  //   syncStatus: true,
  // }),

  // Everhour time tracking: auto-track time spent on tasks
  // Uses metadata.everhourId or metadata.asanaGid (auto-prefixed with 'as:')
  // withEverhour({
  //   autoStartTimer: true,
  //   autoStopTimer: true,
  // }),

  // Todoist integration: sync task status to Todoist
  // Tasks should have metadata.todoistId set
  // withTodoist({
  //   projectId: process.env.TODOIST_PROJECT_ID,
  //   syncStatus: true,
  //   addComments: true,
  // }),

  // Discord notifications via webhook
  // withDiscord({
  //   webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  //   username: 'Loopwork',
  //   notifyOnComplete: true,
  //   notifyOnFail: true,
  //   mentionOnFail: '<@&123456>',  // mention role on failures
  // }),

  // Cost tracking for token usage
  withCostTracking({
    enabled: true,
    defaultModel: 'claude-3.5-sonnet',
  }),

  // Dashboard TUI: live progress display
  // Requires: bun add ink react @types/react
  // withPlugin(createDashboardPlugin({ totalTasks: 10 })),

  // Custom plugin: Log to console
  withPlugin({
    name: 'console-logger',
    onLoopStart: (namespace) => {
      console.log(`\n🚀 Loop starting in namespace: ${namespace}\n`)
    },
    onTaskStart: (task) => {
      console.log(`📋 Starting: ${task.id} - ${task.title}`)
    },
    onTaskComplete: (task, result) => {
      console.log(`✅ Completed: ${task.id} in ${result.duration}s`)
    },
    onTaskFailed: (task, error) => {
      console.log(`❌ Failed: ${task.id} - ${error}`)
    },
    onLoopEnd: (stats) => {
      console.log(`\n📊 Loop finished: ${stats.completed} completed, ${stats.failed} failed\n`)
    },
  }),

  // Custom plugin: Slack webhook (example)
  // withPlugin({
  //   name: 'slack-notify',
  //   onTaskComplete: async (task) => {
  //     await fetch(process.env.SLACK_WEBHOOK_URL, {
  //       method: 'POST',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify({
  //         text: `✅ Task completed: ${task.id} - ${task.title}`,
  //       }),
  //     })
  //   },
  // }),
)(defineConfig({
  // AI CLI tool: 'opencode', 'claude', or 'gemini'
  cli: 'opencode',

  // Loop settings
  maxIterations: 50,
  timeout: 600,          // seconds per task
  namespace: 'default',  // for concurrent loops

  // Behavior
  autoConfirm: false,    // -y flag
  dryRun: false,
  debug: false,

  // Retry settings
  maxRetries: 3,
  circuitBreakerThreshold: 5,
  taskDelay: 2000,       // ms between tasks
  retryDelay: 3000,      // ms before retry
}))

// =============================================================================
// Alternative: Backend Plugins Pattern (recommended)
// =============================================================================

// export default compose(
//   withJSONBackend({ tasksFile: 'tasks.json' }),
//   withTelegram(),
//   withAsana(),
//   withEverhour(),
// )(defineConfig({ cli: 'opencode' }))

// =============================================================================
// Alternative: GitHub Backend Plugin
// =============================================================================

// export default compose(
//   withGitHubBackend({ repo: 'myorg/myrepo' }),
//   withTelegram(),
//   withDiscord({ webhookUrl: process.env.DISCORD_WEBHOOK_URL }),
// )(defineConfig({
//   cli: 'claude',
//   feature: 'auth',  // filter by feature label
// }))

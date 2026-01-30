/**
 * Development Configuration for Loopwork Monorepo
 *
 * This file uses production-style imports (matching what `init` generates)
 * The workspace resolver handles mapping 'loopwork' to the local package
 */
import {
  defineConfig,
  compose,
  withPlugin,
  withJSONBackend,
  withGitHubBackend,
  withCli,
  withModels,
  withRetry,
  ModelPresets,
  RetryPresets,
} from "loopwork";
import { withTelegram } from "@loopwork-ai/telegram";
import { withCostTracking } from "@loopwork-ai/cost-tracking";
import { withAsana } from "@loopwork-ai/asana";
import { withEverhour } from "@loopwork-ai/everhour";
import { withTodoist } from "@loopwork-ai/todoist";
import { withDiscord } from "@loopwork-ai/discord";

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
  // Backend plugin (choose one)
  withJSONBackend({ tasksFile: ".specs/tasks/tasks.json" }),
  // withGitHubBackend({ repo: 'owner/repo' }),

  // CLI configuration with custom model pools
  withCli({
    models: [
      ModelPresets.claudeSonnet({ timeout: 300 }), // Primary: balanced
      ModelPresets.claudeHaiku({ timeout: 120 }),  // Fast fallback
    ],
    fallbackModels: [
      ModelPresets.claudeOpus({ timeout: 900 }),   // Heavy tasks
    ],
    selectionStrategy: "round-robin",
    retry: {
      exponentialBackoff: true,
      baseDelayMs: 2000,
      maxDelayMs: 120000,
      retrySameModel: true,
      maxRetriesPerModel: 2,
    },
  }),

  // Telegram notifications on task events
  // withTelegram({
  //   botToken: process.env.TELEGRAM_BOT_TOKEN,
  //   chatId: process.env.TELEGRAM_CHAT_ID,
  //   silent: false,
  // }),

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
    defaultModel: "claude-4.5-sonnet",
  }),

  // Dashboard TUI: live progress display
  // Requires: bun add ink react @types/react
  // withPlugin(createDashboardPlugin({ totalTasks: 10 })),

  // Custom plugin: Log to console
  withPlugin({
    name: "console-logger",
    onLoopStart: (namespace) => {
      console.log(`\n🚀 Loop starting in namespace: ${namespace}\n`);
    },
    onTaskStart: (task) => {
      console.log(`📋 Starting: ${task.id} - ${task.title}`);
    },
    onTaskComplete: (task, result) => {
      console.log(`✅ Completed: ${task.id} in ${result.duration}s`);
    },
    onTaskFailed: (task, error) => {
      console.log(`❌ Failed: ${task.id} - ${error}`);
    },
    onLoopEnd: (stats) => {
      console.log(
        `\n📊 Loop finished: ${stats.completed} completed, ${stats.failed} failed\n`,
      );
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
)(
  defineConfig({
    // Loop settings
    maxIterations: 50,
    timeout: 600, // default timeout (can be overridden per-model via withCli)
    namespace: "default", // for concurrent loops

    // Behavior
    autoConfirm: false, // -y flag
    dryRun: false,
    debug: false,

    // Retry settings
    maxRetries: 3,
    circuitBreakerThreshold: 5,
    taskDelay: 2000, // ms between tasks
    retryDelay: 3000, // ms before retry
  }),
);

// =============================================================================
// Alternative: Simple CLI Config (backward compatible)
// =============================================================================

// export default compose(
//   withJSONBackend({ tasksFile: 'tasks.json' }),
//   withTelegram(),
// )(defineConfig({
//   cli: 'claude',        // Legacy: simple CLI selection
//   model: 'sonnet',      // Legacy: single model
//   timeout: 600,
// }))

// =============================================================================
// Alternative: Cost-Aware Model Selection
// =============================================================================

// export default compose(
//   withJSONBackend({ tasksFile: 'tasks.json' }),
//   withModels({
//     models: [
//       { name: 'haiku', cli: 'claude', model: 'haiku', costWeight: 1, timeout: 60 },
//       { name: 'sonnet', cli: 'claude', model: 'sonnet', costWeight: 5, timeout: 300 },
//     ],
//     fallbackModels: [
//       { name: 'opus', cli: 'claude', model: 'opus', costWeight: 15, timeout: 900 },
//     ],
//     strategy: 'cost-aware',  // Prefer cheaper models first
//   }),
//   withRetry(RetryPresets.aggressive()),
// )(defineConfig({ maxIterations: 100 }))

// =============================================================================
// Alternative: GitHub Backend with Gentle Retry
// =============================================================================

// export default compose(
//   withGitHubBackend({ repo: 'myorg/myrepo' }),
//   withCli({
//     models: [ModelPresets.claudeSonnet()],
//     retry: RetryPresets.gentle(),  // Longer waits, no same-model retry
//   }),
//   withDiscord({ webhookUrl: process.env.DISCORD_WEBHOOK_URL }),
// )(defineConfig({
//   feature: 'auth',  // filter by feature label
// }))

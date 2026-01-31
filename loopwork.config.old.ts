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
  // Backend plugins (choose one)
  withJSONBackend,
  withGitHubBackend,
  // CLI configuration plugins
  withCli,
  withModels,
  withRetry,
  withCliPaths,
  withSelectionStrategy,
  ModelPresets,
  RetryPresets,
  // Bundled plugins
  withGitAutoCommit,
  withClaudeCode,
  withIPC,
  withAIMonitor,
  withDynamicTasks,
  withRollback,
  withDocumentation,
  withChangelogOnly,
  withFullDocumentation,
  withSmartTasks,
  withSmartTasksConservative,
  withSmartTasksAggressive,
  withSmartTestTasks,
  withTaskRecovery,
  withAutoRecovery,
  withConservativeRecovery,
  withChaos,
  withSafety,
  withFeatureFlags,
  withAgents,
  withGovernance,
  withEmbeddings,
  withVectorStore,
  withEmbeddingAndVectorStore,
  createModel,
} from "@loopwork-ai/loopwork";
// External service integrations
import { withTelegram } from "@loopwork-ai/telegram";
import { withCostTracking } from "@loopwork-ai/cost-tracking";
import { withAsana } from "@loopwork-ai/asana";
import { withEverhour } from "@loopwork-ai/everhour";
import { withTodoist } from "@loopwork-ai/todoist";
import { withDiscord } from "@loopwork-ai/discord";
import { withNotionBackend } from "@loopwork-ai/notion";
import { withDashboard } from "@loopwork-ai/dashboard";

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
  withRetry(RetryPresets.aggressive()), // Exponential backoff with retries

  // CLI configuration with custom model pools
  withCli({
    models: [
      ModelPresets.claudeHaiku({ timeout: 300 }), // Fast fallback

      // Google Antigravity Models (via OpenCode)
      createModel({
        name: "antigravity-claude-sonnet-4-5",
        cli: "opencode",
        model: "google/antigravity-claude-sonnet-4-5",
        timeout: 300,
        costWeight: 30,
      }),
      // Google Gemini Models (via OpenCode)
      createModel({
        name: "antigravity-gemini-3-flash",
        cli: "opencode",
        model: "google/antigravity-gemini-3-flash",
        timeout: 300,
        costWeight: 15,
      }),
      createModel({
        name: "antigravity-gemini-3-pro-high",
        cli: "opencode",
        model: "google/antigravity-gemini-3-pro-high",
        timeout: 600,
        costWeight: 60,
      }),
      createModel({
        name: "antigravity-gemini-3-pro-low",
        cli: "opencode",
        model: "google/antigravity-gemini-3-pro-low",
        timeout: 600,
        costWeight: 50,
      }),

      ModelPresets.claudeSonnet({ timeout: 300 }), // Primary: balanced

      // ModelPresets.opencodeGeminiProHigh({ timeout: 300 }),  // Fast fallback
      // ModelPresets.geminiFlash({ timeout: 300 }), // Primary: balanced
      // ModelPresets.opencodeGeminiProLow({ timeout: 300 }),  // Fast fallback

      // Minimax Models (via OpenCode)
      // createModel({ name: "minimax-m2.1", cli: "opencode", model: "opencode/minimax-m2.1", timeout: 600, costWeight: 55 }),
      // createModel({ name: "minimax-m2.1-free", cli: "opencode", model: "opencode/minimax-m2.1-free", timeout: 600, costWeight: 5 }),
    ],
    fallbackModels: [
      // ModelPresets.claudeOpus({ timeout: 900 }),   // Heavy tasks
      ModelPresets.opencodeGeminiProHigh({ timeout: 900 }), // Fast fallback
      createModel({
        name: "antigravity-claude-opus-4-5-thinking",
        cli: "opencode",
        model: "google/antigravity-claude-opus-4-5-thinking",
        timeout: 900,
        costWeight: 80,
      }),

      // Additional fallback options:
      // createModel({ name: "opencode-claude-opus-4.5", cli: "opencode", model: "opencode/claude-opus-4-5", timeout: 900, costWeight: 100 }),
      // createModel({ name: "copilot-gpt-5.2-codex", cli: "opencode", model: "github-copilot/gpt-5.2-codex", timeout: 900, costWeight: 90 }),
      // createModel({ name: "kimi-k2-thinking", cli: "opencode", model: "opencode/kimi-k2-thinking", timeout: 900, costWeight: 80 }),
    ],
    selectionStrategy: "cost-aware", // Prefer cheaper models first
    orphanWatch: {
      enabled: true, // Enable automatic monitoring
      interval: 60000, // Check every 60 seconds
      maxAge: 1800000, // Kill orphans older than 30 minutes
      autoKill: true, // Automatically kill confirmed orphans
      patterns: [], // Additional process patterns to watch
    },
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

  // Git auto-commit: automatically commit after each task completion
  withGitAutoCommit({
    enabled: true,
    addAll: true, // Auto-stage all changes before commit
    coAuthor: "Loopwork AI <noreply@loopwork.ai>",
    skipIfNoChanges: true, // Skip if no changes detected
  }),

  // 1. Cost Tracking Plugin
  withCostTracking({
    enabled: true,
    defaultModel: "claude-4.5-sonnet",
    dailyBudget: 10.0,
    alertThreshold: 0.8,
    logFile: ".loopwork/costs.json",
  }),

  // 2. AI Monitor - Intelligent log watcher and auto-healer
  withAIMonitor({
    enabled: true,
    llmCooldown: 5 * 60 * 1000,
    llmMaxPerSession: 10,
    llmModel: "haiku",
    patternCheckDebounce: 100,
    cacheUnknownErrors: true,
    cacheTTL: 24 * 60 * 60 * 1000,
    circuitBreaker: {
      maxFailures: 3,
      cooldownPeriodMs: 60000,
      maxHalfOpenAttempts: 1,
    },
    taskRecovery: {
      enabled: true,
      maxLogLines: 50,
      minFailureCount: 1,
    },
  }),

  // 3. Dashboard Plugin - Interactive TUI
  withDashboard({
    enabled: true,
    refreshInterval: 1000,
    theme: "dark",
    layout: "compact",
  }),

  // 4. IPC Plugin - Inter-process communication
  // withIPC({
  //   enabled: true,
  //   socketPath: '/tmp/loopwork-ipc.sock',
  // })

  // -----------------------------------------------------------------------------
  // TASK MANAGEMENT & AUTOMATION PLUGINS
  // -----------------------------------------------------------------------------

  // 1. Dynamic Tasks Plugin - Auto-create tasks based on patterns
  withDynamicTasks({
    enabled: true,
    patterns: [
      { trigger: "TODO:", action: "create-task" },
      { trigger: "FIXME:", action: "create-task", priority: "high" },
    ],
  }),

  // 2. Smart Tasks Plugin - AI-powered task suggestions
  withSmartTasks({
    enabled: true,
    analysisDepth: "medium",
    autoCreate: false,
  }),
  // withSmartTasksConservative()  // Preset: conservative analysis
  // withSmartTasksAggressive()    // Preset: aggressive analysis
  withSmartTestTasks(), // Preset: test-focused

  // 3. Task Recovery Plugin - Auto-retry with AI analysis
  withAutoRecovery(), // Preset: automatic recovery

  // 4. Documentation Plugin - Auto-generate docs
  // withDocumentation({
  //   enabled: true,
  //   formats: ['markdown', 'html'],
  //   outputDir: 'docs',
  //   includeChangelog: true,
  //   includeApi: true,
  // })
  // withChangelogOnly()           // Preset: changelog only
  withFullDocumentation(), // Preset: full documentation

  // -----------------------------------------------------------------------------
  // GIT & VERSION CONTROL PLUGINS
  // -----------------------------------------------------------------------------

  // 1. Git Auto-Commit Plugin
  withGitAutoCommit({
    enabled: true,
    addAll: true,
    coAuthor: "Loopwork AI <noreply@loopwork.ai>",
    skipIfNoChanges: true,
    conventionalCommits: true,
    scope: "loopwork",
  }),

  // Custom plugin: Log to console
  withPlugin({
    name: "console-logger",
    onLoopStart: (namespace) => {
      console.log(`\n🚀 Loop starting in namespace: ${namespace}\n`);
    },
    onTaskStart: (context) => {
      console.log(`📋 Starting: ${context.task.id} - ${context.task.title}`);
    },
    onTaskComplete: (context, result) => {
      console.log(`✅ Completed: ${context.task.id} in ${result.duration}s`);
    },
    onTaskFailed: (context, error) => {
      console.log(`❌ Failed: ${context.task.id} - ${error}`);
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
    parallel: 2, // number of concurrent tasks
    // Loop settings
    maxIterations: 500,
    timeout: 600, // default timeout (can be overridden per-model via withCli)
    namespace: "default", // for concurrent loops

    // Behavior
    autoConfirm: true, // -y flag
    dryRun: false,
    debug: true,

    // Retry settings
    maxRetries: 5,
    circuitBreakerThreshold: 10,
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

// =============================================================================
// ALL AVAILABLE PLUGINS - COMPREHENSIVE REFERENCE
// =============================================================================

// -----------------------------------------------------------------------------
// BACKEND PLUGINS (Choose ONE - Required)
// -----------------------------------------------------------------------------

// 1. JSON Backend - Local file-based task management
// withJSONBackend({
//   tasksFile: '.specs/tasks/tasks.json',
//   tasksDir: '.specs/tasks',
// })

// 2. GitHub Backend - GitHub Issues integration
// withGitHubBackend({
//   repo: 'owner/repo',
//   token: process.env.GITHUB_TOKEN,
//   labels: ['loopwork'],
//   feature: 'auth',  // optional: filter by feature label
// })

// 3. Notion Backend - Notion database integration
// withNotionBackend({
//   auth: process.env.NOTION_TOKEN,
//   databaseId: process.env.NOTION_DATABASE_ID,
//   statusProperty: 'Status',
//   titleProperty: 'Name',
// })

// 4. Trello Backend - Trello board integration
// import { withTrelloBackend } from '@loopwork-ai/trello'
// withTrelloBackend({
//   apiKey: process.env.TRELLO_API_KEY,
//   token: process.env.TRELLO_TOKEN,
//   boardId: process.env.TRELLO_BOARD_ID,
//   lists: {
//     pending: 'To Do',
//     inProgress: 'Doing',
//     completed: 'Done',
//     failed: 'Failed',
//   },
// })

// -----------------------------------------------------------------------------
// CLI CONFIGURATION PLUGINS
// -----------------------------------------------------------------------------

// 1. Advanced CLI Configuration with Model Pools
// withCli({
//   models: [
//     ModelPresets.claudeHaiku({ timeout: 300 }),
//     ModelPresets.claudeSonnet({ timeout: 300 }),
//     ModelPresets.geminiFlash({ timeout: 300 }),
//     ModelPresets.opencodeGeminiProLow({ timeout: 300 }),
//   ],
//   fallbackModels: [
//     ModelPresets.claudeOpus({ timeout: 900 }),
//     ModelPresets.opencodeGeminiProHigh({ timeout: 900 }),
//   ],
//   selectionStrategy: 'round-robin', // or 'random', 'cost-aware', 'priority'
//   orphanWatch: {
//     enabled: true,
//     interval: 60000,
//     maxAge: 1800000,
//     autoKill: true,
//     patterns: [],
//   },
//   retry: RetryPresets.aggressive(),
// })

// 2. Custom Model Configuration
// withModels({
//   models: [
//     { name: 'haiku', cli: 'claude', model: 'haiku', costWeight: 1, timeout: 60 },
//     { name: 'sonnet', cli: 'claude', model: 'sonnet', costWeight: 5, timeout: 300 },
//   ],
//   fallbackModels: [
//     { name: 'opus', cli: 'claude', model: 'opus', costWeight: 15, timeout: 900 },
//   ],
//   strategy: 'cost-aware',
// })

// 3. Retry Configuration Presets
// withRetry(RetryPresets.gentle())      // Longer waits, no same-model retry
// withRetry(RetryPresets.aggressive())  // Exponential backoff with retries
// withRetry(RetryPresets.conservative()) // Conservative retry strategy

// 4. Custom CLI Paths
// withCliPaths({
//   claude: '/usr/local/bin/claude',
//   opencode: '/usr/local/bin/opencode',
// })

// 5. Model Selection Strategy
// withSelectionStrategy('round-robin')  // Default: rotate through models
// withSelectionStrategy('random')       // Random model selection
// withSelectionStrategy('cost-aware')   // Prefer cheaper models first
// withSelectionStrategy('priority')     // Use priority order

// -----------------------------------------------------------------------------
// NOTIFICATION & COMMUNICATION PLUGINS
// -----------------------------------------------------------------------------

// 1. Telegram Bot Notifications
// withTelegram({
//   botToken: process.env.TELEGRAM_BOT_TOKEN,
//   chatId: process.env.TELEGRAM_CHAT_ID,
//   silent: false,
//   notifyOnStart: true,
//   notifyOnComplete: true,
//   notifyOnFail: true,
//   dailyBriefing: {
//     enabled: true,
//     time: '09:00',
//     timezone: 'America/New_York',
//   },
// })

// 2. Discord Webhook Notifications
// withDiscord({
//   webhookUrl: process.env.DISCORD_WEBHOOK_URL,
//   username: 'Loopwork',
//   notifyOnComplete: true,
//   notifyOnFail: true,
//   mentionOnFail: '<@&123456>',  // mention role on failures
//   embedColor: 0x00ff00,
// })

// -----------------------------------------------------------------------------
// PROJECT MANAGEMENT INTEGRATIONS
// -----------------------------------------------------------------------------

// 1. Asana Integration
// withAsana({
//   projectId: process.env.ASANA_PROJECT_ID,
//   syncStatus: true,
//   syncComments: true,
//   createSubtasks: true,
// })

// 2. Todoist Integration
// withTodoist({
//   projectId: process.env.TODOIST_PROJECT_ID,
//   syncStatus: true,
//   addComments: true,
//   autoArchive: true,
// })

// 3. Everhour Time Tracking
// withEverhour({
//   autoStartTimer: true,
//   autoStopTimer: true,
//   roundToMinutes: 15,
// })

// -----------------------------------------------------------------------------
// MONITORING & OBSERVABILITY PLUGINS
// -----------------------------------------------------------------------------

// 1. Cost Tracking Plugin
// withCostTracking({
//   enabled: true,
//   defaultModel: 'claude-4.5-sonnet',
//   dailyBudget: 10.00,
//   alertThreshold: 0.8,
//   logFile: '.loopwork/costs.json',
// })

// 2. AI Monitor - Intelligent log watcher and auto-healer
// withAIMonitor({
//   enabled: true,
//   llmCooldown: 5 * 60 * 1000,
//   llmMaxPerSession: 10,
//   llmModel: 'haiku',
//   patternCheckDebounce: 100,
//   cacheUnknownErrors: true,
//   cacheTTL: 24 * 60 * 60 * 1000,
//   circuitBreaker: {
//     maxFailures: 3,
//     cooldownPeriodMs: 60000,
//     maxHalfOpenAttempts: 1,
//   },
//   taskRecovery: {
//     enabled: true,
//     maxLogLines: 50,
//     minFailureCount: 1,
//   },
// })

// 3. Dashboard Plugin - Interactive TUI
// withDashboard({
//   enabled: true,
//   refreshInterval: 1000,
//   theme: 'dark',
//   layout: 'compact',
// })

// 4. IPC Plugin - Inter-process communication
// withIPC({
//   enabled: true,
//   socketPath: '/tmp/loopwork-ipc.sock',
// })

// -----------------------------------------------------------------------------
// TASK MANAGEMENT & AUTOMATION PLUGINS
// -----------------------------------------------------------------------------

// 1. Dynamic Tasks Plugin - Auto-create tasks based on patterns
// withDynamicTasks({
//   enabled: true,
//   patterns: [
//     { trigger: 'TODO:', action: 'create-task' },
//     { trigger: 'FIXME:', action: 'create-task', priority: 'high' },
//   ],
// })

// 2. Smart Tasks Plugin - AI-powered task suggestions
// withSmartTasks({
//   enabled: true,
//   analysisDepth: 'medium',
//   autoCreate: false,
// })
// withSmartTasksConservative()  // Preset: conservative analysis
// withSmartTasksAggressive()    // Preset: aggressive analysis
// withSmartTestTasks()          // Preset: test-focused

// 3. Task Recovery Plugin - Auto-retry with AI analysis
// withTaskRecovery({
//   enabled: true,
//   maxRetries: 3,
//   analysisModel: 'haiku',
//   retryDelay: 60000,
// })
// withAutoRecovery()            // Preset: automatic recovery
// withConservativeRecovery()    // Preset: conservative recovery

// 4. Documentation Plugin - Auto-generate docs
// withDocumentation({
//   enabled: true,
//   formats: ['markdown', 'html'],
//   outputDir: 'docs',
//   includeChangelog: true,
//   includeApi: true,
// })
// withChangelogOnly()           // Preset: changelog only
// withFullDocumentation()       // Preset: full documentation

// -----------------------------------------------------------------------------
// GIT & VERSION CONTROL PLUGINS
// -----------------------------------------------------------------------------

// 1. Git Auto-Commit Plugin
// withGitAutoCommit({
//   enabled: true,
//   addAll: true,
//   coAuthor: 'Loopwork AI <noreply@loopwork.ai>',
//   skipIfNoChanges: true,
//   conventionalCommits: true,
//   scope: 'loopwork',
// })

// 2. Rollback Plugin - Automatic rollback on failure
// withRollback({
//   enabled: true,
//   strategy: 'git',
//   createBackup: true,
//   maxRollbacks: 3,
// })

// -----------------------------------------------------------------------------
// DEVELOPMENT & TESTING PLUGINS
// -----------------------------------------------------------------------------

// 1. Claude Code Integration Plugin
// withClaudeCode({
//   enabled: true,
//   skillsDir: '.claude/skills',
//   autoSetup: true,
// })

// 2. Chaos Engineering Plugin - Inject failures for testing
// withChaos({
//   enabled: false,  // Only enable in test environments!
//   failureRate: 0.1,
//   patterns: ['timeout', 'network-error', 'rate-limit'],
// })

// 3. Safety Plugin - Runtime safety checks
// withSafety({
//   enabled: true,
//   maxMemoryMB: 1024,
//   maxCpuPercent: 80,
//   timeoutMs: 600000,
// })

// 4. Feature Flags Plugin
// withFeatureFlags({
//   flags: {
//     experimentalFeatures: false,
//     betaFeatures: true,
//   },
// })

// -----------------------------------------------------------------------------
// ADVANCED FEATURES
// -----------------------------------------------------------------------------

// 1. Agents Plugin - Multi-agent coordination
// withAgents({
//   enabled: true,
//   maxConcurrent: 3,
//   coordinationStrategy: 'round-robin',
// })

// 2. Governance Plugin - Policy enforcement
// withGovernance({
//   enabled: true,
//   policies: [
//     { name: 'no-main-branch-commits', enforce: true },
//     { name: 'require-tests', enforce: false },
//   ],
// })

// 3. Embeddings & Vector Store Plugins
// withEmbeddings({
//   provider: 'openai',
//   model: 'text-embedding-ada-002',
//   apiKey: process.env.OPENAI_API_KEY,
// })
// withVectorStore({
//   type: 'chroma',
//   url: 'http://localhost:8000',
// })
// withEmbeddingAndVectorStore({
//   embedding: {
//     provider: 'openai',
//     apiKey: process.env.OPENAI_API_KEY,
//   },
//   vectorStore: {
//     type: 'chroma',
//     url: 'http://localhost:8000',
//   },
// })

// -----------------------------------------------------------------------------
// CUSTOM PLUGINS
// -----------------------------------------------------------------------------

// You can create custom plugins using withPlugin():
// withPlugin({
//   name: 'my-custom-plugin',
//   onConfigLoad: (config) => {
//     console.log('Config loaded');
//     return config;
//   },
//   onBackendReady: (backend) => {
//     console.log('Backend ready');
//   },
//   onLoopStart: (namespace) => {
//     console.log('Loop starting:', namespace);
//   },
//   onTaskStart: (context) => {
//     console.log('Task starting:', context.task.id);
//   },
//   onTaskComplete: (context, result) => {
//     console.log('Task completed:', context.task.id);
//   },
//   onTaskFailed: (context, error) => {
//     console.log('Task failed:', context.task.id, error);
//   },
//   onLoopEnd: (stats) => {
//     console.log('Loop ended:', stats);
//   },
// })

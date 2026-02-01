# Loopwork

An extensible task automation framework that runs AI CLI tools against task backlogs. Features a plugin architecture for integrations with time tracking, notifications, and project management tools.

## Features

- **Multiple Backends** - GitHub Issues, JSON files, with plugin support for custom backends
- **Plugin Architecture** - Next.js-style config with composable plugins
- **Time Tracking** - Everhour integration with daily limits
- **Project Management** - Asana, Todoist sync
- **Notifications** - Telegram, Discord webhooks
- **Cost Tracking** - Token usage and cost monitoring
- **Sub-tasks & Dependencies** - Hierarchical task structures
- **MCP Server** - Model Context Protocol for AI tool integration

## Quick Start

### Try the Example

```bash
# Install dependencies
bun install

# Run the basic example
cd examples/basic-json-backend
./quick-start.sh  # Interactive menu
# OR
bun run start --dry-run  # Preview tasks
```

See [examples/](./examples/) for more.

## Docker Compose-Style Commands

Loopwork provides Docker Compose-style commands for familiar process management:

### Start Services

```bash
# Start in foreground (attached)
loopwork up

# Start in background (detached)
loopwork up -d

# Start with specific namespace
loopwork up -d --namespace prod

# Start and tail logs
loopwork up -d --tail
```

### Stop Services

```bash
# Stop default namespace
loopwork down

# Stop specific namespace
loopwork down prod

# Stop all running processes
loopwork down --all
```

### List Processes

```bash
# List all running processes
loopwork ps

# Output as JSON
loopwork ps --json
```

### Backward Compatibility

The traditional commands still work:
- `loopwork start` → `loopwork up`
- `loopwork start -d` → `loopwork up -d`
- `loopwork stop` → `loopwork down`
- `loopwork status` → `loopwork ps`

## OpenCode Model Configuration

Configure which OpenCode models to use from your authenticated providers:

```bash
# Interactive configuration (shows all authenticated providers)
loopwork models:configure

# Auto-enable all models
loopwork models:configure --all

# Configure specific provider only
loopwork models:configure --provider google

# Output available models as JSON
loopwork models:configure --json
```

This command:
1. Reads `~/.local/share/opencode/auth.json` to detect authenticated providers
2. Fetches available models for each provider
3. Generates `.loopwork/models.json` with model configurations
4. Provides import instructions for your `loopwork.config.ts`

Example usage in config:
```typescript
import models from './.loopwork/models.json'
import { compose, defineConfig, withModels } from 'loopwork'

export default compose(
  withModels(models.models),
  // ... other plugins
)(defineConfig({ cli: 'opencode' }))
```

### Capability-Based Configuration

Instead of specifying models directly, you can use capability levels or roles:

```typescript
import { compose, defineConfig, withModels } from 'loopwork'
import { ModelPresets } from 'loopwork/plugins'

export default compose(
  withModels({
    models: [
      // Use capability levels
      ModelPresets.capabilityHigh(),   // Maps to best model (Opus)
      ModelPresets.capabilityMedium(), // Maps to balanced model (Sonnet)
      ModelPresets.capabilityLow(),    // Maps to fast model (Haiku)
    ],
    // Or use roles
    fallbackModels: [
      ModelPresets.roleArchitect(),    // High capability
    ]
  })
)(defineConfig({ cli: 'claude' }))
```

### From Scratch

Use the interactive init command to set up a new project:

```bash
# Install loopwork
bun install loopwork

# Initialize your project (interactive)
loopwork init
```

The init command will guide you through:
- **Backend selection** - Choose between GitHub Issues or JSON files
- **AI CLI tool** - Select claude, opencode, or gemini
- **Plugin configuration** - Optionally enable Telegram, Discord, cost tracking
- **Project setup** - Creates .gitignore, README.md, templates, and state directory

After initialization, you'll have:
- ✅ `loopwork.config.ts` - Main configuration file
- ✅ `.specs/tasks/` - Task directory with sample task and PRD templates
- ✅ `.loopwork-state/` - State directory for resume capability
- ✅ `.gitignore` - Updated with loopwork patterns
- ✅ `README.md` - Project documentation

Or manually create your config:

```bash
# Install
bun install

# Create config file
cat > loopwork.config.ts << 'EOF'
import { defineConfig, compose, withTelegram, withCostTracking } from './src/loopwork-config-types'
import { withJSONBackend } from './src/backend-plugin'

export default compose(
  withJSONBackend({ tasksFile: '.specs/tasks/tasks.json' }),
  withCostTracking({ dailyBudget: 10.00 }),
)(defineConfig({
  cli: 'claude',
  maxIterations: 50,
}))
EOF

# Run
bun run src/index.ts
```

## Configuration

### Config File (`loopwork.config.ts`)

```typescript
import {
  defineConfig,
  compose,
  withTelegram,
  withDiscord,
  withAsana,
  withEverhour,
  withTodoist,
  withCostTracking,
  withGitAutoCommit,
} from './src/loopwork-config-types'
import { withJSONBackend, withGitHubBackend } from './src/backend-plugin'

export default compose(
  // Backend (pick one)
  withJSONBackend({ tasksFile: '.specs/tasks/tasks.json' }),
  // withGitHubBackend({ repo: 'owner/repo' }),

  // Notifications
  withTelegram({
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
    notifyOnStart: true,
    notifyOnComplete: true,
    notifyOnFail: true,
  }),

  withDiscord({
    webhookUrl: process.env.DISCORD_WEBHOOK_URL,
    mentionOnFail: '<@123456789>',  // User/role to ping on failures
  }),

  // Project Management
  withAsana({
    accessToken: process.env.ASANA_ACCESS_TOKEN,
    workspaceId: process.env.ASANA_WORKSPACE_ID,
    projectId: process.env.ASANA_PROJECT_ID,
    syncComments: true,
  }),

  withTodoist({
    apiToken: process.env.TODOIST_API_TOKEN,
    projectId: process.env.TODOIST_PROJECT_ID,
  }),

  // Time Tracking
  withEverhour({
    apiKey: process.env.EVERHOUR_API_KEY,
    dailyLimit: 8,  // Max hours per day
  }),

  // Cost Tracking
  withCostTracking({
    dailyBudget: 10.00,
    alertThreshold: 0.8,
  }),

  // Git Auto-Commit (optional)
  withGitAutoCommit({
    enabled: true,
    addAll: true,
    coAuthor: 'Loopwork AI <noreply@loopwork.ai>',
    scope: 'all', // 'all' | 'task-only' | 'staged-only'
  }),
)(defineConfig({
  cli: 'claude',              // AI CLI: claude, opencode, gemini
  model: 'claude-sonnet-4-20250514',
  maxIterations: 50,
  taskTimeout: 600,           // seconds
  nonInteractive: true,
  // specialized agents
  agents: [
    {
      role: 'qa',
      description: 'Quality Assurance Specialist',
      systemPrompt: 'You are an expert QA engineer. Focus on edge cases and security.',
      tools: ['run-tests', 'report-bug'],
      model: {
        model: 'claude-opus-3-5' // Use smarter model for QA
      }
    }
  ]
}))
```

### Environment Variables

```bash
# Core
LOOPWORK_DEBUG=true
LOOPWORK_NAMESPACE=default
LOOPWORK_NON_INTERACTIVE=true

# Backends
LOOPWORK_BACKEND=json|github
LOOPWORK_TASKS_FILE=.specs/tasks/tasks.json
LOOPWORK_REPO=owner/repo

# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_CHAT_ID=123456789

# Discord
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...

# Asana
ASANA_ACCESS_TOKEN=...
ASANA_WORKSPACE_ID=...
ASANA_PROJECT_ID=...

# Everhour
EVERHOUR_API_KEY=...

# Todoist
TODOIST_API_TOKEN=...
TODOIST_PROJECT_ID=...
```

### Config Hot Reload

Loopwork supports hot reload of your configuration file, allowing you to change settings without restarting the process.

#### How It Works

When hot reload is enabled, Loopwork watches your `loopwork.config.ts` or `loopwork.config.js` file for changes. When you save changes to the config file:

1. The file watcher detects the change
2. Config is reloaded from the file (module cache is cleared)
3. New config is validated against the config schema
4. If valid, the new config is applied and a `config-reloaded` event is emitted
5. If invalid, the old config is kept and an error is logged

#### Enabling Hot Reload

You can enable hot reload in two ways:

**Option 1: CLI Flag**
```bash
loopwork start --hot-reload
```

**Option 2: Environment Variable**
```bash
export LOOPWORK_HOT_RELOAD=true
loopwork start
```

#### Usage Examples

**Development Workflow**
```bash
# Start loopwork with hot reload enabled
loopwork start --hot-reload

# In another terminal, edit your config
nano loopwork.config.ts

# Save the file - Loopwork will automatically reload the new config
```

**Daemon Mode with Hot Reload**
```bash
# Start daemon with hot reload
loopwork start -d --hot-reload --namespace prod

# Edit config file
nano loopwork.config.ts

# Changes are applied automatically without restarting the daemon
```

**Environment Variable for Always-On**
```bash
# Add to your shell profile (.bashrc, .zshrc, etc.)
export LOOPWORK_HOT_RELOAD=true

# Now every loopwork start will have hot reload enabled
loopwork start
```

#### What Changes Are Hot-Reloaded?

When you edit your config file, these changes are picked up:

- ✅ `cli` - Switch AI tools (claude, opencode, gemini)
- ✅ `maxIterations` - Adjust iteration limit
- ✅ `timeout` - Change task timeout
- ✅ `namespace` - Update namespace
- ✅ Plugin configurations - Update plugin settings

**Changes that require restart:**
- ❌ Adding new plugins (won't be registered)
- ❌ Changing backend type (won't reconnect)
- ❌ CLI arguments passed at start time

#### Event-Based Monitoring

Plugins and custom code can listen to config reload events:

```typescript
import { getConfigHotReloadManager } from 'loopwork'

// Get the hot reload manager
const manager = getConfigHotReloadManager()

// Register a listener
manager.onReload((event) => {
  console.log('Config reloaded!', {
    timestamp: event.timestamp,
    configPath: event.configPath,
    newConfig: event.config
  })
})

// Later, remove the listener
manager.offReload(callback)
```

**Event Type:**
```typescript
interface ConfigReloadEvent {
  timestamp: Date      // When the config was reloaded
  configPath: string   // Path to the config file
  config: Config       // The new configuration object
}
```

#### Manual Config Reload

You can programmatically trigger a config reload using the `reloadConfig` function. This is useful for:

- CLI commands that need to apply new config immediately
- Integration with external config management systems
- Testing purposes

```typescript
import { reloadConfig } from 'loopwork'

// After making changes to loopwork.config.ts
const newConfig = await reloadConfig()
if (newConfig) {
  console.log('Config reloaded successfully')
  console.log('New maxIterations:', newConfig.maxIterations)
} else {
  console.log('Config reload failed or hot reload is not active')
}
```

**Returns:** The reloaded configuration, or `null` if:
- Hot reload is not active (call `getConfig({ hotReload: true })` first)
- No config is currently loaded
- Config reload failed due to errors

**Example with Error Handling:**
```typescript
import { reloadConfig, getConfigHotReloadManager } from 'loopwork'

// Start with hot reload enabled
await getConfig({ hotReload: true })

// Later, trigger a manual reload
const newConfig = await reloadConfig()
if (!newConfig) {
  console.warn('Config reload failed')
  // Check logs for details
} else {
  console.log('Config applied:', newConfig)
}
```

#### Error Handling

Hot reload includes built-in error handling:

- **Invalid config syntax** - Old config is kept, error is logged
- **Invalid config values** - Validation fails, old config is preserved
- **File not found** - Hot reload doesn't start, warning is logged
- **Watcher errors** - Logged but don't crash the process

**Example of graceful degradation:**
```bash
# Start with valid config
loopwork start --hot-reload

# Config has maxIterations: 50

# Edit file to have invalid value (negative number)
echo "maxIterations: -5" >> loopwork.config.ts

# Hot reload detects error, logs it, keeps old config
# Your loopwork process continues with maxIterations: 50
```

#### Best Practices

1. **Test config changes** - Validate your config before applying to production
2. **Monitor logs** - Watch for hot reload success/failure messages
3. **Use in development** - Great for iterative config tuning
4. **Be cautious in production** - Consider restart for major config changes
5. **Know the limits** - Some changes (new plugins, backend type) require restart

#### Troubleshooting

**Hot reload not starting**
```bash
# Check if config file exists
ls loopwork.config.ts

# Check if hot reload flag is set
loopwork start --hot-reload --debug
# Look for: "Config hot reload enabled: /path/to/config"
```

**Changes not applying**
```bash
# Check file watcher is running
loopwork logs --follow | grep "Config file changed"

# Validate new config syntax
bun -c loopwork.config.ts

# Check for validation errors
loopwork logs | grep -i "reload"
```

**Watcher errors**
```bash
# Check file permissions
ls -la loopwork.config.ts

# Ensure file is readable and writable
chmod 644 loopwork.config.ts

# If on Windows, check file is not locked by another process
```

## Plugin Development Guide

Loopwork's plugin system enables extensibility through a composable architecture inspired by Next.js. Create custom plugins to integrate with external systems, add notifications, track metrics, or implement custom logic at key lifecycle points.

### Plugin System Overview

The plugin system is built on:
- **Lifecycle hooks** - React to events at key points (task start, task complete, loop end, etc.)
- **Config composition** - Combine multiple plugins with `compose()` and config wrappers
- **Async-first design** - All hooks are async-safe for I/O operations
- **Error tolerance** - Plugin failures don't crash the main loop

### LoopworkPlugin Interface

Every plugin implements the `LoopworkPlugin` interface:

```typescript
interface LoopworkPlugin {
  /** Unique plugin name */
  name: string

  /** Called when config is loaded - modify or inspect config */
  onConfigLoad?: (config: LoopworkConfig) => LoopworkConfig | Promise<LoopworkConfig>

  /** Called when backend is initialized */
  onBackendReady?: (backend: TaskBackend) => void | Promise<void>

  /** Called when loop starts */
  onLoopStart?: (namespace: string) => void | Promise<void>

  /** Called when loop ends */
  onLoopEnd?: (stats: LoopStats) => void | Promise<void>

  /** Called before task execution */
  onTaskStart?: (context: TaskContext) => void | Promise<void>

  /** Called after task completes successfully */
  onTaskComplete?: (context: TaskContext, result: PluginTaskResult) => void | Promise<void>

  /** Called when task fails */
  onTaskFailed?: (context: TaskContext, error: string) => void | Promise<void>
}
```

### Hook Reference

#### onConfigLoad(config)
Called when configuration is loaded. Plugins can read or modify the config.

```typescript
async onConfigLoad(config: LoopworkConfig) {
  // Read config values
  console.log('Max iterations:', config.maxIterations)

  // Modify config for downstream plugins
  return {
    ...config,
    customField: 'value'
  }
}
```

#### onBackendReady(backend)
Called after the task backend is initialized. Use to validate backend connection or log availability.

```typescript
async onBackendReady(backend: TaskBackend) {
  console.log('Backend is ready:', backend.backendType)
  // Test backend connectivity
  const pending = await backend.listPendingTasks()
  console.log(`Found ${pending.length} pending tasks`)
}
```

#### onLoopStart(namespace)
Called when the automation loop starts. Use for initialization, logging, or notifications.

```typescript
async onLoopStart(namespace: string) {
  console.log(`Starting loop: ${namespace}`)
  // Send notification, reset metrics, etc.
}
```

#### onTaskStart(context)
Called before a task is executed. Use to log, track time, or prepare external systems.

```typescript
async onTaskStart(context: TaskContext) {
  const { task, iteration, namespace } = context
  console.log(`[${namespace}] Iteration ${iteration}: Starting task ${task.id}`)

  // Track start time, update external systems, etc.
}
```

**Context object:**
```typescript
interface TaskContext {
  task: Task
  iteration: number
  startTime: Date
  namespace: string
}
```

#### onTaskComplete(context, result)
Called after a task completes successfully. Use to log completion, update external systems, or collect metrics.

```typescript
async onTaskComplete(context: TaskContext, result: PluginTaskResult) {
  const { task } = context
  const { duration, success, output } = result

  console.log(`Task ${task.id} completed in ${duration}ms`)

  // Log to external system, update metadata, etc.
}
```

**Result object:**
```typescript
interface PluginTaskResult {
  duration: number        // Execution time in milliseconds
  success: boolean        // Whether task succeeded
  output?: string         // Task output (if captured)
}
```

#### onTaskFailed(context, error)
Called when a task fails. Use to log errors, send alerts, or implement recovery logic.

```typescript
async onTaskFailed(context: TaskContext, error: string) {
  const { task, iteration } = context

  console.error(`Task ${task.id} failed on iteration ${iteration}:`)
  console.error(error)

  // Send alert, increment failure counter, update external system, etc.
}
```

#### onLoopEnd(stats)
Called when the automation loop ends. Use to log summary, send final notifications, or cleanup.

```typescript
async onLoopEnd(stats: LoopStats) {
  console.log('Loop complete!')
  console.log(`  Completed: ${stats.completed}`)
  console.log(`  Failed: ${stats.failed}`)
  console.log(`  Duration: ${stats.duration}ms`)
}
```

**Stats object:**
```typescript
interface LoopStats {
  completed: number       // Number of successfully completed tasks
  failed: number          // Number of failed tasks
  duration: number        // Total loop duration in milliseconds
}
```

### Creating a Plugin

Simple plugin template:

```typescript
import type { LoopworkPlugin, TaskContext, LoopStats } from 'loopwork'

export function createMyPlugin(): LoopworkPlugin {
  return {
    name: 'my-plugin',

    async onConfigLoad(config) {
      console.log('Plugin loaded')
      return config
    },

    async onLoopStart(namespace) {
      console.log(`Starting loop: ${namespace}`)
    },

    async onTaskStart(context) {
      console.log(`Task ${context.task.id} starting`)
    },

    async onTaskComplete(context, result) {
      console.log(`Task ${context.task.id} completed in ${result.duration}ms`)
    },

    async onTaskFailed(context, error) {
      console.error(`Task ${context.task.id} failed: ${error}`)
    },

    async onLoopEnd(stats) {
      console.log(`Loop complete: ${stats.completed} completed, ${stats.failed} failed`)
    }
  }
}
```

### Plugin Composition

Plugins are registered using the `compose()` and `withPlugin()` helpers:

```typescript
import { compose, defineConfig, withPlugin } from 'loopwork'
import { withJSONBackend } from 'loopwork/backends'

const myPlugin = createMyPlugin()
const anotherPlugin = createAnotherPlugin()

export default compose(
  withPlugin(myPlugin),
  withPlugin(anotherPlugin),
  withJSONBackend({ tasksFile: '.specs/tasks/tasks.json' })
)(defineConfig({
  cli: 'claude',
  maxIterations: 50
}))
```

The `compose()` function chains config wrappers left-to-right, with each wrapper receiving the config from the previous one.

### Plugin Best Practices

#### 1. Handle Missing Credentials Gracefully

If your plugin requires external APIs or credentials, detect if they're missing and skip initialization:

```typescript
export function createTelegramPlugin(options: TelegramOptions): LoopworkPlugin {
  const { botToken, chatId } = options

  return {
    name: 'telegram',

    onConfigLoad(config) {
      // Gracefully skip if credentials missing
      if (!botToken || !chatId) {
        console.warn('Telegram credentials not found, plugin disabled')
        return config
      }
      return config
    },

    async onLoopEnd(stats) {
      // Only runs if credentials were present
      await sendTelegramMessage(`Loop complete: ${stats.completed} tasks done`)
    }
  }
}
```

#### 2. Validate Task Metadata Before Use

Plugins reading task metadata should check for required fields:

```typescript
async onTaskComplete(context, result) {
  const { asanaGid } = context.task.metadata || {}

  if (!asanaGid) {
    // Task doesn't have Asana metadata, skip
    return
  }

  // Safe to use asanaGid
  await updateAsanaTask(asanaGid, { completed: true })
}
```

#### 3. Never Throw Errors in Hooks

The plugin registry catches errors, but it's better to handle them gracefully:

```typescript
async onTaskComplete(context, result) {
  try {
    await externalApiCall()
  } catch (error) {
    // Log but don't throw - plugins must be fault-tolerant
    console.error(`Plugin error: ${error}`)
  }
}
```

#### 4. Use Informative Plugin Names

Choose names that clearly indicate the plugin's purpose:

```typescript
// Good
name: 'telegram-notifications'
name: 'metrics-collector'
name: 'asana-sync'

// Avoid
name: 'plugin1'
name: 'my-thing'
```

#### 5. Document Configuration Options

Create a TypeScript interface for your plugin options:

```typescript
export interface MyPluginOptions {
  /** Enable/disable plugin */
  enabled?: boolean

  /** API endpoint */
  apiUrl: string

  /** API token for authentication */
  apiToken: string

  /** Batch size for requests */
  batchSize?: number
}

export function createMyPlugin(options: MyPluginOptions): LoopworkPlugin {
  // ... implementation
}
```

### Task Metadata

Plugins can read task metadata to access external system IDs:

```typescript
interface TaskMetadata {
  asanaGid?: string      // Asana task ID
  everhourId?: string    // Everhour task ID
  todoistId?: string     // Todoist task ID
  [key: string]: unknown // Custom fields
}
```

Define metadata in the JSON backend tasks file:

```json
{
  "tasks": [{
    "id": "TASK-001",
    "title": "Implement feature",
    "metadata": {
      "asanaGid": "1234567890",
      "todoistId": "9876543210",
      "customField": "customValue"
    }
  }]
}
```

Access in plugins:

```typescript
async onTaskStart(context) {
  const { asanaGid, todoistId } = context.task.metadata || {}

  if (asanaGid) {
    // Update Asana task
    await updateAsanaTask(asanaGid, { inProgress: true })
  }

  if (todoistId) {
    // Update Todoist task
    await updateTodoistTask(todoistId, { status: 'in_progress' })
  }
}
```

### Troubleshooting

#### Plugin Hook Not Running

**Problem**: A plugin hook isn't being called

**Check**:
1. Verify plugin is registered in config:
   ```typescript
   export default compose(
     withPlugin(myPlugin),  // Must be present
     withJSONBackend()
   )(defineConfig({ ... }))
   ```

2. Verify hook method exists and is async or returns a value:
   ```typescript
   // Good
   async onTaskStart(context) { ... }
   onTaskStart(context) { ... }

   // Won't work
   onTaskStart = (context) => { ... }  // Arrow function doesn't work
   ```

3. Check plugin name is unique - duplicate names cause replacement:
   ```typescript
   // The second plugin replaces the first
   withPlugin({ name: 'logger', ... })
   withPlugin({ name: 'logger', ... })  // Overwrites previous
   ```

#### Plugin Errors Silently Failing

**Problem**: Plugin throws an error but loop continues

**Expected behavior**: The plugin registry catches errors and logs them. This is intentional - plugins shouldn't crash the main loop.

**Fix**: Add error handling in your hooks:
```typescript
async onTaskComplete(context, result) {
  try {
    await externalApiCall()
  } catch (error) {
    console.error(`Plugin ${this.name} error: ${error}`)
    // Don't throw - handle gracefully
  }
}
```

#### Plugins Executing in Wrong Order

**Problem**: Plugins execute in unexpected order

**Note**: Plugins execute in the order they're composed:
```typescript
compose(
  withPlugin(pluginA),  // Runs first
  withPlugin(pluginB),  // Runs second
  withPlugin(pluginC)   // Runs third
)
```

If plugin ordering matters, adjust the composition order.

#### Accessing Config in Hooks

**Problem**: Can't access specific config values in hooks

**Solution**: Plugins have limited context. Store config values in the plugin instance:

```typescript
export function createMyPlugin(options: MyOptions): LoopworkPlugin {
  let config: LoopworkConfig

  return {
    name: 'my-plugin',

    async onConfigLoad(cfg) {
      config = cfg  // Store for later use
      return cfg
    },

    async onLoopEnd(stats) {
      // Access stored config
      console.log('Max iterations was:', config.maxIterations)
    }
  }
}
```

### Built-in Plugins

| Plugin | Purpose | Config Wrapper |
|--------|---------|----------------|
| Claude Code | Claude Code integration (skills & CLAUDE.md) | `withClaudeCode()` |
| Telegram | Notifications & bot commands | `withTelegram()` |
| Discord | Webhook notifications | `withDiscord()` |
| Asana | Task sync & comments | `withAsana()` |
| Everhour | Time tracking | `withEverhour()` |
| Todoist | Task sync | `withTodoist()` |
| Cost Tracking | Token/cost monitoring | `withCostTracking()` |
| Git Auto-Commit | Auto-commit after each task completion | `withGitAutoCommit()` |

### Examples

See `examples/plugins/` for complete working examples of custom plugins:
- Simple notification plugin
- Custom logging plugin
- Metrics collection plugin

## Backend Plugins

Backends are also plugins, providing both task operations and lifecycle hooks:

```typescript
import { withJSONBackend, withGitHubBackend } from './src/backend-plugin'

// JSON Backend
withJSONBackend({
  tasksFile: '.specs/tasks/tasks.json',
  prdDirectory: '.specs/tasks',
})

// GitHub Backend
withGitHubBackend({
  repo: 'owner/repo',
  labels: {
    task: 'loopwork-task',
    pending: 'loopwork:pending',
  },
})
```

### Backend Interface

```typescript
interface BackendPlugin extends LoopworkPlugin {
  readonly backendType: 'json' | 'github' | string

  findNextTask(options?: FindTaskOptions): Promise<Task | null>
  getTask(taskId: string): Promise<Task | null>
  listPendingTasks(options?: FindTaskOptions): Promise<Task[]>

  markInProgress(taskId: string): Promise<UpdateResult>
  markCompleted(taskId: string, comment?: string): Promise<UpdateResult>
  markFailed(taskId: string, error: string): Promise<UpdateResult>
  resetToPending(taskId: string): Promise<UpdateResult>

  getSubTasks(taskId: string): Promise<Task[]>
  getDependencies(taskId: string): Promise<Task[]>
  areDependenciesMet(taskId: string): Promise<boolean>
}
```

## Task Formats

### JSON Backend

```json
// .specs/tasks/tasks.json
{
  "tasks": [
    {
      "id": "TASK-001",
      "status": "pending",
      "priority": "high",
      "feature": "auth",
      "metadata": { "asanaGid": "123" }
    },
    {
      "id": "TASK-002",
      "status": "pending",
      "priority": "medium",
      "parentId": "TASK-001",
      "dependsOn": ["TASK-001"]
    }
  ]
}
```

PRD files in `.specs/tasks/TASK-001.md`:

```markdown
# TASK-001: Implement login

## Goal
Add user authentication

## Requirements
- Login form with validation
- JWT token handling
```

### GitHub Issues

Create issues with labels:
- `loopwork-task` - Identifies managed tasks
- `loopwork:pending` - Pending status
- `priority:high` - Priority level

Add to issue body for relationships:
```markdown
Parent: #123
Depends on: #100, #101

## Description
Task description here
```

## CLI Usage

Loopwork provides a comprehensive CLI for task automation and daemon management.

### Command Reference

| Command | Description |
|---------|-------------|
| `loopwork init` | Initialize a new project with interactive setup |
| `loopwork run` | Execute the main task automation loop |
| `loopwork start` | Start loopwork (foreground or daemon mode) |
| `loopwork logs` | View logs for a namespace |
| `loopwork kill` | Stop a running daemon process |
| `loopwork restart` | Restart a daemon with saved arguments |
| `loopwork status` | Check running processes and namespaces |
| `loopwork dashboard` | Launch interactive TUI dashboard |
| `loopwork reschedule` | Reschedule completed tasks to pending |
| `loopwork task-new` | Create a new task in the backlog |

### Task Management

Loopwork provides commands to manage your task backlog directly from the CLI.

#### Rescheduling Tasks

If you need to re-run completed tasks (e.g., after updating requirements or fixing bugs), use the `reschedule` command:

```bash
# Reschedule a specific task
loopwork reschedule TASK-001

# Reschedule all completed tasks
loopwork reschedule --all

# Reschedule all tasks for a specific feature
loopwork reschedule --feature auth

# Schedule for a specific time (ISO 8601)
loopwork reschedule TASK-001 --for 2025-02-01T12:00:00Z
```

#### Creating Tasks

```bash
# Create a new task
loopwork task-new --title "Fix login bug" --priority high --feature auth
```

### Initialize a Project

```bash
# Interactive setup wizard
loopwork init

# Creates:
# - loopwork.config.ts (configuration)
# - .specs/tasks/ (task directory)
# - .specs/tasks/templates/ (PRD templates)
# - .loopwork-state/ (state directory)
# - .gitignore (with loopwork patterns)
# - README.md (project documentation)

# Non-interactive mode (uses defaults)
LOOPWORK_NON_INTERACTIVE=true loopwork init
```

The init command is **idempotent** - safe to run multiple times. It will:
- Prompt before overwriting existing files
- Only add missing patterns to .gitignore
- Skip existing directories

### Running Loopwork

#### Foreground Mode (Default)

```bash
# Basic run
loopwork start

# Or use the run command directly
loopwork run

# With options
loopwork start --feature auth --max-iterations 10

# Resume from saved state
loopwork start --resume

# Dry run (preview without executing)
loopwork start --dry-run
```

#### Daemon Mode (Background)

```bash
# Start as daemon
loopwork start -d

# With custom namespace
loopwork start -d --namespace prod

# With all options
loopwork start -d --namespace prod --feature auth --resume

# Start and immediately tail logs
loopwork start -d --tail
```

### Common Workflows

#### Quick Start → Monitor

```bash
# 1. Start daemon
loopwork start -d --namespace prod

# 2. View logs
loopwork logs prod

# 3. Tail logs in real-time
loopwork logs prod --follow

# 4. Check status
loopwork status

# 5. Stop when done
loopwork kill prod
```

#### Development Workflow

```bash
# 1. Initialize project
loopwork init

# 2. Edit tasks in .specs/tasks/tasks.json

# 3. Start in foreground for testing
loopwork start --dry-run  # Preview first
loopwork start            # Actually run

# 4. Or run as daemon for long-running tasks
loopwork start -d --tail
```

#### Restart After Changes

```bash
# 1. Kill existing daemon
loopwork kill prod

# 2. Restart with same arguments
loopwork restart prod
```

## Daemon Mode

Daemon mode allows you to run Loopwork in the background, perfect for long-running task automation, CI/CD pipelines, and production deployments.

### Quick Start

```bash
# Start a daemon in the background
loopwork start -d

# View logs
loopwork logs

# Stop when done
loopwork kill
```

### What is Daemon Mode?

Daemon mode differs from foreground mode in several key ways:

| Aspect | Foreground | Daemon |
|--------|-----------|--------|
| **Execution** | Runs in terminal, blocks until complete | Runs in background, returns immediately |
| **Output** | Printed to terminal in real-time | Logged to files |
| **Control** | Ctrl+C to stop | Use `loopwork kill` to stop |
| **Multiple Instances** | One per directory | Multiple via namespaces |
| **State Persistence** | Session state saved | State + restart args saved |
| **Best For** | Development, testing, quick runs | Production, long tasks, CI/CD |

### Starting Daemons

#### Basic Start

```bash
# Start default namespace daemon
loopwork start -d

# Start and immediately tail logs
loopwork start -d --tail

# Start with custom namespace
loopwork start -d --namespace prod
```

#### With Options

```bash
# Start daemon with specific feature filter
loopwork start -d --namespace prod --feature auth

# Start with max iterations limit
loopwork start -d --namespace staging --max-iterations 100

# Start with custom timeout
loopwork start -d --namespace prod --timeout 1200

# Start and resume from saved state
loopwork start -d --namespace prod --resume

# Dry-run mode (preview tasks without executing)
loopwork start -d --dry-run

# With debug logging
loopwork start -d --debug
```

#### Combining Options

```bash
# Full example: production daemon with features and limits
loopwork start -d \
  --namespace prod \
  --feature critical \
  --max-iterations 50 \
  --timeout 600 \
  --tail
```

### Namespace Isolation

Namespaces allow running multiple independent loopwork instances:

```bash
# Start three separate daemons
loopwork start -d --namespace dev --feature auth
loopwork start -d --namespace prod --feature critical
loopwork start -d --namespace staging --feature testing

# Check all running
loopwork status

# View logs per namespace
loopwork logs dev
loopwork logs prod
loopwork logs staging

# Stop specific namespace
loopwork kill prod

# Restart specific namespace
loopwork restart staging
```

**Use Cases for Namespaces:**
- **Environment separation**: dev, staging, production
- **Feature branches**: different features running in parallel
- **Team isolation**: different teams using same project
- **Batch processing**: multiple task queues

### Managing Daemon Processes

#### View Status

```bash
# See all running daemons
loopwork status

# Shows: namespace, PID, uptime, log location
```

#### Restart a Daemon

```bash
# Restart with saved arguments
loopwork restart prod

# Restart default namespace
loopwork restart
```

The `restart` command:
1. Stops the existing process gracefully (SIGTERM)
2. Waits 2 seconds for cleanup
3. Starts a new process with the exact same arguments

#### Stop Daemons

```bash
# Stop specific namespace
loopwork kill prod

# Stop default namespace
loopwork kill

# Stop all running daemons
loopwork kill --all
```

### Logs and Monitoring

#### Viewing Logs

```bash
# Show last 50 lines (default)
loopwork logs

# Show for specific namespace
loopwork logs prod

# Show more lines
loopwork logs --lines 200

# Tail logs in real-time
loopwork logs --follow

# Follow specific namespace
loopwork logs prod --follow
```

#### Task-Specific Logs

View a specific task iteration's prompt and output:

```bash
# Show iteration 3 (prompt + output)
loopwork logs --task 3

# Show iteration 5 for prod namespace
loopwork logs prod --task 5

# Show iteration from specific session
loopwork logs --session 2026-01-25 --task 2
```

#### Session Management

```bash
# View logs from specific session
loopwork logs --session 2026-01-25-103045

# Show latest session (default if session not specified)
loopwork logs
```

### Log Files Structure

Logs are organized hierarchically:

```
.loopwork-state/
├── sessions/
│   └── default/
│       ├── 2026-01-25-103045/
│       │   ├── loopwork.log              # Main log file
│       │   └── logs/
│       │       ├── iteration-1-prompt.md # What was sent to AI
│       │       ├── iteration-1-output.txt  # AI response
│       │       ├── iteration-2-prompt.md
│       │       ├── iteration-2-output.txt
│       │       └── ...
│       └── 2026-01-24-142030/
└── prod/
    └── 2026-01-25-093015/
```

**What Each File Contains:**
- `loopwork.log` - High-level events: task started, completed, failed
- `iteration-N-prompt.md` - The exact prompt sent to the AI CLI
- `iteration-N-output.txt` - Raw output/response from the AI

#### Manual Log Access

```bash
# Find latest session directory
ls -lt .loopwork-state/sessions/default/ | head -1

# Tail the main log in real-time
tail -f .loopwork-state/sessions/default/2026-01-25-103045/loopwork.log

# View a specific iteration's AI response
cat .loopwork-state/sessions/default/2026-01-25-103045/logs/iteration-3-output.txt

# Search for errors across all logs
grep -r "ERROR" .loopwork-state/sessions/default/
```

### PID File Management

Loopwork uses a monitor state file to track daemon processes:

**Location:** `.loopwork-monitor-state.json` (project root)

**Contents:**
```json
{
  "processes": [
    {
      "namespace": "prod",
      "pid": 12345,
      "startedAt": "2026-01-25T10:30:45.123Z",
      "logFile": "/path/to/logs/2026-01-25-103045.log",
      "args": ["--feature", "critical", "--max-iterations", "50"]
    }
  ]
}
```

**How It Works:**
1. When a daemon starts, its PID and metadata are saved to the monitor state file
2. The system validates that each PID is still running (alive check)
3. When a daemon stops, its entry is removed from the state file
4. If a process crashes, `loopwork status` detects the dead PID and cleans it up

**Restart Arguments:**

Separate from the monitor state, restart arguments are saved per namespace:

**Location:** `.loopwork-state/{namespace}-restart-args.json`

**Contents:**
```json
{
  "namespace": "prod",
  "args": ["--feature", "critical", "--max-iterations", "50"],
  "cwd": "/path/to/project",
  "startedAt": "2026-01-25T10:30:45.123Z"
}
```

These allow `loopwork restart` to use the exact same arguments from the original start command.

### Example Workflows

#### Scenario 1: Long-Running Production Task

```bash
# Start daemon with limits and tail logs
loopwork start -d --namespace prod --max-iterations 1000 --tail

# Later: Check on it
loopwork logs prod --follow

# When done: Stop it
loopwork kill prod

# View final results
loopwork logs prod --lines 500
```

#### Scenario 2: Development with Multiple Features

```bash
# Feature branch 1
loopwork start -d --namespace feature-auth --feature auth

# Feature branch 2
loopwork start -d --namespace feature-api --feature api

# Check both
loopwork status

# View logs for each
loopwork logs feature-auth
loopwork logs feature-api

# Restart one after making changes
loopwork restart feature-auth
```

#### Scenario 3: CI/CD Pipeline

```bash
#!/bin/bash
# Start daemon and wait for completion
loopwork start -d --namespace ci-${BUILD_ID} --dry-run

# Check status periodically
while loopwork status | grep -q "ci-${BUILD_ID}"; do
  sleep 10
done

# Get final logs
loopwork logs ci-${BUILD_ID} > build-${BUILD_ID}.log

# Clean up
loopwork kill ci-${BUILD_ID}
```

#### Scenario 4: Graceful Restart After Config Changes

```bash
# Edit your loopwork.config.ts
nano loopwork.config.ts

# Restart the daemon with the same arguments
loopwork restart prod

# Monitor the restart
loopwork logs prod --follow
```

### Troubleshooting

#### "Namespace is already running"

```bash
# Check what's running
loopwork status

# Stop the existing process
loopwork kill prod

# Or use a different namespace
loopwork start -d --namespace prod-new
```

#### Daemon started but no logs appearing

```bash
# Check if process is actually running
loopwork status

# View logs manually
tail -f .loopwork-state/sessions/default/*/loopwork.log

# Check for startup errors
loopwork logs --lines 100
```

#### Cannot stop daemon with `loopwork kill`

```bash
# Check current PID
loopwork status

# Manual kill if needed
kill -9 <PID>

# Clean up the monitor state
rm .loopwork-monitor-state.json

# Restart
loopwork start -d
```

#### Restart doesn't work - "No saved arguments"

The namespace must have been started with `loopwork start -d` previously. You can't restart a namespace that was only run in foreground mode.

```bash
# This won't work (no saved args)
loopwork start
loopwork restart  # ERROR: No saved arguments

# This works (saves args)
loopwork start -d
loopwork restart  # OK
```

#### Want to use different arguments

Kill and restart with new arguments:

```bash
loopwork kill prod
loopwork start -d --namespace prod --max-iterations 100
```

### Daemon Mode vs Foreground Mode

**Use Daemon Mode when:**
- Running long tasks (>10 minutes)
- You need to work on other things
- You need stable logs for debugging
- Running in production or CI/CD
- Testing multiple features in parallel
- You need historical logs

**Use Foreground Mode when:**
- Testing configuration changes
- Developing and debugging
- Quick dry-runs
- You want immediate console feedback
- Learning how loopwork works

### Log Management Guide

**Log Locations:**
```
.loopwork-state/
├── sessions/
│   └── NAMESPACE/
│       └── TIMESTAMP/
│           ├── loopwork.log        # Main log file
│           └── logs/
│               ├── iteration-1-prompt.md
│               ├── iteration-1-output.txt
│               ├── iteration-2-prompt.md
│               └── iteration-2-output.txt
```

**Log Commands:**

```bash
# View main log (last 50 lines)
loopwork logs

# View specific namespace
loopwork logs prod

# Tail logs in real-time
loopwork logs --follow
loopwork logs prod --follow

# More lines
loopwork logs --lines 200

# View specific iteration's prompt & output
loopwork logs --task 5

# View logs from specific session
loopwork logs --session 2026-01-25-103045
```

**Manual Log Access:**
```bash
# Find latest session
ls -lt .loopwork-state/sessions/default/ | head -1

# View main log
tail -f .loopwork-state/sessions/default/2026-01-25-103045/loopwork.log

# View iteration output
cat .loopwork-state/sessions/default/2026-01-25-103045/logs/iteration-3-output.txt
```

### CLI Options Reference

#### Global Options

| Option | Description | Default |
|--------|-------------|---------|
| `--config <path>` | Config file path | loopwork.config.ts |
| `--debug` | Enable debug logging | false |
| `-y, --yes` | Non-interactive mode | false |

#### Run/Start Options

| Option | Description | Default |
|--------|-------------|---------|
| `--cli <tool>` | AI CLI tool (claude, opencode) | opencode |
| `--model <model>` | Model override | - |
| `--backend <type>` | Backend (github, json) | auto-detect |
| `--tasks-file <path>` | JSON tasks file | .specs/tasks/tasks.json |
| `--repo <owner/repo>` | GitHub repository | current repo |
| `--feature <name>` | Filter by feature label | - |
| `--start <id>` | Start from task ID | - |
| `--max-iterations <n>` | Max iterations | 50 |
| `--timeout <seconds>` | Task timeout | 600 |
| `--namespace <name>` | Namespace for isolation | default |
| `--resume` | Resume from saved state | false |
| `--dry-run` | Preview without executing | false |

#### Start-Specific Options

| Option | Description | Default |
|--------|-------------|---------|
| `-d, --daemon` | Run in background | false |
| `--tail` | Tail logs after starting daemon | false |
| `--follow` | Alias for --tail | false |

#### Logs Options

| Option | Description | Default |
|--------|-------------|---------|
| `--lines <n>` | Number of lines to show | 50 |
| `--follow` | Tail logs in real-time | false |
| `--session <timestamp>` | View specific session | latest |
| `--task <number>` | View specific iteration | - |

#### Kill Options

| Option | Description | Default |
|--------|-------------|---------|
| `--all` | Stop all namespaces | false |

### Status and Monitoring

```bash
# Check all running processes
loopwork status

# Interactive dashboard (one-time)
loopwork dashboard

# Auto-refreshing dashboard
loopwork dashboard --watch
```

### Legacy Monitor Commands

These are deprecated but still supported for backward compatibility:

```bash
# Old way (deprecated)
loopwork monitor start default
loopwork monitor status
loopwork monitor logs default
loopwork monitor stop default

# New way (recommended)
loopwork start -d --namespace default
loopwork status
loopwork logs default
loopwork kill default
```

## MCP Server Integration

The Loopwork MCP Server exposes task management capabilities through the Model Context Protocol, allowing AI tools like Claude to interact with your task system directly.

### What is MCP?

Model Context Protocol (MCP) is a standardized protocol that lets AI tools integrate with external systems. With Loopwork's MCP server, Claude and other AI tools can:
- Query tasks and check their status
- Mark tasks as complete, failed, or in-progress
- Check task dependencies and sub-tasks
- Monitor backend health

### Setup for Claude Desktop

#### 1. Get Your Project Path

First, find the absolute path to your Loopwork project:

```bash
cd /path/to/your/loopwork/project
pwd  # Copy this path
```

#### 2. Locate Claude Configuration

Open Claude's configuration file:

**macOS & Linux:**
```bash
~/.claude/claude_desktop_config.json
```

**Windows:**
```
%APPDATA%\Claude\claude_desktop_config.json
```

**Or in Claude Desktop:**
Click the menu (⋮) → Settings → Developer → Edit Config

#### 3. Add Loopwork MCP Server

Add the `loopwork-tasks` server to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "loopwork-tasks": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/loopwork/packages/loopwork/src/mcp/server.ts"],
      "env": {
        "LOOPWORK_BACKEND": "json",
        "LOOPWORK_TASKS_FILE": "/absolute/path/to/your/project/.specs/tasks/tasks.json"
      }
    }
  }
}
```

**Example with GitHub Backend:**
```json
{
  "mcpServers": {
    "loopwork-tasks": {
      "command": "bun",
      "args": ["run", "/Users/you/workspace/loopwork/packages/loopwork/src/mcp/server.ts"],
      "env": {
        "LOOPWORK_BACKEND": "github",
        "LOOPWORK_REPO": "owner/repo"
      }
    }
  }
}
```

#### 4. Verify Configuration

After saving the config, restart Claude Desktop. You should see "loopwork-tasks" in:
- Claude → Menu (⋮) → Settings → Developer → Model Capabilities

Or test directly by asking Claude:
> "What tools do you have available for Loopwork?"

You should see tools listed like `loopwork_list_tasks`, `loopwork_get_task`, etc.

### Available MCP Tools

#### Task Queries

| Tool | Purpose | Parameters |
|------|---------|-----------|
| `loopwork_list_tasks` | List all pending tasks with optional filtering | `feature` (string), `priority` (high/medium/low), `includeBlocked` (true/false), `topLevelOnly` (true/false) |
| `loopwork_get_task` | Get detailed information about a task | `taskId` (required) |
| `loopwork_count_pending` | Count pending tasks with optional filtering | `feature` (string) |

#### Task Updates

| Tool | Purpose | Parameters |
|------|---------|-----------|
| `loopwork_mark_in_progress` | Mark a task as currently being worked on | `taskId` (required) |
| `loopwork_mark_complete` | Mark a task as successfully completed | `taskId` (required), `comment` (optional) |
| `loopwork_mark_failed` | Mark a task as failed | `taskId` (required), `error` (required) |
| `loopwork_reset_task` | Reset a task back to pending for retry | `taskId` (required) |

#### Task Relationships

| Tool | Purpose | Parameters |
|------|---------|-----------|
| `loopwork_get_subtasks` | Get all sub-tasks of a parent task | `taskId` (required) |
| `loopwork_get_dependencies` | Get tasks that a task depends on | `taskId` (required) |
| `loopwork_check_dependencies` | Check if all dependencies are met (completed) | `taskId` (required) |

#### System Status

| Tool | Purpose | Parameters |
|------|---------|-----------|
| `loopwork_backend_status` | Check backend health and get pending task count | (none) |

### Usage Examples

#### Example 1: Check Current Task Status

**Claude Prompt:**
> Show me all high-priority pending tasks

**Claude will call:**
```
loopwork_list_tasks({
  priority: "high",
  topLevelOnly: true
})
```

**Response:**
```json
{
  "count": 2,
  "tasks": [
    {
      "id": "AUTH-001",
      "title": "Implement user login",
      "status": "pending",
      "priority": "high",
      "feature": "auth"
    },
    {
      "id": "AUTH-002",
      "title": "Add JWT validation",
      "status": "pending",
      "priority": "high",
      "feature": "auth"
    }
  ]
}
```

#### Example 2: Get Task Details and Check Dependencies

**Claude Prompt:**
> What's the full details of task TASK-001 and can we start working on it?

**Claude will call:**
```
loopwork_get_task({
  taskId: "TASK-001"
})
```

```
loopwork_check_dependencies({
  taskId: "TASK-001"
})
```

**Responses:**
```json
{
  "id": "TASK-001",
  "title": "Implement user authentication",
  "description": "Add JWT-based user authentication...",
  "status": "pending",
  "priority": "high",
  "feature": "auth",
  "parentId": null,
  "dependsOn": null
}

{
  "taskId": "TASK-001",
  "dependenciesMet": true,
  "canStart": true
}
```

#### Example 3: Complete a Task

**Claude Prompt:**
> Mark AUTH-001 as complete with a note that the login form is implemented

**Claude will call:**
```
loopwork_mark_complete({
  taskId: "AUTH-001",
  comment: "Login form implemented with email/password validation and error handling"
})
```

#### Example 4: Check System Status

**Claude Prompt:**
> How many tasks are left to do?

**Claude will call:**
```
loopwork_backend_status()
```

**Response:**
```json
{
  "backend": "json",
  "healthy": true,
  "latencyMs": 12,
  "pendingTasks": 5,
  "error": null
}
```

### Working with Different Backends

#### JSON Backend (Local Files)

```json
{
  "mcpServers": {
    "loopwork-tasks": {
      "command": "bun",
      "args": ["run", "/path/to/loopwork/packages/loopwork/src/mcp/server.ts"],
      "env": {
        "LOOPWORK_BACKEND": "json",
        "LOOPWORK_TASKS_FILE": "/path/to/.specs/tasks/tasks.json"
      }
    }
  }
}
```

Best for: Local development, quick testing, single-user workflows

#### GitHub Backend

```json
{
  "mcpServers": {
    "loopwork-tasks": {
      "command": "bun",
      "args": ["run", "/path/to/loopwork/packages/loopwork/src/mcp/server.ts"],
      "env": {
        "LOOPWORK_BACKEND": "github",
        "LOOPWORK_REPO": "your-org/your-repo"
      }
    }
  }
}
```

Best for: Team collaboration, integration with GitHub Issues, shared task tracking

### Troubleshooting

#### "Tool not found" or Server Not Appearing in Claude

**Problem:** Loopwork tools don't show up in Claude's tool list

**Solutions:**

1. **Check file paths are absolute:**
   - ❌ Wrong: `"args": ["run", "./src/mcp/server.ts"]`
   - ✅ Correct: `"args": ["run", "/Users/you/projects/loopwork/packages/loopwork/src/mcp/server.ts"]`

2. **Verify Bun is installed:**
   ```bash
   which bun
   bun --version
   ```

3. **Restart Claude Desktop:**
   - Close Claude completely (not just the window)
   - Wait 2-3 seconds
   - Reopen Claude

4. **Check the config file:**
   ```bash
   cat ~/.claude/claude_desktop_config.json
   ```
   Ensure it's valid JSON (use a JSON validator)

5. **Enable MCP Debug Logs in Claude:**
   - Settings → Developer → Show MCP Logs

#### "Command not found: bun"

**Problem:** Claude can't find the Bun runtime

**Solutions:**

1. **Use full path to bun:**
   ```bash
   which bun  # Find bun's path
   ```

   Then update config:
   ```json
   {
     "command": "/Users/you/.bun/bin/bun",
     "args": ["run", "/path/to/loopwork/packages/loopwork/src/mcp/server.ts"]
   }
   ```

2. **Or use Node.js (if available):**
   ```json
   {
     "command": "node",
     "args": ["-r", "tsx", "/path/to/loopwork/packages/loopwork/src/mcp/server.ts"]
   }
   ```

3. **Install Bun if missing:**
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

#### "Connection refused" or "Backend error"

**Problem:** MCP server starts but can't connect to tasks

**Solutions:**

1. **Check file paths exist:**
   ```bash
   # For JSON backend
   ls -la /path/to/.specs/tasks/tasks.json

   # For GitHub backend
   cd /path/to/your/repo
   git remote -v  # Should show your repo
   ```

2. **Verify environment variables:**
   - JSON backend needs `LOOPWORK_TASKS_FILE` pointing to a valid file
   - GitHub backend needs `LOOPWORK_REPO` in format `owner/repo`

3. **Check file permissions:**
   ```bash
   # Should be readable
   test -r /path/to/.specs/tasks/tasks.json && echo "Readable" || echo "Not readable"
   ```

4. **Manual test (requires some TypeScript knowledge):**
   ```bash
   cd /path/to/loopwork/packages/loopwork
   bun run src/mcp/server.ts
   # Type: {"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
   # Press Enter
   # You should see a response
   # Ctrl+C to exit
   ```

#### Tasks Appear Outdated or Stale

**Problem:** Claude sees old task data even after making changes

**Solutions:**

1. **Restart Claude Desktop** - The MCP connection is cached:
   - Close Claude completely
   - Wait 3-5 seconds
   - Reopen Claude

2. **For JSON backend, verify file isn't locked:**
   ```bash
   # Check for .lock file
   ls -la /path/to/.specs/tasks/tasks.json.lock

   # If stale lock exists (older than 30 seconds), remove it
   rm /path/to/.specs/tasks/tasks.json.lock
   ```

3. **Check loopwork isn't running in another terminal:**
   ```bash
   loopwork status
   # If anything is running, it might have the file locked
   loopwork kill --all
   ```

#### "Parse error" or "Invalid JSON"

**Problem:** Backend returns parse errors

**Solutions:**

1. **Verify tasks.json is valid JSON:**
   ```bash
   bun run -e "console.log(JSON.parse(Bun.file('/path/to/tasks.json').text()))"
   ```

2. **Check for file encoding issues:**
   ```bash
   # Should return "ASCII" or "UTF-8"
   file -i /path/to/tasks.json
   ```

3. **For corrupted files, restore from backup:**
   ```bash
   git checkout /path/to/.specs/tasks/tasks.json
   ```

#### MCP Server Crashes or Exits Immediately

**Problem:** Server exits with errors in Claude's MCP logs

**Solutions:**

1. **Run the server directly to see errors:**
   ```bash
   cd /path/to/loopwork/packages/loopwork
   bun run src/mcp/server.ts
   ```

2. **Check all env variables are set correctly:**
   ```bash
   echo $LOOPWORK_BACKEND
   echo $LOOPWORK_TASKS_FILE  # or LOOPWORK_REPO
   ```

3. **Verify Loopwork is installed correctly:**
   ```bash
   cd /path/to/loopwork
   bun install
   bun run build
   ```

### Performance Tips

- **Use `topLevelOnly: true`** when querying to exclude sub-tasks (faster response)
- **Filter by feature** to reduce result size: `loopwork_list_tasks({feature: "auth"})`
- **Cache task lists** if querying frequently - MCP results are fresh each time
- **For GitHub backend**, the first query may take longer as it fetches issues

### Advanced: Custom Backend Configuration

If you have a custom backend implementation, configure it the same way:

```json
{
  "mcpServers": {
    "loopwork-tasks": {
      "command": "bun",
      "args": ["run", "/path/to/loopwork/packages/loopwork/src/mcp/server.ts"],
      "env": {
        "LOOPWORK_BACKEND": "custom",
        "LOOPWORK_CUSTOM_CONFIG": "/path/to/custom/backend/config.json"
      }
    }
  }
}
```

## Claude Code Integration

The `withClaudeCode()` plugin automatically detects Claude Code and sets up seamless integration:

**What it does:**
- Detects `.claude/` directory or `CLAUDE.md` file
- Creates `.claude/skills/loopwork.md` with task management skills
- Updates `CLAUDE.md` with Loopwork documentation
- Only runs on first detection (idempotent)

**Available Skills:**
- `/loopwork:run` - Run the task automation loop
- `/loopwork:resume` - Resume from saved state
- `/loopwork:status` - Check current progress
- `/loopwork:task-new` - Create new tasks
- `/loopwork:config` - View configuration

**Usage:**
```typescript
import { defineConfig, withClaudeCode } from 'loopwork'
import { withJSONBackend } from 'loopwork/backends'

export default compose(
  withJSONBackend(),
  withClaudeCode(), // Auto-detects and sets up
)(defineConfig({ cli: 'claude' }))
```

**Options:**
```typescript
withClaudeCode({
  enabled: true,               // Enable/disable (default: true)
  skillsDir: '.claude/skills', // Skills directory (default)
  claudeMdPath: 'CLAUDE.md'    // CLAUDE.md path (default)
})
```

The plugin is smart:
- Skips setup if Claude Code not detected
- Never overwrites existing skill files
- Never duplicates CLAUDE.md sections
- Prefers `.claude/CLAUDE.md` over root `CLAUDE.md`

## Telegram Bot

Interactive task management via Telegram:

```bash
bun run src/telegram-bot.ts
```

Commands:
- `/tasks` - List pending tasks
- `/task <id>` - Get task details
- `/complete <id>` - Mark completed
- `/fail <id> [reason]` - Mark failed
- `/reset <id>` - Reset to pending
- `/status` - Backend status
- `/help` - Show commands

## GitHub Labels

Setup labels in your repo:

```bash
bun run src/setup-labels.ts
```

Creates:
| Label | Description |
|-------|-------------|
| `loopwork-task` | Managed task |
| `loopwork:pending` | Pending |
| `loopwork:in-progress` | In progress |
| `loopwork:failed` | Failed |
| `loopwork:sub-task` | Sub-task |
| `loopwork:blocked` | Blocked |
| `priority:high/medium/low` | Priority |

## Testing

```bash
# All tests
bun test

# Specific file
bun test test/backends.test.ts

# With coverage
bun test --coverage
```

## Output System

Loopwork provides a flexible output system with multiple rendering modes to suit different environments and use cases.

### Output Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| `ink` | React-based TUI with rich interactive display | Interactive terminal sessions |
| `human` | Console output with colors and formatting | Development and debugging |
| `json` | Structured JSON events for parsing | CI/CD pipelines and automation |
| `silent` | Suppress all output | Headless environments |

### Configuring Output Mode

```typescript
import { defineConfig, compose } from 'loopwork'

export default compose(
  // ... other plugins
)(defineConfig({
  // Output mode: 'ink' | 'json' | 'silent' | 'human'
  outputMode: 'ink',
  
  // Minimum log level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent'
  logLevel: 'info',
  
  // Enable/disable colors
  useColor: true,
  
  // Force TTY mode (auto-detected by default)
  useTty: true,
}))
```

### Ink TUI Mode

The Ink renderer provides a rich terminal user interface with:

- **Real-time task progress** with animated progress bars
- **Live log streaming** with color-coded levels
- **Task statistics** showing completed/failed counts
- **Keyboard shortcuts** (press `q` to quit, `v` to toggle logs)

**Requirements:**
- Interactive terminal (TTY)
- Terminal emulator with Unicode support
- Minimum 80x24 terminal size

**Example output:**
```
╔══════════════════════════════════════════╗
║           LOOPWORK DASHBOARD             ║
║  Namespace: default    Elapsed: 2m 30s   ║
╠══════════════════════════════════════════╣
║ Status                                     ║
║   ✓ 5   │ ✗ 1   │ Total: 6               ║
║   [████████████████████░░░░░░░] 83%      ║
╠══════════════════════════════════════════╣
║ Current Task                              ║
║   TASK-005                                ║
║   Implementing user authentication...     ║
║   ⏱ 45s                                  ║
╠══════════════════════════════════════════╣
║ Logs (Press 'v' to toggle)               ║
║ 10:30:00 INFO: Task TASK-005 started     ║
║ 10:30:15 INFO: Creating auth module      ║
║ 10:30:45 INFO: Adding JWT validation     ║
╚══════════════════════════════════════════╝
Press 'q' to quit | 'v' toggle logs
```

### JSON Mode

JSON mode outputs newline-delimited JSON events for programmatic consumption:

```json
{"type":"loop:start","namespace":"default","taskCount":5}
{"type":"task:start","taskId":"TASK-001","title":"First task"}
{"type":"task:complete","taskId":"TASK-001","duration":1500}
{"type":"loop:end","namespace":"default","completed":5,"failed":0}
```

**Use cases:**
- Parsing by external tools
- CI/CD pipeline integration
- Log aggregation systems
- Automated testing and verification

### Human Mode

Human mode provides colored console output optimized for readability:

```
10:30:00 ℹ️ INFO: Starting loop in namespace 'default'
10:30:01 ℹ️ INFO: Task TASK-001 started
10:30:15 ⚠️ WARN: Rate limit approaching
10:30:30 ✅ SUCCESS: Task TASK-001 completed in 29s
```

### TTY Detection

Loopwork automatically detects terminal capabilities:

- **TTY available**: Uses Ink renderer with full TUI
- **No TTY**: Falls back to human-readable console output
- **Force TTY**: Set `useTty: true` in config to override auto-detection

### Event System

The output system is event-driven with 16 event types:

| Category | Events |
|----------|--------|
| **Loop** | `loop:start`, `loop:end`, `loop:iteration` |
| **Task** | `task:start`, `task:complete`, `task:failed` |
| **CLI** | `cli:start`, `cli:output`, `cli:complete`, `cli:error` |
| **Log** | `log` (trace, debug, info, warn, error) |
| **Progress** | `progress:start`, `progress:update`, `progress:stop` |
| **Raw** | `raw`, `json` |

### Custom Renderers

Implement custom output renderers by extending `BaseRenderer`:

```typescript
import { BaseRenderer, type OutputEvent } from 'loopwork/output'

export class MyCustomRenderer extends BaseRenderer {
  readonly name = 'custom'
  readonly isSupported = true

  render(event: OutputEvent): void {
    // Handle each event type
    switch (event.type) {
      case 'log':
        this.handleLog(event)
        break
      case 'task:start':
        this.handleTaskStart(event)
        break
      // ... handle other events
    }
  }
}
```

### Performance Considerations

- **Ink mode**: Higher memory usage due to React component tree
- **JSON mode**: Lowest overhead, ideal for high-throughput scenarios
- **Log filtering**: Use `logLevel` to suppress verbose output
- **Buffer limits**: Ink renderer keeps last 100 log entries

## Architecture

```
loopwork/
├── src/
│   ├── index.ts              # Main entry
│   ├── loopwork-config-types.ts  # Config & plugin types
│   ├── backend-plugin.ts     # Backend plugin system
│   ├── plugins.ts            # Plugin registry
│   ├── config.ts             # Config loading
│   ├── state.ts              # State management
│   ├── cli.ts                # CLI executor
│   ├── monitor.ts            # Background manager
│   ├── dashboard.ts          # Status dashboard
│   ├── dashboard.tsx         # React/ink TUI
│   ├── cost-tracking.ts      # Cost tracking
│   ├── telegram-plugin.ts    # Telegram notifications
│   ├── telegram-bot.ts       # Telegram bot
│   ├── discord-plugin.ts     # Discord notifications
│   ├── asana-plugin.ts       # Asana integration
│   ├── everhour-plugin.ts    # Everhour time tracking
│   ├── todoist-plugin.ts     # Todoist integration
│   ├── mcp-server.ts         # MCP server
│   └── backends/
│       ├── types.ts          # Backend interface
│       ├── index.ts          # Backend factory
│       ├── github-adapter.ts # GitHub backend
│       └── json-adapter.ts   # JSON backend
├── test/                     # Tests
├── loopwork.config.ts        # Config file
└── package.json
```

## License

MIT

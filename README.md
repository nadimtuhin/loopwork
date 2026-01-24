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
)(defineConfig({
  cli: 'claude',              // AI CLI: claude, opencode, gemini
  model: 'claude-sonnet-4-20250514',
  maxIterations: 50,
  taskTimeout: 600,           // seconds
  nonInteractive: true,
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

## Plugin System

### Built-in Plugins

| Plugin | Purpose | Config Wrapper |
|--------|---------|----------------|
| Telegram | Notifications & bot commands | `withTelegram()` |
| Discord | Webhook notifications | `withDiscord()` |
| Asana | Task sync & comments | `withAsana()` |
| Everhour | Time tracking | `withEverhour()` |
| Todoist | Task sync | `withTodoist()` |
| Cost Tracking | Token/cost monitoring | `withCostTracking()` |

### Creating Custom Plugins

```typescript
import type { LoopworkPlugin, PluginContext, TaskResult } from './src/loopwork-config-types'

const myPlugin: LoopworkPlugin = {
  name: 'my-plugin',

  async onLoopStart(config) {
    console.log('Loop starting with', config.maxIterations, 'max iterations')
  },

  async onTaskStart(context: PluginContext) {
    console.log('Starting task:', context.task.id)
  },

  async onTaskComplete(context: PluginContext, result: TaskResult) {
    console.log('Completed:', context.task.id, 'in', result.duration, 'ms')
  },

  async onTaskFailed(context: PluginContext, error: string) {
    console.error('Failed:', context.task.id, error)
  },

  async onLoopEnd(stats) {
    console.log('Loop complete:', stats.completed, 'tasks done')
  },
}

// Register with withPlugin()
import { withPlugin } from './src/loopwork-config-types'

export default compose(
  withPlugin(myPlugin),
  // ... other plugins
)(defineConfig({ cli: 'claude' }))
```

### Task Metadata

Plugins can read external IDs from task metadata:

```typescript
interface TaskMetadata {
  asanaGid?: string      // Asana task ID
  everhourId?: string    // Everhour task ID
  todoistId?: string     // Todoist task ID
  [key: string]: unknown
}

// In JSON tasks file
{
  "tasks": [{
    "id": "TASK-001",
    "title": "Implement feature",
    "metadata": {
      "asanaGid": "1234567890",
      "todoistId": "9876543210"
    }
  }]
}
```

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

```bash
# Basic run
bun run src/index.ts

# With options
bun run src/index.ts \
  --cli claude \
  --backend json \
  --tasks-file .specs/tasks/tasks.json \
  --max 10 \
  --timeout 300 \
  -y  # non-interactive

# Resume from state
bun run src/index.ts --resume

# Filter by feature
bun run src/index.ts --feature auth

# Dry run
bun run src/index.ts --dry-run
```

### CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `--cli <tool>` | AI CLI tool (claude, opencode, gemini) | opencode |
| `--model <model>` | Model override | - |
| `--backend <type>` | Backend (github, json) | auto-detect |
| `--tasks-file <path>` | JSON tasks file | .specs/tasks/tasks.json |
| `--feature <name>` | Filter by feature label | - |
| `--start <id>` | Start from task ID | - |
| `--max <n>` | Max iterations | 50 |
| `--timeout <s>` | Task timeout (seconds) | 600 |
| `--namespace <name>` | Namespace for isolation | default |
| `--resume` | Resume from saved state | false |
| `-y, --yes` | Non-interactive mode | false |
| `--dry-run` | Show without executing | false |
| `--debug` | Debug logging | false |

## Background Execution

### Monitor

```bash
# Start in background
bun run src/monitor.ts start default
bun run src/monitor.ts start feature-auth --feature auth

# Status
bun run src/monitor.ts status

# Logs
bun run src/monitor.ts logs default
bun run src/monitor.ts tail default

# Stop
bun run src/monitor.ts stop default
bun run src/monitor.ts stop --all
```

### Dashboard

```bash
# One-time status
bun run src/dashboard.ts

# Watch mode
bun run src/dashboard.ts watch
```

## MCP Server

For integration with Claude Desktop or other MCP clients:

```json
// claude_desktop_config.json
{
  "mcpServers": {
    "loopwork-tasks": {
      "command": "bun",
      "args": ["run", "/path/to/loopwork/src/mcp-server.ts"],
      "env": {
        "LOOPWORK_BACKEND": "json",
        "LOOPWORK_TASKS_FILE": ".specs/tasks/tasks.json"
      }
    }
  }
}
```

### MCP Tools

| Tool | Description |
|------|-------------|
| `loopwork_list_tasks` | List pending tasks |
| `loopwork_get_task` | Get task details |
| `loopwork_mark_complete` | Mark completed |
| `loopwork_mark_failed` | Mark failed |
| `loopwork_mark_in_progress` | Mark in-progress |
| `loopwork_reset_task` | Reset to pending |
| `loopwork_get_subtasks` | Get sub-tasks |
| `loopwork_get_dependencies` | Get dependencies |
| `loopwork_check_dependencies` | Check if deps met |
| `loopwork_count_pending` | Count pending |
| `loopwork_backend_status` | Health check |

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

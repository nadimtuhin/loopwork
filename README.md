# Loopwork 🔁

> **AI-powered task automation with pluggable backends and extensible integrations**

[![npm version](https://img.shields.io/npm/v/loopwork.svg)](https://www.npmjs.com/package/loopwork)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Loopwork is an extensible task automation framework that runs AI CLI tools (Claude, OpenCode, Gemini) against task backlogs from various sources (GitHub Issues, JSON files, or custom backends). Features a Next.js-style composable plugin architecture for integrations with time tracking, notifications, and project management tools.

## ✨ Features

- 🤖 **Multiple AI Backends** - Support for Claude, OpenCode, and Gemini
- 📋 **Flexible Task Sources** - GitHub Issues, JSON files, with plugin support for custom backends
- 🔌 **Plugin Architecture** - Next.js-style config with composable plugins
- ⏱️ **Time Tracking** - Everhour integration with daily limits
- 📊 **Project Management** - Asana, Todoist sync
- 🔔 **Notifications** - Telegram bot & Discord webhooks
- 💰 **Cost Tracking** - Token usage and cost monitoring
- 🌳 **Sub-tasks & Dependencies** - Hierarchical task structures
- 🔧 **MCP Server** - Model Context Protocol for AI tool integration
- 📺 **Real-time Streaming** - Live output from AI execution
- 🎯 **Smart Retries** - Automatic failover between AI models

## 🚀 Quick Start

### Try the Example

```bash
# Clone the repository
git clone https://github.com/nadimtuhin/loopwork.git
cd loopwork

# Install dependencies
bun install

# Run the basic example
cd examples/basic-json-backend
./quick-start.sh  # Interactive menu
```

### Install from npm

```bash
npm install -g loopwork
# or
bun install -g loopwork

# Initialize a new project
loopwork init
```

## 📖 Usage

### Basic Configuration

Create a `loopwork.config.ts` file:

```typescript
import { defineConfig, compose } from 'loopwork/contracts'
import { withJSONBackend } from 'loopwork'

export default compose(
  withJSONBackend({ tasksFile: '.specs/tasks/tasks.json' }),
)(defineConfig({
  cli: 'claude',
  maxIterations: 50,
}))
```

### With Plugins

```typescript
import {
  defineConfig,
  compose,
  withTelegram,
  withCostTracking,
} from 'loopwork/contracts'
import { withJSONBackend } from 'loopwork'

export default compose(
  withJSONBackend({ tasksFile: '.specs/tasks/tasks.json' }),
  withTelegram({
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
    notifyOnComplete: true,
  }),
  withCostTracking({ dailyBudget: 10.00 }),
)(defineConfig({
  cli: 'claude',
  maxIterations: 50,
}))
```

### Run Loopwork

```bash
# Basic run
loopwork

# With options
loopwork --cli claude --max 10 --dry-run

# Resume from saved state
loopwork --resume

# Filter by feature
loopwork --feature auth
```

## 🔌 Available Plugins

| Plugin | Purpose | NPM Package |
|--------|---------|-------------|
| JSON Backend | Local JSON task files | Built-in |
| GitHub Backend | GitHub Issues | Built-in |
| Telegram | Bot commands & notifications | `@loopwork/telegram` |
| Discord | Webhook notifications | `@loopwork/discord` |
| Asana | Task sync & comments | `@loopwork/asana` |
| Everhour | Time tracking | `@loopwork/everhour` |
| Todoist | Task sync | `@loopwork/todoist` |
| Cost Tracking | Token/cost monitoring | `@loopwork/cost-tracking` |
| Notion | Notion database backend | `@loopwork/notion` |

## 📝 Task Format

### JSON Backend

```json
{
  "tasks": [
    {
      "id": "TASK-001",
      "status": "pending",
      "priority": "high",
      "feature": "auth"
    }
  ]
}
```

Place PRD files in `.specs/tasks/TASK-001.md`:

```markdown
# TASK-001: Implement Authentication

## Goal
Add user authentication system

## Requirements
- Login form with validation
- JWT token handling
- Password reset flow
```

### GitHub Issues

Create issues with labels:
- `loopwork-task` - Marks issue as a loopwork task
- `loopwork:pending` - Task status
- `priority:high` - Priority level

## 🏗️ Project Structure

```
loopwork/
├── packages/
│   ├── loopwork/          # Core package
│   ├── telegram/          # Telegram plugin
│   ├── discord/           # Discord plugin
│   ├── asana/             # Asana plugin
│   ├── everhour/          # Everhour plugin
│   ├── todoist/           # Todoist plugin
│   ├── cost-tracking/     # Cost tracking plugin
│   ├── notion/            # Notion plugin
│   └── dashboard/         # Interactive dashboard
├── examples/              # Example configurations
│   └── basic-json-backend/
└── README.md
```

## 📚 Documentation

- [Full Documentation](./packages/loopwork/README.md) - Complete guide with all features
- [Plugin Development](./docs/PLUGINS.md) - Create custom plugins
- [Examples](./examples/) - Working examples
- [Changelog](./packages/loopwork/CHANGELOG.md) - Version history

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

MIT © [Nadim Tuhin](https://github.com/nadimtuhin)

## 🙏 Acknowledgments

- Built with [Bun](https://bun.sh)
- Powered by Claude, OpenCode, and Gemini AI models
- Inspired by modern task automation workflows

---

**Star ⭐ this repo if you find it useful!**

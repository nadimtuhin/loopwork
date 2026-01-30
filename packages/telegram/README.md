# Loopwork Telegram Agent (Teleloop)

An intelligent, interactive Telegram bot for Loopwork that transforms your task automation into a conversational agent.

## Features

- 💬 **Conversational Interface**: Create and refine tasks using natural language.
- 🎮 **Loop Control**: Start, stop, and monitor the automation loop directly from Telegram.
- 📡 **Live Logs**: Stream real-time execution logs to your chat.
- 🔄 **Human-in-the-Loop**: Interactive feedback mechanism (send input to running loops).

## Installation

```bash
bun add @loopwork-ai/telegram
```

## Setup

1. **Create a Bot**: Talk to [@BotFather](https://t.me/BotFather) on Telegram to create a new bot and get the **API Token**.
2. **Get Chat ID**: Talk to [@userinfobot](https://t.me/userinfobot) to get your **ID**.
3. **Configure Environment**:
   ```bash
   export TELEGRAM_BOT_TOKEN="your-token"
   export TELEGRAM_CHAT_ID="your-chat-id"
   ```

## Usage

### Running the Agent

Run the bot as a standalone daemon (recommended):

```bash
# Run from your project root
bun run node_modules/@loopwork-ai/telegram/dist/bot.js
```

Or if you have the source:

```bash
bun run src/bot.ts
```

### Commands

**Loop Control:**
- `/run` - Start the automation loop (runs `loopwork run` by default)
- `/stop` - Stop the running loop
- `/status` - Check backend and loop status
- `/input <text>` - Send text input to the running loop (for interactive prompts)

**Task Management:**
- `/tasks` - List pending tasks
- `/task <id>` - Get task details
- `/complete <id>` - Mark task as complete
- `/fail <id> [reason]` - Mark task as failed
- `/new <title>` - Quick create task (legacy)
- **Drafting**: Just type "Create a task to..." to start an interactive drafting session.

## Configuration

You can customize the bot behavior by instantiating it with options:

```typescript
import { TelegramTaskBot } from '@loopwork-ai/telegram'

const bot = new TelegramTaskBot({
  botToken: '...',
  chatId: '...',
  // Custom command to run the loop (default: ['loopwork', 'run'])
  loopCommand: ['bun', 'run', 'src/index.ts'] 
})

bot.start()
```

## Architecture

The Teleloop agent runs as a daemon process that:
1. Listens for Telegram updates (polling).
2. Spawns `loopwork` as a child process when `/run` is requested.
3. Streams `stdout/stderr` from the child process to Telegram.
4. Manages user sessions for interactive task creation.

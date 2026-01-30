# Loopwork Telegram Agent (Teleloop)

An intelligent, interactive Telegram bot for Loopwork that transforms your task automation into a conversational agent.

## Features

- 💬 **Conversational Interface**: Create and refine tasks using natural language.
- 🎤 **Voice-to-Task**: Create tasks hands-free by sending voice notes (powered by OpenAI Whisper).
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

   # Optional: Enable voice-to-task feature
   export OPENAI_API_KEY="your-openai-api-key"
   ```

### Voice Notes Setup (Optional)

To enable voice-to-task creation:

1. Get an OpenAI API key from [platform.openai.com](https://platform.openai.com/api-keys)
2. Set the `OPENAI_API_KEY` environment variable
3. The bot will automatically enable voice note processing

Voice notes are transcribed using OpenAI's Whisper API and parsed to create tasks automatically.

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
- 🎤 **Voice Notes**: Send a voice message to create tasks hands-free! (requires OpenAI API key)

### Voice-to-Task Examples

Send a voice note saying:
- "Urgent: fix the login bug on mobile" → Creates high-priority task
- "Add user profile page. This should include avatar upload and bio editing." → Creates task with detailed description
- "Low priority: update documentation" → Creates low-priority task

Priority keywords detected:
- **High priority**: "urgent", "asap", "critical", "high priority", "important"
- **Low priority**: "low priority", "minor", "whenever", "someday"

## Configuration

You can customize the bot behavior by instantiating it with options:

```typescript
import { TelegramTaskBot } from '@loopwork-ai/telegram'

const bot = new TelegramTaskBot({
  botToken: '...',
  chatId: '...',
  // Custom command to run the loop (default: ['loopwork', 'run'])
  loopCommand: ['bun', 'run', 'src/index.ts'],
  // Voice-to-task configuration
  whisperApiKey: 'sk-...',           // OpenAI API key (or use env: OPENAI_API_KEY)
  enableVoiceNotes: true,            // Enable/disable voice notes (default: true if whisperApiKey provided)
  whisperModel: 'whisper-1',         // Whisper model (default: 'whisper-1')
  whisperLanguage: 'en'              // Optional: Force language (default: auto-detect)
})

bot.start()
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `botToken` | string | `TELEGRAM_BOT_TOKEN` | Telegram bot API token |
| `chatId` | string | `TELEGRAM_CHAT_ID` | Allowed chat ID for security |
| `loopCommand` | string[] | `['loopwork', 'run']` | Command to run automation loop |
| `whisperApiKey` | string | `OPENAI_API_KEY` | OpenAI API key for voice transcription |
| `enableVoiceNotes` | boolean | `true` (if key set) | Enable voice-to-task feature |
| `whisperModel` | string | `'whisper-1'` | Whisper model to use |
| `whisperLanguage` | string | `undefined` | Force language code (e.g., 'en', 'es') |

## IPC Communication

The Telegram bot supports **Inter-Process Communication (IPC)** for rich, structured notifications and interactive features. When enabled, the bot can:

- 📊 **Rich Notifications**: Receive structured task lifecycle events (start, complete, failed) with formatted messages
- ❓ **Interactive Questions**: Display AI questions as inline keyboards for quick user responses
- ✅ **Approval Requests**: Show approve/deny buttons for dangerous operations
- 📈 **Progress Updates**: Display real-time task progress with visual progress bars

### Enabling IPC

To enable IPC communication, configure your `loopwork.config.ts` with the IPC plugin:

```typescript
import { compose, defineConfig, withIPC } from 'loopwork'
import { withJSONBackend } from 'loopwork/backends'

export default compose(
  withJSONBackend({ tasksFile: '.specs/tasks/tasks.json' }),
  withIPC({ enabled: true })
)(defineConfig({
  cli: 'claude',
  maxIterations: 50
}))
```

See `examples/loopwork.bot.config.ts` for a complete example.

### IPC Event Types

The IPC protocol supports the following event types:

| Event | Description | Visual |
|-------|-------------|--------|
| `task_start` | Task execution started | 🚀 Task Started |
| `task_complete` | Task completed successfully | ✅ Task Completed |
| `task_failed` | Task execution failed | ❌ Task Failed |
| `loop_start` | Automation loop started | 🎯 Loop Started |
| `loop_end` | Automation loop ended | 🏁 Loop Complete |
| `question` | AI asking for user input | ❓ Question with buttons |
| `approval_request` | Requires user approval | ⚠️ Approval buttons |
| `progress_update` | Task progress update | ⚙️ Progress bar |

### Interactive Features

**Questions**: When the AI needs input, it displays options as inline keyboard buttons:

```
❓ Which approach should I use?

[Approach A (Fast)]  [Approach B (Robust)]
```

**Approval Requests**: For dangerous operations, the bot shows approve/deny buttons:

```
⚠️ Approval Required

About to delete 50 test files

Action: delete_all_tests

[✅ Approve]  [❌ Deny]
```

### How It Works

1. **Loopwork subprocess** emits IPC messages to stdout with special delimiters: `__IPC_START__{...JSON...}__IPC_END__`
2. **Bot parser** extracts IPC messages from stdout chunks using regex
3. **IPC handler** routes messages to specific handlers based on event type
4. **Telegram API** displays formatted messages with inline keyboards
5. **Button clicks** send responses back to loopwork via stdin

### Backward Compatibility

IPC is fully backward compatible:
- IPC plugin is **opt-in** via config
- Regular stdout/stderr logs continue to work
- Existing notification plugin remains unchanged
- No breaking changes to bot commands

## Architecture

The Teleloop agent runs as a daemon process that:
1. Listens for Telegram updates (polling).
2. Spawns `loopwork` as a child process when `/run` is requested.
3. Streams `stdout/stderr` from the child process to Telegram.
4. Parses IPC messages from stdout for rich notifications (when enabled).
5. Manages user sessions for interactive task creation.

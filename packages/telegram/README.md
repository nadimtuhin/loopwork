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

## Architecture

The Teleloop agent runs as a daemon process that:
1. Listens for Telegram updates (polling).
2. Spawns `loopwork` as a child process when `/run` is requested.
3. Streams `stdout/stderr` from the child process to Telegram.
4. Manages user sessions for interactive task creation.

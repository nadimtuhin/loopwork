# Loopwork Telegram Agent Plan (Project: Teleloop)

## Goal
Transform the basic Telegram bot into a fully interactive AI agent interface for Loopwork, enabling conversational task management, real-time loop control, and human-in-the-loop feedback.

## Features

### 1. Conversational Interface (Chat Mode) ✅ Implemented
- **Natural Language Task Creation**: Parse messages like "Remind me to fix the auth bug on login page" into structured tasks.
- **Interactive Refinement**: Bot asks clarifying questions before creating tasks.
- **Context Awareness**: Bot remembers recent conversation context.

### 2. Loop Control Center ✅ Implemented
- **Commands**:
  - `/run` - Start the Loopwork automation loop.
  - `/stop` - Stop the current loop execution gracefully.
  - `/status` - Get real-time status of the loop (active task, iteration count, errors).
  - `/input <text>` - Send input to the running loop (for manual feedback).

### 3. Live Execution Logs ✅ Implemented
- **Streaming Updates**: Stream key CLI events to a dedicated Telegram topic or main chat.
- **Buffering**: Logs are buffered (2000 chars or 2s) to avoid rate limits.

### 4. The "Overseer" (Structured IPC) 🧠 (Planned)
- **Problem**: Raw text streaming is dumb. The bot doesn't "know" when the AI is asking for permission.
- **Solution**: Implement a structured IPC channel.
- **Features**:
  - **Interactive Approvals**: Dangerous commands trigger a `[🚫 Deny] [✅ Allow]` button menu.
  - **Structured Questions**: AI sends a JSON payload defining a question and options; Bot renders a button menu.
  - **Event-Driven**: The bot reacts to `onTaskComplete`, `onError`, etc., with formatted messages rather than grepping logs.

### 5. Voice-to-Task (Audio Notes) 🎙️ (Planned)
- **Problem**: Typing on mobile is slow.
- **Solution**: Accept Telegram voice notes.
- **Workflow**:
  1. User records audio ("Fix the login bug").
  2. Bot downloads audio.
  3. Bot calls STT API (Whisper/Google).
  4. Bot creates task from transcript.

### 6. "Vision" Bug Reporting 📸 (Planned)
- **Problem**: Describing UI bugs is hard.
- **Solution**: Accept screenshots.
- **Workflow**:
  1. User uploads photo.
  2. Bot saves to `.specs/attachments/`.
  3. Bot creates task "Fix visual regression" linked to the image path.
  4. Loopwork passes image to multimodal model.

### 7. Smart Daily Briefings 📊 (Planned)
- **Problem**: Logs are too verbose for a quick check-in.
- **Solution**: AI-generated summaries.
- **Features**:
  - **Morning Brief**: "3 High Priority tasks pending."
  - **Session Report**: "Completed 5 tasks, modified 12 files. 1 Error."

## Technical Architecture

### Component 1: The "Teleloop" Daemon
A long-running process that:
1.  **Hosts the Telegram Bot**: Listens for polling updates.
2.  **Manages Loop Process**: Spawns `loopwork` as a child process using `Bun.spawn`.
3.  **Inter-Process Communication (IPC)**:
    - Sends commands to Loopwork via stdin (`/input`).
    - Receives logs via stdout/stderr and streams to Telegram.

## Roadmap

### Phase 1: Interactive Task Management ✅
- [x] Enhance `TelegramTaskBot` to handle conversational flows.
- [x] Implement simple state machine for "Drafting Task" conversation (`src/session.ts`).

### Phase 2: Loop Control Daemon ✅
- [x] Implement `handleRunLoop` and `handleStopLoop`.
- [x] Stream stdout/stderr from child process to Telegram with buffering.

### Phase 3: The Overseer (IPC)
- [ ] Design IPC Protocol (JSON over stdout or dedicated IPC channel).
- [ ] Update `TelegramTaskBot` to parse structured IPC messages.
- [ ] Implement `withIPC()` plugin in Loopwork to emit structured events.
- [ ] Add Telegram Button support (CallbackQueries).

### Phase 4: Multimodal & Voice
- [ ] Add `voice` and `photo` message handlers to `TelegramTaskBot`.
- [ ] Integrate OpenAI Whisper or similar for STT.
- [ ] Update Task backend to support attachments.

## Configuration
New config section in `TelegramTaskBot` constructor:
```typescript
loopCommand?: string[] // Command to run loopwork (default: ['loopwork', 'run'])
```

# TELE-010: Teleloop - Implement 'Overseer' IPC Communication

## Overview
Establish a structured Inter-Process Communication (IPC) channel between the Telegram bot daemon and the loopwork subprocess to enable interactive approvals, structured questions, and rich event notifications instead of raw stdout/stderr streaming.

## Background
Currently, the Telegram bot spawns loopwork as a child process and blindly forwards stdout/stderr streams as text. This prevents:
- Interactive button-based approvals for dangerous operations
- Structured AI questions with multiple-choice options
- Rich event notifications with metadata
- Real-time progress updates with task context

## Goals
1. **Structured Event Communication**: Replace raw text streaming with JSON-based structured messages
2. **Interactive Approvals**: Enable button-based user confirmations for risky operations
3. **Structured Questions**: Support AI asking questions with inline keyboard options
4. **Backward Compatibility**: Maintain existing stdout/stderr for logs while adding IPC layer

## Non-Goals
- Voice-to-task (TELE-011)
- Vision bug reporting (TELE-012)
- Daily briefings (TELE-013)
- Replacing the plugin notification system

## Architecture

### IPC Protocol Design

**Transport**: JSON messages via stdout with special prefix
```typescript
// IPC message format
interface IPCMessage {
  type: 'ipc' // Magic prefix for parsing
  version: '1.0'
  event: IPCEventType
  data: any
  timestamp: number
  messageId: string // UUID for correlation
}

type IPCEventType =
  | 'task_start'
  | 'task_complete'
  | 'task_failed'
  | 'question'
  | 'approval_request'
  | 'progress_update'
  | 'log' // Structured log with level
```

**Example Messages**:
```json
{
  "type": "ipc",
  "version": "1.0",
  "event": "question",
  "messageId": "abc-123",
  "timestamp": 1706543210000,
  "data": {
    "question": "Which approach should I use?",
    "options": [
      {"id": "opt1", "label": "Approach A (Fast)"},
      {"id": "opt2", "label": "Approach B (Robust)"}
    ],
    "timeout": 60
  }
}

{
  "type": "ipc",
  "version": "1.0",
  "event": "approval_request",
  "messageId": "def-456",
  "timestamp": 1706543220000,
  "data": {
    "action": "delete_all_tests",
    "description": "About to delete 50 test files",
    "severity": "high",
    "timeout": 30
  }
}

{
  "type": "ipc",
  "version": "1.0",
  "event": "task_start",
  "messageId": "ghi-789",
  "timestamp": 1706543230000,
  "data": {
    "taskId": "FEAT-001",
    "title": "Implement user authentication"
  }
}
```

### Component Changes

#### 1. Loopwork Core - IPC Emitter Plugin (`packages/loopwork/src/plugins/ipc.ts`)

New plugin that emits IPC messages to stdout:

```typescript
export interface IPCPluginOptions {
  enabled?: boolean // Default: true
  filter?: (event: IPCEventType) => boolean // Optional event filtering
}

export function createIPCPlugin(options?: IPCPluginOptions): LoopworkPlugin {
  return {
    name: 'ipc-emitter',
    onTaskStart: async (context) => {
      emitIPC('task_start', { taskId: context.task.id, title: context.task.title })
    },
    onTaskComplete: async (context, result) => {
      emitIPC('task_complete', { taskId: context.task.id, result })
    },
    onTaskFailed: async (context, error) => {
      emitIPC('task_failed', { taskId: context.task.id, error: error.message })
    },
    // ... other hooks
  }
}

function emitIPC(event: IPCEventType, data: any) {
  const message: IPCMessage = {
    type: 'ipc',
    version: '1.0',
    event,
    data,
    timestamp: Date.now(),
    messageId: crypto.randomUUID()
  }
  // Write to stdout with special format
  console.log(`__IPC_START__${JSON.stringify(message)}__IPC_END__`)
}
```

**Config Usage**:
```typescript
import { compose, defineConfig } from 'loopwork'
import { createIPCPlugin } from 'loopwork/plugins/ipc'

export default compose(
  createIPCPlugin({ enabled: true })
)(defineConfig({ ... }))
```

#### 2. Telegram Bot - IPC Parser (`packages/telegram/src/ipc-handler.ts`)

New module to parse and handle IPC messages:

```typescript
export class IPCHandler {
  private pendingRequests = new Map<string, PendingRequest>()

  constructor(private bot: TelegramTaskBot) {}

  parseOutput(chunk: string): { ipcMessages: IPCMessage[], logs: string } {
    const ipcPattern = /__IPC_START__(.*?)__IPC_END__/g
    const messages: IPCMessage[] = []
    let logs = chunk

    let match
    while ((match = ipcPattern.exec(chunk)) !== null) {
      try {
        const msg = JSON.parse(match[1])
        if (msg.type === 'ipc') {
          messages.push(msg)
          logs = logs.replace(match[0], '') // Remove from logs
        }
      } catch (e) {
        // Invalid JSON, treat as log
      }
    }

    return { ipcMessages: messages, logs: logs.trim() }
  }

  async handleMessage(msg: IPCMessage) {
    switch (msg.event) {
      case 'question':
        await this.handleQuestion(msg)
        break
      case 'approval_request':
        await this.handleApprovalRequest(msg)
        break
      case 'task_start':
        await this.handleTaskStart(msg)
        break
      // ... other handlers
    }
  }

  private async handleQuestion(msg: IPCMessage) {
    const { question, options, timeout } = msg.data

    // Create inline keyboard
    const keyboard = options.map((opt: any) => [{
      text: opt.label,
      callback_data: `ipc:${msg.messageId}:${opt.id}`
    }])

    await this.bot.sendMessage(question, {
      reply_markup: { inline_keyboard: keyboard }
    })

    // Wait for response with timeout
    return this.waitForResponse(msg.messageId, timeout)
  }

  private async handleApprovalRequest(msg: IPCMessage) {
    const { action, description, severity } = msg.data

    const emoji = severity === 'high' ? '⚠️' : 'ℹ️'
    const text = `${emoji} Approval Required\n\n${description}\n\nProceed with: ${action}?`

    await this.bot.sendMessage(text, {
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Approve', callback_data: `ipc:${msg.messageId}:approve` },
          { text: '❌ Deny', callback_data: `ipc:${msg.messageId}:deny` }
        ]]
      }
    })

    return this.waitForResponse(msg.messageId, msg.data.timeout)
  }

  private waitForResponse(messageId: string, timeout: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(messageId)
        reject(new Error('Response timeout'))
      }, timeout * 1000)

      this.pendingRequests.set(messageId, { resolve, reject, timer })
    })
  }

  resolveRequest(messageId: string, response: string) {
    const pending = this.pendingRequests.get(messageId)
    if (pending) {
      clearTimeout(pending.timer)
      pending.resolve(response)
      this.pendingRequests.delete(messageId)
    }
  }
}
```

#### 3. Bot Integration (`packages/telegram/src/bot.ts`)

Modify `streamOutput()` to use IPC handler:

```typescript
private async streamOutput(stream: ReadableStream, chatId: number, type: 'stdout' | 'stderr') {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let lastSendTime = Date.now()

  const ipcHandler = new IPCHandler(this) // NEW

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value, { stream: true })

    // Parse IPC messages from chunk
    const { ipcMessages, logs } = ipcHandler.parseOutput(chunk) // NEW

    // Handle IPC messages
    for (const msg of ipcMessages) { // NEW
      await ipcHandler.handleMessage(msg) // NEW
    } // NEW

    buffer += logs // Only add logs to buffer

    // ... existing buffering logic for logs
  }
}
```

Add callback query handler:

```typescript
bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data

  if (data.startsWith('ipc:')) {
    const [_, messageId, response] = data.split(':')

    // Send response to loopwork via stdin
    if (this.loopProcess) {
      const writer = this.loopProcess.stdin.getWriter()
      await writer.write(new TextEncoder().encode(`${response}\n`))
      await writer.releaseLock()
    }

    // Resolve pending request
    this.ipcHandler.resolveRequest(messageId, response)

    await ctx.answerCallbackQuery()
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] }) // Remove buttons
  }
})
```

## Implementation Plan

### Phase 1: Core IPC Infrastructure
1. Create `packages/loopwork/src/plugins/ipc.ts` with IPC emitter plugin
2. Add IPC plugin to default plugin exports
3. Write tests for IPC message emission

### Phase 2: Bot Parser & Handler
1. Create `packages/telegram/src/ipc-handler.ts` with message parser
2. Add callback query handler to bot
3. Integrate IPC handler into `streamOutput()`
4. Write tests for message parsing

### Phase 3: Interactive Features
1. Implement question handler with inline keyboards
2. Implement approval request handler
3. Add response correlation and timeout handling
4. Write integration tests

### Phase 4: Documentation & Examples
1. Update telegram package README with IPC usage
2. Add example config with IPC plugin
3. Document IPC message protocol
4. Update PLAN.md to mark Phase 3 complete

## Success Criteria
- [ ] IPC plugin emits structured messages for task lifecycle events
- [ ] Bot correctly parses IPC messages and separates them from logs
- [ ] Interactive questions display as inline keyboards in Telegram
- [ ] Approval requests show approve/deny buttons
- [ ] Button clicks send responses back to loopwork via stdin
- [ ] Logs continue to display normally in Telegram
- [ ] All tests pass
- [ ] Documentation updated

## Testing Strategy

### Unit Tests
- `packages/loopwork/test/plugins/ipc.test.ts` - Test IPC emission
- `packages/telegram/test/ipc-handler.test.ts` - Test message parsing

### Integration Tests
- Create test that spawns loopwork with IPC plugin
- Verify bot receives and parses IPC messages
- Test button interaction flow end-to-end

## Security Considerations
1. **Timeout handling**: All interactive requests must have timeouts to prevent blocking
2. **Message validation**: Parse and validate all IPC messages before processing
3. **Response correlation**: Use UUIDs to prevent response injection
4. **Deny by default**: If user doesn't respond to approval request, deny the action

## Migration & Backward Compatibility
- IPC plugin is optional (opt-in via config)
- Existing stdout/stderr logs continue to work
- Existing notification plugin remains unchanged
- No breaking changes to existing bot commands

## Dependencies
- No new external dependencies required
- Uses built-in `crypto.randomUUID()` for message IDs
- Uses Telegram Bot API inline keyboards (already supported)

## Future Enhancements (Not in Scope)
- WebSocket-based IPC for lower latency
- File transfer protocol for images/attachments
- Bidirectional streaming events
- IPC message encryption

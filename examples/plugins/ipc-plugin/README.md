# IPC Plugin Example

The IPC (Inter-Process Communication) plugin is a **built-in plugin** that emits structured JSON messages to stdout for parent process communication. This is particularly useful when loopwork is spawned as a child process and you need to capture task lifecycle events programmatically.

## What It Demonstrates

- Using the built-in IPC plugin
- Structured event emission via stdout
- Message filtering
- Parent-child process communication patterns
- Parsing IPC messages in the parent process

## Use Case

Perfect for integrating loopwork with external tools, dashboards, or notification systems that need real-time task updates without parsing raw logs.

**Examples:**
- Telegram bot showing task progress with inline keyboards
- Dashboard displaying real-time task status
- CI/CD pipeline integration
- Custom monitoring tools

## Key Features

- Emits JSON messages with special wrapper format: `__IPC_START__{json}__IPC_END__`
- Events: `loop_start`, `loop_end`, `task_start`, `task_complete`, `task_failed`
- Each message includes: messageId (UUID), timestamp, version, event type
- Optional event filtering to reduce noise
- Can be disabled without affecting other functionality

## Configuration

### Basic Usage

```typescript
import { compose, defineConfig } from 'loopwork'
import { withJSONBackend } from 'loopwork/backends'
import { withIPC } from 'loopwork/plugins/ipc'

export default compose(
  withJSONBackend({ tasksFile: '.specs/tasks/tasks.json' }),
  withIPC() // Enable IPC with default settings
)(defineConfig({
  cli: 'claude',
  maxIterations: 50
}))
```

### With Custom Options

```typescript
import { withIPC } from 'loopwork/plugins/ipc'

export default compose(
  withJSONBackend(),
  withIPC({
    enabled: true,
    filter: (event) => {
      // Only emit task events, skip loop events
      return event.startsWith('task_')
    }
  })
)(defineConfig({ cli: 'claude' }))
```

### Disable IPC

```typescript
withIPC({ enabled: false })
```

## Message Format

All IPC messages follow this structure:

```typescript
interface IPCMessage {
  type: 'ipc'           // Magic type for identification
  version: '1.0'        // Protocol version
  event: IPCEventType   // Event type
  data: any             // Event-specific data
  timestamp: number     // Unix timestamp in milliseconds
  messageId: string     // Unique UUID for correlation
}
```

### Example Messages

**Loop Start:**
```json
{
  "type": "ipc",
  "version": "1.0",
  "event": "loop_start",
  "messageId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": 1706543230000,
  "data": {
    "namespace": "my-project"
  }
}
```

**Task Start:**
```json
{
  "type": "ipc",
  "version": "1.0",
  "event": "task_start",
  "messageId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "timestamp": 1706543240000,
  "data": {
    "taskId": "FEAT-001",
    "title": "Implement user authentication",
    "namespace": "my-project",
    "iteration": 1
  }
}
```

**Task Complete:**
```json
{
  "type": "ipc",
  "version": "1.0",
  "event": "task_complete",
  "messageId": "6ba7b811-9dad-11d1-80b4-00c04fd430c8",
  "timestamp": 1706543350000,
  "data": {
    "taskId": "FEAT-001",
    "title": "Implement user authentication",
    "namespace": "my-project",
    "iteration": 1,
    "duration": 110000,
    "success": true
  }
}
```

**Task Failed:**
```json
{
  "type": "ipc",
  "version": "1.0",
  "event": "task_failed",
  "messageId": "6ba7b812-9dad-11d1-80b4-00c04fd430c8",
  "timestamp": 1706543400000,
  "data": {
    "taskId": "FEAT-002",
    "title": "Add payment integration",
    "namespace": "my-project",
    "iteration": 2,
    "error": "Rate limit exceeded"
  }
}
```

## Parent Process Integration

### Node.js Example

```javascript
import { spawn } from 'child_process'

const loopwork = spawn('npx', ['loopwork'], {
  stdio: ['pipe', 'pipe', 'pipe']
})

// Buffer for partial messages
let buffer = ''

loopwork.stdout.on('data', (chunk) => {
  const text = chunk.toString()
  buffer += text

  // Extract IPC messages
  const ipcPattern = /__IPC_START__(.*?)__IPC_END__/g
  let match

  while ((match = ipcPattern.exec(buffer)) !== null) {
    try {
      const message = JSON.parse(match[1])

      if (message.type === 'ipc') {
        handleIPCMessage(message)

        // Remove processed message from buffer
        buffer = buffer.replace(match[0], '')
      }
    } catch (e) {
      console.error('Failed to parse IPC message:', e)
    }
  }
})

function handleIPCMessage(message) {
  switch (message.event) {
    case 'task_start':
      console.log(`▶️  Task started: ${message.data.title}`)
      break

    case 'task_complete':
      const minutes = Math.floor(message.data.duration / 60000)
      console.log(`✅ Task completed: ${message.data.title} (${minutes}m)`)
      break

    case 'task_failed':
      console.log(`❌ Task failed: ${message.data.title}`)
      console.log(`   Error: ${message.data.error}`)
      break
  }
}
```

### Python Example

```python
import subprocess
import json
import re

process = subprocess.Popen(
    ['npx', 'loopwork'],
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True
)

buffer = ''
ipc_pattern = re.compile(r'__IPC_START__(.*?)__IPC_END__')

for line in process.stdout:
    buffer += line

    for match in ipc_pattern.finditer(buffer):
        try:
            message = json.loads(match.group(1))

            if message['type'] == 'ipc':
                handle_ipc_message(message)

                # Remove processed message
                buffer = buffer.replace(match.group(0), '')
        except json.JSONDecodeError as e:
            print(f'Failed to parse IPC message: {e}')

def handle_ipc_message(message):
    event = message['event']
    data = message['data']

    if event == 'task_start':
        print(f"▶️  Task started: {data['title']}")
    elif event == 'task_complete':
        minutes = data['duration'] // 60000
        print(f"✅ Task completed: {data['title']} ({minutes}m)")
    elif event == 'task_failed':
        print(f"❌ Task failed: {data['title']}")
        print(f"   Error: {data['error']}")
```

## Event Filtering Examples

### Only Task Events

```typescript
withIPC({
  filter: (event) => event.startsWith('task_')
})
```

### Only Loop Lifecycle

```typescript
withIPC({
  filter: (event) => event === 'loop_start' || event === 'loop_end'
})
```

### Skip Task Start (Reduce Noise)

```typescript
withIPC({
  filter: (event) => event !== 'task_start'
})
```

### Conditional Based on Environment

```typescript
withIPC({
  filter: (event) => {
    // In production, only emit failures
    if (process.env.NODE_ENV === 'production') {
      return event === 'task_failed'
    }
    // In dev, emit everything
    return true
  }
})
```

## Best Practices

1. **Always validate parsed JSON** - Malformed messages can crash your parser
2. **Use a buffer** - Messages may arrive in chunks across multiple reads
3. **Remove processed messages** - Prevent re-processing the same message
4. **Handle partial messages** - A message might be split across chunks
5. **Set timeouts** - Don't wait indefinitely for messages
6. **Log parsing errors** - But don't crash on invalid JSON

## Troubleshooting

### Messages Not Appearing

- Check if IPC plugin is enabled: `withIPC({ enabled: true })`
- Verify filter is not blocking all events
- Ensure stdout is being captured (not redirected elsewhere)

### Invalid JSON Errors

- Check if other plugins/code are writing to stdout
- Verify the regex pattern matches the wrapper format
- Buffer may contain incomplete message - wait for `__IPC_END__`

### Duplicate Messages

- Make sure to remove processed messages from buffer
- Check if multiple IPC plugins are registered (shouldn't happen)

## Performance Considerations

- IPC messages are synchronous `console.log` calls
- Filtering reduces message volume for large task lists
- Each message is ~200-500 bytes depending on data
- Overhead is negligible for typical task counts (<1000/run)

## Security Notes

- IPC messages are **not encrypted** - don't include secrets
- Message IDs are UUIDs - safe for correlation
- No authentication - assume parent process is trusted
- Timestamps are UTC epoch milliseconds

## Integration Examples

See the [Telegram package](../../../packages/telegram) for a real-world example of:
- Parsing IPC messages in a bot
- Displaying interactive buttons based on events
- Correlating user responses with message IDs
- Handling timeouts and errors

## Next Steps

- Integrate with your monitoring dashboard
- Add custom event types (via separate plugin)
- Build notification system around IPC events
- Create CI/CD integration using task events

## Related

- [Main Plugin Guide](../../packages/loopwork/README.md#plugin-development-guide)
- [Telegram Integration](../../../packages/telegram/README.md)
- [Plugin System Architecture](../../../packages/loopwork/src/plugins/)

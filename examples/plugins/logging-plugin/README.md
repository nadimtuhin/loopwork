# Custom Logging Plugin

A plugin that collects detailed logs of all tasks and persists them to a JSON file.

## What This Plugin Does

The logging plugin demonstrates:
- Maintaining state within a plugin instance
- Writing and reading files from a plugin
- Recording both successful and failed tasks
- Appending logs across multiple runs

Every task execution is recorded with:
- Task ID and title
- Execution start time
- Duration
- Success/failure status
- Error message (if failed)

## Key Concepts Demonstrated

1. **Plugin State** - Storing data in the plugin instance
2. **File I/O** - Reading and writing JSON files
3. **Data Persistence** - Logs persist across runs
4. **Error Handling** - Recording failures gracefully
5. **Structured Logging** - JSON format for easy parsing

## Installation

Copy `plugin.ts` to your project and import it:

```typescript
import { compose, defineConfig, withPlugin } from 'loopwork'
import { withJSONBackend } from 'loopwork/backends'
import { createLoggingPlugin } from './plugins/logging-plugin'

export default compose(
  withPlugin(createLoggingPlugin()),
  withJSONBackend()
)(defineConfig({ cli: 'claude' }))
```

## Usage

```bash
loopwork start
```

Logs are written to `.loopwork-logs/tasks.json` (configurable).

## Example Log Output

```json
{
  "logs": [
    {
      "timestamp": "2026-01-25T14:32:15.123Z",
      "taskId": "TASK-001",
      "title": "Implement feature",
      "status": "completed",
      "duration": 30235,
      "error": null
    },
    {
      "timestamp": "2026-01-25T14:32:45.234Z",
      "taskId": "TASK-002",
      "title": "Add tests",
      "status": "completed",
      "duration": 27150,
      "error": null
    },
    {
      "timestamp": "2026-01-25T14:33:12.456Z",
      "taskId": "TASK-003",
      "title": "Write docs",
      "status": "failed",
      "duration": 33000,
      "error": "Rate limit exceeded"
    }
  ]
}
```

## Configuration

Customize the log file location:

```typescript
withPlugin(createLoggingPlugin({
  logFile: './custom-logs/execution.json'
}))
```

## Plugin Breakdown

### Plugin State

The plugin stores state to track logs across hooks:

```typescript
let logs: LogEntry[] = []
let currentTask: { id: string; startTime: Date } | null = null
```

### `onLoopStart`

Initializes the plugin by loading existing logs:

```typescript
async onLoopStart() {
  logs = await loadLogsFromFile()
}
```

### `onTaskStart`

Records when a task starts:

```typescript
async onTaskStart(context) {
  currentTask = {
    id: context.task.id,
    startTime: new Date()
  }
}
```

### `onTaskComplete`

Records successful task completion:

```typescript
async onTaskComplete(context, result) {
  logs.push({
    timestamp: new Date().toISOString(),
    taskId: context.task.id,
    title: context.task.title,
    status: 'completed',
    duration: result.duration,
    error: null
  })
  await saveLogsToFile()
}
```

### `onTaskFailed`

Records task failure:

```typescript
async onTaskFailed(context, error) {
  logs.push({
    timestamp: new Date().toISOString(),
    taskId: context.task.id,
    title: context.task.title,
    status: 'failed',
    duration: Date.now() - currentTask.startTime,
    error
  })
  await saveLogsToFile()
}
```

## Reading Logs

After tasks complete, you can analyze the logs:

```typescript
import fs from 'fs'

const logsFile = '.loopwork-logs/tasks.json'
const data = JSON.parse(fs.readFileSync(logsFile, 'utf-8'))

// Find slowest task
const slowest = data.logs.reduce((max, log) =>
  log.duration > max.duration ? log : max
)
console.log(`Slowest task: ${slowest.taskId} (${slowest.duration}ms)`)

// Calculate success rate
const failed = data.logs.filter(log => log.status === 'failed').length
const total = data.logs.length
console.log(`Success rate: ${((total - failed) / total * 100).toFixed(1)}%`)
```

## Extending This Plugin

### Add More Information

```typescript
interface LogEntry {
  timestamp: string
  taskId: string
  title: string
  status: 'completed' | 'failed'
  duration: number
  error: string | null
  iteration?: number
  namespace?: string
  metadata?: any
}

async onTaskComplete(context, result) {
  logs.push({
    // ... existing fields
    iteration: context.iteration,
    namespace: context.namespace,
    metadata: context.task.metadata
  })
}
```

### Rotate Log Files

```typescript
async onLoopEnd() {
  const logDir = path.dirname(logFile)
  const timestamp = new Date().toISOString().replace(/:/g, '-')
  const archiveFile = path.join(logDir, `tasks-${timestamp}.json`)
  fs.renameSync(logFile, archiveFile)
}
```

### Send Logs to External Service

```typescript
async onLoopEnd() {
  try {
    await fetch('https://your-api.com/logs', {
      method: 'POST',
      body: JSON.stringify({ logs })
    })
  } catch (error) {
    console.error('Failed to send logs:', error)
  }
}
```

### Filter Sensitive Information

```typescript
function sanitizeTask(task: any) {
  const { title, id, ...rest } = task
  // Remove sensitive metadata before logging
  return { id, title }
}
```

## File Structure

```
.loopwork-logs/
└── tasks.json           # All task execution logs
```

## Performance Considerations

The logging plugin:
- Writes to disk after each task (ensures no data loss)
- Loads logs at loop start (one-time operation)
- Minimal memory overhead (stores only current logs in memory)

For very high-volume logging:
- Batch writes (write every N tasks instead of after each)
- Compress old log files
- Implement log rotation

## Error Handling

The plugin handles errors gracefully:

```typescript
async onTaskFailed(context, error) {
  try {
    logs.push({...})
    await saveLogsToFile()
  } catch (error) {
    console.error('Logging error:', error)
    // Don't throw - continue even if logging fails
  }
}
```

## See Also

- [Notification Plugin](../notification-plugin/) - Simple console logging
- [Metrics Plugin](../metrics-plugin/) - Analyze task performance
- [Plugin Development Guide](../../../packages/loopwork/README.md#plugin-development-guide)

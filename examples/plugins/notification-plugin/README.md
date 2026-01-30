# Simple Notification Plugin

A minimal plugin that sends notifications when tasks start and complete.

## What This Plugin Does

The notification plugin demonstrates basic plugin structure and lifecycle hooks. It logs simple messages when:
- The automation loop starts
- Each task starts execution
- Each task completes successfully
- Each task fails
- The automation loop ends

## Key Concepts Demonstrated

1. **Basic Plugin Structure** - Minimal implementation of `LoopworkPlugin` interface
2. **Lifecycle Hooks** - Using `onLoopStart`, `onTaskStart`, `onTaskComplete`, `onTaskFailed`, `onLoopEnd`
3. **Context Objects** - Accessing task information from context
4. **Timestamps** - Tracking when events occur

## Installation

Copy `plugin.ts` to your project and import it:

```typescript
import { compose, defineConfig, withPlugin } from 'loopwork'
import { withJSONBackend } from 'loopwork/backends'
import { createNotificationPlugin } from './plugins/notification-plugin'

export default compose(
  withPlugin(createNotificationPlugin()),
  withJSONBackend()
)(defineConfig({ cli: 'claude' }))
```

## Usage

Run loopwork normally - the plugin will automatically log notifications:

```bash
loopwork start
```

## Example Output

```
[14:32:15] Starting loop: default
[14:32:15] Starting task: TASK-001 (Implement feature)
[14:32:45] Completed: TASK-001 in 30235ms
[14:32:45] Starting task: TASK-002 (Add tests)
[14:33:12] Completed: TASK-002 in 27150ms
[14:33:12] Starting task: TASK-003 (Write docs)
[14:33:45] Failed: TASK-003 - Rate limit exceeded
[14:33:45] Loop complete: 2 completed, 1 failed, 90385ms total
```

## Plugin Breakdown

The plugin consists of:

### `name`
Unique identifier for the plugin. Should be descriptive.

```typescript
name: 'simple-notifications'
```

### `onLoopStart(namespace)`
Called when the automation loop starts. Use for initialization or announcements.

```typescript
async onLoopStart(namespace) {
  const time = new Date().toLocaleTimeString()
  console.log(`[${time}] Starting loop: ${namespace}`)
}
```

### `onTaskStart(context)`
Called before a task is executed. The context includes:
- `task` - The task object with id, title, metadata
- `iteration` - Current iteration number
- `namespace` - Loop namespace
- `startTime` - When the task started

```typescript
async onTaskStart(context) {
  const { task, iteration } = context
  const time = new Date().toLocaleTimeString()
  console.log(`[${time}] Task ${iteration}: ${task.id} (${task.title})`)
}
```

### `onTaskComplete(context, result)`
Called after a task succeeds. The result includes:
- `duration` - Execution time in milliseconds
- `success` - Boolean indicating success
- `output` - Task output (if captured)

```typescript
async onTaskComplete(context, result) {
  const { task } = context
  const time = new Date().toLocaleTimeString()
  console.log(`[${time}] Completed: ${task.id} in ${result.duration}ms`)
}
```

### `onTaskFailed(context, error)`
Called when a task fails. The error parameter contains the failure reason.

```typescript
async onTaskFailed(context, error) {
  const { task } = context
  const time = new Date().toLocaleTimeString()
  console.log(`[${time}] Failed: ${task.id} - ${error}`)
}
```

### `onLoopEnd(stats)`
Called when the loop completes. The stats include:
- `completed` - Number of successfully completed tasks
- `failed` - Number of failed tasks
- `duration` - Total loop duration in milliseconds

```typescript
async onLoopEnd(stats) {
  const time = new Date().toLocaleTimeString()
  console.log(`[${time}] Loop complete: ${stats.completed} completed, ${stats.failed} failed, ${stats.duration}ms total`)
}
```

## Extending This Plugin

### Add Task Status Updates

```typescript
async onTaskStart(context) {
  // Mark task as in-progress in your system
  const { task } = context
  await updateExternalSystem(task.id, { status: 'in_progress' })
}

async onTaskComplete(context) {
  const { task } = context
  await updateExternalSystem(task.id, { status: 'completed' })
}
```

### Send Notifications to External Services

```typescript
async onLoopEnd(stats) {
  // Send to Slack
  await fetch(SLACK_WEBHOOK, {
    method: 'POST',
    body: JSON.stringify({
      text: `Loop complete: ${stats.completed}/${stats.completed + stats.failed} tasks done`
    })
  })
}
```

### Add Colored Output

```typescript
import chalk from 'chalk'

async onTaskComplete(context, result) {
  console.log(chalk.green(`Task completed: ${context.task.id}`))
}

async onTaskFailed(context) {
  console.log(chalk.red(`Task failed: ${context.task.id}`))
}
```

## Error Handling

The plugin doesn't throw errors - it logs them. This is intentional. If something goes wrong in a hook, the plugin registry will catch it and log it without crashing the main loop:

```typescript
async onTaskComplete(context, result) {
  try {
    // Do something that might fail
    await someAsyncOperation()
  } catch (error) {
    // Log but don't throw
    console.error(`Plugin error: ${error}`)
  }
}
```

## Performance Considerations

The notification plugin has minimal performance impact:
- All operations are synchronous (just console logs)
- No file I/O or network requests
- No state accumulation

For production use with many tasks, consider:
- Batching notifications
- Using debug logging mode only
- Offloading heavy operations to background jobs

## See Also

- [Custom Logging Plugin](../logging-plugin/) - Persist logs to files
- [Metrics Plugin](../metrics-plugin/) - Collect and analyze metrics
- [Plugin Development Guide](../../../packages/loopwork/README.md#plugin-development-guide)

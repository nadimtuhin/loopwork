# Plugin Examples

This directory contains practical examples of custom Loopwork plugins. Each example demonstrates different plugin capabilities and use cases.

## Available Examples

### 1. Simple Notification Plugin (`notification-plugin/`)

A minimal plugin that sends notifications when tasks start and complete.

**What it demonstrates:**
- Basic plugin structure
- Using lifecycle hooks (onLoopStart, onTaskStart, onTaskComplete, onLoopEnd)
- Accessing task and context information
- Simple logging

**Use case:** Get notified about task progress in your terminal

**Key features:**
- Logs when loop starts and ends
- Tracks task progress with timestamps
- Displays completion summary

[View Example →](./notification-plugin/)

### 2. Custom Logging Plugin (`logging-plugin/`)

A plugin that collects and persists detailed logs of all tasks.

**What it demonstrates:**
- Storing state within a plugin instance
- Writing files from a plugin
- Handling both success and failure cases
- Creating structured logs

**Use case:** Maintain detailed records of task execution for debugging and auditing

**Key features:**
- Writes JSON log file with task details
- Captures execution duration and status
- Includes error messages for failed tasks
- Appends to existing logs across multiple runs

[View Example →](./logging-plugin/)

### 3. Metrics Collection Plugin (`metrics-plugin/`)

A plugin that collects and reports performance metrics.

**What it demonstrates:**
- Collecting metrics from multiple hooks
- Calculating statistics (average duration, success rate)
- Handling task metadata
- Generating summary reports

**Use case:** Monitor task automation performance and identify bottlenecks

**Key features:**
- Tracks task execution duration
- Calculates success rate
- Reports slowest and fastest tasks
- Detects trends over multiple runs

[View Example →](./metrics-plugin/)

## Quick Start

Each example is self-contained. To use an example:

1. Copy the plugin file to your project
2. Import and register it in your `loopwork.config.ts`
3. Run loopwork

Example:

```typescript
import { compose, defineConfig, withPlugin } from 'loopwork'
import { withJSONBackend } from 'loopwork/backends'
import { createNotificationPlugin } from './examples/plugins/notification-plugin'

export default compose(
  withPlugin(createNotificationPlugin()),
  withJSONBackend()
)(defineConfig({ cli: 'claude' }))
```

## Learning Path

We recommend studying the examples in this order:

1. **Start**: `notification-plugin/` - Understand basic structure
2. **Next**: `logging-plugin/` - Learn state management and file I/O
3. **Advanced**: `metrics-plugin/` - Master metrics collection and reporting

## Extending the Examples

These examples are intentionally simple to be educational. You can extend them to:

- Send notifications to Slack, Discord, or email
- Upload logs to cloud storage (S3, etc.)
- Store metrics in a database
- Integrate with monitoring systems (DataDog, New Relic, etc.)
- Create custom alerts based on metrics

## File Structure

Each example follows this structure:

```
{example-name}/
├── README.md              # Detailed documentation
├── plugin.ts              # Plugin implementation
└── test.ts                # Example usage/test
```

## Common Patterns

### Reading Task Information

```typescript
async onTaskStart(context) {
  const { task, iteration, namespace } = context
  console.log(`[${namespace}] Task: ${task.id} (${task.title})`)
}
```

### Accessing Task Metadata

```typescript
async onTaskComplete(context, result) {
  const metadata = context.task.metadata || {}
  if (metadata.asanaGid) {
    // This task is synced with Asana
  }
}
```

### Storing State

```typescript
let state = { startTime: 0, taskCount: 0 }

return {
  name: 'my-plugin',
  async onLoopStart() {
    state.startTime = Date.now()
    state.taskCount = 0
  },
  async onTaskStart() {
    state.taskCount++
  }
}
```

### Error Handling

```typescript
async onTaskComplete(context, result) {
  try {
    // Do something
  } catch (error) {
    console.error(`Plugin error: ${error}`)
    // Don't throw - plugins must be fault-tolerant
  }
}
```

## Next Steps

After understanding these examples:
- Read the [Plugin Development Guide](../../packages/loopwork/README.md#plugin-development-guide) in the main README
- Check out the [built-in plugins](../../packages/loopwork/src/) for more advanced patterns
- Create your own plugin tailored to your needs

## Need Help?

- Check individual plugin READMEs for detailed explanations
- Review inline code comments
- Refer to the main [Plugin Development Guide](../../packages/loopwork/README.md#plugin-development-guide)
- Open an issue on GitHub

# Metrics Collection Plugin

A plugin that collects and reports comprehensive performance metrics about task execution.

## What This Plugin Does

The metrics plugin demonstrates:
- Collecting data from multiple hooks
- Computing statistics (averages, percentiles, success rates)
- Handling task metadata for advanced analytics
- Generating summary reports with insights

Metrics collected include:
- Total tasks completed/failed
- Success rate percentage
- Task duration statistics (min, max, average, median)
- Tasks by status
- Slowest and fastest tasks
- Failure analysis

## Key Concepts Demonstrated

1. **Multi-Hook Data Collection** - Gathering information from multiple lifecycle points
2. **Statistical Calculations** - Computing min, max, average, median
3. **Task Metadata** - Reading custom fields from task metadata
4. **Report Generation** - Creating human-readable summaries
5. **Trend Detection** - Identifying patterns in task performance

## Installation

Copy `plugin.ts` to your project and import it:

```typescript
import { compose, defineConfig, withPlugin } from 'loopwork'
import { withJSONBackend } from 'loopwork/backends'
import { createMetricsPlugin } from './plugins/metrics-plugin'

export default compose(
  withPlugin(createMetricsPlugin()),
  withJSONBackend()
)(defineConfig({ cli: 'claude' }))
```

## Usage

```bash
loopwork start
```

Metrics are reported when the loop ends.

## Example Output

```
TASK EXECUTION METRICS
====================================

Summary:
  Total Tasks: 10
  Completed: 8 (80.0%)
  Failed: 2 (20.0%)

Duration:
  Min: 5,234ms
  Max: 45,123ms
  Average: 21,456ms
  Median: 19,890ms

Performance:
  Slowest Tasks:
    1. TASK-008: Generate report (45,123ms)
    2. TASK-005: Process data (34,567ms)
    3. TASK-003: Build pipeline (28,901ms)

  Fastest Tasks:
    1. TASK-001: Setup (5,234ms)
    2. TASK-002: Initialize (6,789ms)
    3. TASK-004: Validate (8,123ms)

Failures:
  TASK-009: Network timeout
  TASK-010: Rate limit exceeded
```

## Plugin Breakdown

### Data Collection

The plugin collects metrics throughout execution:

```typescript
const metrics = {
  total: 0,
  completed: 0,
  failed: 0,
  durations: [] as number[],
  tasks: [] as TaskMetrics[],
  failures: [] as FailureMetrics[]
}
```

### Task Metrics

Each task records:

```typescript
interface TaskMetrics {
  id: string
  title: string
  duration: number
  status: 'completed' | 'failed'
  error?: string
}
```

### Hook: onTaskComplete

```typescript
async onTaskComplete(context, result) {
  metrics.completed++
  metrics.total++
  metrics.durations.push(result.duration)

  metrics.tasks.push({
    id: context.task.id,
    title: context.task.title,
    duration: result.duration,
    status: 'completed'
  })
}
```

### Hook: onTaskFailed

```typescript
async onTaskFailed(context, error) {
  metrics.failed++
  metrics.total++

  metrics.failures.push({
    taskId: context.task.id,
    error: error.substring(0, 100) // First 100 chars
  })
}
```

### Report Generation

```typescript
async onLoopEnd(stats) {
  const report = generateReport(metrics)
  console.log(report)
}
```

## Advanced Features

### Success Rate Analysis

```typescript
const successRate = (metrics.completed / metrics.total) * 100
if (successRate < 70) {
  console.warn('WARNING: Success rate below 70%')
}
```

### Duration Percentiles

```typescript
function getPercentile(values: number[], percentile: number): number {
  const sorted = values.sort((a, b) => a - b)
  const index = Math.ceil((percentile / 100) * sorted.length) - 1
  return sorted[Math.max(0, index)]
}

const p95 = getPercentile(metrics.durations, 95)
console.log(`95th percentile: ${p95}ms`)
```

### Task Categorization

```typescript
const byStatus = {
  completed: metrics.tasks.filter(t => t.status === 'completed'),
  failed: metrics.tasks.filter(t => t.status === 'failed')
}

const byFeature = groupBy(metrics.tasks, t => t.metadata?.feature)
```

## Extending This Plugin

### Add Memory Usage Tracking

```typescript
async onLoopStart() {
  const initial = process.memoryUsage()
  metrics.startMemory = initial.heapUsed
}

async onLoopEnd() {
  const final = process.memoryUsage()
  const used = (final.heapUsed - metrics.startMemory) / 1024 / 1024
  console.log(`Memory used: ${used.toFixed(2)}MB`)
}
```

### Export to CSV

```typescript
async onLoopEnd() {
  const csv = metrics.tasks.map(t =>
    `${t.id},${t.title},${t.duration},${t.status}`
  ).join('\n')

  fs.writeFileSync('metrics.csv', csv)
}
```

### Send to Monitoring Service

```typescript
async onLoopEnd() {
  await fetch('https://metrics.example.com/api/tasks', {
    method: 'POST',
    body: JSON.stringify({
      successRate: (metrics.completed / metrics.total) * 100,
      avgDuration: average(metrics.durations),
      timestamp: new Date().toISOString()
    })
  })
}
```

### Track by Metadata

```typescript
async onTaskComplete(context, result) {
  const { feature, priority } = context.task.metadata || {}

  metrics.byFeature[feature] ||= { completed: 0, failed: 0 }
  metrics.byFeature[feature].completed++

  if (priority) {
    metrics.byPriority[priority] ||= { completed: 0, failed: 0 }
    metrics.byPriority[priority].completed++
  }
}
```

## Performance Considerations

The metrics plugin:
- Stores all task durations in memory
- Calculates statistics only at loop end
- Minimal performance impact during execution
- Suitable for 100+ tasks per run

For very high-volume scenarios (1000+ tasks/run):
- Use streaming to a database instead of memory
- Calculate running statistics instead of storing all values
- Implement pagination for report generation

## Error Handling

The plugin handles errors gracefully:

```typescript
async onTaskFailed(context, error) {
  try {
    metrics.failures.push({
      taskId: context.task.id,
      error: error?.substring(0, 200) || 'Unknown error'
    })
  } catch (err) {
    console.error('Metrics error:', err)
  }
}
```

## Useful Utility Functions

The plugin includes helpers for common operations:

```typescript
// Sort and find
function getTopN(tasks: TaskMetrics[], n: number) {
  return tasks.sort((a, b) => b.duration - a.duration).slice(0, n)
}

// Calculate median
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// Format duration
function formatMs(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}
```

## See Also

- [Logging Plugin](../logging-plugin/) - Persist individual task logs
- [Notification Plugin](../notification-plugin/) - Simple status updates
- [Plugin Development Guide](../../../packages/loopwork/README.md#plugin-development-guide)

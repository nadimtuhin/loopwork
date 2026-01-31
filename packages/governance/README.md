# @loopwork-ai/governance

Governance and audit logging plugin for Loopwork task automation framework.

## Features

- **Comprehensive Audit Logging** - Tracks all lifecycle events with timestamps and rich context
- **Flexible Query API** - Query audit logs by event type, task, namespace, date range
- **Export Formats** - Export to JSON or CSV for external analysis
- **Policy Enforcement** - Basic policy engine for governance rules
- **Configurable** - Filter events, control log size, enable/disable features

## Installation

```bash
bun install @loopwork-ai/governance
```

## Usage

### Basic Audit Logging

```typescript
import { defineConfig, compose } from '@loopwork-ai/loopwork'
import { withAuditLogging } from '@loopwork-ai/governance'

export default compose(
  withAuditLogging({
    enabled: true,
    auditDir: '.loopwork/audit/',
  }),
)(defineConfig({
  cli: 'claude',
  maxIterations: 50,
}))
```

### Event Filtering

```typescript
withAuditLogging({
  eventTypes: ['task_start', 'task_complete', 'task_failed'],
  includeDescriptions: true,
})
```

### Log Management

```typescript
withAuditLogging({
  maxFileSizeMb: 10,      // Rotate logs when they exceed 10MB
  maxFiles: 100,          // Keep maximum 100 log files
  compressOldLogs: false,  // Future: compress logs older than retention period
})
```

## Audit Events

The plugin logs the following event types:

| Event Type | Trigger | Data Logged |
|-----------|----------|-------------|
| `loop_start` | Automation loop starts | Namespace, session ID |
| `loop_end` | Automation loop ends | Stats (completed, failed, duration) |
| `task_start` | Task execution begins | Task ID, title, priority, metadata |
| `task_complete` | Task succeeds | Duration, output, success flag |
| `task_failed` | Task fails | Error message, failure context |
| `step_event` | Execution phase change | Step ID, phase, duration |
| `tool_call` | AI tool called | Tool name, arguments |
| `agent_response` | AI model responds | Model, response text, partial flag |

## Audit Log Format

Logs are written in JSONL (JSON Lines) format:

```jsonl
{"id":"audit_1706725800000_abc123","timestamp":"2026-01-31T22:00:00.000Z","eventType":"task_start","taskId":"TASK-001","taskTitle":"Implement feature","namespace":"default","iteration":1,"data":{"status":"pending","priority":"high","description":"Task description"}}
{"id":"audit_1706725850000_def456","timestamp":"2026-01-31T22:00:50.000Z","eventType":"task_complete","taskId":"TASK-001","taskTitle":"Implement feature","namespace":"default","iteration":1,"data":{"duration":5000,"success":true,"output":"Task completed"}}
```

## Querying Audit Logs

```typescript
import { queryAuditLogs, exportAuditLogs } from '@loopwork-ai/governance'

// Query all events
const allEvents = queryAuditLogs('.loopwork/audit/')

// Filter by event type
const taskEvents = queryAuditLogs('.loopwork/audit/', {
  eventType: ['task_start', 'task_complete']
})

// Filter by task
const taskHistory = queryAuditLogs('.loopwork/audit/', {
  taskId: 'TASK-001'
})

// Filter by date range
const recentEvents = queryAuditLogs('.loopwork/audit/', {
  startDate: '2026-01-01T00:00:00Z',
  endDate: '2026-01-31T23:59:59Z'
})

// Limit results
const last10 = queryAuditLogs('.loopwork/audit/', {
  limit: 10
})
```

## Generating Reports

```typescript
import { createAuditQueryManager } from '@loopwork-ai/governance'

const manager = createAuditQueryManager('.loopwork/audit/')

// Get all events
const events = manager.query({})

// Generate summary report
const report = manager.generateReport(events)

console.log('Total events:', report.totalEvents)
console.log('Tasks completed:', report.tasksCompleted)
console.log('Tasks failed:', report.tasksFailed)
console.log('Date range:', report.dateRange)
console.log('Events by type:', report.eventsByType)
console.log('Events by task:', report.eventsByTask)
```

## Exporting Audit Logs

### Export to JSON

```typescript
exportAuditLogs({
  auditDir: '.loopwork/audit/',
  format: 'json',
  outputPath: './audit_export.json',
  query: {
    eventType: ['task_complete', 'task_failed']
  }
})
```

### Export to CSV

```typescript
exportAuditLogs({
  auditDir: '.loopwork/audit/',
  format: 'csv',
  outputPath: './audit_export.csv',
})
```

## Configuration Options

### AuditConfig

```typescript
interface AuditConfig {
  /** Enable/disable audit logging (default: true) */
  enabled?: boolean

  /** Directory to store audit logs (default: '.loopwork/audit/') */
  auditDir?: string

  /** Maximum size per log file in MB (default: 10) */
  maxFileSizeMb?: number

  /** Maximum number of log files to keep (default: 100) */
  maxFiles?: number

  /** Filter which event types to log (default: all) */
  eventTypes?: AuditEvent['eventType'][]

  /** Include task descriptions in audit logs (default: true) */
  includeDescriptions?: boolean

  /** Compress old logs (future feature) */
  compressOldLogs?: boolean
}
```

## Audit Report Structure

```typescript
interface AuditReport {
  /** Total number of events */
  totalEvents: number

  /** Event count grouped by type */
  eventsByType: Record<string, number>

  /** Event count grouped by task */
  eventsByTask: Record<string, number>

  /** Number of successfully completed tasks */
  tasksCompleted: number

  /** Number of failed tasks */
  tasksFailed: number

  /** Date range of logged events */
  dateRange: {
    start: string
    end: string
  }

  /** All events in the report */
  events: AuditEvent[]
}
```

## Log Rotation and Cleanup

The audit log manager automatically:

- **Rotates logs** when a file exceeds `maxFileSizeMb`
- **Keeps recent files** - oldest files are deleted when exceeding `maxFiles`
- **Cleans up old logs** - removes logs older than 30 days (configurable)

### Manual Cleanup

```typescript
import { createAuditLogManager } from '@loopwork-ai/governance'

const manager = createAuditLogManager('.loopwork/audit/')

// Rotate logs now
manager.rotateLogs()

// Clean up logs older than 7 days
manager.cleanupOldLogs(7)
```

## Testing

```bash
# Run all tests
bun test

# Run with coverage
bun test --coverage
```

## Use Cases

### Compliance Auditing

Track all automated actions for regulatory compliance:

```typescript
withAuditLogging({
  eventTypes: ['task_start', 'task_complete', 'task_failed', 'tool_call']
})
```

### Performance Analysis

Analyze task execution times and failure rates:

```typescript
const events = queryAuditLogs('.loopwork/audit/')
const report = generateReport(events)

const avgDuration = events
  .filter(e => e.data.duration)
  .reduce((sum, e) => sum + e.data.duration!, 0) / report.tasksCompleted

const failureRate = report.tasksFailed / (report.tasksCompleted + report.tasksFailed)

console.log('Average task duration:', avgDuration, 'ms')
console.log('Failure rate:', `${(failureRate * 100).toFixed(2)}%`)
```

### Debugging Failed Tasks

Quickly investigate task failures:

```typescript
const failedTasks = queryAuditLogs('.loopwork/audit/', {
  eventType: ['task_failed']
})

failedTasks.forEach(event => {
  console.log(`Task ${event.taskId} failed:`, event.data.error)
  console.log('Context:', event.data.metadata)
})
```

### External System Integration

Export audit logs for external analytics systems:

```typescript
// Daily export for SIEM
exportAuditLogs({
  format: 'csv',
  outputPath: `/logs/audit-${new Date().toISOString().split('T')[0]}.csv`
})

// Real-time streaming for monitoring systems
const events = queryAuditLogs({ limit: 100 })
events.forEach(event => {
  sendToMonitoringSystem(event)
})
```

## Policy Enforcement

The governance package includes a basic policy engine:

```typescript
import { withGovernance } from '@loopwork-ai/governance'

export default compose(
  withGovernance({
    enabled: true,
    rules: {
      maxConcurrentTasks: 5,
      allowedClis: ['claude', 'opencode']
    }
  }),
)(defineConfig({ cli: 'claude' }))
```

## License

MIT

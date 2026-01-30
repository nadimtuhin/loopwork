# @loopwork-ai/ai-monitor

AI-powered log monitoring and auto-healing for Loopwork task automation framework.

## Overview

`@loopwork-ai/ai-monitor` provides intelligent monitoring capabilities that watch your Loopwork task execution, detect failure patterns, and automatically recover from common issues. It uses AI to analyze logs, suggest fixes, and maintain system health.

## Installation

```bash
bun add @loopwork-ai/ai-monitor
```

## Quick Start

```typescript
import { compose, defineConfig } from '@loopwork-ai/loopwork'
import { withJSONBackend } from '@loopwork-ai/loopwork/backends'
import { withAIMonitor } from '@loopwork-ai/ai-monitor'

export default compose(
  withJSONBackend({ tasksFile: '.specs/tasks/tasks.json' }),
  withAIMonitor({
    enabled: true,
    logWatching: true,
    autoHealing: true,
  })
)(defineConfig({
  cli: 'claude',
  maxIterations: 50,
}))
```

## Features

### Circuit Breaker

Automatically detects repeating failures and halts execution to prevent resource waste:

- Tracks failure patterns across tasks
- Configurable failure thresholds
- Time-based reset windows
- Manual recovery options

### Log Watching

Real-time log analysis with pattern detection:

- Monitors CLI output streams
- Detects error patterns and anomalies
- Categorizes issues by severity
- Provides actionable insights

### Task Recovery

Intelligent task failure recovery:

- Analyzes failure context
- Suggests alternative approaches
- Auto-retries with strategy adjustments
- Escalates to human intervention when needed

### Wisdom Capture

Learns from failures to prevent recurrence:

- Records failure patterns and solutions
- Builds knowledge base of fixes
- Shares learnings across task executions
- Exports wisdom for team sharing

## Configuration

```typescript
export interface AIMonitorConfig {
  enabled: boolean
  logWatching?: boolean
  autoHealing?: boolean
  circuitBreaker?: {
    enabled: boolean
    failureThreshold: number
    resetTimeout: number
  }
  wisdomCapture?: {
    enabled: boolean
    outputPath: string
  }
}
```

## API Reference

### Plugin Hooks

- `onLoopStart` - Initialize monitoring session
- `onTaskStart` - Begin task monitoring
- `onTaskComplete` - Analyze task success
- `onTaskFailed` - Analyze failure and attempt recovery
- `onLoopEnd` - Generate monitoring report

### Core Functions

#### `analyzeFailure(context, error)`

Analyzes task failure using AI to determine root cause and suggest fixes.

**Parameters:**
- `context: TaskContext` - Task execution context
- `error: Error` - Failure error object

**Returns:** `FailureAnalysis` with root cause and suggested actions

#### `checkCircuitBreaker(namespace)`

Checks if circuit breaker is open for a namespace.

**Parameters:**
- `namespace: string` - Task namespace to check

**Returns:** `CircuitBreakerState` with status and metrics

#### `captureWisdom(analysis, resolution)`

Records failure and resolution for future reference.

**Parameters:**
- `analysis: FailureAnalysis` - Failure analysis results
- `resolution: Resolution` - How the issue was resolved

**Returns:** `void`

#### `generateReport(stats)`

Generates monitoring report for completed loop.

**Parameters:**
- `stats: LoopStats` - Loop execution statistics

**Returns:** `MonitoringReport` with insights and recommendations

## Examples

### Custom Circuit Breaker Configuration

```typescript
withAIMonitor({
  enabled: true,
  circuitBreaker: {
    enabled: true,
    failureThreshold: 3, // Open after 3 failures
    resetTimeout: 300000, // Reset after 5 minutes
  }
})
```

### Wisdom Export

```typescript
withAIMonitor({
  enabled: true,
  wisdomCapture: {
    enabled: true,
    outputPath: '.loopwork/wisdom.json'
  }
})
```

## CLI Usage

The AI Monitor can be used as a standalone command-line tool:

### Standalone Commands

```bash
# Watch and heal logs in real-time
loopwork ai-monitor --watch

# Watch only, don't execute healing actions
loopwork ai-monitor --dry-run

# Show circuit breaker status
loopwork ai-monitor --status

# Monitor a specific log file
loopwork ai-monitor --log-file /path/to/log.log

# Override log directory
loopwork ai-monitor --log-dir .loopwork/runs

# Monitor a specific namespace
loopwork ai-monitor --namespace my-namespace

# Use a specific LLM model for analysis
loopwork ai-monitor --model opus
```

### Integration with Run/Start Commands

Enable AI Monitor when running loopwork:

```bash
# Run with AI monitoring
loopwork run --with-ai-monitor

# Start with AI monitoring
loopwork start --with-ai-monitor
```

## Testing

```bash
bun test
```

## License

MIT

## Contributing

See the main [Loopwork repository](https://github.com/loopwork-ai/loopwork) for contribution guidelines.

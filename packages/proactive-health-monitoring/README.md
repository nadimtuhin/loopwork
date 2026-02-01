# Proactive Health Monitoring Plugin

A Loopwork plugin that monitors system resources (CPU, Memory), CLI connectivity, and API quotas.

## Installation

```bash
bun add @loopwork-ai/proactive-health-monitoring
```

## Usage

### System Resource Monitoring

In your `loopwork.config.ts`:

```typescript
import { compose, defineConfig } from 'loopwork'
import { withSystemMonitoring } from '@loopwork-ai/proactive-health-monitoring'

export default compose(
  withSystemMonitoring({
    enabled: true,
    intervalMs: 60000,
    cpuThresholdPercent: 90,
    memoryThresholdPercent: 90,
  })
)(defineConfig({
  // ...
}))
```

### Connectivity Monitoring

Monitor CLI tool availability and responsiveness:

```typescript
import { compose, defineConfig } from 'loopwork'
import { withConnectivityMonitoring } from '@loopwork-ai/proactive-health-monitoring'

export default compose(
  withConnectivityMonitoring({
    enabled: true,
    intervalMs: 300000,
    cliTools: ['claude', 'opencode', 'gemini'],
    timeoutMs: 10000,
  })
)(defineConfig({
  // ...
}))
```

### Quota Monitoring

Track API request and token usage:

```typescript
import { compose, defineConfig } from 'loopwork'
import { withQuotaMonitoring } from '@loopwork-ai/proactive-health-monitoring'

export default compose(
  withQuotaMonitoring({
    enabled: true,
    dailyRequestLimit: 1000,
    dailyTokenLimit: 100000,
    warnThresholdPercent: 80,
  })
)(defineConfig({
  // ...
}))
```

### Combined Monitoring

Use all monitors together:

```typescript
import { compose, defineConfig } from 'loopwork'
import { 
  withSystemMonitoring,
  withConnectivityMonitoring,
  withQuotaMonitoring
} from '@loopwork-ai/proactive-health-monitoring'

export default compose(
  withSystemMonitoring({
    enabled: true,
    intervalMs: 60000,
    cpuThresholdPercent: 90,
    memoryThresholdPercent: 90,
  }),
  withConnectivityMonitoring({
    enabled: true,
    intervalMs: 300000,
    cliTools: ['claude', 'opencode'],
  }),
  withQuotaMonitoring({
    enabled: true,
    dailyRequestLimit: 500,
    dailyTokenLimit: 50000,
  })
)(defineConfig({
  // ...
}))
```

## Options

### System Monitoring

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable monitoring |
| `intervalMs` | number | `60000` | Check interval in ms |
| `cpuThresholdPercent` | number | `90` | CPU usage % warning threshold |
| `memoryThresholdPercent` | number | `90` | Memory usage % warning threshold |
| `warnOnHighUsage` | boolean | `true` | Log warning on console |

### Connectivity Monitoring

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable monitoring |
| `intervalMs` | number | `300000` | Check interval in ms (5 minutes) |
| `checkCliTools` | boolean | `true` | Check CLI tool availability |
| `cliTools` | string[] | `['claude', 'opencode', 'gemini']` | CLI tools to monitor |
| `warnOnFailure` | boolean | `true` | Log warning on failures |
| `timeoutMs` | number | `10000` | CLI check timeout |

### Quota Monitoring

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable monitoring |
| `dailyRequestLimit` | number | `1000` | Daily API request limit |
| `dailyTokenLimit` | number | `100000` | Daily token usage limit |
| `warnThresholdPercent` | number | `80` | Usage % warning threshold |
| `warnOnThreshold` | boolean | `true` | Log warning when threshold reached |

## Features

### System Resource Monitor
- Tracks CPU load and memory usage
- Configurable thresholds
- Real-time warnings when resources are constrained
- Prevents system overload during intensive tasks

### Connectivity Monitor
- Checks if CLI tools are installed and accessible
- Verifies CLI responsiveness with version checks
- Tracks response times
- Warns about unavailable or unresponsive tools
- Helps catch broken installations early

### Quota Monitor
- Tracks daily API request counts
- Monitors token consumption
- Warns at configurable usage thresholds
- Automatically resets quotas at midnight
- Prevents unexpected API limit errors
- Provides session summaries

## Testing

```bash
bun test
```


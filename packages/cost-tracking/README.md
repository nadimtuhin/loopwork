# @loopwork-ai/cost-tracking

Cost tracking and budget management plugin for Loopwork task automation framework.

## Features

- **Token Usage Tracking** - Automatically parse and track token usage from AI CLI outputs
- **Cost Calculation** - Real-time cost calculation based on model pricing
- **Daily Budget Caps** - Set maximum daily spending limits
- **Per-Task Budget Caps** - Set maximum cost limits per individual task
- **Budget Enforcement** - Block, warn, or alert when budgets are exceeded
- **Alert Thresholds** - Get warned when approaching budget limits
- **Telemetry Reports** - Generate detailed usage and cost reports
- **Multi-Model Support** - Supports Claude, OpenAI, and Gemini pricing

## Installation

```bash
bun install @loopwork-ai/cost-tracking
```

## Usage

### Basic Cost Tracking

```typescript
import { defineConfig, compose } from '@loopwork-ai/loopwork'
import { withCostTracking } from '@loopwork-ai/cost-tracking'

export default compose(
  withCostTracking({
    enabled: true,
    defaultModel: 'claude-3.5-sonnet',
  }),
)(defineConfig({
  cli: 'claude',
  maxIterations: 50,
}))
```

### Daily Budget Caps

Prevent overspending by setting a daily budget:

```typescript
withCostTracking({
  dailyBudget: 50.00,        // Maximum $50 per day
  budgetAction: 'block',     // 'warn' | 'block' | 'alert'
  alertThreshold: 0.8,       // Warn at 80% of budget
})
```

### Per-Task Budget Caps

Limit costs for individual tasks:

```typescript
withCostTracking({
  perTaskBudget: 5.00,       // Maximum $5 per task
  budgetAction: 'block',     // Block execution if exceeded
})
```

### Combined Budget Configuration

Use both daily and per-task budgets together:

```typescript
withCostTracking({
  dailyBudget: 100.00,       // Daily limit
  perTaskBudget: 10.00,      // Per-task limit
  budgetAction: 'warn',      // Warn but allow
  alertThreshold: 0.75,      // 75% threshold for alerts
})
```

## Budget Actions

The `budgetAction` option controls behavior when budgets are exceeded:

| Action | Behavior |
|--------|----------|
| `'warn'` | Log warnings but allow task execution (default) |
| `'block'` | Throw `BudgetExceededError` and prevent execution |
| `'alert'` | Only alert without blocking or logging warnings |

## Cost Tracker API

For programmatic access to cost tracking:

```typescript
import { CostTracker } from '@loopwork-ai/cost-tracking'

const tracker = new CostTracker('./project', 'my-namespace')

// Record usage manually
const entry = tracker.record('TASK-001', 'claude-3.sonnet', {
  inputTokens: 1000,
  outputTokens: 500,
}, 30, 'success')

// Get task cost summary
const taskCost = tracker.getTaskCost('TASK-001')
console.log(`Task cost: $${taskCost.toFixed(4)}`)

// Check budgets
const dailyCheck = tracker.checkDailyBudget(50.0)
if (!dailyCheck.allowed) {
  console.warn(`Daily budget exceeded: $${dailyCheck.currentCost.toFixed(4)}`)
}

// Validate multiple budgets
const validation = tracker.validateBudgets('TASK-001', {
  dailyBudget: 100.0,
  perTaskBudget: 10.0,
  budgetAction: 'block',
})

if (!validation.allowed) {
  console.warn('Budget validation failed:', validation.warnings)
}
```

## Error Handling

Catch budget exceeded errors:

```typescript
import { BudgetExceededError } from '@loopwork-ai/cost-tracking'

try {
  await runTaskWithBudgetCheck()
} catch (error) {
  if (error instanceof BudgetExceededError) {
    console.error(`${error.budgetType} budget exceeded!`)
    console.error(`Current: $${error.currentCost.toFixed(4)}`)
    console.error(`Limit: $${error.budgetLimit.toFixed(4)}`)
    if (error.taskId) {
      console.error(`Task: ${error.taskId}`)
    }
  }
}
```

## Telemetry and Reporting

Generate detailed usage reports:

```typescript
const report = tracker.getTelemetryReport()

console.log('Total cost:', report.summary.totalCost)
console.log('Tasks completed:', report.summary.successCount)
console.log('Tasks failed:', report.summary.failureCount)

// Cost breakdown by model
for (const [model, stats] of Object.entries(report.byModel)) {
  console.log(`${model}: $${stats.totalCost.toFixed(4)}`)
}

// Recent failures
for (const failure of report.recentFailures) {
  console.log(`${failure.taskId}: ${failure.error}`)
}
```

## Daily Summaries

Get daily cost summaries:

```typescript
// Today's summary
const today = tracker.getTodaySummary()
console.log(`Today: $${today.totalCost.toFixed(4)} for ${today.taskCount} tasks`)

// Last 7 days
const week = tracker.getDailySummaries(7)
for (const day of week) {
  console.log(`${day.date}: $${day.totalCost.toFixed(4)}`)
}

// Date range
const start = new Date('2026-01-01')
const end = new Date('2026-01-31')
const range = tracker.getRangeSummary(start, end)
```

## Model Pricing

View current model pricing:

```typescript
import { MODEL_PRICING } from '@loopwork-ai/cost-tracking'

// Get pricing for a specific model
const claudePricing = MODEL_PRICING['claude-3.5-sonnet']
console.log(`Input: $${claudePricing.inputPer1M} per 1M tokens`)
console.log(`Output: $${claudePricing.outputPer1M} per 1M tokens`)

// Default pricing for unknown models
const defaultPricing = MODEL_PRICING['default']
```

### Supported Models

- **Claude**: `claude-3-opus`, `claude-3-sonnet`, `claude-3-haiku`, `claude-3.5-sonnet`, `claude-3.5-haiku`, `claude-opus-4`, `claude-sonnet-4`
- **OpenAI**: `gpt-4`, `gpt-4-turbo`, `gpt-4o`, `gpt-4o-mini`, `o1`, `o1-mini`
- **Google**: `gemini-1.5-pro`, `gemini-1.5-flash`, `gemini-2.0-flash`

## Configuration Options

### CostTrackingConfig

```typescript
interface CostTrackingConfig {
  /** Enable/disable cost tracking (default: true) */
  enabled?: boolean

  /** Default model for cost calculation (default: 'claude-3.5-sonnet') */
  defaultModel?: string

  /** Maximum daily budget in USD */
  dailyBudget?: number

  /** Alert threshold as percentage of budget (default: 0.8 = 80%) */
  alertThreshold?: number

  /** Maximum cost per individual task in USD */
  perTaskBudget?: number

  /** Maximum cost per user session in USD (reserved for future use) */
  perUserBudget?: number

  /** User identifier for tracking per-user budgets (reserved for future use) */
  userId?: string

  /** Action when budget exceeded: 'warn' | 'block' | 'alert' (default: 'warn') */
  budgetAction?: 'warn' | 'block' | 'alert'
}
```

## Formatting Helpers

Format costs and tokens for display:

```typescript
import { formatCost, formatTokens, formatUsageSummary } from '@loopwork-ai/cost-tracking'

// Format cost
formatCost(0.00123)    // '$0.0012'
formatCost(0.123)      // '$0.123'
formatCost(12.34)      // '$12.34'

// Format tokens
formatTokens(999)      // '999'
formatTokens(1500)     // '1.5K'
formatTokens(1500000)  // '1.50M'

// Format summary
const summary = tracker.getAllTimeSummary()
console.log(formatUsageSummary(summary))
```

## Testing

```bash
# Run all tests
bun test

# Run specific test file
bun test test/budget-enforcement.test.ts
```

## Use Cases

### Development Budget Control

Keep development costs under control:

```typescript
withCostTracking({
  dailyBudget: 25.00,        // $25/day limit for development
  perTaskBudget: 5.00,       // $5 per task
  budgetAction: 'block',     // Hard stop when exceeded
  alertThreshold: 0.9,       // Alert at 90%
})
```

### Production Monitoring

Monitor production usage without blocking:

```typescript
withCostTracking({
  dailyBudget: 500.00,       // Higher production limit
  budgetAction: 'alert',     // Just alert, don't block
  alertThreshold: 0.75,      // Early warning at 75%
})
```

### CI/CD Integration

Track costs in automated pipelines:

```typescript
withCostTracking({
  dailyBudget: 100.00,
  budgetAction: 'warn',      // Log warnings in CI output
  enabled: process.env.CI === 'true',
})
```

## License

MIT

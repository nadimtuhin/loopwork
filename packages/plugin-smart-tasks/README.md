# @loopwork-ai/plugin-smart-tasks

Smart task generation plugin for Loopwork that provides intelligent task suggestions and decomposition.

## Features

- **Test Suggestions**: Automatically suggests test tasks after feature completion
- **Task Decomposition**: Breaks down large tasks into smaller, actionable sub-tasks
- **AI-Powered Analysis**: Uses AI models to analyze task complexity and requirements

## Installation

```bash
bun add @loopwork-ai/plugin-smart-tasks
```

## Usage

### Basic Configuration

```typescript
import { compose, defineConfig } from 'loopwork'
import { withSmartTasks } from '@loopwork-ai/plugin-smart-tasks'

export default compose(
  withSmartTasks({
    enabled: true,
    autoCreate: false,
    maxSuggestions: 3,
    minConfidence: 0.7
  })
)(defineConfig({
  cli: 'claude',
  maxIterations: 50
}))
```

### Preset: Test Suggestions

Automatically suggests test tasks after feature completion:

```typescript
import { withTestSuggestions } from '@loopwork-ai/plugin-smart-tasks'

export default compose(
  withTestSuggestions()
)(defineConfig({ cli: 'claude' }))
```

### Preset: Task Decomposition

Breaks down large tasks into smaller sub-tasks:

```typescript
import { withTaskDecomposition } from '@loopwork-ai/plugin-smart-tasks'

export default compose(
  withTaskDecomposition()
)(defineConfig({ cli: 'claude' }))
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable smart task generation |
| `cli` | string | `'claude'` | CLI tool to use for analysis |
| `model` | string | `undefined` | Model to use (default: sonnet) |
| `autoCreate` | boolean | `false` | Auto-create tasks without approval |
| `maxSuggestions` | number | `3` | Max suggestions per task |
| `minConfidence` | number | `0.7` | Min confidence for auto-creation |
| `features.testSuggestions` | boolean | `true` | Enable test suggestions |
| `features.taskDecomposition` | boolean | `true` | Enable task decomposition |

## How It Works

1. **Task Completion**: When a task completes, the plugin analyzes the result
2. **AI Analysis**: Uses AI to determine if follow-up tasks are needed
3. **Smart Suggestions**: Generates relevant test tasks or decomposed sub-tasks
4. **Approval Flow**: Presents suggestions for review (unless `autoCreate: true`)

## Examples

### Manual Approval Mode

```typescript
withSmartTasks({
  enabled: true,
  autoCreate: false,  // Requires manual approval
  maxSuggestions: 5
})
```

### Automatic Mode

```typescript
withSmartTasks({
  enabled: true,
  autoCreate: true,   // Auto-creates high-confidence suggestions
  minConfidence: 0.8  // Only create if 80%+ confidence
})
```

## License

MIT

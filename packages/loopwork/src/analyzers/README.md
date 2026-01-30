# Task Analyzers

Task analyzers examine CLI execution results and suggest follow-up tasks based on detected patterns.

## PatternAnalyzer

The `PatternAnalyzer` detects common indicators in CLI output that suggest additional work is needed.

### Usage

```typescript
import { PatternAnalyzer } from './analyzers'
import type { Task, PluginTaskResult } from './contracts'

// Create analyzer with default config
const analyzer = new PatternAnalyzer()

// Or with custom config
const customAnalyzer = new PatternAnalyzer({
  enabled: true,
  maxTasksPerAnalysis: 5,
  patterns: ['todo-comment', 'fixme-comment'] // Optional: filter patterns
})

// Analyze a task result
const task: Task = { id: 'TASK-001', ... }
const result: PluginTaskResult = { success: true, output: '...' }

const analysis = await analyzer.analyze(task, result)

if (analysis.shouldCreateTasks) {
  console.log(`Found ${analysis.suggestedTasks.length} follow-up tasks`)
  for (const suggested of analysis.suggestedTasks) {
    console.log(`- [${suggested.priority}] ${suggested.title}`)
  }
}
```

### Detected Patterns

The analyzer detects 6 common patterns:

| Pattern | Priority | Example |
|---------|----------|---------|
| `todo-comment` | medium | `TODO: Add input validation` |
| `fixme-comment` | high | `FIXME: Memory leak in handler` |
| `next-steps` | medium | `Next steps: Deploy to staging` |
| `prerequisite-error` | high | `Error: prerequisite: Install dependencies first` |
| `partial-completion` | medium | `Work in progress: Auth module incomplete` |
| `ai-suggestion` | low | `Consider adding: Error handling` |

### Configuration

```typescript
interface PatternAnalyzerConfig {
  // Enable/disable the analyzer
  enabled?: boolean        // Default: true

  // Maximum tasks to suggest per analysis
  maxTasksPerAnalysis?: number  // Default: 5

  // Filter to specific patterns (empty = all patterns)
  patterns?: string[]      // Default: []
}
```

### Features

- ✅ **Deduplication**: Prevents creating duplicate suggestions
- ✅ **Context extraction**: Includes surrounding output context
- ✅ **Title truncation**: Keeps titles under 60 characters
- ✅ **Priority assignment**: Different patterns have appropriate priorities
- ✅ **Sub-task creation**: Suggests tasks as sub-tasks of parent
- ✅ **Case-insensitive**: Matches patterns regardless of case

### API Methods

#### `analyze(task: Task, result: PluginTaskResult): Promise<TaskAnalysisResult>`

Analyzes a completed task and returns suggested follow-up tasks.

#### `resetSeenPatterns(): void`

Clears the deduplication cache. Useful for testing or new analysis sessions.

#### `getPatternNames(): string[]`

Returns list of active pattern names based on configuration.

### Example Output

```typescript
{
  shouldCreateTasks: true,
  suggestedTasks: [
    {
      title: 'Add unit tests for the new feature',
      description: 'Found TODO comment in output\n\nContext:\n...',
      priority: 'medium',
      isSubTask: true,
      parentId: 'TASK-001'
    }
  ],
  reason: 'Detected 1 potential follow-up task(s) based on output patterns'
}
```

## Integration with Loopwork

The pattern analyzer can be integrated into the task loop to automatically create follow-up tasks:

```typescript
// After task execution
const analysis = await analyzer.analyze(task, result)

if (analysis.shouldCreateTasks) {
  for (const suggested of analysis.suggestedTasks) {
    await backend.createSubTask(task.id, {
      title: suggested.title,
      description: suggested.description,
      priority: suggested.priority
    })
  }
}
```

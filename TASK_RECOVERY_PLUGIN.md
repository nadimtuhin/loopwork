# Task Recovery Plugin

Automatically analyzes task failures and generates recovery plans to help fix issues and complete tasks successfully.

## Features

- **Intelligent Failure Analysis**: Uses AI (Sonnet by default) to understand what went wrong
- **Multiple Recovery Strategies**: Retry with fixes, create recovery tasks, update tests, or skip transient errors
- **Confidence Scoring**: Each recovery plan includes a 0-100 confidence score
- **Root Cause Identification**: Analyzes errors to determine the underlying issue
- **Auto-Recovery Mode**: Optionally execute recovery plans automatically
- **Retry Limiting**: Prevents infinite retry loops with configurable max attempts
- **Failure Context Tracking**: Updates task descriptions with failure history

## Installation

The plugin is included in the core Loopwork package:

```typescript
import { withTaskRecovery } from 'loopwork'
```

## Usage

### Basic Usage (Manual Approval)

```typescript
import { compose, defineConfig, withTaskRecovery } from 'loopwork'
import { withJSONBackend } from 'loopwork/backends'

export default compose(
  withJSONBackend(),
  withTaskRecovery({
    enabled: true,
    autoRecover: false, // Present plans for approval
  }),
)(defineConfig({ cli: 'claude' }))
```

### Auto-Recovery Mode

```typescript
import { withAutoRecovery } from 'loopwork'

export default compose(
  withJSONBackend(),
  withAutoRecovery(), // Automatically execute recovery plans
)(defineConfig({ cli: 'claude' }))
```

### Conservative Mode (Fewer Retries)

```typescript
import { withConservativeRecovery } from 'loopwork'

export default compose(
  withJSONBackend(),
  withConservativeRecovery(), // Manual approval, max 1 retry
)(defineConfig({ cli: 'claude' }))
```

## Configuration

```typescript
interface TaskRecoveryConfig {
  /** Enable task recovery analysis */
  enabled?: boolean

  /** CLI tool to use for failure analysis */
  cli?: 'claude' | 'opencode' | 'gemini'

  /** Model to use (default: sonnet for better reasoning) */
  model?: string

  /** Auto-execute recovery plan without approval */
  autoRecover?: boolean

  /** Maximum number of auto-retry attempts per task */
  maxRetries?: number

  /** Recovery strategies to enable */
  strategies?: {
    /** Retry task with AI-suggested fixes */
    autoRetry?: boolean
    /** Create corrective tasks in backlog */
    createTasks?: boolean
    /** Update or create tests based on failure */
    updateTests?: boolean
    /** Update task description with failure context */
    updateTaskDescription?: boolean
  }

  /** Skip recovery for certain failure types */
  skip?: {
    /** Error message patterns to skip */
    errorPatterns?: RegExp[]
    /** Task title patterns to skip */
    taskPatterns?: RegExp[]
    /** Labels to skip (GitHub backend) */
    labels?: string[]
  }
}
```

## Recovery Plan Types

The AI analyzes failures and recommends one of four recovery types:

### 1. Retry
Suggests fixing the code and retrying the task. Includes specific recommendations for fixes.

The AI receives:
- Task details (ID, title, description)
- Error message
- **Last 2000 characters of CLI output** (stack traces, error messages, etc.)
- Iteration and retry attempt numbers

**Example:**
```
Root Cause: Missing null check on user object
Recommendation: Add defensive null checks before accessing user.name
Confidence: 85%
```

### 2. Create Task
Creates a new corrective task when the issue requires separate investigation or work.

**Example:**
```
Root Cause: Missing database migration for new schema
Recommendation: Create migration task to update schema
New Task: "Create migration for user_preferences table"
Confidence: 90%
```

### 3. Update Test
Suggests updating or creating tests based on the failure.

**Example:**
```
Root Cause: Test expectations don't match new API response format
Recommendation: Update test assertions to match new format
Test Changes: test/api.test.ts - Update response schema expectations
Confidence: 75%
```

### 4. Skip
Indicates a transient or environmental error that doesn't need action.

**Example:**
```
Root Cause: Network timeout - transient connectivity issue
Recommendation: Retry without code changes
Confidence: 95%
```

## Examples

### Skip Certain Error Patterns

```typescript
withTaskRecovery({
  skip: {
    errorPatterns: [
      /timeout/i,
      /cancelled/i,
      /rate limit/i,
    ],
  },
})
```

### Custom Strategy Configuration

```typescript
withTaskRecovery({
  autoRecover: true,
  maxRetries: 3,
  strategies: {
    autoRetry: true,        // Enable retry with fixes
    createTasks: true,      // Create recovery tasks
    updateTests: false,     // Don't update tests automatically
    updateTaskDescription: true, // Track failure history
  },
})
```

### Different AI Models

```typescript
// Fast analysis with Haiku
withTaskRecovery({ model: 'haiku' })

// Detailed analysis with Opus
withTaskRecovery({ model: 'opus' })
```

## How It Works

1. **Task Fails**: When `onTaskFailed` hook triggers
2. **Read Logs**: Automatically reads last 2000 characters from CLI output logs
3. **Check Skip Rules**: Verify if failure should be analyzed
4. **AI Analysis**: Send failure context + log excerpt to AI for analysis
5. **Recovery Plan**: AI generates plan with confidence score
6. **Execute or Present**: Either auto-execute or show to user
7. **Track History**: Record retry attempts and failure context

### Log File Reading

The plugin automatically reads from these locations (in order):
1. `.loopwork/runs/{namespace}/{session}/logs/iteration-{N}-output.txt` - Task-specific output
2. `.loopwork/runs/{namespace}/{session}/loopwork.log` - Session log file

This provides the AI with **actual error messages, stack traces, and CLI output** for accurate root cause analysis.

## Preset Comparison

| Feature | Standard | Auto-Recovery | Conservative |
|---------|----------|---------------|--------------|
| Auto-Execute | No | Yes | No |
| Max Retries | 2 | 3 | 1 |
| Auto-Retry | Yes | Yes | No |
| Create Tasks | Yes | Yes | Yes |
| Update Tests | Yes | Yes | No |
| Update Description | Yes | Yes | No |

## Output Examples

### Manual Approval Mode

```
🔧 Task Recovery Analysis: TASK-001
────────────────────────────────────────────────────────────

Task: Implement user authentication
Retry Attempt: 1

Root Cause: Missing JWT secret in environment variables
Confidence: 90%

Recovery Type: retry
Recommendation: Add JWT_SECRET to .env file and restart server

To enable auto-recovery, add autoRecover: true to your TaskRecovery config
────────────────────────────────────────────────────────────
```

### Auto-Recovery Mode

```
🔍 Analyzing task failure for recovery plan...
✓ Recovery plan generated (create-task, 85% confidence)
ℹ Creating recovery task: Add JWT_SECRET environment variable
  ✓ Created recovery task: TASK-002
```

## Best Practices

1. **Start with Manual Approval**: Use `autoRecover: false` initially to review recommendations
2. **Increase Retries Gradually**: Start with `maxRetries: 2`, increase if needed
3. **Skip Transient Errors**: Add timeout/network patterns to skip list
4. **Use Appropriate Models**: Haiku for speed, Sonnet for balance, Opus for complex failures
5. **Monitor Confidence Scores**: Low confidence (<60%) may indicate unclear failures
6. **Review Failure History**: Check task descriptions for patterns in failures

## Integration with Other Plugins

Works seamlessly with:
- **Smart Tasks Plugin**: Recovery tasks can trigger smart suggestions
- **Documentation Plugin**: Failure context gets documented automatically
- **Git Auto-Commit Plugin**: Recovery fixes can be committed
- **Retry Plugin**: Complements built-in retry with intelligent analysis

## Troubleshooting

**Q: Plugin creates too many recovery tasks**
A: Increase `minConfidence` or use `autoRecover: false` for manual approval

**Q: Max retries exceeded too quickly**
A: Increase `maxRetries` or adjust skip patterns

**Q: AI analysis takes too long**
A: Use `model: 'haiku'` for faster (but less detailed) analysis

**Q: Getting "skip" recommendations too often**
A: Check if error messages contain enough detail for analysis

## Test Coverage

- 30 comprehensive tests
- Coverage includes:
  - Plugin creation and configuration
  - Backend integration
  - Failure filtering and skip rules
  - Retry limiting
  - Recovery strategies
  - Error handling
  - Preset configurations
  - Failure history tracking

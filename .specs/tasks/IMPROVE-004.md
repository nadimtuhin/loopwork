# IMPROVE-004: Improve CLI error handling and user feedback

## Goal
Enhance error handling throughout the CLI to provide helpful, actionable feedback when things go wrong.

## Current State
- Basic error logging exists
- Some errors may not be caught or handled gracefully
- Error messages may not guide users toward solutions

## Common Error Scenarios to Handle

### 1. Missing Config File
**Current:** May crash or show generic error
**Improved:**
```
❌ ERROR: loopwork.config.ts not found

💡 Solution: Run 'npx loopwork init' to create a config file
```

### 2. Invalid Config File
**Current:** TypeScript or runtime error
**Improved:**
```
❌ ERROR: Invalid config file: SyntaxError at line 15

💡 Check your loopwork.config.ts for syntax errors
💡 Example config: https://github.com/nadimtuhin/loopwork#configuration
```

### 3. Missing AI CLI
**Current:** Command not found
**Improved:**
```
❌ ERROR: AI CLI 'claude' not found in PATH

💡 Install Claude Code: https://claude.com/code
💡 Or change CLI in config to 'opencode' or 'gemini'
```

### 4. No Tasks Available
**Current:** May not provide clear feedback
**Improved:**
```
ℹ️  No pending tasks found

💡 Create tasks in .specs/tasks/tasks.json
💡 Or run: npx loopwork task-new
```

### 5. API Rate Limit
**Current:** Generic error
**Improved:**
```
⚠️  Rate limit reached, waiting 60 seconds...

💡 Consider upgrading API tier for higher limits
```

### 6. Task Execution Failure
**Current:** Basic error log
**Improved:**
```
❌ Task TASK-001 failed after 3 retries

Error: Command 'npm test' exited with code 1
Output: [last 10 lines]

💡 Check task requirements in .specs/tasks/TASK-001.md
💡 Run manually: npm test
💡 Skip task: npx loopwork --skip TASK-001
```

## Requirements
- [ ] Audit all error handling in CLI commands
- [ ] Add try-catch blocks where missing
- [ ] Create helpful error messages with:
  - Clear problem description
  - Suggested solutions
  - Relevant documentation links
- [ ] Add error recovery options where possible
- [ ] Log errors to file for debugging
- [ ] Implement graceful shutdown on fatal errors

## Error Handling Utilities to Create
```typescript
// packages/loopwork/src/core/errors.ts
export class LoopworkError extends Error {
  constructor(
    message: string,
    public suggestions: string[],
    public docsUrl?: string
  ) {
    super(message)
  }
}

export function handleError(error: Error): void {
  if (error instanceof LoopworkError) {
    logger.error(error.message)
    error.suggestions.forEach(s => logger.info(`💡 ${s}`))
    if (error.docsUrl) logger.info(`📚 ${error.docsUrl}`)
  } else {
    logger.error(error.message)
    logger.debug(error.stack)
  }
}
```

## Acceptance Criteria
- All CLI commands have error handling
- Errors provide actionable feedback
- Users can recover from common errors
- Error logs help with debugging
- No uncaught exceptions in normal usage

## Testing
- Add tests for error scenarios
- Verify error messages are helpful
- Test error recovery flows

# IMPROVE-005: Add CLI progress indicators for long-running operations

## Goal
Improve user experience by adding visual progress indicators for operations that take more than a few seconds.

## Current State
- Long operations run silently
- Users don't know if the CLI is working or frozen
- No indication of progress during task execution

## Operations Needing Progress Indicators

### 1. Task Execution
**Current:** Silent execution
**Improved:**
```
⏳ Running task AUTH-001: Implement user authentication
   [=====>    ] 50% (iteration 5/10)
   Model: claude-3.5-sonnet | Elapsed: 45s
```

### 2. Init Command
**Current:** Immediate output
**Improved:**
```
✓ Created loopwork.config.ts
✓ Created .gitignore
✓ Created README.md
⏳ Creating task templates...
✓ Setup complete!
```

### 3. File Operations
**Current:** No feedback
**Improved:**
```
⏳ Reading task files... (15 files)
✓ Loaded 15 tasks
```

### 4. API Calls
**Current:** Waiting silently
**Improved:**
```
⏳ Fetching GitHub issues...
✓ Found 23 tasks
```

## Implementation Options

### Option 1: ora (Recommended)
```typescript
import ora from 'ora'

const spinner = ora('Running task...').start()
// do work
spinner.succeed('Task completed!')
```

### Option 2: Custom Spinner
```typescript
// Simpler, no dependencies
export class Spinner {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  private interval: NodeJS.Timer

  start(text: string): void {
    let i = 0
    this.interval = setInterval(() => {
      process.stdout.write(`\r${this.frames[i]} ${text}`)
      i = (i + 1) % this.frames.length
    }, 80)
  }

  stop(text: string, symbol = '✓'): void {
    clearInterval(this.interval)
    process.stdout.write(`\r${symbol} ${text}\n`)
  }
}
```

## Requirements
- [ ] Add progress indicators for operations > 2 seconds
- [ ] Choose spinner library (ora or custom)
- [ ] Add to package.json if using ora
- [ ] Implement spinner wrapper in utils
- [ ] Add spinners to:
  - Task execution loop
  - Init command file operations
  - Backend initialization
  - API calls (GitHub, Asana, etc.)
- [ ] Handle terminal width for long messages
- [ ] Disable spinners in non-TTY environments
- [ ] Disable spinners in debug mode (show full logs)

## UI/UX Guidelines
- Use subtle animations (not distracting)
- Show elapsed time for long operations (> 10s)
- Use appropriate symbols:
  - ⏳ In progress
  - ✓ Success
  - ✗ Error
  - ⚠️ Warning
  - ℹ️ Info
- Clear spinner before showing errors
- Don't hide important log messages

## Acceptance Criteria
- Spinners work in TTY environments
- Spinners auto-disable in CI/non-TTY
- All long operations have indicators
- Error messages still visible
- Debug mode shows full logs (no spinners)

## Example Output
```
⏳ Loopwork starting...
✓ Config loaded
✓ Backend initialized (JSON: 5 tasks)
⏳ Running task AUTH-001: Implement user authentication
   [=====>    ] 50% | claude-3.5-sonnet | 45s elapsed

✓ Task AUTH-001 completed in 1m 23s
✓ Loop finished: 1 completed, 0 failed
```

## Testing
- Test in TTY and non-TTY environments
- Verify spinners don't break logs
- Test error handling during spinner
- Verify cleanup on process exit

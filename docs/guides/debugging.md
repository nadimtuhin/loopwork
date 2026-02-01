# Loopwork Debugger

The Loopwork debugger provides breakpoint-based debugging for the task loop with support for:
- Pausing execution at specific events
- Inspecting task context and state
- Stepping through events
- **Edit & Continue** - Modify AI prompts before execution

## Quick Start

```typescript
import { Debugger } from 'loopwork/core/debugger'
import { CliExecutor } from 'loopwork/core/cli'

// Create debugger instance
const debugger = new Debugger()
debugger.setEnabled(true)

// Add breakpoint
debugger.addBreakpoint({
  eventType: 'PRE_PROMPT',
  enabled: true
})

// Use with CliExecutor
const executor = new CliExecutor(config, { debugger })
```

## Available Events

- `LOOP_START` - When task loop begins
- `LOOP_END` - When task loop completes
- `TASK_START` - Before task execution
- `PRE_TASK` - Before task plugins run
- `POST_TASK` - After task completes
- `PRE_PROMPT` - Before AI prompt is sent (supports edit)
- `TOOL_CALL` - When AI invokes a tool
- `ERROR` - When an error occurs

## Interactive Commands

When paused at a breakpoint:

| Command | Alias | Description |
|---------|-------|-------------|
| `continue` | `c` | Resume execution |
| `step` | `s` | Step to next event |
| `inspect` | `i` | Show current state |
| `breakpoint <event>` | `b`, `bp` | Toggle breakpoint |
| `list` | `l` | List all breakpoints |
| `edit` | `e` | Edit prompt in $EDITOR (PRE_PROMPT only) |
| `help` | `h`, `?` | Show help |
| `quit` | `q` | Exit debugger |

## Edit & Continue

At `PRE_PROMPT` breakpoints, you can edit the AI prompt before execution:

1. Hit breakpoint at `PRE_PROMPT` event
2. Type `edit` or `e`
3. Your `$EDITOR` opens with the prompt
4. Make changes and save
5. Close editor
6. Modified prompt is used for execution

### Example Session

```
DEBUGGER PAUSED

Event: PRE_PROMPT
Task: TASK-001
Iteration: 1

Prompt Preview:
Fix the authentication bug in login.ts
...

debug> edit
Opening prompt in vim...
Prompt modified successfully
Continuing execution with modified prompt...
```

### Safeguards

- Empty prompts are rejected (original used)
- Invalid edits are rejected
- Temp file is automatically cleaned up
- Only works at PRE_PROMPT breakpoints

## Programmatic Usage

```typescript
// Enable debugger
debugger.setEnabled(true)

// Add conditional breakpoint
debugger.addBreakpoint({
  eventType: 'ERROR',
  taskId: 'TASK-001', // Only break for this task
  enabled: true,
  condition: (event) => event.data?.severity === 'high'
})

// Listen to state changes
debugger.addListener({
  onPause: () => console.log('Paused!'),
  onResume: () => console.log('Resumed!'),
})

// Set task context for inspection
debugger.setContext(taskContext)

// Check if prompt was modified
const modifiedPrompt = debugger.getAndClearModifiedPrompt()
```

## Integration with CliExecutor

The `CliExecutor` automatically:
1. Emits `PRE_PROMPT` events with full prompt content
2. Checks for modified prompts after debugger returns
3. Uses modified prompt if edit-and-continue was used
4. Passes modified prompt to both Claude and OpenCode CLIs

## Environment Variables

- `EDITOR` - Editor to use for edit-and-continue (default: `vi`)
- `VISUAL` - Alternative editor variable

## Best Practices

1. **Use PRE_PROMPT for prompt inspection** - See exactly what the AI receives
2. **Use edit for quick iterations** - Modify prompts without restarting
3. **Add task-specific breakpoints** - Debug specific tasks only
4. **Use step mode for fine-grained control** - Step through each event
5. **Clean up breakpoints** - Disable when not needed

## Implementation Details

- **Files:**
  - `src/contracts/debugger.ts` - Type definitions
  - `src/core/debugger.ts` - Main Debugger class
  - `src/core/debugger-tui.ts` - Interactive TUI
  - `src/core/cli.ts` - Integration point

- **Tests:**
  - `test/debugger.test.ts` - Core functionality
  - `test/debugger-tui.test.ts` - TUI and edit features

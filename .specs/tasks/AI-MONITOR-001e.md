# AI-MONITOR-001e: Task Recovery Integration

## Goal
Integrate the existing task recovery module into the AI Monitor's `onTaskFailed` lifecycle hook to automatically analyze early task exits and enhance task context (PRD, tests, docs) for retry.

## Context
The task recovery functionality is already implemented in `src/ai-monitor/task-recovery.ts` with full test coverage. It includes:
- Exit reason detection (vague_prd, missing_tests, missing_context, scope_large, wrong_approach)
- PRD enhancement generation
- Test scaffolding creation
- Subtask splitting

Currently, the AI Monitor has a comment in `onTaskFailed` (line 260-262 in `src/ai-monitor/index.ts`) indicating where task recovery should be integrated, but it's not yet implemented.

## Requirements

### 1. Integrate Task Recovery into onTaskFailed Hook
- [x] Import `analyzeEarlyExit` and `enhanceTask` functions from `./task-recovery`
- [x] In `onTaskFailed` hook, collect recent log lines (last 50 lines from log file)
- [x] Call `analyzeEarlyExit` to analyze the failure
- [x] Call `enhanceTask` to apply the enhancements
- [x] Handle errors gracefully (log warnings but don't crash)
- [x] Respect circuit breaker state (don't enhance if circuit is open)

### 2. Add Configuration Options
- [x] Add `taskRecovery` section to `AIMonitorConfig`:
  - `enabled: boolean` (default: true)
  - `maxLogLines: number` (default: 50)
  - `minFailureCount: number` (default: 1) - only enhance after N failures

### 3. Track Recovery History
- [x] Add `recoveryHistory` to `MonitorState`:
  - Track which tasks have been enhanced
  - Store timestamp and exit reason
  - Prevent duplicate enhancements for same task/reason pair
- [x] Save/load recovery history with monitor state
- [x] Add stats for recovery attempts (success/failure counts)

### 4. Integration Test
- [x] Create integration test in `test/ai-monitor/core.test.ts`
- [x] Test scenario: mock task failure → recovery triggered → PRD enhanced
- [x] Verify circuit breaker integration (no recovery when circuit open)
- [x] Verify duplicate prevention (same task not enhanced twice)

## Key Files
- `packages/loopwork/src/ai-monitor/index.ts` - Main integration point (onTaskFailed hook)
- `packages/loopwork/src/ai-monitor/task-recovery.ts` - Existing recovery module
- `packages/loopwork/src/ai-monitor/types.ts` - Type definitions
- `packages/loopwork/test/ai-monitor/core.test.ts` - Integration tests

## Implementation Notes

### Reading Recent Logs
Since the monitor has access to `this.logFile`, we can read the last N lines:
```typescript
private async getRecentLogs(maxLines: number = 50): Promise<string[]> {
  if (!this.logFile || !fs.existsSync(this.logFile)) {
    return []
  }

  const content = fs.readFileSync(this.logFile, 'utf-8')
  const lines = content.split('\n').filter(line => line.trim())
  return lines.slice(-maxLines)
}
```

### Preventing Duplicate Enhancements
Track enhanced tasks in state:
```typescript
interface RecoveryHistoryEntry {
  taskId: string
  exitReason: ExitReason
  timestamp: number
  success: boolean
}

// Check before enhancing:
const key = `${taskId}:${analysis.exitReason}`
if (this.state.recoveryHistory[key]) {
  logger.debug(`Task ${taskId} already enhanced for ${analysis.exitReason}`)
  return
}
```

### Configuration Example
```typescript
withAIMonitor({
  enabled: true,
  taskRecovery: {
    enabled: true,
    maxLogLines: 50,
    minFailureCount: 1
  }
})
```

## Success Criteria
- [x] Task recovery triggered automatically in `onTaskFailed` hook
- [x] Configuration options work as expected
- [x] Recovery history prevents duplicate enhancements
- [x] Circuit breaker integration prevents recovery when circuit open
- [x] No type errors (`bun run type-check`)
- [x] All existing tests still pass
- [x] New integration test verifies full data path
- [x] Code follows project conventions (no semicolons, single quotes)

## Testing Strategy

### Unit Tests (Already Exist)
- `test/ai-monitor/task-recovery.test.ts` (30 tests) - Already passing
- `test/ai-monitor/circuit-breaker.test.ts` (12 tests) - Already passing

### Integration Test (New)
Add to `test/ai-monitor/core.test.ts`:
```typescript
describe('Task Recovery Integration', () => {
  test('should enhance task on failure', async () => {
    // Setup: Create mock backend with task
    // Setup: Create AI Monitor with recovery enabled
    // Action: Trigger onTaskFailed with mock logs
    // Verify: analyzeEarlyExit called with correct logs
    // Verify: enhanceTask called with analysis
    // Verify: Recovery history updated
  })

  test('should respect circuit breaker', async () => {
    // Setup: Open circuit breaker (3 failures)
    // Action: Trigger onTaskFailed
    // Verify: Recovery NOT triggered
  })

  test('should prevent duplicate enhancements', async () => {
    // Action: Trigger onTaskFailed twice for same task/reason
    // Verify: Enhancement only happens once
  })
})
```

## Non-Goals
- Not implementing new recovery strategies (use existing ones)
- Not modifying core task recovery logic
- Not adding UI/CLI commands for recovery (future task)
- Not implementing LLM-based recovery analysis (use pattern-based only)

## Dependencies
- Existing task-recovery module (AI-MONITOR-001d - completed)
- Circuit breaker (AI-MONITOR-001c - completed)
- AI Monitor core infrastructure (AI-MONITOR-001a - completed)

## References
- Parent task: AI-MONITOR-001 (Intelligent Log Watcher & Auto-Healer)
- Related: AI-MONITOR-001d (Auto-Create PRD Action)
- Integration check in tasks.json: Line 315-325

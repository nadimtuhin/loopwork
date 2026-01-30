# PROC-001c: Process Management - OrphanDetector (Find Rogue Processes)

## Goal

Implement OrphanDetector that scans for orphaned loopwork processes using three detection methods:
1. **Registry-Parent Check**: Processes in registry but parent PID is dead
2. **Pattern Scan**: Processes matching loopwork patterns not in registry
3. **Stale Timeout**: Processes running > 2x configured timeout without activity

## Requirements

### 1. Create OrphanDetector Class

Create `/Users/nadimtuhin/opensource/loopwork/packages/loopwork/src/core/process-management/orphan-detector.ts` with:

```typescript
class OrphanDetector {
  constructor(
    registry: ProcessRegistry,
    patterns: string[],
    staleTimeoutMs: number
  )

  scan(): Promise<OrphanInfo[]>
  private detectDeadParents(): OrphanInfo[]
  private detectUntrackedProcesses(): Promise<OrphanInfo[]>
  private detectStaleProcesses(): OrphanInfo[]
  private scanRunningProcesses(): ProcessInfo[]
  private parseUnixProcesses(output: string): ProcessInfo[]
  private parseWindowsProcesses(output: string): ProcessInfo[]
  private isProcessAlive(pid: number): boolean
}
```

### 2. Detection Methods

#### Method 1: Registry-Parent Check
- Query ProcessRegistry for all tracked processes
- For each process, check if parent PID is still alive
- Use `process.kill(pid, 0)` to test existence without killing
- Mark as orphan with reason 'parent-dead' if parent is gone

#### Method 2: Pattern Scan
- Execute platform-specific process listing command:
  - **Unix/Mac**: `ps -eo pid,ppid,command`
  - **Windows**: `tasklist /FO CSV /NH`
- Parse output to extract running processes
- Filter by patterns (e.g., 'claude', 'opencode', 'loopwork')
- Cross-reference with registry to find untracked matches
- Mark as orphan with reason 'untracked'

#### Method 3: Stale Timeout
- Query ProcessRegistry for all tracked processes
- Calculate running time: `Date.now() - process.startTime`
- If running time > staleTimeoutMs * 2, mark as stale
- Mark as orphan with reason 'stale'

### 3. Default Patterns

```typescript
const DEFAULT_PATTERNS = [
  'claude --print',
  'opencode run',
  'loopwork'
]
```

### 4. Platform Support

- **Unix/Mac**: Use `ps -eo pid,ppid,command`
- **Windows**: Use `tasklist /FO CSV /NH`
- Graceful fallback if command fails (return empty, don't crash)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      OrphanDetector                              │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  scan()                                                 │    │
│  │    ├─▶ detectDeadParents()        [Method 1]          │    │
│  │    ├─▶ detectUntrackedProcesses() [Method 2]          │    │
│  │    └─▶ detectStaleProcesses()     [Method 3]          │    │
│  └────────────────────────────────────────────────────────┘    │
│           │                      │                      │        │
│           ▼                      ▼                      ▼        │
│  ┌───────────────┐     ┌───────────────┐     ┌───────────────┐│
│  │ProcessRegistry│     │ps/tasklist    │     │Time Check     ││
│  └───────────────┘     └───────────────┘     └───────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Checklist

- [x] Create `src/core/process-management/orphan-detector.ts`
- [x] Implement `scan()` with all three detection methods
- [x] Implement `detectDeadParents()` using registry and alive check
- [x] Implement `detectUntrackedProcesses()` with ps/tasklist
- [x] Implement `detectStaleProcesses()` with time comparison
- [x] Implement `scanRunningProcesses()` with platform detection
- [x] Implement `parseUnixProcesses()` for ps output
- [x] Implement `parseWindowsProcesses()` for tasklist output
- [x] Implement `isProcessAlive()` using signal 0
- [x] Add proper error handling for command failures
- [x] Deduplicate orphans by PID in scan() results
- [x] Export OrphanInfo interface from contracts

## Testing Strategy

Tests verify:

1. **Dead Parent Detection**
   - Process with dead parent PID is detected
   - Process with alive parent is not flagged
   - Handles missing parent PID gracefully

2. **Pattern Matching**
   - Untracked process matching pattern is detected
   - Tracked process matching pattern is not flagged
   - Non-matching processes are ignored

3. **Stale Detection**
   - Process exceeding staleTimeout * 2 is detected
   - Process within timeout is not flagged
   - Time calculation is correct

4. **Platform Support**
   - Unix ps command output parsed correctly
   - Windows tasklist output parsed correctly
   - Command failures handled gracefully

5. **Deduplication**
   - Same process detected by multiple methods only appears once
   - Deduplication preserves first detection reason

## Success Criteria

- [x] `OrphanDetector` class implemented in `core/process-management/orphan-detector.ts`
- [x] All three detection methods working correctly
- [x] Platform-specific process scanning (Unix + Windows)
- [x] Proper error handling for command failures
- [x] Deduplication of orphan results
- [x] OrphanInfo interface exported from contracts
- [x] No TypeScript errors (`bun run build`)
- [x] All tests pass (`bun test test/orphan-management.test.ts`)

## Integration Points

This task integrates with:
- **PROC-001b**: Uses ProcessRegistry to query tracked processes
- **PROC-001d**: ProcessCleaner will consume OrphanInfo[] for cleanup
- **contracts/process-manager.ts**: Uses OrphanInfo, ProcessInfo types

## Security Considerations

1. **Only scan own processes**: Filter by patterns to avoid flagging unrelated processes
2. **Safe alive check**: Use signal 0 (doesn't kill, just checks existence)
3. **No false positives**: Multiple detection methods increase confidence
4. **Graceful degradation**: If ps/tasklist fails, return empty (don't crash)

## Notes

- Follow project conventions: no semicolons, single quotes, 2-space indent
- Use `execSync` for synchronous process listing
- Log warnings if platform commands fail
- Stale threshold is 2x the configured timeout (conservative approach)
- Deduplication ensures same process only reported once even if multiple methods flag it

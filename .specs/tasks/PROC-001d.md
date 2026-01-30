# PROC-001d: Process Management - ProcessCleaner (Kill Orphans Safely)

## Goal
Implement ProcessCleaner that safely terminates orphan processes using graceful shutdown sequence, proper logging, and registry updates.

## Requirements

### Core Functionality
- Implement ProcessCleaner class in `src/core/process-management/process-cleaner.ts`
- Accept list of orphan process PIDs to terminate
- Use graceful shutdown sequence: SIGTERM → wait 5s → SIGKILL
- Log all cleanup actions for audit trail
- Update ProcessRegistry after successful cleanup

### Graceful Shutdown Sequence
1. Send SIGTERM signal to process
2. Wait 5000ms for graceful termination
3. Check if process still exists
4. If still running, send SIGKILL
5. Verify process termination

### Error Handling
- Handle cases where process doesn't exist (already terminated)
- Handle permission errors (EPERM)
- Handle cases where SIGKILL fails
- Never throw errors that break the cleanup loop
- Log all errors but continue with remaining processes

### Logging Requirements
- Log when SIGTERM is sent
- Log when waiting for graceful shutdown
- Log when SIGKILL is needed
- Log when process successfully terminated
- Log when process was already gone
- Log any errors encountered

### Registry Integration
- Remove successfully terminated processes from registry
- Keep failed terminations in registry with error metadata
- Persist registry changes to disk after cleanup

## Architecture

### Pattern
Cleaner pattern with graceful shutdown sequence

### Dependencies
- ProcessRegistry (for tracking and updates)
- Node.js process module (for kill signals)
- Logger utility

### Interface
```typescript
interface ProcessCleaner {
  cleanup(pids: number[]): Promise<CleanupResult>
  cleanupOne(pid: number): Promise<boolean>
}

interface CleanupResult {
  cleaned: number[]
  failed: Array<{ pid: number; error: string }>
  alreadyGone: number[]
}
```

## Integration Check

### Data Flow
ProcessCleaner.cleanup(orphans) → SIGTERM → wait → SIGKILL → update registry

### Critical Seams
1. Signal sending (process.kill)
2. Wait timeout (setTimeout/Promise)
3. Registry update (ProcessRegistry.remove)

### Test Required
Integration test: orphan process → cleaner kills → registry updated → process gone

## Success Criteria
- [ ] ProcessCleaner class implemented in `src/core/process-management/process-cleaner.ts`
- [ ] Graceful shutdown sequence works (SIGTERM → wait → SIGKILL)
- [ ] All cleanup actions are logged
- [ ] Registry is updated after cleanup
- [ ] Error handling prevents cleanup loop breakage
- [ ] Unit tests verify all cleanup scenarios
- [ ] No type errors (`bun run type-check`)

## Implementation Notes
- Use async/await for timeout handling
- Check process existence with process.kill(pid, 0) which returns true if process exists
- Handle ESRCH error (process not found) gracefully
- Use proper TypeScript types for all interfaces
- Follow project conventions (no semicolons, single quotes, 2-space indent)

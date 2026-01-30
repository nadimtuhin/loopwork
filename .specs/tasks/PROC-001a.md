# PROC-001a: Process Management - IProcessManager Interface (Dependency Inversion)

## Goal

Define the `IProcessManager` interface and refactor `CliExecutor` to depend on this interface instead of directly using Node's `child_process.spawn()`. This enables dependency injection for testing and establishes a clean contract for process management.

## Requirements

### 1. Define IProcessManager Interface

Create `/Users/nadimtuhin/opensource/loopwork/packages/loopwork/src/contracts/process-manager.ts` with:

```typescript
interface IProcessManager {
  spawn(command: string, args: string[], options?: SpawnOptions): ChildProcess
  kill(pid: number, signal?: NodeJS.Signals): boolean
  track(pid: number, metadata: ProcessMetadata): void
  untrack(pid: number): void
  listChildren(): ProcessInfo[]
  cleanup(): Promise<CleanupResult>
}

interface ProcessMetadata {
  command: string
  args: string[]
  namespace: string
  taskId?: string
  startTime: number
}

interface ProcessInfo extends ProcessMetadata {
  pid: number
  status: 'running' | 'stopped' | 'orphaned' | 'stale'
}

interface CleanupResult {
  cleaned: number[]
  failed: number[]
  errors: Array<{ pid: number; error: string }>
}
```

### 2. Create MockProcessManager for Testing

Create `/Users/nadimtuhin/opensource/loopwork/packages/loopwork/src/core/process-management/mock-process-manager.ts`:

- Implements `IProcessManager` interface
- Returns mock `ChildProcess` objects
- Tracks method calls for verification
- No real process spawning

### 3. Refactor CliExecutor

Update `/Users/nadimtuhin/opensource/loopwork/packages/loopwork/src/core/cli.ts`:

- Add `processManager: IProcessManager` parameter to constructor
- Replace direct `spawn()` calls with `this.processManager.spawn()`
- Track spawned processes using `this.processManager.track()`
- Maintain backward compatibility temporarily by defaulting to a basic implementation

### 4. Export from contracts/index.ts

Add exports for:
- `IProcessManager`
- `ProcessMetadata`
- `ProcessInfo`
- `CleanupResult`

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CliExecutor                               │
│  (depends on IProcessManager interface, not implementation)      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     IProcessManager                              │
│  interface {                                                     │
│    spawn(cmd, args, opts): ChildProcess                         │
│    kill(pid, signal): boolean                                   │
│    track(pid, metadata): void                                   │
│    listChildren(): ProcessInfo[]                                │
│    cleanup(): Promise<void>                                     │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│   ProcessManagerImpl    │     │   MockProcessManager    │
│   (production)          │     │   (testing)             │
│   [PROC-001b]           │     │   [this task]           │
└─────────────────────────┘     └─────────────────────────┘
```

## Implementation Checklist

- [ ] Create `src/contracts/process-manager.ts` with all interface definitions
- [ ] Export types from `src/contracts/index.ts`
- [ ] Create `src/core/process-management/` directory
- [ ] Create `src/core/process-management/mock-process-manager.ts`
- [ ] Refactor `CliExecutor` constructor to accept `IProcessManager`
- [ ] Update `CliExecutor.execute()` to use `processManager.spawn()`
- [ ] Update `CliExecutor.killProcess()` to use `processManager.kill()`
- [ ] Add process tracking after spawn

## Testing Strategy

Unit tests will be created in PROC-001e. For this task, verify:

1. TypeScript compilation passes (`bun run build` or `tsc --noEmit`)
2. Existing tests still pass (no breaking changes)
3. `MockProcessManager` correctly implements `IProcessManager`

## Success Criteria

- [ ] `IProcessManager` interface defined in `contracts/process-manager.ts`
- [ ] All required types exported from `contracts/index.ts`
- [ ] `MockProcessManager` implements the interface
- [ ] `CliExecutor` accepts `IProcessManager` in constructor
- [ ] `CliExecutor` uses interface methods instead of direct `spawn()`
- [ ] No TypeScript errors (`bun --cwd packages/loopwork run type-check`)
- [ ] Existing tests pass (`bun --cwd packages/loopwork test`)

## Notes

- This task focuses on defining contracts and setting up dependency injection
- Actual `ProcessManagerImpl` with registry/detection/cleanup will be in PROC-001b-d
- Maintain backward compatibility during transition
- Follow project conventions: no semicolons, single quotes, 2-space indent

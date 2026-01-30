# PROC-001: Process Management - Robust Child Process Lifecycle & Orphan Cleanup

## Goal

Implement robust child process management with proper lifecycle tracking, orphan detection, and cleanup. Use dependency inversion pattern for testability and clean architecture.

## Problem Statement

Currently, loopwork spawns CLI processes (claude, opencode) but lacks:
1. **Process tracking** - No registry of spawned child processes
2. **Orphan detection** - If parent crashes, child processes become orphans
3. **Cleanup mechanism** - No way to clean up stale/orphan processes
4. **Testability** - CliExecutor directly uses spawn, hard to unit test

## Architecture

### Dependency Inversion Pattern

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
└─────────────────────────┘     └─────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Components                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ProcessRegistry│  │OrphanDetector│  │ProcessCleaner│          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### Component Details

#### 1. IProcessManager Interface

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
```

#### 2. ProcessRegistry

- Tracks all spawned child processes
- Persists to `.loopwork/processes.json`
- Loads on startup for crash recovery
- Fields: pid, command, args, startTime, parentPid, namespace, status

```typescript
class ProcessRegistry {
  private processes: Map<number, ProcessInfo>
  private storagePath: string

  add(pid: number, metadata: ProcessMetadata): void
  remove(pid: number): void
  get(pid: number): ProcessInfo | undefined
  list(): ProcessInfo[]
  listByNamespace(namespace: string): ProcessInfo[]
  persist(): Promise<void>
  load(): Promise<void>
}
```

#### 3. OrphanDetector

Detects orphaned processes using three methods:

1. **Registry-Parent Check**: Process in registry but parent PID dead
2. **Pattern Scan**: Running processes matching loopwork patterns not in registry
3. **Stale Timeout**: Process running > 2x configured timeout without activity

```typescript
class OrphanDetector {
  constructor(
    private registry: ProcessRegistry,
    private patterns: string[],
    private staleTimeoutMs: number
  )

  scan(): Promise<OrphanInfo[]>
  private checkParentAlive(parentPid: number): boolean
  private scanRunningProcesses(): Promise<ProcessInfo[]>
  private isStale(process: ProcessInfo): boolean
}

interface OrphanInfo {
  pid: number
  reason: 'parent-dead' | 'untracked' | 'stale'
  process: ProcessInfo
}
```

#### 4. ProcessCleaner

Safely terminates orphan processes:

```typescript
class ProcessCleaner {
  constructor(
    private registry: ProcessRegistry,
    private gracePeriodMs: number = 5000
  )

  cleanup(orphans: OrphanInfo[]): Promise<CleanupResult>
  private gracefulKill(pid: number): Promise<boolean>
  private forceKill(pid: number): boolean

  // Shutdown sequence:
  // 1. SIGTERM
  // 2. Wait gracePeriodMs
  // 3. SIGKILL if still alive
}

interface CleanupResult {
  cleaned: number[]
  failed: number[]
  errors: Array<{ pid: number; error: string }>
}
```

### Storage Format

`.loopwork/processes.json`:

```json
{
  "version": 1,
  "parentPid": 12345,
  "processes": [
    {
      "pid": 12346,
      "command": "claude",
      "args": ["--print", "-p", "..."],
      "namespace": "default",
      "taskId": "FEAT-001",
      "startTime": 1706543210000,
      "status": "running"
    }
  ],
  "lastUpdated": 1706543220000
}
```

## Testing Strategy

### Unit Tests (PROC-001e)

Mock all external dependencies:

```typescript
describe('ProcessRegistry', () => {
  test('adds process to registry')
  test('removes process from registry')
  test('persists to disk')
  test('loads from disk')
  test('handles missing file gracefully')
})

describe('OrphanDetector', () => {
  test('detects process with dead parent')
  test('detects untracked process matching pattern')
  test('detects stale process exceeding timeout')
  test('does not flag healthy processes')
})

describe('ProcessCleaner', () => {
  test('sends SIGTERM first')
  test('waits grace period before SIGKILL')
  test('updates registry after cleanup')
  test('handles already-dead processes')
})

describe('CliExecutor with IProcessManager', () => {
  test('uses injected process manager for spawn')
  test('tracks spawned processes')
  test('cleans up on shutdown')
})
```

### Integration Tests (PROC-001f)

Use real processes with short-lived test scripts:

```typescript
describe('Process Management Integration', () => {
  const testScript = 'sleep 60' // or custom test script

  test('spawns and tracks real process', async () => {
    const manager = new ProcessManagerImpl()
    const child = manager.spawn('sleep', ['60'])

    expect(manager.listChildren()).toContainEqual(
      expect.objectContaining({ pid: child.pid })
    )

    manager.kill(child.pid, 'SIGTERM')
  })

  test('persists registry across restarts', async () => {
    const manager1 = new ProcessManagerImpl()
    const child = manager1.spawn('sleep', ['60'])
    await manager1.persist()

    const manager2 = new ProcessManagerImpl()
    await manager2.load()

    expect(manager2.listChildren()).toContainEqual(
      expect.objectContaining({ pid: child.pid })
    )

    manager2.kill(child.pid, 'SIGKILL')
  })

  test('detects orphan when parent dies', async () => {
    // Spawn child with fake parent PID
    // Verify detector finds it as orphan
  })
})
```

### E2E Tests (PROC-001g)

Full scenario testing:

```typescript
describe('Process Management E2E', () => {
  test('crash-recovery: orphans cleaned on restart', async () => {
    // 1. Start loopwork with a task
    // 2. Kill parent process with SIGKILL (simulating crash)
    // 3. Restart loopwork
    // 4. Verify orphan processes were cleaned
  })

  test('namespace-isolation: each namespace cleans own orphans', async () => {
    // 1. Start loopwork in namespace A
    // 2. Start loopwork in namespace B
    // 3. Crash namespace A
    // 4. Restart namespace A
    // 5. Verify only A's orphans cleaned, B unaffected
  })

  test('stale-timeout: long-running process killed', async () => {
    // 1. Start task with 60s timeout
    // 2. Mock process that never completes
    // 3. Wait for 2x timeout
    // 4. Verify process detected as stale and killed
  })
})
```

## CLI Commands

```bash
# List tracked processes
loopwork processes list
loopwork processes list --namespace default
loopwork processes list --json

# Clean orphan processes
loopwork processes clean              # Interactive confirmation
loopwork processes clean --yes        # Auto-confirm
loopwork processes clean --force      # Kill ALL tracked processes
loopwork processes clean --dry-run    # Show what would be cleaned

# Start with auto-cleanup
loopwork start --clean-orphans        # Clean orphans before starting
```

## Implementation Plan

### Phase 1: Core Infrastructure (PROC-001a, PROC-001b)
1. Define IProcessManager interface
2. Implement ProcessRegistry with persistence
3. Refactor CliExecutor to depend on IProcessManager

### Phase 2: Detection & Cleanup (PROC-001c, PROC-001d)
1. Implement OrphanDetector with all three detection methods
2. Implement ProcessCleaner with graceful shutdown
3. Wire components together in ProcessManagerImpl

### Phase 3: Testing (PROC-001e, PROC-001f, PROC-001g)
1. Write comprehensive unit tests with mocks
2. Write integration tests with real processes
3. Write E2E tests for failure scenarios

### Phase 4: CLI & Polish (PROC-001h)
1. Add `loopwork processes` commands
2. Add `--clean-orphans` flag to start
3. Update documentation

## Success Criteria

- [ ] IProcessManager interface defined and CliExecutor refactored
- [ ] ProcessRegistry persists and loads correctly
- [ ] OrphanDetector finds orphans by all three methods
- [ ] ProcessCleaner safely terminates with SIGTERM/SIGKILL sequence
- [ ] Unit tests cover all components with mocks
- [ ] Integration tests verify real process tracking
- [ ] E2E tests verify crash recovery scenarios
- [ ] CLI commands work correctly
- [ ] Documentation updated

## Security Considerations

1. **Only kill own processes**: Never kill processes not in registry or not matching patterns
2. **Validate PIDs**: Check process ownership before killing
3. **Log all actions**: Audit trail for all kill operations
4. **Graceful first**: Always try SIGTERM before SIGKILL

## Dependencies

- No new external dependencies
- Uses Node.js built-in `child_process` and `process`
- Uses existing file system utilities

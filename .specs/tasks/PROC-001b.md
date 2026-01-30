# PROC-001b: Process Management - ProcessRegistry (Track All Children)

## Goal

Implement ProcessRegistry that tracks all spawned child processes with metadata (pid, command, startTime, parentPid, namespace). Persist to `.loopwork/processes.json` for crash recovery.

## Requirements

### 1. Create ProcessRegistry Class

Create `/Users/nadimtuhin/opensource/loopwork/packages/loopwork/src/core/process-management/process-registry.ts` with:

```typescript
class ProcessRegistry {
  private processes: Map<number, ProcessInfo>
  private storagePath: string
  private lockPath: string

  constructor(storagePath?: string)
  add(pid: number, metadata: ProcessMetadata): void
  remove(pid: number): void
  get(pid: number): ProcessInfo | undefined
  list(): ProcessInfo[]
  listByNamespace(namespace: string): ProcessInfo[]
  updateStatus(pid: number, status: ProcessStatus): void
  persist(): Promise<void>
  load(): Promise<void>
  clear(): void
}
```

### 2. Storage Format

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

### 3. File Locking

Use the same locking pattern as JSON backend:
- Lock file: `.loopwork/processes.json.lock`
- Contains process PID
- Stale lock detection (>30s or dead PID)
- Retry mechanism: 100ms interval, 5s timeout

### 4. Key Features

- **In-memory tracking**: Map of PID → ProcessInfo for fast lookups
- **Persistence**: Auto-persist on add/remove/update
- **Load on startup**: Read from disk to recover state after crashes
- **Namespace filtering**: Query by namespace for isolation
- **Parent PID tracking**: Store parent PID for orphan detection
- **Status tracking**: running | stopped | orphaned | stale

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      ProcessRegistry                             │
│                                                                  │
│  ┌─────────────────┐                                            │
│  │ In-Memory Map   │                                            │
│  │ PID → Process   │                                            │
│  └─────────────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐         ┌─────────────────┐              │
│  │   add/remove    │────────▶│    persist()    │              │
│  │   get/list      │         │                 │              │
│  └─────────────────┘         └─────────────────┘              │
│                                        │                         │
└────────────────────────────────────────┼─────────────────────────┘
                                         ▼
                            ┌────────────────────────┐
                            │ .loopwork/processes.json│
                            │ (file locking)         │
                            └────────────────────────┘
```

## Implementation Checklist

- [ ] Create `src/core/process-management/process-registry.ts`
- [ ] Implement constructor with storage path setup
- [ ] Implement `add(pid, metadata)` with auto-persist
- [ ] Implement `remove(pid)` with auto-persist
- [ ] Implement `get(pid)` for single process lookup
- [ ] Implement `list()` for all processes
- [ ] Implement `listByNamespace(namespace)` for filtered queries
- [ ] Implement `updateStatus(pid, status)` with auto-persist
- [ ] Implement `persist()` with file locking
- [ ] Implement `load()` for startup recovery
- [ ] Implement `clear()` for cleanup
- [ ] Add proper error handling
- [ ] Use logger for debug output

## Testing Strategy

Unit tests will verify:

1. **Add/Remove Operations**
   - Adding a process stores it in-memory
   - Removing a process deletes from memory
   - Operations trigger persistence

2. **Persistence**
   - `persist()` writes correct JSON format
   - `load()` reads from disk correctly
   - Missing file handled gracefully
   - File locking prevents concurrent writes

3. **Querying**
   - `get()` returns correct process
   - `list()` returns all processes
   - `listByNamespace()` filters correctly

4. **Status Updates**
   - `updateStatus()` modifies status
   - Changes are persisted

## Success Criteria

- [ ] `ProcessRegistry` class implemented in `core/process-management/process-registry.ts`
- [ ] All methods (add, remove, get, list, persist, load) working correctly
- [ ] File locking mechanism implemented
- [ ] Storage format matches specification
- [ ] Namespace filtering works
- [ ] No TypeScript errors (`bun --cwd packages/loopwork run type-check`)
- [ ] Unit tests pass if they exist

## Integration Points

This task integrates with:
- **PROC-001a**: Uses `ProcessInfo` and `ProcessMetadata` types from interface
- **PROC-001c**: OrphanDetector will query registry for orphan detection
- **PROC-001d**: ProcessCleaner will update registry after cleanup
- **Future**: ProcessManagerImpl will use registry for all spawn operations

## Notes

- Follow project conventions: no semicolons, single quotes, 2-space indent
- Use existing file locking pattern from `backends/json.ts`
- Logger should use debug level for detailed operations
- Graceful error handling - don't crash if file operations fail
- Consider edge cases: multiple processes with same PID (shouldn't happen but handle gracefully)

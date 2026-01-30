# PARALLEL-001: Parallel Execution for Loopwork

## Goal

Add parallel task execution to loopwork with 2-3 concurrent workers. Opt-in via `--parallel` flag, sequential remains default.

## Requirements

- 2-5 parallel workers (default: 2 when --parallel used)
- Atomic task claiming to prevent race conditions
- Shared model pool across workers
- Configurable failure mode (continue vs abort-all)
- Resume support for interrupted parallel sessions
- Worker-prefixed logging ([W0], [W1], etc.)

## User Stories

1. As a user, I want to run `loopwork run --parallel` to execute tasks with 2 workers
2. As a user, I want to run `loopwork run --parallel 3` to specify worker count
3. As a user, I want to run `loopwork run --sequential` to force single-worker mode
4. As a user, I want interrupted tasks to be reset on resume

## Technical Design

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    ParallelRunner                        │
│                    (Coordinator)                         │
│  - Circuit breaker (coordinator-level)                  │
│  - isAborted flag                                       │
│  - Statistics tracking                                  │
└─────────────────────────────────────────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
    ┌─────────┐      ┌─────────┐      ┌─────────┐
    │ Worker0 │      │ Worker1 │      │ Worker2 │
    └────┬────┘      └────┬────┘      └────┬────┘
         │                │                │
         └────────────────┼────────────────┘
                          ▼
              ┌───────────────────────┐
              │    JSON Backend       │
              │  - File lock          │
              │  - Atomic claimTask() │
              └───────────────────────┘
```

### Key Coordination: Atomic Task Claiming

```typescript
async claimTask(options?: FindTaskOptions): Promise<Task | null> {
  return await this.withLock(async () => {
    // Under single file lock:
    // 1. Find next pending task
    // 2. Mark as in-progress
    // 3. Save atomically
    // 4. Return task
  })
}
```

### File Conflict Prevention: Task Dependencies

Users set `dependsOn` to ensure tasks modifying same files run sequentially:

```json
{
  "tasks": [
    { "id": "AUTH-001", "status": "pending" },
    { "id": "AUTH-002", "status": "pending", "dependsOn": ["AUTH-001"] }
  ]
}
```

## Sub-tasks

| ID | Title | Status |
|----|-------|--------|
| PARALLEL-001a | Add config types | Completed |
| PARALLEL-001b | Add CLI flags | Completed |
| PARALLEL-001c | Add claimTask interface | Completed |
| PARALLEL-001d | Implement claimTask | Completed |
| PARALLEL-001e | Create ParallelRunner | Completed |
| PARALLEL-001f | Update ICliExecutor | Completed |
| PARALLEL-001g | Integrate into run command | Completed |
| PARALLEL-001h | Write unit tests | Completed |
| PARALLEL-001i | Write integration tests | Completed |

## Verification

- [x] `bun test parallel` - 21 tests pass
- [x] `bun run build` - compiles successfully
- [x] `./bin/loopwork run --help` shows --parallel and --sequential
- [x] Task dependencies respected in parallel mode

## Usage

```bash
# Enable parallel with 2 workers (default)
loopwork run --parallel

# Enable parallel with 3 workers
loopwork run --parallel 3

# Force sequential mode
loopwork run --sequential

# Resume parallel execution
loopwork run --parallel --resume
```

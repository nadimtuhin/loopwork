# Loopwork Claude Code Plugin - Architecture Plan

## Executive Summary

Build a **Claude Code plugin** that deeply integrates loopwork's task automation framework, enabling multi-instance coordination, enhanced autonomy, real-time observability, and seamless task management - all **without forking Claude Code**.

---

## What Powers You Gain

### 1. Multi-Instance Coordination
| Feature | How Plugin Enables It |
|---------|----------------------|
| **Distributed locking** | MCP server manages file locks across Claude instances |
| **Task claiming** | Atomic "claim task" operation via MCP tool |
| **Conflict detection** | PreToolUse hook checks for concurrent edits |
| **Heartbeat system** | Background process tracks active instances |

### 2. Deep Integration
| Feature | How Plugin Enables It |
|---------|----------------------|
| **Native commands** | `/loopwork:run`, `/loopwork:status`, `/loopwork:task` slash commands |
| **Task-aware context** | SessionStart hook injects current task PRD into every session |
| **Automatic backend sync** | MCP server provides direct task CRUD without CLI wrapper |
| **Skill-based workflows** | Reusable skills for common patterns (TDD, review, deploy) |

### 3. Enhanced Autonomy
| Feature | How Plugin Enables It |
|---------|----------------------|
| **Auto-continuation** | Stop hook forces Claude to continue if tasks pending |
| **Sub-task creation** | MCP tool lets Claude decompose tasks |
| **Dependency awareness** | Claude sees blocked/blocking tasks before starting |
| **Self-healing** | PostToolUseFailure triggers recovery logic |

### 4. Better Observability
| Feature | How Plugin Enables It |
|---------|----------------------|
| **Progress streaming** | PostToolUse hook logs every action to `.loopwork/runs/` |
| **Real-time dashboard** | MCP server exposes state for dashboard polling |
| **Session recording** | Hooks capture full execution trace |
| **Cost tracking** | Token usage tracked per task |

---

## Plugin Architecture

```
loopwork-claude-plugin/
├── .claude-plugin/
│   └── plugin.json              # Manifest
├── commands/
│   ├── run.md                   # /loopwork:run
│   ├── resume.md                # /loopwork:resume
│   ├── status.md                # /loopwork:status
│   ├── task.md                  # /loopwork:task <id>
│   ├── next.md                  # /loopwork:next (auto-pick)
│   └── complete.md              # /loopwork:complete
├── agents/
│   ├── task-executor.md         # Isolated task execution
│   ├── task-planner.md          # PRD → subtasks decomposition
│   └── task-verifier.md         # Completion verification
├── skills/
│   ├── tdd-workflow/
│   │   └── SKILL.md             # Test-first pattern
│   ├── review-workflow/
│   │   └── SKILL.md             # Code review pattern
│   └── task-context/
│       └── SKILL.md             # Task awareness knowledge
├── hooks/
│   └── hooks.json               # Lifecycle automation
├── scripts/
│   ├── load-context.sh          # Load task PRD
│   ├── check-pending.sh         # Check if work remains
│   ├── claim-task.sh            # Atomic task claim
│   ├── release-task.sh          # Release task lock
│   └── log-action.sh            # Action logging
└── .mcp.json                    # MCP server config
```

---

## Coordination Architecture (5-10 Instances)

The **MCP Server is the central coordinator** for all Claude instances:

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Claude #1  │  │  Claude #2  │  │  Claude #3  │  │  Claude #N  │
│  Terminal   │  │  VSCode     │  │  CI Runner  │  │  (up to 10) │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │                │
       └────────────────┴────────────────┴────────────────┘
                                │
                    MCP Tool Calls (stdio/http)
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│               LOOPWORK MCP SERVER (Coordinator)                 │
│                                                                 │
│  Started: `loopwork mcp serve` OR auto-start via plugin         │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ IN-MEMORY STATE (fast atomic operations)                │    │
│  │                                                         │    │
│  │  instances: Map<id, {name, lastHeartbeat, currentTask}> │    │
│  │  taskClaims: Map<taskId, {instanceId, claimedAt}>       │    │
│  │  fileLocks: Map<path, {instanceId, lockedAt}>           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                          │                                      │
│                          ▼ (persisted every 5s + on change)     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ FILE PERSISTENCE (crash recovery)                       │    │
│  │  .loopwork/coordinator-state.json                       │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    TASK BACKEND (Source of Truth)               │
│  .specs/tasks/tasks.json  OR  GitHub Issues  OR  Notion DB      │
└─────────────────────────────────────────────────────────────────┘
```

### Coordination Protocol

```
CLAUDE #1                    MCP SERVER                    CLAUDE #2
    │                            │                             │
    │──register("claude-1")─────▶│                             │
    │◀─────instance_id: abc──────│                             │
    │                            │                             │
    │──claim_task(TASK-001)─────▶│                             │
    │◀─────granted───────────────│                             │
    │                            │                             │
    │                            │◀──register("claude-2")──────│
    │                            │───instance_id: def─────────▶│
    │                            │                             │
    │                            │◀──claim_task(TASK-001)──────│
    │                            │───DENIED (owned by abc)────▶│
    │                            │                             │
    │                            │◀──claim_task(TASK-002)──────│
    │                            │───granted──────────────────▶│
    │                            │                             │
    │──heartbeat()──────────────▶│  (every 60s)                │
    │                            │◀──heartbeat()───────────────│
    │                            │                             │
    │──lock_file(src/foo.ts)────▶│                             │
    │◀─────granted───────────────│                             │
    │                            │                             │
    │                            │◀──lock_file(src/foo.ts)─────│
    │                            │───DENIED (locked by abc)───▶│
    │                            │                             │
    │──complete(TASK-001)───────▶│  (auto-releases locks)      │
    │◀─────ok────────────────────│                             │
    │                            │                             │
    │──claim_task(TASK-003)─────▶│  (gets next available)      │
```

### Scaling for 5-10 Instances

| Concern | Solution |
|---------|----------|
| **Stale claims** | 2-min heartbeat timeout auto-releases task |
| **Crash recovery** | State persisted to JSON, restored on server restart |
| **Fair distribution** | Priority queue + round-robin for equal-priority tasks |
| **File conflicts** | `lock_file` / `unlock_file` before Edit/Write |
| **Visibility** | `get_active_instances` shows who's working on what |
| **Race conditions** | All state ops are atomic (single-threaded server) |

### Server Lifecycle

```bash
# Option 1: Manual start (recommended for production)
loopwork mcp serve --port 3847

# Option 2: Auto-start via plugin (development)
# Plugin .mcp.json auto-launches server on first MCP call

# Option 3: Systemd service (server deployment)
systemctl start loopwork-coordinator
```

---

## Core Components

### Component 1: MCP Server (Task Operations)

**File:** `packages/loopwork/src/mcp/server.ts` (already exists, needs enhancement)

**New Tools to Add:**

| Tool | Purpose |
|------|---------|
| `loopwork_register` | Register instance, get unique ID |
| `loopwork_claim_task` | Atomically claim a task |
| `loopwork_release_task` | Release a claimed task |
| `loopwork_heartbeat` | Keep claim alive (call every 60s) |
| `loopwork_lock_file` | Lock file before editing |
| `loopwork_unlock_file` | Release file lock |
| `loopwork_create_subtask` | Let Claude create sub-tasks |
| `loopwork_get_task_context` | Return PRD + dependencies + blockers |
| `loopwork_log_progress` | Stream progress to run log |
| `loopwork_get_active_instances` | See all active Claude instances |
| `loopwork_get_coordinator_status` | Full coordinator state dump |

**Multi-Instance Protocol:**
```
1. On session start: call loopwork_register() → get instance_id
2. To work on task: call loopwork_claim_task(task_id)
   - If granted → proceed
   - If denied → pick another task
3. Before editing file: call loopwork_lock_file(path)
   - If granted → edit
   - If denied → wait or skip
4. Every 60s: call loopwork_heartbeat()
5. On completion: call loopwork_release_task() (auto-releases file locks)
6. Server cleans up instances with no heartbeat for 2+ minutes
```

### Component 2: Hooks (Lifecycle Automation)

**File:** `loopwork-claude-plugin/hooks/hooks.json`

```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": {},
      "hooks": [{
        "type": "command",
        "command": "$CLAUDE_PLUGIN_ROOT/scripts/load-context.sh",
        "timeout": 5000
      }]
    }],

    "UserPromptSubmit": [{
      "matcher": {},
      "hooks": [{
        "type": "command",
        "command": "$CLAUDE_PLUGIN_ROOT/scripts/inject-task-context.sh \"$CLAUDE_USER_PROMPT\""
      }]
    }],

    "PreToolUse": [{
      "matcher": { "toolName": "Edit|Write" },
      "hooks": [{
        "type": "command",
        "command": "$CLAUDE_PLUGIN_ROOT/scripts/check-file-lock.sh \"$CLAUDE_TOOL_INPUT_FILE_PATH\""
      }]
    }],

    "PostToolUse": [{
      "matcher": {},
      "hooks": [{
        "type": "command",
        "command": "$CLAUDE_PLUGIN_ROOT/scripts/log-action.sh"
      }]
    }],

    "Stop": [{
      "matcher": {},
      "hooks": [{
        "type": "prompt",
        "prompt": "Check .loopwork/state.json for pending tasks. If currentTask exists and status != 'completed', return {\"ok\": false, \"reason\": \"Task incomplete\"}. Otherwise return {\"ok\": true}."
      }]
    }]
  }
}
```

### Component 3: Subagents (Isolated Execution)

**File:** `loopwork-claude-plugin/agents/task-executor.md`

```markdown
---
name: task-executor
description: Execute a single task in isolation
model: sonnet
tools:
  - Read
  - Edit
  - Write
  - Bash
  - Glob
  - Grep
  - mcp__loopwork__*
disallowedTools:
  - Task  # No nesting
acceptEdits: true
---

# Task Executor

You are executing a specific loopwork task. Your job is to:

1. Read the task PRD from the context
2. Implement the requirements
3. Run tests to verify
4. Mark task complete via MCP tool

## Rules
- Stay focused on THIS task only
- Do not create new tasks without explicit PRD instruction
- Always verify before marking complete
```

### Component 4: Commands (Slash Commands)

**File:** `loopwork-claude-plugin/commands/run.md`

```markdown
---
name: run
description: Start loopwork task loop
---

Start the loopwork task automation loop:

1. Call `loopwork_list_tasks` to see pending tasks
2. Call `loopwork_claim_task` on highest priority unclaimed task
3. Read task PRD from `.specs/tasks/{TASK_ID}.md`
4. Execute task using task-executor subagent
5. On completion, call `loopwork_mark_complete`
6. Repeat until no pending tasks

Use `/loopwork:status` to check progress.
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Create plugin scaffold with manifest
- [ ] Enhance MCP server with claim/release/heartbeat
- [ ] Implement SessionStart hook for context loading
- [ ] Create basic `/loopwork:status` command

**Critical Files:**
- `packages/loopwork/src/mcp/server.ts`
- `loopwork-claude-plugin/.claude-plugin/plugin.json`
- `loopwork-claude-plugin/hooks/hooks.json`

### Phase 2: Multi-Instance (Week 2)
- [ ] Implement distributed locking in MCP server
- [ ] Add heartbeat mechanism (60s interval)
- [ ] Create `loopwork_get_active_instances` tool
- [ ] Add PreToolUse hook for file conflict detection

**Critical Files:**
- `packages/loopwork/src/mcp/lock-manager.ts` (new)
- `loopwork-claude-plugin/scripts/check-file-lock.sh`

### Phase 3: Autonomy (Week 3)
- [ ] Implement Stop hook for auto-continuation
- [ ] Add `loopwork_create_subtask` MCP tool
- [ ] Create task-planner subagent for decomposition
- [ ] Implement dependency-aware task selection

**Critical Files:**
- `loopwork-claude-plugin/agents/task-planner.md`
- `packages/loopwork/src/mcp/subtask-handler.ts` (new)

### Phase 4: Observability (Week 4)
- [ ] Implement PostToolUse action logging
- [ ] Create run trace format in `.loopwork/runs/`
- [ ] Add dashboard polling endpoint
- [ ] Integrate cost tracking per task

**Critical Files:**
- `loopwork-claude-plugin/scripts/log-action.sh`
- `packages/loopwork/src/mcp/observability.ts` (new)

---

## Dashboard Integration

The web dashboard (`packages/dashboard/web/`) connects to the coordinator for real-time visibility:

```
┌─────────────────────────────────────────────────────────────────┐
│                     NEXT.JS DASHBOARD                           │
│                   (packages/dashboard/web/)                     │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ Instance    │  │ Task Board  │  │ Activity    │             │
│  │ Monitor     │  │ (Kanban)    │  │ Feed        │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└────────────────────────────┬────────────────────────────────────┘
                             │
              HTTP/WebSocket │ (every 1-2 seconds)
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│               LOOPWORK MCP SERVER (Coordinator)                 │
│                                                                 │
│  HTTP Endpoints (in addition to MCP):                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ GET  /api/instances      → List active Claude instances │    │
│  │ GET  /api/tasks          → Task board with claims       │    │
│  │ GET  /api/activity       → Recent actions stream        │    │
│  │ WS   /api/events         → Real-time event push         │    │
│  │ GET  /api/runs/:id       → Execution trace for run      │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Dashboard Features

| View | Data Source | Update Frequency |
|------|-------------|------------------|
| **Instance Monitor** | `GET /api/instances` | 2s polling or WebSocket |
| **Task Board** | `GET /api/tasks` | 2s polling |
| **Activity Feed** | `WS /api/events` | Real-time push |
| **Run Traces** | `GET /api/runs/:id` | On-demand |
| **Cost Tracking** | `GET /api/costs` | 5s polling |

### WebSocket Events

```typescript
// Server pushes these events to connected dashboards
type DashboardEvent =
  | { type: 'instance_joined', instance: InstanceInfo }
  | { type: 'instance_left', instanceId: string }
  | { type: 'task_claimed', taskId: string, instanceId: string }
  | { type: 'task_completed', taskId: string, result: 'success' | 'failed' }
  | { type: 'file_locked', path: string, instanceId: string }
  | { type: 'progress', taskId: string, message: string }
```

---

## Error Handling & Recovery

### Instance Crash Recovery

```
SCENARIO: Claude #1 crashes mid-task

Timeline:
  T+0:00  Claude #1 claims TASK-001, starts working
  T+1:30  Claude #1 process killed (crash/network/user ctrl+c)
  T+2:00  Heartbeat missed (expected at T+1:00)
  T+3:00  Heartbeat timeout (2 min) reached
  T+3:00  Coordinator auto-releases:
          - TASK-001 claim → status back to "pending"
          - All file locks held by instance
  T+3:05  Claude #2 calls claim_task → gets TASK-001
  T+3:05  Claude #2 sees partial work, continues or restarts
```

### Task Failure Handling

```
SCENARIO: Task execution fails

1. Claude detects failure (tests fail, build breaks)
2. Claude calls loopwork_mark_failed(taskId, reason)
3. Coordinator:
   - Releases claim and file locks
   - Increments task.failureCount
   - If failureCount >= 3 → mark task as "blocked"
   - Logs failure to .loopwork/runs/
4. Dashboard shows failure with reason
5. Other instances skip blocked tasks
```

### Recovery Strategies

| Failure Type | Recovery Action |
|--------------|-----------------|
| **Instance crash** | Auto-release after 2min timeout |
| **Task fails once** | Re-queue for another instance |
| **Task fails 3x** | Mark as "blocked", alert user |
| **Server crash** | Restore from `.loopwork/coordinator-state.json` |
| **File conflict** | PreToolUse hook blocks, Claude picks different file |
| **Network partition** | Heartbeat timeout releases claims |

### Graceful Shutdown

```typescript
// When Claude session ends normally
async function onSessionEnd() {
  await mcp.call('loopwork_release_task', { taskId: currentTask });
  await mcp.call('loopwork_unregister', { instanceId });
  // All file locks auto-released with task release
}
```

---

## Testing Strategy

### Unit Tests (Fast, Isolated)

```typescript
// packages/loopwork/test/mcp/coordinator.test.ts

describe('Coordinator', () => {
  test('claim_task grants to first requester', async () => {
    const coord = new Coordinator();
    const result1 = await coord.claimTask('TASK-001', 'instance-a');
    const result2 = await coord.claimTask('TASK-001', 'instance-b');

    expect(result1.granted).toBe(true);
    expect(result2.granted).toBe(false);
    expect(result2.reason).toBe('claimed by instance-a');
  });

  test('stale claims are auto-released', async () => {
    const coord = new Coordinator({ heartbeatTimeout: 100 }); // 100ms for test
    await coord.claimTask('TASK-001', 'instance-a');

    await sleep(150); // Wait for timeout

    const result = await coord.claimTask('TASK-001', 'instance-b');
    expect(result.granted).toBe(true); // Stale claim released
  });

  test('file locks prevent concurrent edits', async () => {
    const coord = new Coordinator();
    await coord.claimTask('TASK-001', 'instance-a');

    const lock1 = await coord.lockFile('src/foo.ts', 'instance-a');
    const lock2 = await coord.lockFile('src/foo.ts', 'instance-b');

    expect(lock1.granted).toBe(true);
    expect(lock2.granted).toBe(false);
  });
});
```

### Integration Tests (Multi-Process)

```typescript
// packages/loopwork/test/mcp/multi-instance.test.ts

describe('Multi-Instance Coordination', () => {
  let server: ChildProcess;

  beforeAll(async () => {
    server = spawn('loopwork', ['mcp', 'serve', '--port', '3847']);
    await waitForServer('http://localhost:3847/health');
  });

  test('two instances claim different tasks', async () => {
    const client1 = new MCPClient('http://localhost:3847');
    const client2 = new MCPClient('http://localhost:3847');

    await client1.call('loopwork_register', { name: 'test-1' });
    await client2.call('loopwork_register', { name: 'test-2' });

    // Both try to claim TASK-001
    const [result1, result2] = await Promise.all([
      client1.call('loopwork_claim_task', { taskId: 'TASK-001' }),
      client2.call('loopwork_claim_task', { taskId: 'TASK-001' }),
    ]);

    // Exactly one should succeed
    expect([result1.granted, result2.granted]).toContain(true);
    expect([result1.granted, result2.granted]).toContain(false);
  });
});
```

### E2E Tests (Full Plugin)

```bash
# test/e2e/multi-claude.test.sh

#!/bin/bash
# Start coordinator
loopwork mcp serve --port 3847 &
SERVER_PID=$!

# Create test task
echo '{"tasks":[{"id":"TEST-001","status":"pending"}]}' > .specs/tasks/tasks.json

# Start two Claude instances in parallel
claude --plugin-dir ./loopwork-claude-plugin -p "claim and complete TEST-001" &
CLAUDE1_PID=$!

claude --plugin-dir ./loopwork-claude-plugin -p "claim and complete TEST-001" &
CLAUDE2_PID=$!

# Wait for completion
wait $CLAUDE1_PID $CLAUDE2_PID

# Verify task completed exactly once
COMPLETIONS=$(grep -c '"status":"completed"' .loopwork/runs/*.jsonl)
assert_equals 1 $COMPLETIONS "Task should complete exactly once"

# Cleanup
kill $SERVER_PID
```

### Test Matrix

| Test Type | What It Validates | Run Frequency |
|-----------|-------------------|---------------|
| Unit (coordinator) | Claim/release/heartbeat logic | Every commit |
| Unit (hooks) | Hook scripts exit codes | Every commit |
| Integration (MCP) | Multi-process coordination | PR merge |
| E2E (full plugin) | End-to-end with real Claude | Nightly/manual |
| Load test | 10 concurrent instances | Release candidate |

---

## What Can't Be Done (Plugin Limitations)

| Limitation | Workaround |
|------------|------------|
| No nested subagents | Chain from main conversation |
| Hooks can't invoke skills | Use bash scripts that output instructions |
| Background subagents can't use MCP | Run task-executor in foreground |
| No pre-decision interception | Use PreToolUse to deny (not prevent) |
| No context window access | Track token usage externally |

---

## Verification Plan

### Test 1: Multi-Instance Coordination
```bash
# Terminal 1
claude --plugin-dir ./loopwork-claude-plugin
> /loopwork:run

# Terminal 2 (same machine)
claude --plugin-dir ./loopwork-claude-plugin
> /loopwork:run
# Should see: "Task TASK-001 claimed by instance-abc, picking TASK-002"
```

### Test 2: Auto-Continuation
```bash
claude --plugin-dir ./loopwork-claude-plugin
> Work on TASK-001
# Claude completes TASK-001, tries to stop
# Stop hook fires, detects TASK-002 pending
# Claude continues without user intervention
```

### Test 3: Observability
```bash
# While Claude works
tail -f .loopwork/runs/session-*.jsonl
# Should see: tool calls, file edits, test runs in real-time
```

---

## File Changes Summary

### New Files
| Path | Purpose |
|------|---------|
| `loopwork-claude-plugin/` | Plugin directory (entire structure) |
| `packages/loopwork/src/mcp/lock-manager.ts` | Distributed locking |
| `packages/loopwork/src/mcp/subtask-handler.ts` | Subtask creation |
| `packages/loopwork/src/mcp/observability.ts` | Action logging |

### Modified Files
| Path | Changes |
|------|---------|
| `packages/loopwork/src/mcp/server.ts` | Add 7 new tools |
| `packages/loopwork/src/plugins/claude-code.ts` | Auto-register plugin |

---

## Success Criteria

1. **Multi-Instance:** 3 Claude instances work on same backlog without conflicts
2. **Deep Integration:** Zero manual context switching between sessions
3. **Autonomy:** Claude completes 5-task backlog without user intervention
4. **Observability:** Full execution trace available within 1 second of action

---

## Baby-Step Task Breakdown

### Sprint 1: Plugin Scaffold (2-3 hours)

```
PLUGIN-001: Create plugin directory structure
├── PLUGIN-001a: Create loopwork-claude-plugin/ folder
├── PLUGIN-001b: Create .claude-plugin/plugin.json manifest
├── PLUGIN-001c: Create empty hooks/hooks.json
└── PLUGIN-001d: Test plugin loads with `claude --plugin-dir`
```

```
PLUGIN-002: Create first slash command
├── PLUGIN-002a: Create commands/status.md
├── PLUGIN-002b: Command reads .loopwork/state.json
├── PLUGIN-002c: Command outputs pending task count
└── PLUGIN-002d: Test /loopwork:status works
```

### Sprint 2: MCP Server Enhancement (3-4 hours)

```
MCP-001: Add instance registration
├── MCP-001a: Add loopwork_register tool to server.ts
├── MCP-001b: Generate unique instance ID (uuid)
├── MCP-001c: Store in-memory instances Map
├── MCP-001d: Write unit test for registration
└── MCP-001e: Test via MCP inspector
```

```
MCP-002: Add task claiming
├── MCP-002a: Add loopwork_claim_task tool
├── MCP-002b: Check if task already claimed
├── MCP-002c: Return granted/denied response
├── MCP-002d: Write unit test for claiming
└── MCP-002e: Write unit test for conflict
```

```
MCP-003: Add task release
├── MCP-003a: Add loopwork_release_task tool
├── MCP-003b: Remove claim from taskClaims Map
├── MCP-003c: Write unit test
└── MCP-003d: Test claim → release → claim cycle
```

### Sprint 3: Heartbeat System (2 hours)

```
MCP-004: Add heartbeat mechanism
├── MCP-004a: Add loopwork_heartbeat tool
├── MCP-004b: Update lastHeartbeat timestamp
├── MCP-004c: Add cleanup timer (runs every 30s)
├── MCP-004d: Auto-release claims older than 2min
├── MCP-004e: Write unit test with mock timers
└── MCP-004f: Integration test: claim → wait → auto-release
```

### Sprint 4: File Locking (2 hours)

```
MCP-005: Add file locking
├── MCP-005a: Add loopwork_lock_file tool
├── MCP-005b: Add loopwork_unlock_file tool
├── MCP-005c: Store in-memory fileLocks Map
├── MCP-005d: Auto-release locks on task release
├── MCP-005e: Write unit tests
└── MCP-005f: Test lock conflict scenario
```

### Sprint 5: Hooks Integration (3 hours)

```
HOOK-001: SessionStart hook
├── HOOK-001a: Create scripts/load-context.sh
├── HOOK-001b: Script reads current task from state
├── HOOK-001c: Script outputs task PRD as context
├── HOOK-001d: Add to hooks.json
└── HOOK-001e: Test session starts with task context
```

```
HOOK-002: PreToolUse hook for file locks
├── HOOK-002a: Create scripts/check-file-lock.sh
├── HOOK-002b: Script calls MCP lock_file
├── HOOK-002c: Exit code 2 if denied
├── HOOK-002d: Add to hooks.json with Edit|Write matcher
└── HOOK-002e: Test: locked file prevents edit
```

```
HOOK-003: Stop hook for auto-continuation
├── HOOK-003a: Add Stop hook with prompt type
├── HOOK-003b: Prompt checks for pending tasks
├── HOOK-003c: Return ok:false if tasks remain
└── HOOK-003d: Test: Claude continues after task completion
```

### Sprint 6: State Persistence (2 hours)

```
STATE-001: Persist coordinator state
├── STATE-001a: Create .loopwork/coordinator-state.json on change
├── STATE-001b: Load state on server start
├── STATE-001c: Add debounced save (5s interval)
├── STATE-001d: Test: restart server, state preserved
└── STATE-001e: Test: crash recovery scenario
```

### Sprint 7: Dashboard Endpoints (3 hours)

```
DASH-001: Add HTTP endpoints to MCP server
├── DASH-001a: Add GET /api/instances endpoint
├── DASH-001b: Add GET /api/tasks endpoint
├── DASH-001c: Add GET /api/activity endpoint
├── DASH-001d: Add health check endpoint
└── DASH-001e: Test endpoints with curl
```

```
DASH-002: Add WebSocket events
├── DASH-002a: Add WS /api/events endpoint
├── DASH-002b: Emit instance_joined on register
├── DASH-002c: Emit task_claimed on claim
├── DASH-002d: Emit task_completed on release
└── DASH-002e: Test with wscat
```

### Sprint 8: Subagents (2 hours)

```
AGENT-001: Create task-executor subagent
├── AGENT-001a: Create agents/task-executor.md
├── AGENT-001b: Define tool restrictions
├── AGENT-001c: Add MCP tool access
└── AGENT-001d: Test subagent executes task
```

```
AGENT-002: Create task-planner subagent
├── AGENT-002a: Create agents/task-planner.md
├── AGENT-002b: Configure for task decomposition
└── AGENT-002c: Test subtask creation
```

### Sprint 9: Commands (2 hours)

```
CMD-001: Create /loopwork:run command
├── CMD-001a: Create commands/run.md
├── CMD-001b: Implement claim → execute → complete loop
└── CMD-001c: Test full loop with single task
```

```
CMD-002: Create /loopwork:next command
├── CMD-002a: Create commands/next.md
├── CMD-002b: Auto-pick highest priority unclaimed
└── CMD-002c: Test priority ordering
```

### Sprint 10: Integration Testing (3 hours)

```
TEST-001: Multi-instance integration test
├── TEST-001a: Create test/mcp/multi-instance.test.ts
├── TEST-001b: Test two instances claim different tasks
├── TEST-001c: Test file lock prevents conflict
└── TEST-001d: Test heartbeat timeout releases
```

```
TEST-002: E2E test with real Claude
├── TEST-002a: Create test/e2e/multi-claude.test.sh
├── TEST-002b: Start server, two Claude instances
├── TEST-002c: Verify task completed once
└── TEST-002d: Add to CI (nightly)
```

---

## Task Dependency Graph

```
PLUGIN-001 ─────────────────────────────────────────────────────┐
     │                                                          │
     ▼                                                          │
PLUGIN-002                                                      │
                                                                │
MCP-001 ────┬──────────────────────────────────────────────────┤
     │      │                                                   │
     ▼      ▼                                                   │
MCP-002   MCP-004 (heartbeat)                                   │
     │      │                                                   │
     ▼      │                                                   │
MCP-003 ◄───┘                                                   │
     │                                                          │
     ▼                                                          │
MCP-005 (file locks)                                            │
     │                                                          │
     ├───────────────┬──────────────────────────────────────────┤
     ▼               ▼                                          │
HOOK-001         HOOK-002                                       │
     │               │                                          │
     └───────┬───────┘                                          │
             ▼                                                  │
         HOOK-003                                               │
             │                                                  │
             ▼                                                  │
        STATE-001                                               │
             │                                                  │
     ┌───────┴───────┐                                          │
     ▼               ▼                                          │
DASH-001         AGENT-001                                      │
     │               │                                          │
     ▼               ▼                                          │
DASH-002         AGENT-002                                      │
     │               │                                          │
     └───────┬───────┘                                          │
             ▼                                                  │
         CMD-001 ◄──────────────────────────────────────────────┘
             │
             ▼
         CMD-002
             │
             ▼
        TEST-001
             │
             ▼
        TEST-002
```

---

## Recommended Execution Order

| # | Task | Estimated Time | Dependencies |
|---|------|----------------|--------------|
| 1 | PLUGIN-001 | 30 min | None |
| 2 | MCP-001 | 45 min | None (parallel with 1) |
| 3 | MCP-002 | 30 min | MCP-001 |
| 4 | MCP-003 | 20 min | MCP-002 |
| 5 | MCP-004 | 45 min | MCP-001 |
| 6 | MCP-005 | 45 min | MCP-003 |
| 7 | PLUGIN-002 | 30 min | PLUGIN-001 |
| 8 | HOOK-001 | 45 min | MCP-005, PLUGIN-001 |
| 9 | HOOK-002 | 30 min | MCP-005, PLUGIN-001 |
| 10 | HOOK-003 | 30 min | HOOK-001 |
| 11 | STATE-001 | 45 min | MCP-005 |
| 12 | DASH-001 | 1 hr | STATE-001 |
| 13 | DASH-002 | 45 min | DASH-001 |
| 14 | AGENT-001 | 30 min | PLUGIN-001, MCP-005 |
| 15 | AGENT-002 | 30 min | AGENT-001 |
| 16 | CMD-001 | 45 min | All hooks, agents |
| 17 | CMD-002 | 20 min | CMD-001 |
| 18 | TEST-001 | 1 hr | CMD-002 |
| 19 | TEST-002 | 1 hr | TEST-001 |

**Total: ~13 hours of focused work**

---

## First 5 Tasks to Start With

1. **PLUGIN-001a**: `mkdir -p loopwork-claude-plugin/.claude-plugin`
2. **PLUGIN-001b**: Create `plugin.json` with name/version/description
3. **MCP-001a**: Add `loopwork_register` tool skeleton to server.ts
4. **MCP-001b**: Implement UUID generation for instance ID
5. **MCP-001c**: Add instances Map and register/lookup logic

**Start here → Immediate feedback → Build momentum**

# Orphan Process Management

This document describes how loopwork detects, tracks, and terminates orphan processes spawned by CLI tools.

## Overview

Loopwork spawns long-running AI CLI processes (`claude`, `opencode`) to execute tasks. When the parent loopwork process exits abnormally (crash, SIGKILL, etc.), these child processes may persist as orphans, consuming system resources.

### Why Orphan Management Matters

- **Resource leaks**: Orphaned processes consume memory and CPU indefinitely
- **Port conflicts**: Orphaned processes may hold open ports/file handles
- **Billing**: Orphaned API clients continue consuming API quota
- **System stability**: Accumulated orphans degrade system performance

### Safety-First Design

All orphan management includes multiple safeguards:

1. **PID tracking**: Only processes explicitly spawned by loopwork are "confirmed"
2. **PPID verification**: Parent-child process ancestry is validated
3. **Pattern matching**: Untracked processes must match known CLI patterns
4. **Working directory check**: Process must run in project directory
5. **Graceful termination**: SIGTERM before SIGKILL
6. **Force flag requirement**: Suspected orphans need `--force` to kill

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│              loopwork spawn(claude, opencode)                │
└────────────────────┬─────────────────────────────────────────┘
                     │ track PID
                     ▼
        ┌────────────────────────────┐
        │  spawned-pids.json         │
        │  ├─ pid: number            │
        │  ├─ command: string        │
        │  ├─ spawnedAt: ISO date    │
        │  └─ cwd: working dir       │
        └────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
   ┌──────────────┐      ┌──────────────┐
   │ Detector     │      │ Monitor      │
   │ - Pattern    │      │ - Background │
   │ - PPID check │      │ - Periodic   │
   │ - Ancestry   │      │ - Auto-kill  │
   └──────┬───────┘      └──────┬───────┘
          │                     │
          └──────────┬──────────┘
                     ▼
        ┌────────────────────────┐
        │  OrphanProcess list    │
        │  - confirmed: tracked  │
        │  - suspected: pattern  │
        └────────────┬───────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │  Killer (SIGTERM/KILL) │
        │  - Confirmed: always   │
        │  - Suspected: w/ force │
        └────────────┬───────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │  orphan-events.log     │
        │  - DETECTED events     │
        │  - KILLED events       │
        │  - SKIPPED events      │
        └────────────────────────┘
```

## Process Classification

### Confirmed Orphans

These are guaranteed spawned by loopwork and safe to kill:

**Criteria:**
- PID exists in `spawned-pids.json` tracking file
- Process still exists (verified via `kill(pid, 0)`)
- Age filtering applied (optional)

**Marking:** `classification: 'confirmed'`
**Default action:** Kill with SIGTERM → SIGKILL
**Force required:** No

**Example:**
```json
{
  "pid": 1234,
  "command": "claude -p --model sonnet",
  "classification": "confirmed",
  "reason": "Tracked by loopwork",
  "age": 3600000,
  "memory": 524288000
}
```

### Suspected Orphans

These match patterns but lack confirmation:

**Criteria:**
- NOT in `spawned-pids.json`
- BUT matches one of these:
  - Command matches pattern (e.g., `claude`, `bun test`, `tail -f`)
  - Running in project directory
  - Is loopwork descendant (PPID chain includes loopwork)

**Marking:** `classification: 'suspected'`
**Default action:** Skip (report only)
**Force required:** Yes (via `--force` flag)

**Example:**
```json
{
  "pid": 5678,
  "command": "bun test suite",
  "classification": "suspected",
  "reason": "Matches pattern and in project directory but not tracked",
  "cwd": "/path/to/project",
  "age": 5400000
}
```

## Orphan Detection

### Pattern-Based Detection

Default patterns matched (configurable):

```typescript
const DEFAULT_ORPHAN_PATTERNS = [
  'bun test',           // Test runners
  'tail -f',            // Log watchers
  'zsh -c -l source.*shell-snapshots',  // Shell environments
  'claude',             // Claude CLI
  'opencode',           // OpenCode CLI
]
```

Custom patterns can be added via `DetectorOptions.patterns`.

### Ancestry Verification

For untracked processes, the detector verifies loopwork ancestry by walking PPID chain:

```
Process X
  ↑ ppid
Parent Y (claude)
  ↑ ppid
Grandparent Z (loopwork) ← Found: confirmed as loopwork descendant
  ↑ ppid
init (PID 1) ← Stop walking
```

**Protection:** Stops at PID 1, prevents infinite loops, uses visited set.

### Working Directory Check

Processes are only classified as confirmed if:

1. **Tracked PID**: In `spawned-pids.json` (always confirmed)
2. **Untracked PID**: Must be in project directory (via `lsof` cwd detection)

This prevents killing unrelated user processes like `tail -f` in home directory.

## Process Lifecycle

### 1. Spawning

When loopwork spawns a CLI:

```typescript
// cli.ts - spawn() call
const child = spawn(command, args, { ... })

// Track the PID
trackSpawnedPid(child.pid!, command, cwd)

// In spawned-pids.json:
{
  "pids": [
    {
      "pid": 12345,
      "command": "claude -p --model sonnet",
      "spawnedAt": "2025-01-30T10:00:00.000Z",
      "cwd": "/path/to/project"
    }
  ]
}
```

### 2. Normal Cleanup

When process completes normally:

```typescript
// Untrack the PID when closing
process.on('close', (code) => {
  untrackPid(child.pid)  // Removes from spawned-pids.json
})
```

### 3. Orphan Detection

At any time (manual or periodic), detect orphans:

```bash
loopwork kill --orphans
# or
monitor.startOrphanWatch({ interval: 60000, autoKill: true })
```

### 4. Termination

For confirmed orphans:

1. Send SIGTERM
2. Wait up to `timeout` ms (default 5000)
3. If not dead, send SIGKILL
4. Verify process is gone
5. Emit event + log result
6. Untrack PID

## Safety Mechanisms

### PID < 100 Protection

System processes with low PIDs are never killed:

```typescript
if (pid <= 1 || pid < 100) {
  // Skip - system process
  result.skipped.push(pid)
}
```

### Forced Dual-Check Before SIGKILL

Before sending SIGKILL, verify process still exists and matches:

```typescript
if (!processExists(pid)) {
  // Already dead - success
  result.killed.push(pid)
  continue
}
// Send SIGKILL only if still exists
process.kill(pid, 'SIGKILL')
```

### Race Condition Handling

If process dies between checks, treat as success:

```typescript
if (error.includes('ESRCH')) {
  // ESRCH: No such process - already dead
  result.killed.push(pid)  // Success
}
```

### Permission Denied Handling

Gracefully skip processes without kill permission:

```typescript
if (error.includes('EPERM')) {
  // EPERM: Operation not permitted
  result.failed.push({ pid, error: 'Permission denied' })
}
```

## CLI Usage

### Find Orphans (Dry-Run)

```bash
loopwork kill --orphans --dry-run
```

Output:
```
Orphan Processes Found:
┌───────┬─────────────────────────────────────────┬────────┬────────────┬─────────┐
│  PID  │              Command                    │  Age   │   Status   │ Action  │
├───────┼─────────────────────────────────────────┼────────┼────────────┼─────────┤
│ 12345 │ claude -p --model sonnet                │ 2h 15m │ confirmed  │ would k │
│ 67890 │ bun test suite                          │ 45m    │ suspected  │ would s │
└───────┴─────────────────────────────────────────┴────────┴────────────┴─────────┘

Summary: Would kill 1 orphan(s), skipped 1

Tip: Use --force to also kill 1 suspected orphan(s)
```

### Kill Confirmed Only

```bash
loopwork kill --orphans
```

Only kills confirmed orphans (from tracking file). Skips suspected.

### Kill All (With Force)

```bash
loopwork kill --orphans --force
```

Kills both confirmed and suspected orphans. Use carefully!

### JSON Output

```bash
loopwork kill --orphans --json
```

Machine-readable output:
```json
{
  "orphans": [
    {
      "pid": 12345,
      "command": "claude -p --model sonnet",
      "age": "2h 15m",
      "ageMs": 8100000,
      "classification": "confirmed",
      "reason": "Tracked by loopwork",
      "action": "killed"
    }
  ],
  "summary": {
    "killed": 1,
    "skipped": 0,
    "failed": 0
  }
}
```

### Flags

| Flag | Type | Default | Purpose |
|------|------|---------|---------|
| `--orphans` | boolean | false | Scan for and kill orphans |
| `--dry-run` | boolean | false | Preview without killing |
| `--force` | boolean | false | Kill suspected orphans too |
| `--json` | boolean | false | JSON output format |

## Monitor Integration

### Background Orphan Watch

Start monitoring in background:

```typescript
const monitor = new LoopworkMonitor(projectRoot)

monitor.startOrphanWatch({
  interval: 60000,        // Check every 60s
  maxAge: 1800000,        // Kill if older than 30min
  autoKill: true,         // Auto-kill confirmed orphans
  patterns: ['my-cli']    // Additional patterns
})
```

### Events Emitted

The killer emits three events:

```typescript
killer.on('orphan:killed', ({ pid, command }) => {
  // Successfully terminated
})

killer.on('orphan:skipped', ({ pid, command, reason }) => {
  // Not killed (suspected without --force, etc)
})

killer.on('orphan:failed', ({ pid, command, error }) => {
  // Failed to terminate
})
```

### Statistics

Track orphan watch activity:

```typescript
const stats = monitor.getOrphanStats()
// {
//   watching: true,
//   lastCheck: "2025-01-30T10:05:00.000Z",
//   orphansDetected: 5,
//   orphansKilled: 3
// }
```

## File Locations

### State Files

```
.loopwork-state/
├── spawned-pids.json       # Tracked PIDs (created by detector)
└── orphan-events.log       # Event log (created by monitor)
```

### spawned-pids.json Structure

```json
{
  "pids": [
    {
      "pid": 12345,
      "command": "claude -p --model sonnet",
      "spawnedAt": "2025-01-30T10:00:00.000Z",
      "cwd": "/path/to/project"
    },
    {
      "pid": 67890,
      "command": "bun run build",
      "spawnedAt": "2025-01-30T10:01:15.000Z",
      "cwd": "/path/to/project"
    }
  ]
}
```

### orphan-events.log Format

```log
[2025-01-30T10:05:12.345Z] DETECTED pid=12345 cmd="claude -p" age=5min status=confirmed
[2025-01-30T10:05:13.567Z] KILLED pid=12345 cmd="claude -p" age=5min status=confirmed
[2025-01-30T10:05:14.890Z] SKIPPED pid=67890 cmd="bun test" age=2min status=suspected reason="suspected, autoKill disabled"
```

**Fields:**
- `timestamp`: ISO timestamp
- `event`: DETECTED, KILLED, SKIPPED, FAILED
- `pid`: Process ID
- `cmd`: Command (truncated)
- `age`: Age in minutes
- `status`: confirmed or suspected
- `reason`: Optional reason for skip/fail

## Process Information Gathering

### Commands Used

All process info is gathered via standard Unix tools:

| Data | Command | Fallback |
|------|---------|----------|
| PID existence | `kill(pid, 0)` | Signal 0 test |
| Process info | `ps -p PID -o pid=,ppid=,command=,etime=,rss=` | |
| Working dir | `lsof -a -p PID -d cwd -Fn` | Skipped if lsof unavailable |
| Full process list | `ps aux` | For pattern matching |

### Error Handling

- **ps** timeouts: 5s timeout, returns null if exceeded
- **lsof** failures: Silent (may require elevated permissions)
- **Missing processes**: Gracefully handled (ESRCH errors)

## Design Decisions

### Why Dual Classification?

Two-tier classification allows safe cleanup without risky guessing:

- **Confirmed**: We have proof (tracking file) → Safe to auto-kill
- **Suspected**: Pattern match only → Requires user consent

This prevents accidentally killing legitimate processes.

### Why Store spawned-pids.json?

Enables:
1. Distinguishing our processes from unrelated ones
2. Resuming cleanup after crashes
3. Auditing which processes loopwork spawned
4. Graceful cleanup on normal shutdown

### Why SIGTERM Before SIGKILL?

SIGTERM gives processes chance to:
1. Save state
2. Close file handles
3. Clean up temporary files
4. Flush logs

Only escalate to SIGKILL if process ignores SIGTERM.

### Why maxAge Filter?

Recent orphans may still be in-flight or legitimately spawned. Only target old ones to reduce false positives.

## Troubleshooting

### No Orphans Found

Check if tracking file exists:
```bash
cat .loopwork-state/spawned-pids.json
```

If empty or missing, orphans were either never tracked or already cleaned.

### Suspected Orphans Blocking Cleanup

Run with `--force` after confirming they're safe:
```bash
loopwork kill --orphans --force
```

Or use `--dry-run` first to preview:
```bash
loopwork kill --orphans --force --dry-run
```

### Permission Denied Errors

Some processes may require elevated permissions to kill:

```bash
# Check process owner
ps -p <PID> -o user=

# If different user, try:
sudo loopwork kill --orphans --force
```

### Stale Tracking Entries

The detector automatically cleans stale entries on read:

```typescript
// Remove tracked PIDs that no longer exist
const cleanedPids = tracked.pids.filter(p => processExists(p.pid))
```

## Related Documentation

- **CLI Invocation**: [`cli-invocation-algorithm.md`](./cli-invocation-algorithm.md) - How loopwork spawns and manages CLI processes
- **Execution Model**: [`../core/cli.ts`](../core/cli.ts) - Implementation of process spawning with timeout handling
- **Commands**: [`../commands/kill.ts`](../commands/kill.ts) - Kill command CLI interface

## Implementation References

### Core Modules

| Module | Purpose |
|--------|---------|
| `orphan-detector.ts` | Detection logic, classification, pattern matching |
| `orphan-killer.ts` | Termination logic, safety checks, event emission |
| `monitor/index.ts` | Background monitoring, periodic checks, auto-kill |
| `commands/kill.ts` | CLI interface for orphan management |

### Key Functions

| Function | Purpose |
|----------|---------|
| `detectOrphans()` | Find all orphan processes |
| `trackSpawnedPid()` | Register a spawned PID |
| `untrackPid()` | Remove a PID from tracking |
| `killer.kill()` | Terminate orphan processes |
| `monitor.startOrphanWatch()` | Periodic background monitoring |

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

1. **PID tracking**: Only processes explicitly spawned by loopwork can be killed
2. **Registry-only cleanup**: Only processes in the tracking registry are targeted
3. **Graceful termination**: SIGTERM before SIGKILL
4. **No untracked killing**: We DO NOT kill processes just because they match patterns

> **IMPORTANT (v0.3.4+)**: The "untracked process" detection was **removed** for safety.
> Previously, loopwork would scan for ANY process matching patterns like 'claude' or 'opencode'
> and kill them if not in the registry. This was dangerous because it killed users'
> independently-running CLI sessions. Now we only kill processes loopwork actually spawned.

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

### Tracked Orphans (Safe to Kill)

These are guaranteed spawned by loopwork and safe to kill:

**Criteria:**
- PID exists in registry/tracking file
- Process still exists (verified via `kill(pid, 0)`)
- Either: parent PID is dead, OR process exceeded stale timeout

**Action:** Kill with SIGTERM → SIGKILL

**Example:**
```json
{
  "pid": 1234,
  "command": "claude -p --model sonnet",
  "reason": "parent-dead",
  "age": 3600000
}
```

### Orphan Detection Methods (v0.3.4+)

Only TWO detection methods are active:

1. **Dead Parent Detection**: Process is in registry AND its parent PID no longer exists
2. **Stale Detection**: Process is in registry AND running longer than 2x configured timeout

> **REMOVED**: "Untracked process" detection was removed in v0.3.4 because it was
> killing processes that matched patterns like 'claude' but were never spawned by
> loopwork. This caused users' independent CLI sessions to be terminated.

## Orphan Detection

### Registry-Based Detection (v0.3.4+)

Orphan detection is now **registry-only**. We only look at processes that loopwork actually spawned and tracked:

```typescript
// Detection methods (in OrphanDetector.scan())
const orphans = []

// Method 1: Dead parent - tracked process whose parent PID died
orphans.push(...this.detectDeadParents())

// Method 2: Stale - tracked process running > 2x timeout
orphans.push(...this.detectStaleProcesses())

// Method 3: REMOVED - untracked pattern matching (was dangerous)
// This was killing users' independent CLI sessions!
```

### Why Pattern-Based Detection Was Removed

The old pattern-based detection would:
1. Scan ALL running processes via `ps aux`
2. Filter to those matching patterns like `claude`, `opencode`, `bun test`
3. Kill any matching process NOT in the registry

**The problem:** If you had a Claude CLI running in another terminal (not spawned by loopwork), it would be killed because it matched the pattern but wasn't tracked.

**The fix:** Only kill processes that are:
- In the registry (loopwork spawned them)
- AND either their parent died OR they exceeded stale timeout

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

### Kill Tracked Orphans

```bash
loopwork kill --orphans
```

Kills orphaned processes that are tracked in the registry (loopwork spawned them).

> **Note (v0.3.4+)**: The `--force` flag no longer has special meaning for orphan killing.
> We no longer have "suspected" vs "confirmed" categories since we only kill tracked processes.

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
| `--orphans` | boolean | false | Scan for and kill tracked orphans |
| `--dry-run` | boolean | false | Preview without killing |
| `--json` | boolean | false | JSON output format |

> **Note**: The `--force` flag was used for killing "suspected" orphans, but suspected
> orphan detection was removed in v0.3.4 for safety reasons.

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

### Why Registry-Only Detection? (v0.3.4+)

We removed pattern-based "suspected orphan" detection because it was too dangerous:

- **Problem**: Pattern matching killed ANY process matching 'claude', 'opencode', etc.
- **Real bug**: Users' independent CLI sessions (not from loopwork) were being killed
- **Solution**: Only kill processes we definitely spawned (in registry)

This is more conservative but much safer. We'd rather miss some orphans than kill legitimate user processes.

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

### Processes Not Being Cleaned Up

If orphan processes aren't being killed, they might not be in the registry:

1. Check the registry: `cat .loopwork/processes.json`
2. If empty, the processes weren't spawned by loopwork
3. Kill manually with `kill <PID>` or `pkill -f <pattern>`

> **Note (v0.3.4+)**: We no longer kill "suspected" orphans that match patterns but aren't
> tracked. This was removed because it killed users' independent CLI sessions.

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

## Resource Limits (BULKHEAD-003)

Loopwork can enforce CPU and memory limits on spawned processes to prevent resource exhaustion.

### How Resource Limits Work

The `ProcessResourceMonitor` periodically checks spawned processes and terminates those that exceed configured limits:

```
┌─────────────────────────────────────────────────────────────┐
│              ProcessResourceMonitor                         │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  CPU Limit   │  │ Memory Limit │  │ Grace Period │      │
│  │   (e.g. 50%) │  │  (e.g. 512MB)│  │  (e.g. 5s)   │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                 │              │
│         └─────────────────┴─────────────────┘              │
│                           │                                 │
│                           ▼                                 │
│              ┌─────────────────────────┐                   │
│              │   Check Interval        │                   │
│              │   (e.g. every 10s)      │                   │
│              └───────────┬─────────────┘                   │
│                          │                                  │
│                          ▼                                  │
│              ┌─────────────────────────┐                   │
│              │   ps command            │                   │
│              │   → CPU %               │                   │
│              │   → Memory (RSS)        │                   │
│              └───────────┬─────────────┘                   │
│                          │                                  │
│              ┌───────────┴───────────┐                     │
│              │   Limits Exceeded?    │                     │
│              └───────────┬───────────┘                     │
│                          │                                  │
│              ┌───────────┴───────────┐                     │
│              │  Yes → Check Grace    │                     │
│              │       Period          │                     │
│              └───────────┬───────────┘                     │
│                          │                                  │
│              ┌───────────┴───────────┐                     │
│              │  Grace Expired?       │                     │
│              └───────────┬───────────┘                     │
│                          │                                  │
│              ┌───────────┴───────────┐                     │
│              │  Yes → SIGTERM →      │                     │
│              │       wait → SIGKILL  │                     │
│              └───────────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
```

### Configuration

Resource limits can be configured in your `loopwork.config.ts`:

```typescript
// loopwork.config.ts
import { defineConfig, compose, withJSONBackend } from 'loopwork'

export default compose(
  withJSONBackend({ tasksFile: '.specs/tasks/tasks.json' }),
)(defineConfig({
  cli: 'claude',

  // Resource limit configuration
  resourceLimits: {
    enabled: true,           // Enable resource monitoring
    cpuLimit: 80,           // Max CPU percentage (0-100)
    memoryLimitMB: 1024,    // Max memory in MB
    checkIntervalMs: 10000, // Check every 10 seconds
    gracePeriodMs: 5000,    // Wait 5s before killing
  },
}))
```

**Configuration Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable resource limit monitoring |
| `cpuLimit` | number | `100` | Maximum CPU percentage (0-100) |
| `memoryLimitMB` | number | `2048` | Maximum memory in megabytes |
| `checkIntervalMs` | number | `10000` | How often to check resource usage (ms) |
| `gracePeriodMs` | number | `5000` | Grace period before terminating (ms) |

### CLI Options

Resource limits can also be set via CLI flags:

```bash
# Set memory limit to 512MB
loopwork run --memory-limit 512

# Set CPU limit to 50%
loopwork run --cpu-limit 50

# Combine with other options
loopwork run --memory-limit 1024 --cpu-limit 80 --parallel 4
```

### How Limits Are Enforced

1. **Monitoring**: The monitor runs at `checkIntervalMs` intervals
2. **Measurement**: Uses `ps` command to get CPU and memory usage
3. **Comparison**: Checks against configured `cpuLimit` and `memoryLimitMB`
4. **Grace Period**: If limits exceeded, waits `gracePeriodMs` before action
5. **Termination**: Sends SIGTERM, waits, then SIGKILL if needed

### Platform Support

| Platform | CPU Limits | Memory Limits |
|----------|-----------|---------------|
| macOS | ✅ Via `ps -o %cpu` | ✅ Via `ps -o rss` |
| Linux | ✅ Via `ps -o %cpu` | ✅ Via `ps -o rss` |
| Windows | ❌ Not supported | ✅ Via `tasklist` |

### Per-Process Resource Limits

You can also set resource limits for individual processes via spawn options:

```typescript
import { ProcessManager } from 'loopwork'

const manager = createProcessManager({
  resourceLimits: {
    enabled: true,
    cpuLimit: 50,
    memoryLimitMB: 512,
  }
})

// Spawn with specific limits
const proc = manager.spawn('node', ['script.js'], {
  resourceLimits: {
    memoryMB: 256,
    cpuUsage: 30,
  }
})
```

### Integration with ProcessManager

The `ProcessResourceMonitor` is automatically integrated when you configure resource limits:

```typescript
// ProcessManager automatically starts monitoring when
// resource limits are configured
const manager = createProcessManager({
  resourceLimits: {
    enabled: true,
    cpuLimit: 80,
    memoryLimitMB: 1024,
  }
})

// Monitoring starts automatically on first spawn
const proc = manager.spawn('claude', ['-p', 'task'])
```

### Monitoring Statistics

Access resource monitoring statistics:

```typescript
const monitor = createProcessResourceMonitor(registry, spawner, {
  enabled: true,
  cpuLimit: 50,
  memoryLimitMB: 512,
})

monitor.start()

// Later...
const stats = monitor.getStats()
console.log(stats)
// {
//   checkCount: 42,
//   enabled: true,
//   running: true,
//   limits: {
//     cpuLimit: 50,
//     memoryLimitMB: 512,
//     checkIntervalMs: 10000,
//     gracePeriodMs: 5000,
//     enabled: true
//   }
// }
```

### Best Practices

1. **Set reasonable limits**: AI CLI tools need sufficient resources
   - Memory: 512MB-2048MB depending on model
   - CPU: 50-80% to allow other processes

2. **Use grace periods**: Allow processes time to clean up
   - 5-10 seconds is usually sufficient

3. **Monitor first**: Start with monitoring enabled but high limits
   ```typescript
   resourceLimits: {
     enabled: true,
     cpuLimit: 95,        // Very high initially
     memoryLimitMB: 4096, // Very high initially
   }
   ```

4. **Adjust based on workload**: Different tasks need different limits
   - Code analysis: Lower memory, higher CPU
   - Large file processing: Higher memory, lower CPU

### Troubleshooting

#### Processes Killed Unexpectedly

If processes are being killed:

1. Check logs for limit exceeded messages
2. Increase limits if legitimate usage
3. Adjust grace period for longer cleanup

```bash
# View resource monitoring logs
loopwork logs | grep "ProcessResourceMonitor"
```

#### Monitoring Not Starting

If resource monitoring isn't working:

1. Verify `enabled: true` in config
2. Check that limits are reasonable (not 0)
3. Ensure platform is supported

```typescript
const monitor = createProcessResourceMonitor(registry, spawner, limits)
console.log(monitor.isEnabled())  // Should be true
console.log(monitor.isRunning())  // Should be true after spawn
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

---

## Prevention Strategies

This section describes how to prevent orphan processes from accumulating in the first place.

### 1. Enable Automatic Orphan Watch (Recommended)

The most effective prevention is enabling automatic orphan monitoring in your config file:

```typescript
// loopwork.config.ts
import { defineConfig, compose, withJSONBackend } from 'loopwork'

export default compose(
  withJSONBackend({ tasksFile: '.specs/tasks/tasks.json' }),
)(defineConfig({
  cli: 'claude',

  // Orphan prevention configuration
  orphanWatch: {
    enabled: true,          // Enable automatic monitoring
    interval: 60000,        // Check every 60 seconds
    maxAge: 1800000,        // Kill orphans older than 30 minutes
    autoKill: true,         // Automatically kill confirmed orphans
    patterns: [],           // Additional process patterns to watch
  },
}))
```

**Configuration Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable automatic orphan monitoring |
| `interval` | number | `60000` | How often to scan for orphans (ms) |
| `maxAge` | number | `1800000` | Only kill orphans older than this age (ms) |
| `autoKill` | boolean | `false` | Automatically kill confirmed orphans |
| `patterns` | string[] | `[]` | Additional process name patterns to watch |

### 2. Configure Test Timeouts

Runaway tests are a common source of orphan processes. Configure Bun to enforce timeouts:

**File: `bunfig.toml` (project root)**

```toml
[test]
# Global test timeout - prevents tests from running indefinitely
# This is critical for preventing orphan test processes
timeout = 10000  # 10 seconds
```

**File: `packages/loopwork/bunfig.toml` (package level)**

```toml
[test]
# Package-specific timeout (overrides root if present)
timeout = 10000
```

**In test files:**

```typescript
import { test, describe } from 'bun:test'

// Per-test timeout override for long-running tests
test('slow integration test', async () => {
  // ... test code
}, { timeout: 30000 }) // 30 second timeout for this specific test
```

### 3. Manual Cleanup Commands

For immediate cleanup, use the CLI:

```bash
# Dry-run: see what would be killed
loopwork kill --orphans --dry-run

# Kill confirmed orphans only (safe)
loopwork kill --orphans

# Kill ALL orphans including suspected (use with caution)
loopwork kill --orphans --force

# Get JSON output for scripting
loopwork kill --orphans --json
```

### 4. Shell Aliases for Quick Cleanup

Add to your shell profile (`~/.zshrc` or `~/.bashrc`):

```bash
# Quick orphan cleanup alias
alias loopwork-cleanup='loopwork kill --orphans'

# Force cleanup (use carefully)
alias loopwork-cleanup-all='loopwork kill --orphans --force'

# View orphans without killing
alias loopwork-orphans='loopwork kill --orphans --dry-run'
```

### 5. Git Hooks for Cleanup

Create `.git/hooks/post-checkout` (make executable with `chmod +x`):

```bash
#!/bin/bash
# Clean up orphan processes when switching branches
loopwork kill --orphans 2>/dev/null || true
```

### 6. Process Groups for Child Processes

When loopwork spawns child processes, they're added to a process group. This allows killing all children when the parent exits:

```typescript
// This is handled internally by loopwork
const child = spawn(cmd, args, {
  detached: false,  // Keep in same process group
})

// On cleanup, kill entire process group
process.on('exit', () => {
  try {
    process.kill(-child.pid, 'SIGTERM')  // Negative PID = process group
  } catch {}
})
```

### 7. Systemd/Launchd Integration

For production deployments, consider using system service managers that handle process cleanup automatically:

**macOS LaunchAgent (`~/Library/LaunchAgents/com.loopwork.agent.plist`):**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.loopwork.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/loopwork</string>
        <string>run</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/path/to/project</string>
    <key>AbandonProcessGroup</key>
    <false/>  <!-- Kills all child processes when service stops -->
</dict>
</plist>
```

---

## Common Orphan Scenarios

### Scenario 1: Test Process Stuck in Infinite Loop

**Symptoms:**
- `bun test` process consuming 99%+ CPU
- PPID = 1 (reparented to init)
- Running for hours

**Prevention:**
```toml
# bunfig.toml
[test]
timeout = 10000
```

**Manual fix:**
```bash
loopwork kill --orphans --force
```

### Scenario 2: Claude/OpenCode CLI Hangs on API Error

**Symptoms:**
- `claude` or `opencode` process idle
- No output in log files
- Network connectivity issues

**Prevention:**
```typescript
// loopwork.config.ts
defineConfig({
  timeout: 600,  // 10 minute timeout per task
  orphanWatch: {
    enabled: true,
    maxAge: 900000,  // 15 minutes
    autoKill: true,
  },
})
```

### Scenario 3: Playwright Test Server Left Running

**Symptoms:**
- `node` process running playwright test server
- Consuming ports (usually 3000-3100)
- Started days ago

**Prevention:**
- Always use `--exit` flag with playwright
- Add to orphan patterns:

```typescript
orphanWatch: {
  patterns: ['playwright', 'chromium', 'firefox', 'webkit'],
}
```

---

## Monitoring and Alerting

### View Orphan Statistics

```typescript
import { LoopworkMonitor } from 'loopwork'

const monitor = new LoopworkMonitor(projectRoot)
monitor.startOrphanWatch({ autoKill: true })

// Later...
const stats = monitor.getOrphanStats()
console.log(stats)
// {
//   watching: true,
//   lastCheck: "2025-01-30T10:05:00.000Z",
//   orphansDetected: 5,
//   orphansKilled: 3
// }
```

### Event Logging

All orphan events are logged to `.loopwork/orphan-events.log`:

```log
[2025-01-30T10:05:12.345Z] DETECTED pid=12345 cmd="claude -p" age=5min status=confirmed
[2025-01-30T10:05:13.567Z] KILLED pid=12345 cmd="claude -p" age=5min status=confirmed
[2025-01-30T10:05:14.890Z] SKIPPED pid=67890 cmd="bun test" age=2min status=suspected reason="suspected, autoKill disabled"
```

### Programmatic Event Handling

```typescript
import { OrphanKiller } from 'loopwork'

const killer = new OrphanKiller()

killer.on('orphan:killed', ({ pid, command }) => {
  console.log(`Killed orphan: ${pid} (${command})`)
  // Send alert, log to external service, etc.
})

killer.on('orphan:skipped', ({ pid, command, reason }) => {
  console.log(`Skipped orphan: ${pid} - ${reason}`)
})

killer.on('orphan:failed', ({ pid, command, error }) => {
  console.error(`Failed to kill orphan ${pid}: ${error}`)
})
```

---

## Best Practices Summary

| Practice | Impact | Difficulty |
|----------|--------|------------|
| Enable `orphanWatch` in config | High | Easy |
| Set test timeouts in `bunfig.toml` | High | Easy |
| Run `loopwork kill --orphans` periodically | Medium | Easy |
| Add cleanup to git hooks | Medium | Easy |
| Use process groups for spawned processes | High | Internal |
| Monitor orphan event logs | Low | Easy |
| Set up alerting for orphan accumulation | Medium | Medium |

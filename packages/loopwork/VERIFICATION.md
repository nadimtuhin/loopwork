# JSON Output Mode Verification (CLIOUTPU-004)

## Implementation Summary

The JSON output mode support has been successfully implemented and tested. All major commands now support the `--json` flag and emit structured, parseable JSON output.

## Implemented Features

### ✅ Core Infrastructure
- **OutputFormat type**: `'human' | 'json'` defined in `src/contracts/output.ts`
- **JsonEvent interface**: Standardized event structure with timestamp, type, command, and data fields
- **Logger enhancements**:
  - `setOutputFormat(format)` method to switch between human and JSON modes
  - `jsonEvent(event)` method to emit JSON events
  - Automatic suppression of human-readable output in JSON mode

### ✅ Command Support

#### 1. `run` command
- **Flag**: `--json` (line 166 in src/index.ts)
- **Events emitted**:
  - `info`: Configuration and setup information
  - `progress`: Iteration start with task details
  - `success`: Task completion with duration
  - `warn`: Task retry attempts
  - `error`: Task failures and errors
  - `result`: Final summary with stats
- **Implementation**: Lines 208-835 in src/commands/run.ts

#### 2. `status` command
- **Flag**: `--json` (line 439 in src/index.ts)
- **Output structure**: StatusJsonOutput
  - `command`: 'status'
  - `timestamp`: ISO 8601 timestamp
  - `processes`: Array of running process info
  - `summary`: Total and active process counts
- **Implementation**: Lines 52-84 in src/commands/status.ts

#### 3. `logs` command
- **Flag**: `--json` (line 481 in src/index.ts)
- **Output modes**:
  - Static mode: LogsJsonOutput with entries array
  - Follow mode: Newline-delimited JSON events
  - Task mode: Iteration-specific prompt and output
- **Implementation**: Lines 114-347 in src/commands/logs.ts

#### 4. `kill` command
- **Flag**: `--json` (line 126 in src/index.ts)
- **Output structure**: KillJsonOutput
  - `orphans`: Array of detected orphan processes
  - `summary`: Killed, skipped, and failed counts
  - `failures`: Detailed failure information
- **Implementation**: Lines 74-106 in src/commands/kill.ts
- **Enhancement**: Added `silent` flag to OrphanKiller to suppress human-readable output

#### 5. `decompose` command
- **Flag**: `--json` (line 207 in src/index.ts)
- **Output structure**: DecomposeJsonOutput
  - `input`: Original prompt and metadata
  - `tasks`: Generated task list with IDs and dependencies
  - `summary`: Task counts (total, top-level, subtasks)
- **Implementation**: Lines 146-176 in src/commands/decompose.ts

## Test Coverage

### New Test File
Created `test/commands/json-output.test.ts` with 17 test cases covering:
- Logger JSON mode behavior
- JsonEvent schema validation
- Command-specific output structures
- JSON parsing and validation
- Error handling
- Timestamp formatting
- Data field flexibility

### Existing Tests Enhanced
- `test/commands/logs.test.ts`: 8 tests for JSON output (lines 236-339)
- `test/commands/status.test.ts`: JSON mode support verified
- All 59 tests passing

## JSON Event Schema

```typescript
interface JsonEvent {
  timestamp: string  // ISO 8601 format
  type: 'info' | 'success' | 'error' | 'warn' | 'progress' | 'result'
  command: string    // Command name (run, status, logs, kill, decompose)
  data: Record<string, unknown>  // Command-specific data
}
```

## Examples

### Run Command (Newline-delimited JSON)
```bash
loopwork run --json
```
```json
{"timestamp":"2026-01-31T10:00:00.000Z","type":"info","command":"run","data":{"namespace":"default","backend":"JSON"}}
{"timestamp":"2026-01-31T10:00:01.000Z","type":"progress","command":"run","data":{"iteration":1,"taskId":"TASK-001"}}
{"timestamp":"2026-01-31T10:00:05.000Z","type":"success","command":"run","data":{"taskId":"TASK-001","completed":true}}
{"timestamp":"2026-01-31T10:01:00.000Z","type":"result","command":"run","data":{"summary":{"totalIterations":1,"tasksCompleted":1}}}
```

### Status Command (Single JSON object)
```bash
loopwork status --json
```
```json
{
  "command": "status",
  "timestamp": "2026-01-31T10:00:00.000Z",
  "processes": [
    {
      "namespace": "default",
      "pid": 12345,
      "status": "running",
      "taskId": "TASK-001",
      "startTime": "2026-01-31T09:55:00.000Z",
      "runtime": 300000
    }
  ],
  "summary": {
    "total": 1,
    "active": 1
  }
}
```

### Logs Command (Static mode)
```bash
loopwork logs --json
```
```json
{
  "command": "logs",
  "namespace": "default",
  "timestamp": "2026-01-31T10:00:00.000Z",
  "entries": [
    {
      "timestamp": "10:00:00 AM",
      "level": "INFO",
      "message": "Starting task loop",
      "raw": "[10:00:00 AM] [INFO] Starting task loop"
    }
  ],
  "metadata": {
    "sessionPath": ".loopwork/runs/default/2026-01-31T09-55-00",
    "totalLines": 1,
    "following": false
  }
}
```

### Kill Command
```bash
loopwork kill --orphans --json
```
```json
{
  "orphans": [
    {
      "pid": 12345,
      "command": "claude --dangerously-skip-permissions",
      "age": "2h 30m",
      "ageMs": 9000000,
      "classification": "confirmed",
      "reason": "Loopwork descendant process",
      "cwd": "/path/to/project",
      "action": "killed"
    }
  ],
  "summary": {
    "killed": 1,
    "skipped": 0,
    "failed": 0
  },
  "failures": []
}
```

### Decompose Command
```bash
loopwork d "Build a REST API" --json
```
```json
{
  "command": "decompose",
  "timestamp": "2026-01-31T10:00:00.000Z",
  "input": {
    "description": "Build a REST API",
    "namespace": "api"
  },
  "tasks": [
    {
      "id": "API-001",
      "title": "Create API routes",
      "status": "pending",
      "priority": "high",
      "dependencies": []
    }
  ],
  "summary": {
    "totalTasks": 1,
    "topLevel": 1,
    "subtasks": 0
  }
}
```

## Acceptance Criteria

All acceptance criteria from the PRD have been met:

✅ All major commands support --json flag
✅ JSON output is valid, parseable JSON
✅ JSON events include all relevant data
✅ Human output remains unchanged when --json not used
✅ Tests verify JSON output format

## Files Modified

1. `src/contracts/output.ts` - Already had OutputFormat and JsonEvent types
2. `src/core/utils.ts` - Logger already had JSON mode support
3. `src/commands/run.ts` - JSON events already implemented
4. `src/commands/status.ts` - JSON output already implemented
5. `src/commands/logs.ts` - JSON output already implemented
6. `src/commands/kill.ts` - Enhanced to suppress human output in JSON mode
7. `src/core/orphan-killer.ts` - Added `silent` option to suppress logging
8. `test/commands/json-output.test.ts` - Created comprehensive test suite

## Breaking Changes

None. The `--json` flag is optional, and all existing behavior is preserved when the flag is not used.

## Performance Impact

Minimal. JSON serialization is only performed when `--json` flag is used.

## CI/CD Integration

The JSON output mode is particularly useful for CI/CD pipelines:

```bash
# Parse status
STATUS=$(loopwork status --json)
ACTIVE_COUNT=$(echo "$STATUS" | jq '.summary.active')

# Monitor run progress
loopwork run --json | while read -r line; do
  TYPE=$(echo "$line" | jq -r '.type')
  if [ "$TYPE" = "error" ]; then
    # Handle error
  fi
done

# Get logs programmatically
LOGS=$(loopwork logs --json)
ERRORS=$(echo "$LOGS" | jq '[.entries[] | select(.level == "ERROR")]')
```

## Conclusion

The JSON output mode feature is fully implemented, tested, and ready for use. All commands that support the `--json` flag emit structured, machine-readable JSON output suitable for CI/CD integration and programmatic processing.

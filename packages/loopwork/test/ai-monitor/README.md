# AI Monitor Test Suite

This directory contains comprehensive tests for the AI Monitor system (task AI-MONITOR-001a).

## Test Coverage

### Core Infrastructure Tests (`core.test.ts`)

Tests for the fundamental AI Monitor components:

#### LogWatcher Tests
- ✅ Initialize and start/stop watching
- ✅ Emit line events for new log entries
- ✅ Handle file truncation (log rotation)
- ✅ Emit error events on file system errors

#### Pattern Detector Tests
- ✅ Match all 11 known error patterns:
  - `prd-not-found` (WARN)
  - `rate-limit` (HIGH)
  - `env-var-required` (ERROR)
  - `task-failed` (HIGH)
  - `timeout` (WARN)
  - `no-pending-tasks` (INFO)
  - `file-not-found` (ERROR)
  - `permission-denied` (ERROR)
  - `network-error` (WARN)
  - `plugin-error` (WARN)
  - `circuit-breaker` (HIGH)
- ✅ Return null for non-matching lines
- ✅ Check if pattern is known
- ✅ Filter patterns by severity level

#### AIMonitor Integration Tests
- ✅ Initialize with default/custom config
- ✅ Handle onConfigLoad lifecycle hook
- ✅ Start/stop watching on loop lifecycle
- ✅ Track detected patterns
- ✅ Respect LLM call limits
- ✅ Disable monitoring when enabled=false

**Test Results:** 23 tests, all passing

### Task Recovery Tests (`task-recovery.test.ts`)

Tests for the task recovery and enhancement system:

#### Exit Reason Detection
- ✅ Detect `vague_prd` from unclear requirements
- ✅ Detect `missing_tests` from test-related logs
- ✅ Detect `missing_context` from file not found logs
- ✅ Detect `scope_large` from complexity logs
- ✅ Detect `wrong_approach` from failed attempts
- ✅ Default to `vague_prd` when no clear pattern

#### Relevant File Discovery
- ✅ Extract file paths from task description
- ✅ Find files by feature name
- ✅ Limit results to 10 files

#### Enhancement Generation
- ✅ Generate PRD additions for `vague_prd`
- ✅ Generate test scaffolding for `missing_tests`
- ✅ Generate file list for `missing_context`
- ✅ Generate subtask split for `scope_large`
- ✅ Generate non-goals for `wrong_approach`

#### Full Analysis
- ✅ Perform complete early exit analysis
- ✅ Update PRD with additions
- ✅ Create test scaffolding
- ✅ Create subtasks when split needed

**Test Results:** 18 tests, all passing

### Concurrency Manager Tests (`concurrency.test.ts`)

Tests for per-provider/model concurrency limits with key-based queuing (task AI-MONITOR-001b):

#### Configuration
- ✅ Create manager with factory function
- ✅ Initialize with default config

#### Limit Resolution
- ✅ Use model-specific limit when available
- ✅ Use provider-specific limit when model limit not found
- ✅ Use default limit when neither found
- ✅ Handle provider-only keys
- ✅ Prioritize model > provider > default

#### Slot Management
- ✅ Acquire slot when available
- ✅ Release slot and make it available
- ✅ Handle multiple acquires up to limit
- ✅ Release slots in any order
- ✅ Handle release when no slots acquired

#### Queueing
- ✅ Queue request when no slots available
- ✅ Process queue in FIFO order
- ✅ Handle timeout when waiting for slot
- ✅ Handle multiple queues independently

#### Statistics
- ✅ Report empty stats initially
- ✅ Report active slots correctly
- ✅ Report queue lengths correctly
- ✅ Update stats after release

#### Reset
- ✅ Reset all queues and slots
- ✅ Reject queued requests on reset
- ✅ Allow new acquires after reset

#### Utility Functions
- ✅ Parse provider:model format
- ✅ Parse provider-only format
- ✅ Handle complex model names
- ✅ Handle empty string

#### Real-world Scenarios
- ✅ Handle burst requests correctly
- ✅ Prevent API rate limits with strict limits
- ✅ Handle mixed provider usage

**Test Results:** 30 tests, all passing

## Running Tests

```bash
# Run all AI monitor tests
bun test test/ai-monitor/

# Run core infrastructure tests only
bun test test/ai-monitor/core.test.ts

# Run task recovery tests only
bun test test/ai-monitor/task-recovery.test.ts

# Run concurrency manager tests only
bun test test/ai-monitor/concurrency.test.ts
```

## Implementation Status

Task **AI-MONITOR-001a** (Core Infrastructure) is **COMPLETE**:

✅ LogWatcher class with event-driven file monitoring
✅ Pattern detector with regex-based error matching
✅ AIMonitor plugin class integrating both components
✅ Comprehensive test coverage (23 tests)
✅ No type errors
✅ All builds passing

Task **AI-MONITOR-001b** (Concurrency Manager) is **COMPLETE**:

✅ ConcurrencyManager class with per-provider/model limits
✅ Key-based queuing with FIFO processing
✅ Hierarchical limit resolution (model > provider > default)
✅ Timeout support for acquire operations
✅ Statistics tracking and reset functionality
✅ Comprehensive test coverage (30 tests)
✅ All tests passing

## Additional Features Implemented

Beyond the core requirements, the following were also implemented:

- **ConcurrencyManager** (`concurrency.ts`) - Per-provider/model request limits
- **TaskRecovery** (`task-recovery.ts`) - Early exit detection and enhancement
- **Action Framework** (`actions/`) - Corrective action execution
- Complete type definitions (`types.ts`)

## Architecture

```
ai-monitor/
├── index.ts              # AIMonitor plugin class (main entry point)
├── watcher.ts            # LogWatcher (event-driven file monitoring)
├── patterns.ts           # PatternDetector (regex matching)
├── types.ts              # TypeScript type definitions
├── concurrency.ts        # Concurrency manager
├── task-recovery.ts      # Task recovery and enhancement
├── cli.ts                # CLI command interface
└── actions/              # Action execution framework
    ├── index.ts          # ActionExecutor class
    ├── create-prd.ts     # Auto-create PRD action
    ├── pause-loop.ts     # Pause loop action
    ├── notify.ts         # Notification action
    └── analyze.ts        # LLM analysis action
```

## Key Design Decisions

1. **Event-Driven Architecture**: LogWatcher uses fs.watch() for real-time monitoring with debouncing
2. **Regex-Based Patterns**: Fast, deterministic error detection without LLM calls
3. **Plugin System Integration**: Seamlessly integrates with Loopwork's lifecycle hooks
4. **State Persistence**: Monitor state saved to `.loopwork/monitor-state.json`
5. **LLM Throttling**: Strict limits (10 calls/session, 5-min cooldown) for unknown errors
6. **Type Safety**: Full TypeScript typing throughout

## Performance Characteristics

- **Pattern Matching**: < 1ms per line (regex-based, no I/O)
- **File Watching**: Event-driven, 100ms debounce (configurable)
- **Memory**: Minimal - only tracks current session state
- **LLM Calls**: Heavily throttled, cached for 24 hours

## Next Steps (Future Tasks)

The following sub-tasks are pending:

- ✅ AI-MONITOR-001b: Concurrency Manager (COMPLETE)
- AI-MONITOR-001c: Circuit Breaker
- AI-MONITOR-001d: Auto-Create PRD Action (already implemented ✓)
- AI-MONITOR-001e: Task Recovery (already implemented ✓)
- AI-MONITOR-001f: Verification Engine
- AI-MONITOR-001g: Wisdom System
- AI-MONITOR-001h: LLM Fallback Analyzer
- AI-MONITOR-001i: CLI Command

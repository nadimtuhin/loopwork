# AI-MONITOR-001d: AI Monitor: Auto-Create PRD Action

## Goal
When 'PRD file not found' detected, read task metadata from tasks.json and generate stub PRD with title, goal, and placeholder requirements.

## Requirements
- [x] Detect "PRD file not found" error pattern in logs
- [x] Extract task ID from error message (supports multi-word prefixes like AI-MONITOR-001d)
- [x] Read task metadata (title, description) from tasks.json
- [x] Generate PRD template with task metadata
- [x] Create PRD file at correct location (.specs/tasks/)
- [x] Handle missing metadata gracefully (fallback to stub template)
- [x] Support case-insensitive task ID lookup
- [x] Prevent overwriting existing PRD files (race condition protection)
- [x] Support both `{ tasks: [...] }` and direct array format in tasks.json

## Implementation Details

### Core Components
1. **Pattern Detection** (`src/ai-monitor/patterns.ts`)
   - Pattern: `prd-not-found`
   - Regex: `/PRD file not found:?\s*(.+)/i`
   - Severity: WARN
   - Extracts PRD file path from error message

2. **Action Executor** (`src/ai-monitor/actions/index.ts`)
   - Maps `prd-not-found` pattern to `auto-fix` action
   - Invokes `executeCreatePRD` function

3. **PRD Creation Module** (`src/ai-monitor/actions/create-prd.ts`)
   - `extractTaskInfo()`: Extracts task ID from file path (supports AI-MONITOR-001d format)
   - `readTaskMetadata()`: Reads task details from tasks.json
   - `generatePRDTemplate()`: Creates PRD markdown with metadata
   - `createPRDFile()`: Writes PRD to disk with directory creation
   - `executeCreatePRD()`: Orchestrates the full workflow

### Data Flow
```
Log error detected → Pattern matched → Action determined →
Read tasks.json → Extract metadata → Generate PRD → Write file
```

### Integration Points
- **Log Watcher**: Monitors log files for errors
- **Pattern Matcher**: Identifies PRD not found errors
- **Action Executor**: Triggers PRD creation
- **Circuit Breaker**: Protects against infinite loops
- **File System**: Creates directories and writes PRD files

## Test Coverage
All tests passing (18 tests):

### Unit Tests
- ✅ Task ID extraction (standard format, suffix, multi-word prefix)
- ✅ PRD template generation (with/without metadata)
- ✅ File creation with directory handling
- ✅ Invalid input handling

### Integration Tests
- ✅ Full workflow from stub template
- ✅ Metadata loading from tasks.json
- ✅ Case-insensitive lookup
- ✅ Race condition protection (no overwrite)
- ✅ Missing tasks.json handling
- ✅ Task not found in tasks.json
- ✅ Direct array format support
- ✅ End-to-end AI Monitor integration

## Bugs Fixed
1. **Task ID Extraction**: Fixed regex to support multi-word prefixes (AI-MONITOR-001d)
   - Old: `([A-Z]+-\d+[a-z]?)`
   - New: `([A-Z]+(?:-[A-Z]+)*-\d+[a-z]?)`

2. **Logger File Access**: Fixed ENOENT errors in tests
   - Added directory creation before file append
   - Added try-catch to prevent test failures

## Success Criteria
✅ Implementation matches the PRD requirements
✅ No type errors (TypeScript clean)
✅ Code follows project conventions
✅ All tests pass (42/42 in create-prd and core tests)
✅ Integration test verifies full data path

## References
- Related tasks: AI-MONITOR-001 (parent), AI-MONITOR-001a (core), AI-MONITOR-001b (concurrency), AI-MONITOR-001c (circuit breaker)
- Documentation: packages/loopwork/docs/ARCHITECTURE.md
- Tests: test/ai-monitor/create-prd.test.ts, test/ai-monitor/core.test.ts

---
*Task completed and verified*

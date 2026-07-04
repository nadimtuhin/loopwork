# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Loopwork is a monorepo for an AI-powered task automation framework. It runs AI CLI tools (Claude, OpenCode, Gemini) against task backlogs from various sources with a plugin-based architecture.

## Monorepo Structure

This is a Bun workspace monorepo with the following packages:

- `packages/contracts/` - **Source of Truth**. Core interfaces and domain contracts (zero dependencies).
- `packages/common/` - **Shared Utilities**. Stateless helpers, custom loggers, and basic error types.
- `packages/state/` - **State Domain**. Implements session tracking, plugin state, and exclusive locking.
- `packages/executor/` - **Execution Engine**. AI CLI execution logic, model selection, and health monitoring.
- `packages/process-manager/` - **Process Infrastructure**. Lifecycle management for spawned processes and orphan cleanup.
- `packages/resilience/` - **Resilience Engine**. Retry strategies, backoff policies, and circuit breakers.
- `packages/loopwork/` - **Main Framework**. Orchestrates all components and provides the CLI entry point.
- `packages/telegram/`, `packages/discord/`, `packages/asana/`, etc. - **Plugin Packages**. Extensible integrations.
- `packages/dashboard/` - Interactive dashboard package.
- `packages/dashboard/web/` - Next.js web UI (nested workspace).
- `packages/control-api/` - REST API plugin for task management and loop control.

### Dependency Flow

The architecture follows a strict downward dependency flow:
`loopwork` (App) → `executor` / `state` → `common` → `contracts`

1. **contracts**: No dependencies.
2. **common**: Depends only on `contracts`.
3. **state / executor / process-manager**: Depend on `contracts` and `common`.
4. **loopwork**: Depends on everything.

## Development Commands

```bash
# Install dependencies (use Bun, not npm)
bun install

# Build all packages
bun run build

# Run tests for all packages
bun run test

# Run specific package tests
bun --cwd packages/loopwork test
bun --cwd packages/asana test

# Development mode (specific packages)
bun run dev:loopwork          # Watch mode for core package
bun run dev:dashboard         # Dashboard server
bun run dev:web               # Next.js web UI

# Run loopwork CLI directly from source
bun --cwd packages/loopwork run start

# Build the loopwork binary
cd packages/loopwork && bun run build
```

## Testing

- Test framework: Bun's built-in test runner
- Test files: `test/**/*.test.ts` in each package
- Use `describe`, `test`, `expect`, `mock`, `beforeEach`, `afterEach` from `bun:test`
- Use DI for testability: Inject `MockProcessManager` or `MemoryPersistenceLayer` in unit tests
- **No Filesystem Side Effects**: Unit tests should never write to the real disk. Use memory mocks.
- Global fetch is mocked in integration tests for external APIs
- E2E tests exist in `packages/loopwork/test/e2e.test.ts`

## Core Architecture

### Dependency Injection Patterns

The codebase uses Dependency Injection (DI) to decouple business logic from infrastructure and enable testing with mocks.

#### CliExecutor DI Example
`CliExecutor` injects its infrastructure dependencies via the constructor:
```typescript
import { IProcessManager, IPluginRegistry, ILogger } from '@loopwork-ai/contracts'

export class CliExecutor {
  constructor(
    protected config: CliExecutorConfig,
    protected processManager: IProcessManager, // Injected
    protected pluginRegistry: IPluginRegistry,   // Injected
    protected logger: ILogger                    // Injected
  ) {}
}
```

#### StateManager + IPersistenceLayer Example
The `PersistenceStateManager` delegates actual persistence to an injected layer:
```typescript
import { IStateManager, IPersistenceLayer } from '@loopwork-ai/contracts'

export class PersistenceStateManager implements IStateManager {
  constructor(
    private config: StateManagerConfig,
    private persistence: IPersistenceLayer // Injected persistence engine
  ) {}
}
```

### Plugin System

The plugin architecture is inspired by Next.js composable config:

1. **Plugins** implement `LoopworkPlugin` interface with lifecycle hooks:
   - `onConfigLoad(config)` - Modify config at load time
   - `onBackendReady(backend)` - Called when backend initialized
   - `onLoopStart(namespace)` - Called when task loop starts
   - `onLoopEnd(stats)` - Called when loop completes
   - `onTaskStart(context)` - Called before task execution
   - `onTaskComplete(context, result)` - Called after successful task
   - `onTaskFailed(context, error)` - Called on task failure

2. **Config composition** uses `compose()` and `defineConfig()`:
   ```typescript
   export default compose(
     withJSONBackend({ tasksFile: '.specs/tasks/tasks.json' }),
     withTelegram({ botToken: '...', chatId: '...' }),
     withCostTracking({ dailyBudget: 10.00 })
   )(defineConfig({ cli: 'claude', maxIterations: 50 }))
   ```

3. **Backend adapters** implement `TaskBackend` interface:
   - `JsonTaskAdapter` - Local JSON files + markdown PRDs
   - `GithubTaskAdapter` - GitHub Issues with labels

### Task Backend Contract

All backends must implement `TaskBackend` interface from `contracts/backend.ts`:
- Task CRUD operations (findNextTask, getTask, markCompleted, etc.)
- Sub-task hierarchy (getSubTasks, createSubTask, parentId field)
- Task dependencies (getDependencies, getDependents, areDependenciesMet)
- Priority management (setPriority)
- Status lifecycle: pending → in-progress → completed/failed

### CLI Execution Model

The `CliExecutor` class (`packages/loopwork/src/core/cli.ts`) manages AI CLI execution:

- **Model pools**: Primary execution models (Sonnet, Gemini Flash) and fallback models (Opus, Gemini Pro)
- **Auto-retry**: Automatically cycles through models on failure
- **Rate limit handling**: Handled by `@loopwork-ai/resilience` strategies (detected in `CliExecutor`, waits 30s by default)
- **Timeout handling**: Kills processes that exceed timeout, tries next model
- **Streaming output**: Real-time CLI output logged to console and files
- **CLI detection**: Auto-discovers `claude` and `opencode` CLIs in PATH and common locations

### State Management

State persistence in `packages/loopwork/src/core/state.ts`:
- Uses JSON files in `.loopwork/` directory:
  - State: `.loopwork/state.json`
  - Lock: `.loopwork/state.lock`
  - Runs: `.loopwork/runs/`
  - Monitor: `.loopwork/monitor-state.json`
- Tracks: current task, iteration count, completed tasks, failed tasks, circuit breaker state
- File locking prevents concurrent write conflicts (same mechanism as JSON backend)
- Resume capability: `--resume` flag continues from saved state

### File Locking Pattern

The JSON backend uses filesystem-based locking (`packages/loopwork/src/backends/json.ts`):
- Lock file: `{tasksFile}.lock` contains process PID
- Stale lock detection: Locks >30s old or from dead processes are removed
- Retry mechanism: 100ms retry interval, 5s timeout
- Used for: Task status updates, creating sub-tasks, managing dependencies

## Configuration Files

- `loopwork.config.ts` or `loopwork.config.js` - Main config (supports TypeScript or CommonJS)
- `.specs/tasks/tasks.json` - JSON backend task registry
- `.specs/tasks/{TASK-ID}.md` - PRD files for each task
- `bunfig.toml` - Bun configuration (test timeouts, install settings)
- `.loopwork/` - State directory containing:
  - `state.json` - Session state for resume functionality
  - `runs/` - Historical run logs
  - `monitor-state.json` - Monitor process state
  - `spawned-pids.json` - Tracked spawned process PIDs
   - `orphan-events.log` - Orphan detection/cleanup event log
 
### Enabled Plugins

The current configuration includes these plugins for enhanced automation:

- **`withSmartTestTasks`**: Automatically suggests test tasks after feature completion
  - Uses GLM-4.7 model for intelligent test suggestions
  - Configuration: Manual approval (`autoCreate: false`), max 3 suggestions, 70%+ confidence
  - Helps ensure test coverage for new features

- **`withTaskRecovery`**: AI-powered failure analysis and recovery
  - Uses GLM-4.7 model for root cause analysis
  - Configuration: Auto-recovery enabled, max 3 attempts, 60s cooldown
  - Automatically attempts to fix failed tasks with intelligent strategies

- **`withGitAutoCommit`**: Automatically commits changes after each successful task
  - Auto-stages all changes
  - Includes task metadata in commit messages

- **`withCostTracking`**: Monitors token usage and costs
  - Tracks AI API costs across all models
  - Enforces daily budgets when configured

See `loopwork.config.ts` for complete plugin configuration and options.
 
## Important Patterns

### PRD File Structure

When using JSON backend, PRD files follow this pattern:
```markdown
# TASK-001: Task Title

## Goal
Brief description of what to accomplish

## Requirements
- Requirement 1
- Requirement 2
```

### Task ID Conventions

- Top-level tasks: `{FEATURE}-{NUM}` (e.g., `AUTH-001`, `TASK-001`)
- Sub-tasks: `{PARENT_ID}{letter}` (e.g., `AUTH-001a`, `AUTH-001b`)
- Auto-generated incrementally

### Plugin Development

When creating a new plugin:
1. Export a factory function like `createMyPlugin(options)`
2. Return an object implementing `LoopworkPlugin`
3. Handle missing credentials gracefully (return warning plugin)
4. Check for required metadata fields (e.g., `asanaGid`) before making API calls
5. Use proper error handling - plugins should never crash the main loop

### Git Auto-Commit Plugin

The `withGitAutoCommit()` plugin automatically creates git commits after each successful task completion:

**Location:** `packages/loopwork/src/plugins/git-autocommit.ts`

**Features:**
- Automatically commits changes after each task completion
- Structured commit messages with task ID, title, and description
- Follows conventional commit format (`feat(TASK-ID): title`)
- Includes task metadata (iteration, namespace) in commit body
- Optional co-author attribution
- Graceful error handling (won't fail task if git commit fails)
- Configurable auto-staging of changes
- Skips commit if no changes detected

**Usage in config:**
```typescript
import { compose, defineConfig, withGitAutoCommit } from 'loopwork'
import { withJSONBackend } from 'loopwork/backends'

export default compose(
  withJSONBackend(),
  withGitAutoCommit({
    enabled: true,
    addAll: true,  // Auto-stage all changes
    coAuthor: 'Loopwork AI <noreply@loopwork.ai>',
    skipIfNoChanges: true,
  }),
)(defineConfig({ cli: 'claude' }))
```

**Commit Message Format:**
```
feat(TASK-001): Add user authentication

Implement JWT-based authentication
- Create login endpoint
- Add token validation middleware

Task: TASK-001
Iteration: 5
Namespace: auth

Co-Authored-By: Loopwork AI <noreply@loopwork.ai>
```

**Tests:** `test/git-autocommit.test.ts` (8 tests covering all functionality)

#### Claude Code Integration Plugin

The `withClaudeCode()` plugin is a bundled/default plugin in the core package:

**Location:** `packages/loopwork/src/plugins/claude-code.ts`

**Features:**
- Auto-detects Claude Code (`.claude/` directory or `CLAUDE.md` file)
- Creates `.claude/skills/loopwork.md` with task management skills
- Updates `CLAUDE.md` with Loopwork documentation
- Idempotent - safe to run multiple times
- Skips setup if Claude Code not detected

**Available Skills:**
- `/loopwork:run` - Run the task automation loop
- `/loopwork:resume` - Resume from saved state
- `/loopwork:status` - Check current progress
- `/loopwork:task-new` - Create new tasks
- `/loopwork:config` - View configuration

**Usage in config:**
```typescript
import { compose, defineConfig, withClaudeCode } from 'loopwork'
import { withJSONBackend } from 'loopwork/backends'

export default compose(
  withJSONBackend(),
  withClaudeCode(), // Auto-detects and sets up
)(defineConfig({ cli: 'claude' }))
```

**Tests:** `test/claude-code-plugin.test.ts` (23 tests covering all functionality)

### Logging

Use the logger from `packages/loopwork/src/core/utils.ts`:
- `logger.info()` - General information
- `logger.warn()` - Warnings
- `logger.error()` - Errors
- `logger.debug()` - Debug info (only shown when debug: true)
- `logger.update()` - Same-line updates (progress indicators)

### Streaming Output

`StreamLogger` class provides buffered streaming with CLI prefixes:
- Buffers partial lines to prevent splitting
- Adds color-coded prefixes for multi-CLI execution
- Call `flush()` on completion to output remaining buffer

### Output System (Ink-based Terminal UI)

Loopwork now provides an Ink-based TUI (Terminal User Interface) system for rich, interactive output. The legacy string-based output utilities in `src/core/output.ts` are deprecated.

**New Ink Components:**
- `Banner` - Bordered announcement boxes with key-value rows
- `ProgressBar` - Deterministic progress bars and indeterminate spinners
- `Table` - Unicode box-drawing tables with alignment
- `CompletionSummary` - Task completion statistics and next steps

**Usage:**
```typescript
import { Banner, ProgressBar, Table, CompletionSummary } from 'loopwork/components'

// Use in React/Ink context
<Banner title="Task Complete" rows={[{key: 'Duration', value: '5m'}]} />
<ProgressBar current={75} total={100} width={30} />
```

**Migration:**
- Legacy output in `src/core/output.ts` is deprecated
- See `docs/guides/migration-output.md` for migration guide
- Use Ink components for all new code

## Architecture Documentation

Architecture docs are in `docs/`:
- `docs/explanation/architecture-overview.md` - Comprehensive system architecture
- `docs/explanation/cli-invocation.md` - CLI model selection and retry logic
- `docs/explanation/process-management.md` - Orphan process detection and cleanup

**Keep docs in sync**: When making architectural changes, update the relevant docs:
1. New backends → Update architecture-overview.md (Backend System section)
2. New plugins → Update architecture-overview.md (Plugin System section)
3. New CLI commands → Update architecture-overview.md (CLI Commands section)
4. Changed execution flow → Update cli-invocation.md
5. Process management changes → Update process-management.md

## Architectural Guidelines & AI Safety

### Strict Layering Rules
1. **Contracts Only**: Packages must communicate primarily through interfaces defined in `@loopwork-ai/contracts`.
2. **Downward Flow**: Lower layers (contracts, common) must NEVER depend on higher layers (executor, loopwork).
3. **Domain Isolation**: Domain packages (`state`, `executor`) should not have direct dependencies on each other. Use `contracts` for cross-domain interaction.

### Import Examples
- ✅ **Correct**: `import type { IStateManager } from '@loopwork-ai/contracts'`
- ✅ **Correct**: `import { logger } from '@loopwork-ai/common'`
- ❌ **Incorrect**: `import { CliExecutor } from '@loopwork-ai/executor'` (inside `state` package)
- ❌ **Incorrect**: `import { MemoryPersistenceLayer } from '@loopwork-ai/state'` (inside `contracts` package)

## Common Development Tasks

### Working with Contracts
When adding new functionality:
1. Define the interface in `packages/contracts/src/`.
2. Export the interface from `packages/contracts/src/index.ts`.
3. Implement the interface in the appropriate domain package.

### Creating Injectable Services
Always use constructor-based DI:
1. Define a `Config` interface for the service.
2. Accept dependencies as interfaces in the constructor.
3. Provide a default implementation or factory function in the main package (`loopwork`).

## Important Notes

- **Always use Bun, not npm/yarn** - This project is built for Bun
- **File locking is critical** - Don't bypass lock mechanisms in backends
- **Plugins must be fault-tolerant** - A failing plugin shouldn't crash the loop
- **CLI paths are auto-detected** - Don't hardcode paths to `claude` or `opencode`
- **Test timeouts**: Default is 5000ms, increase for integration tests
- **Update architecture docs** - Keep `docs/` in sync with code changes


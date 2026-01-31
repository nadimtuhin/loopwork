# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Loopwork is a monorepo for an AI-powered task automation framework. It runs AI CLI tools (Claude, OpenCode, Gemini) against task backlogs from various sources with a plugin-based architecture.

## Monorepo Structure

This is a Bun workspace monorepo with the following packages:

- `packages/loopwork/` - Core framework with task backends (JSON, GitHub), CLI runner, state management
- `packages/telegram/` - Telegram bot plugin for notifications and commands
- `packages/discord/` - Discord webhook plugin for notifications
- `packages/asana/` - Asana API integration plugin for task sync
- `packages/everhour/` - Everhour time tracking plugin
- `packages/todoist/` - Todoist task sync plugin
- `packages/cost-tracking/` - Token usage and cost monitoring plugin
- `packages/notion/` - Notion database backend plugin
- `packages/dashboard/` - Interactive dashboard package
- `packages/dashboard/web/` - Next.js web UI (nested workspace)

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
- Global fetch is mocked in integration tests for external APIs
- E2E tests exist in `packages/loopwork/test/e2e.test.ts`

## Core Architecture

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
- **Rate limit handling**: Detects rate limits and waits 30s before retry
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

## Common Development Tasks

### Adding a New Backend

1. Create `packages/loopwork/src/backends/my-backend.ts`
2. Implement `TaskBackend` interface
3. Export from `packages/loopwork/src/backends/index.ts`
4. Add integration test in `packages/loopwork/test/backends.test.ts`

### Adding a New Plugin Package

1. Create directory: `packages/my-plugin/`
2. Add `package.json` with name `@loopwork-ai/my-plugin`
3. Create `src/index.ts` exporting plugin factory
4. Add `test/index.test.ts` with tests
5. Add to workspace in root `package.json`
6. Update main README's plugin table

### Running Examples

The `examples/basic-json-backend/` demonstrates minimal setup:
```bash
cd examples/basic-json-backend
./quick-start.sh  # Interactive menu
# Or manually:
bun run ../../packages/loopwork/src/index.ts
```

## TypeScript Configuration

- Uses Bun's native TypeScript support
- `moduleResolution: "bundler"` for Bun compatibility
- `allowImportingTsExtensions: true` - import `.ts` files directly
- `noEmit: true` - No JS compilation, Bun runs TS directly
- Shared base config in `packages/loopwork/tsconfig.json`

## Publishing

```bash
# Build and test before publishing
bun run build
bun run test

# Publish all packages (from root)
bun run publish:all

# Or individual package
cd packages/loopwork
npm publish
```

## Security

- `SECURITY.md` exists for vulnerability reporting
- Trivy scanning available: `bun run security:trivy` (in loopwork package)
- Never commit API tokens or credentials
- Use environment variables for sensitive config

## AI Development Philosophy

### Core Principles

1. **Contract-First Design**: Define interfaces/contracts before implementation. All modules communicate through well-defined contracts in `src/contracts/`. Never depend on concrete implementations directly.

2. **Dependency Inversion**: High-level modules must not depend on low-level modules. Both should depend on abstractions (contracts). Inject dependencies rather than importing concrete implementations.

3. **Always TDD**: Write tests BEFORE writing implementation code. Red → Green → Refactor cycle is mandatory.

4. **E2E Testing Always**: Every feature must have end-to-end tests that verify the full user journey. Unit tests alone are insufficient.

5. **Test Integrity**: If tests fail, do not amend tests just to pass them. First, verify if the feature implementation is broken. Fix the code, not the test, unless the test itself is incorrect.

### Implementation Patterns

6. **Swap via Imports**: When replacing functionality, create the new implementation first, then swap the import. Never modify existing working code inline. This enables easy rollback and A/B testing.

7. **Single Feature Focus**: Work on ONE feature at a time. Complete it fully (tests passing, E2E verified) before moving to the next. Avoid scattered partial implementations.

8. **Task Decomposition for Long Tasks**: For complex tasks, the main thread should:
   - Break the task into small, atomic sub-tasks (each <30 min of work)
   - Feed each sub-task to a subagent with clear inputs/outputs
   - Aggregate results and verify integration
   - Never give subagents large, ambiguous tasks

### Task Management

9. **Proactive Task Proposal**: You should be able to propose new tasks when you identify gaps or improvements.

10. **Task Creation**: You are empowered to create new tasks in the backlog to track necessary work.

### Contract-Driven Development Workflow

```
1. Define contract/interface in src/contracts/
2. Write E2E test against the contract
3. Write unit tests for the implementation
4. Implement to satisfy contracts and tests
5. Verify E2E passes
6. Swap in new implementation via import change
```

## Integration Testing Rules

These rules prevent bugs where individual components work but fail when wired together.

### 1. Test the Full Data Path

When adding features that involve data flowing through multiple layers:
- Write unit tests for the new code
- Write an integration test that verifies the FULL PATH from entry to exit
- If data passes through A → B → C, test A→C directly, not just A and C separately

**Example (Bug that was caught):** `withCli()` plugin correctly set `cliConfig`, but `getConfig()` forgot to pass it through. Unit tests passed, but integration was broken.

### 2. Test at the Seams

A "seam" is where two components connect. When modifying code:
1. Identify all seams the change touches
2. Write at least one test that crosses each seam
3. Never trust that "if A works and B works, A→B works"

**Key seams in loopwork:**
- Config file → `loadConfigFile()` → `getConfig()` → `CliExecutor`
- Backend plugin → `TaskBackend` interface → run command
- Plugin hooks → Loop execution → Task lifecycle

### 3. Beware Silent Defaults

DANGER: When code has a fallback default, bugs can hide because the system "works" with wrong values.

```typescript
// This pattern hides bugs:
cli: options.cli || fileConfig?.cli || 'opencode'
// If fileConfig.cliConfig.models is lost, system uses 'opencode' default
// No error thrown, but wrong behavior!
```

**Rule:** When adding defaults, add a test that FAILS if the primary value is lost.

### 4. New Config Property Checklist

When adding a new config property, verify it appears in ALL these places:
- [ ] Type/interface definition
- [ ] `DEFAULT_CONFIG` (if applicable)
- [ ] Config file loading (`loadConfigFile`)
- [ ] Config merging (`getConfig`) - **this is where bugs hide!**
- [ ] Validation (`validateConfig`)
- [ ] Consumer code (`CliExecutor`, etc.)
- [ ] Integration test verifying full path

### 5. Property Propagation Grep Check

Before completing config changes, run:
```bash
git grep "const config.*=" -- "*.ts" | grep -v test
```
This finds all places that build config objects - verify your new property is included in each.

## Architecture Documentation

Architecture docs are in `packages/loopwork/docs/`:
- `ARCHITECTURE.md` - Comprehensive system architecture
- `cli-invocation-algorithm.md` - CLI model selection and retry logic
- `orphan-process-management.md` - Orphan process detection and cleanup

**Keep docs in sync**: When making architectural changes, update the relevant docs:
1. New backends → Update ARCHITECTURE.md (Backend System section)
2. New plugins → Update ARCHITECTURE.md (Plugin System section)
3. New CLI commands → Update ARCHITECTURE.md (CLI Commands section)
4. Changed execution flow → Update cli-invocation-algorithm.md
5. Process management changes → Update orphan-process-management.md

## Important Notes

- **Always use Bun, not npm/yarn** - This project is built for Bun
- **File locking is critical** - Don't bypass lock mechanisms in backends
- **Plugins must be fault-tolerant** - A failing plugin shouldn't crash the loop
- **CLI paths are auto-detected** - Don't hardcode paths to `claude` or `opencode`
- **Test timeouts**: Default is 5000ms, increase for integration tests
- **Update architecture docs** - Keep `packages/loopwork/docs/` in sync with code changes

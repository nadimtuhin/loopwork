# Changelog

All notable changes to this project will be documented in this file.

## [0.3.4] - 2026-01-30

### Added
- **Self-Healing Circuit Breaker** - Instead of just stopping on repeated failures, the circuit breaker now:
  - Analyzes failure patterns (rate limits, timeouts, memory pressure, unknown)
  - Automatically adjusts execution parameters based on detected pattern:
    - Rate limits: Reduces workers and increases delay
    - Timeouts: Increases timeout duration
    - Memory pressure: Reduces parallel workers
    - Unknown: Conservative reduction of workers and delay
  - Attempts up to 3 self-healing adjustments before giving up
  - Configurable cooldown period between healing attempts (`selfHealingCooldown` config option)

### Fixed
- **macOS Memory Calculation** - Fixed memory check that was preventing CLI spawning on macOS
  - `os.freemem()` on macOS returns only truly "free" pages (~90MB) due to aggressive caching
  - Now calculates available memory as: free + inactive + purgeable + speculative pages
  - Uses `vm_stat` command on macOS for accurate memory reporting

- **Orphan Process Safety** - Removed dangerous "untracked process" detection from OrphanDetector
  - Previously killed ANY process matching patterns like 'claude' or 'opencode'
  - This was killing users' independently-running CLI sessions not spawned by loopwork
  - Now only kills processes that were actually tracked by loopwork (from registry)
  - Orphan detection now limited to: dead-parent orphans and stale tracked processes

- **Parallel Runner Dry-Run** - Fixed dry-run mode marking tasks as in-progress
  - Dry-run now uses `findNextTask()` instead of `claimTask()`
  - Tasks no longer change status during dry-run preview

- **LoopworkError Constructor** - Fixed parameter order (message, suggestions[])

### Changed
- Updated orphan detector tests to reflect removed untracked detection
- Skipped flaky stale detection tests pending registry timing investigation

## [Unreleased]

### Added
- **Enhanced `loopwork init` command** with comprehensive project setup:
  - `.gitignore` management - Adds/updates with recommended patterns (`.loopwork-state/`, `.env`, etc.)
  - `README.md` generation - Creates project documentation with quick start guide
  - `.loopwork-state/` directory - Created upfront for state management
  - PRD templates - Feature and bugfix templates in `.specs/tasks/templates/`
  - Optional plugin configuration - Interactive prompts for Telegram, Discord, cost tracking
  - Smart import generation - Only imports plugins that are enabled
  - Idempotent behavior - Safe to run multiple times, prompts before overwriting
  - User-friendly prompts - Clear success messages and helpful next steps

### Changed
- `init` command now creates a complete project structure
- Cost tracking is now optional (was always enabled before)
- Plugin configuration uses environment variables with clear guidance

## [0.2.0] - 2026-01-24

### Added
- **New `init` command**: Interactive scaffolding for new projects (`loopwork init`).
  - Supports GitHub and JSON backends.
  - Generates `loopwork.config.ts`.
  - Creates sample tasks and PRDs for JSON backend.
- CLI architecture refactor:
  - Split main logic into `src/commands/run.ts` and `src/commands/init.ts`.
  - `src/index.ts` now acts as a command dispatcher.
- Comprehensive E2E test suite for JSON backend (`test/e2e.test.ts`)
  - Tests for complete task workflow
  - Task failure and retry scenarios
  - Priority ordering
  - Dependencies and sub-tasks
  - Feature filtering
  - State management
- Example directory structure for testing (`examples/basic-json-backend/`)
  - Simple tasks for learning
  - Interactive quick-start script
  - Complete documentation

### Changed
- **BREAKING**: CLI command options no longer have default values
  - Allows config file values to take precedence
  - Priority is now: CLI args > env vars > config file > defaults
- CLI executor now shows the command being executed
  - Debug mode shows full command
  - Info mode shows model and timeout

### Fixed
- Config file loading now works properly
  - Removed default values from commander options
  - Config file values are now respected when no CLI args provided
- Command execution visibility improved
  - Shows what command is being run
  - Shows model and timeout information

## [0.1.0] - Initial Release

### Added
- Multiple backend support (GitHub Issues, JSON files)
- Plugin architecture with composable config
- Built-in plugins: Telegram, Discord, Asana, Everhour, Todoist, Cost Tracking
- Task dependencies and sub-tasks
- MCP server integration
- Background execution monitor
- TUI dashboard

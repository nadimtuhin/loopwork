# Changelog

All notable changes to this project will be documented in this file.

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

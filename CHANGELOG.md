# Changelog

## [0.4.0] - 2026-02-02

### BREAKING CHANGES
- **Modular Architecture**: The core framework is now split into multiple specialized packages (`@loopwork-ai/contracts`, `@loopwork-ai/state`, `@loopwork-ai/executor`, etc.). Direct imports from `loopwork/src/*` are no longer supported.
- **Dependency Injection**: Services now use constructor-based DI. Plugins and custom services must be updated to inject dependencies.
- **Ink-based UI**: Legacy console output utilities are deprecated in favor of Ink-based TUI components.

### New Features
- **Modular Packages**: Improved maintainability and reduced bundle sizes for specific use cases.
- **Standardized TUI**: Rich, interactive terminal interface using Ink.
- **Enhanced Process Management**: Better orphan detection and resource limiting.

### Bug Fixes
- **Test Isolation**: Improved test reliability through modular package boundaries and better mocking capabilities.

### 2026-02-01 - MCPMANAG-004
- MCPMANAG-004: Implement Task-Scoped Context Injection Logic

### 2026-02-01 - VISUALIZ-002
- VISUALIZ-002: Task Requirements

### 2026-02-01 - CONTROLA-005
- CONTROLA-005: Add Authentication Middleware

### 2026-02-01 - DEADLETT-004
- DEADLETT-004: Add Cooldown & Retry Policy

### 2026-02-01 - MCPMANAG-003
- MCPMANAG-003: Build Local Script Bridge Adapter

### 2026-02-01 - PLUGINAR-004
- PLUGINAR-004: Implement Persistent Plugin State

### 2026-02-01 - CONTROLA-003
- CONTROLA-003: Implement Real-time Event Streaming (SSE)

### 2026-02-01 - MCPMANAG-002
- MCPMANAG-002: Implement MCP Client Connection & Tool Registry

### 2026-02-01 - DEBUGGER-003
- DEBUGGER-003: Implement 'Edit & Continue' for Prompts

### 2026-02-01 - PLUGINAR-003
- PLUGINAR-003: Create Capability Registration API

### 2026-02-01 - DEBUGGER-002
- DEBUGGER-002: Build TUI Inspector & Interactive Shell

### 2026-02-01 - DEADLETT-003
- DEADLETT-003: Implement Auto-Quarantine Logic

### 2026-02-01 - BULKHEAD-003
- BULKHEAD-003: Implement Process Resource Limits (CPU & Memory)

### 2026-02-01 - TIMESTAM-003
- TIMESTAM-003: Map GitHub Timestamps to Task Lifecycle

### 2026-02-01 - PLUGINAR-002
- PLUGINAR-002: Add Granular Lifecycle Hooks to Core

### 2026-02-01 - CHECKPOI-003
- CHECKPOI-003: Add Resume-from-Checkpoint Capabilities

### 2026-02-01 - TIMESTAM-002
- TIMESTAM-002: Implement Lifecycle Tracking in JSON Backend

### 2026-02-01 - AI-MONITOR-001h
- AI-MONITOR-001h: AI Monitor: LLM Fallback Analyzer

### 2026-02-01 - FALLBACK-004
- FALLBACK-004: Implement Reduced Functionality Mode

### 2026-02-01 - CHECKPOI-002
- CHECKPOI-002: Implement Auto-Checkpoint Integration

### 2026-02-01 - FALLBACK-003
- FALLBACK-003: Implement Offline Operation Queue

### 2026-02-01 - BULKHEAD-002
- BULKHEAD-002: Integrate Worker Pools into CLI Executor

### 2026-02-01 - ROLLBACK-003
- ROLLBACK-003: Implement Interactive & Selective Rollback

### 2026-02-01 - CHAOS-003
- CHAOS-003: Implement Network Interception for API Simulation

### 2026-02-01 - HEALTHCH-004
- HEALTHCH-004: Add Webhook Notification System

### 2026-02-01 - CHAOS-002
- CHAOS-002: Implement Task-Level Fault Injection

### 2026-02-01 - HEALTHCH-003
- HEALTHCH-003: Implement Connectivity and Quota Monitors

### 2026-02-01 - HEALTHCH-002
- HEALTHCH-002: Implement System Resource Monitors

### 2026-02-01 - RETRY-003
- RETRY-003: Integrate Retry Logic into Task Runner

### 2026-02-01 - PROC-001g
- PROC-001g: Process Management: E2E Tests (Full Loop Scenario)

### 2026-02-01 - DYNAMICT-004
- DYNAMICT-004: Add AI-powered task analysis using LLM

### 2026-02-01 - DYNAMICT-003
- DYNAMICT-003: Create withDynamicTasks plugin for automatic task creation

### 2026-02-01 - RETRY-002
- RETRY-002: Implement Retry Budget System

### 2026-02-01 - DYNAMICT-002
- DYNAMICT-002: Implement output pattern analyzer for detecting follow-up work

### 2026-02-01 - CLIOUTPU-004
- CLIOUTPU-004: Add JSON output mode support

### 2026-02-01 - CLIOUTPU-002
- CLIOUTPU-002: Standardize output method across all commands

### 2026-02-01 - CLIOUTPU-003
- CLIOUTPU-003: Add progress bar and completion summary components

### 2026-02-01 - PROC-001f
- PROC-001f: Process Management: Integration Tests (Real Processes)

### 2026-02-01 - HEALTH-002
- HEALTH-002: Add unit tests for health check endpoint

### 2026-02-01 - PROC-001e
- PROC-001e: Process Management: Unit Tests (Mocked Dependencies)

### 2026-02-01 - AI-MONITOR-001g
- AI-MONITOR-001g: AI Monitor: Wisdom System (Learn from Healing)

### 2026-02-01 - IMPROVE-004
- IMPROVE-004: Improve CLI error handling and user feedback

### 2026-02-01 - TELE-012
- TELE-012: Teleloop - 'Vision' Bug Reporting

### 2026-02-01 - AI-MONITOR-001f
- AI-MONITOR-001f: Verification Engine

### 2026-02-01 - TELE-011
- TELE-011: Teleloop Voice-to-Task (Audio Notes)

### 2026-02-01 - AI-MONITOR-001e
- AI-MONITOR-001e: Task Recovery Integration

### 2026-02-01 - ARCHWAVE-104
- ARCHWAVE-104: Define Isolation Contracts

### 2026-02-01 - TEST-001
- Test task


# Loopwork Architecture

**Loopwork** is an AI-powered task automation framework that orchestrates AI CLI tools (Claude, OpenCode, Gemini) against task backlogs from multiple sources. This document describes the core architecture, components, and data flow.

## Table of Contents

- [Project Overview](#project-overview)
- [Monorepo Structure](#monorepo-structure)
- [Core Architecture](#core-architecture)
- [Plugin System](#plugin-system)
- [Backend System](#backend-system)
- [CLI Execution Engine](#cli-execution-engine)
- [State Management](#state-management)
- [Process Management](#process-management)
- [Data Models](#data-models)
- [Command Reference](#command-reference)
- [Key Constants](#key-constants)
- [Dependency Graph](#dependency-graph)

## Project Overview

Loopwork automates task completion by:

1. **Loading configuration** from TypeScript config files with a composable plugin system
2. **Connecting to backends** (GitHub Issues, JSON files, or custom sources)
3. **Executing tasks** by spawning AI CLI tools with context about each task
4. **Managing state** with file-based locks to prevent concurrent conflicts
5. **Running in background** with daemon mode for long-running automation

**Core principles:**
- Plugin-based architecture inspired by Next.js config composition
- Lifecycle hooks for external integrations (Telegram, Discord, Asana, etc.)
- Auto-retry with model fallback (Sonnet → Opus → Gemini)
- File-based state with stale lock detection
- Fault tolerance: plugin errors don't crash the main loop

## Monorepo Structure

```
loopwork/
├── packages/loopwork/              # Core framework (v0.3.3)
│   ├── src/
│   │   ├── index.ts                # CLI entry point
│   │   ├── commands/               # CLI commands
│   │   ├── core/                   # Core business logic
│   │   ├── contracts/              # Type definitions
│   │   ├── backends/               # Task source adapters
│   │   ├── plugins/                # Plugin system
│   │   ├── monitor/                # Daemon management
│   │   ├── dashboard/              # TUI interface
│   │   ├── mcp/                    # MCP server
│   │   └── ai-monitor/             # Log analysis & healing
│   └── test/                       # Test suite
│
├── packages/telegram/              # Telegram notifications
├── packages/discord/               # Discord webhooks
├── packages/asana/                 # Asana API integration
├── packages/todoist/               # Todoist sync
├── packages/trello/                # Trello sync
├── packages/everhour/              # Time tracking
├── packages/notion/                # Notion backend
├── packages/cost-tracking/         # Token monitoring
├── packages/dashboard/             # Interactive dashboard
│   └── web/                        # Next.js web UI (nested)
│
├── examples/                       # Usage examples
└── turbo.json                      # Turbo build config
```

**Build System:** Bun workspace with Turbo for caching and parallelization

## Core Architecture

### Entry Point

**File:** `src/index.ts`

- **Commander CLI** with lazy-loaded commands
- Detects legacy run arguments and auto-inserts `run` subcommand
- Version from package.json
- Error handling with `LoopworkError`

```
index.ts
  ├── kill / stop
  ├── run (core automation)
  ├── task-new (create task)
  ├── monitor (daemon management)
  ├── restart (resume with saved args)
  ├── dashboard (TUI status)
  ├── ai-monitor (auto-healer)
  ├── init (setup wizard)
  ├── start (foreground + daemon)
  ├── logs (log viewer)
  └── status (check processes)
```

### Configuration System

**Files:**
- `src/core/config.ts` - Config loading and merging
- `src/contracts/config.ts` - Config types and defaults

**Flow:**
```
loopwork.config.ts (TypeScript config)
    ↓
defineConfig() (type safety + defaults)
    ↓
compose() (chain wrappers)
    ↓
withPlugin(), withJSONBackend(), etc.
    ↓
Final LoopworkConfig object
```

**Config Structure:**
```typescript
interface LoopworkConfig {
  // Backend selection
  backend: BackendConfig

  // CLI settings
  cli: 'claude' | 'opencode' | 'gemini'
  model?: string
  cliConfig?: CliExecutorConfig

  // Execution
  maxIterations?: number (default: 50)
  timeout?: number (default: 600s)
  namespace?: string (default: 'default')
  autoConfirm?: boolean
  dryRun?: boolean
  debug?: boolean

  // Resilience
  maxRetries?: number (default: 3)
  circuitBreakerThreshold?: number (default: 5)
  taskDelay?: number (default: 2000ms)
  retryDelay?: number (default: 3000ms)

  // Plugins
  plugins?: LoopworkPlugin[]
}
```

## Plugin System

### LoopworkPlugin Interface

```typescript
interface LoopworkPlugin {
  readonly name: string

  onConfigLoad?(config: LoopworkConfig): LoopworkConfig | Promise<LoopworkConfig>
  onBackendReady?(backend: TaskBackend): void | Promise<void>
  onLoopStart?(namespace: string): void | Promise<void>
  onLoopEnd?(stats: LoopStats): void | Promise<void>
  onTaskStart?(context: TaskContext): void | Promise<void>
  onTaskComplete?(context: TaskContext, result: PluginTaskResult): void | Promise<void>
  onTaskFailed?(context: TaskContext, error: string): void | Promise<void>
}
```

### Plugin Registry

**File:** `src/plugins/index.ts`

```typescript
class PluginRegistry {
  register(plugin: LoopworkPlugin): void
  unregister(name: string): void
  getAll(): LoopworkPlugin[]
  async runHook(hookName: keyof LoopworkPlugin, ...args: unknown[]): Promise<void>
}

export const plugins = new PluginRegistry()
```

**Error handling:** Plugin failures are caught and logged, never crash the main loop.

### Config Composition Pattern

```typescript
// Composable wrappers
export function compose(...wrappers: ConfigWrapper[]): ConfigWrapper
export function withPlugin(plugin: LoopworkPlugin): ConfigWrapper
export function withJSONBackend(config: BackendConfig): ConfigWrapper
export function withGitHubBackend(config: BackendConfig): ConfigWrapper

// Usage
export default compose(
  withJSONBackend({ tasksFile: '.specs/tasks/tasks.json' }),
  withPlugin(customPlugin),
  withTelegram({ botToken: '...' }),
)(defineConfig({
  cli: 'claude',
  maxIterations: 50
}))
```

## AI Monitor System

**Directory:** `src/ai-monitor/`

The AI Monitor is an intelligent log watcher and auto-healer that monitors loopwork execution logs in real-time, detects known error patterns, and automatically takes corrective actions to keep the loop running smoothly.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    AI Monitor                            │
├─────────────────────────────────────────────────────────┤
│  LogWatcher  →  PatternMatcher  →  ActionExecutor       │
│      │              │                     │              │
│      ↓              ↓                     ↓              │
│  Chokidar      ErrorPatterns        CircuitBreaker      │
│   Events         Registry           VerificationEngine  │
│                                      WisdomSystem        │
└─────────────────────────────────────────────────────────┘
```

### Core Components

#### 1. Log Watcher (`watcher.ts`)

Monitors log files using chokidar for file system events.

```typescript
class LogWatcher extends EventEmitter {
  constructor(config: {
    logFile: string
    debounceMs?: number // Default: 100ms
  })

  start(): Promise<void>
  stop(): void

  // Events
  on('line', (logLine: LogLine) => void)
  on('error', (error: Error) => void)
}
```

**Features:**
- Event-driven log monitoring with chokidar
- Polling fallback for reliability (2s interval)
- Line buffering to prevent splitting
- Debounced pattern checking (100ms default)

#### 2. Pattern Matcher (`patterns.ts`)

Detects known error patterns using regex matching.

```typescript
interface ErrorPattern {
  name: string
  regex: RegExp
  severity: 'INFO' | 'WARN' | 'ERROR' | 'HIGH'
  action: MonitorAction
  category?: string
  description?: string
}
```

**Built-in Patterns:**
- Type errors: `TS2304`, `TS2345`, etc.
- Build failures: `npm ERR!`, compilation errors
- Rate limits: API throttling, quota exceeded
- Dependency issues: missing modules, version conflicts
- Timeout errors: execution timeouts, network timeouts

**Pattern Matching Flow:**
```
Log Line → Match against patterns → Found? → Execute action
                                  → Not found? → LLM analysis (throttled)
```

#### 3. Action Executor (`actions/index.ts`)

Executes healing actions based on detected patterns.

```typescript
type MonitorActionType = 'auto-fix' | 'pause' | 'skip' | 'notify' | 'analyze' | 'enhance-task'

interface Action {
  type: MonitorActionType
  pattern: string
  context?: Record<string, any>
  prompt?: string
}
```

**Action Types:**
- `auto-fix`: Spawn agent to fix the issue automatically
- `pause`: Pause the loop for manual intervention
- `skip`: Skip the current task and move to next
- `notify`: Send notification via Telegram/Discord
- `analyze`: Use LLM to understand unknown errors
- `enhance-task`: Update PRD with missing context

#### 4. Circuit Breaker (`circuit-breaker.ts`)

Prevents infinite healing loops by tracking failures.

```typescript
class CircuitBreaker {
  constructor(config: {
    maxFailures?: number         // Default: 3
    cooldownPeriodMs?: number    // Default: 60000
    maxHalfOpenAttempts?: number // Default: 1
  })

  canProceed(): boolean
  recordSuccess(): void
  recordFailure(): void
  reset(): void

  getState(): CircuitBreakerState
  getStatus(): string
  isOpen(): boolean
  getCooldownRemaining(): number
}
```

**States:**
- `CLOSED`: Normal operation, allows all requests
- `OPEN`: Failure threshold reached, blocks requests during cooldown
- `HALF_OPEN`: Testing recovery, allows limited attempts

**Flow:**
```
CLOSED ──[3 failures]──> OPEN ──[60s cooldown]──> HALF_OPEN ──[success]──> CLOSED
   ↑                                                    │
   └────────────────────[failure]─────────────────────┘
```

#### 5. Verification Engine (`verification.ts`)

**NEW in AI-MONITOR-001f**: Enforces verification-before-completion protocol.

```typescript
class VerificationEngine {
  constructor(config: {
    freshnessTTL?: number           // Default: 300000 (5 minutes)
    checks?: VerificationCheck[]    // Check types to run
    requireArchitectApproval?: boolean
    cwd?: string
    logFile?: string
  })

  async verify(claim: string, taskId?: string): Promise<VerificationResult>
  isEvidenceFresh(evidence: VerificationEvidence): boolean
}
```

**Check Types:**
- `BUILD`: Run build command (e.g., `tsc --noEmit`, `bun run build`)
- `TEST`: Run test suite (e.g., `bun test`)
- `LINT`: Run linter (e.g., `eslint`, `biome check`)
- `FUNCTIONALITY`: Verify feature works as expected (manual)
- `ARCHITECT`: Get architect approval (opus model verification)
- `TODO`: Ensure no pending todos in task
- `ERROR_FREE`: Check logs for errors in last 5 minutes

**Verification Flow:**
```
Healing Action Completes
    ↓
VerificationEngine.verify()
    ↓
Run all required checks (BUILD, TEST, LINT, ERROR_FREE)
    ↓
Check evidence freshness (<5 min)
    ↓
All required checks pass? ──Yes──> Record success
    │                              Update circuit breaker
    No
    ↓
Record failure
Update circuit breaker
```

**Features:**
- **Evidence Freshness**: Rejects stale evidence (>5 min old, configurable)
- **Auto-detection**: Detects build/test/lint commands from `package.json`
- **Fallback**: Falls back to `tsc --noEmit` if no build script
- **Timeout Handling**: Configurable per-check timeouts
- **Error Filtering**: Ignores monitor's own healing messages in logs

**Configuration Example:**
```typescript
{
  verification: {
    freshnessTTL: 5 * 60 * 1000,  // 5 minutes
    checks: [
      { type: 'BUILD', command: 'bun run build', timeout: 120000, required: true },
      { type: 'TEST', command: 'bun test', timeout: 180000, required: true },
      { type: 'LINT', command: 'bun run lint', timeout: 60000, required: false },
      { type: 'ERROR_FREE', required: true }
    ],
    requireArchitectApproval: false
  }
}
```

**Integration with AI Monitor:**
```typescript
// In AIMonitor.executeAction()
if (action.type === 'auto-fix') {
  const result = await this.executor.executeAction(action)

  if (result.success) {
    // Run verification before claiming success
    const verificationResult = await this.verificationEngine.verify(
      `Healing action for ${action.pattern}`,
      taskId
    )

    if (verificationResult.passed) {
      this.circuitBreaker.recordSuccess()
    } else {
      // Verification failed - don't claim success
      this.circuitBreaker.recordFailure()
    }
  }
}
```

#### 6. Task Recovery (`task-recovery.ts`)

Analyzes early task exits and enhances PRDs automatically.

```typescript
export async function analyzeEarlyExit(
  taskId: string,
  logs: string[],
  backend: TaskBackend
): Promise<TaskRecoveryAnalysis>

export async function enhanceTask(
  analysis: TaskRecoveryAnalysis,
  backend: TaskBackend
): Promise<void>
```

**Exit Reasons Detected:**
- `vague_prd`: PRD needs more detail
- `missing_tests`: Test scaffolding needed
- `missing_context`: File paths/snippets needed
- `scope_large`: Should split into subtasks
- `wrong_approach`: Constraints/non-goals needed

**Enhancement Actions:**
- Add key file paths to PRD
- Add context snippets
- Suggest approach hints
- Define non-goals
- Create subtasks for large scope
- Generate test scaffolding

#### 7. Wisdom System (`wisdom.ts`)

Learns from successful and failed healing attempts.

```typescript
class WisdomSystem {
  constructor(config: {
    enabled?: boolean
    learnFromSuccess?: boolean
    learnFromFailure?: boolean
    patternExpiryDays?: number
  })

  recordSuccess(pattern: ErrorPattern, outcome: string): void
  recordFailure(pattern: ErrorPattern, error: string): void
  getLearnedPatterns(): LearnedPattern[]
  shouldUsePattern(signature: string): boolean
}
```

**Features:**
- Tracks success/failure count per pattern
- Calculates confidence score (success / total attempts)
- Expires old patterns (default: 30 days)
- Persists to `.loopwork/ai-monitor/wisdom.json`

#### 8. Concurrency Manager (`concurrency.ts`)

Rate-limits healing actions by provider and model.

```typescript
class ConcurrencyManager {
  constructor(config: {
    default: number
    providers: Record<string, number>  // e.g., { claude: 2, gemini: 3 }
    models: Record<string, number>     // e.g., { 'claude-opus': 1 }
  })

  async acquire(key: string): Promise<() => void>
  getAvailableSlots(key: string): number
}
```

### Plugin Integration

The AI Monitor implements the `LoopworkPlugin` interface:

```typescript
class AIMonitor implements LoopworkPlugin {
  readonly name = 'ai-monitor'

  async onConfigLoad(config: LoopworkConfig): Promise<LoopworkConfig>
  async onBackendReady(backend: TaskBackend): Promise<void>
  async onLoopStart(namespace: string): Promise<void>
  async onLoopEnd(stats: LoopStats): Promise<void>
  async onTaskStart(context: TaskContext): Promise<void>
  async onTaskComplete(context: TaskContext, result: PluginTaskResult): Promise<void>
  async onTaskFailed(context: TaskContext, error: string): Promise<void>
}
```

**Lifecycle Integration:**
- `onConfigLoad`: Set state file path, load existing state
- `onBackendReady`: Store backend reference for task recovery
- `onLoopStart`: Start watching log file
- `onLoopEnd`: Stop watcher, save state
- `onTaskFailed`: Trigger task recovery analysis

### Configuration

```typescript
interface AIMonitorConfig {
  enabled?: boolean                   // Default: true
  llmCooldown?: number               // Default: 5 minutes
  llmMaxPerSession?: number          // Default: 10
  llmModel?: string                  // Default: 'haiku'
  patternCheckDebounce?: number      // Default: 100ms
  cacheUnknownErrors?: boolean       // Default: true
  cacheTTL?: number                  // Default: 24 hours

  circuitBreaker?: {
    maxFailures?: number             // Default: 3
    cooldownPeriodMs?: number        // Default: 60000
    maxHalfOpenAttempts?: number     // Default: 1
  }

  taskRecovery?: {
    enabled?: boolean                // Default: true
    maxLogLines?: number             // Default: 50
    minFailureCount?: number         // Default: 1
  }

  verification?: {
    freshnessTTL?: number            // Default: 300000 (5 min)
    checks?: VerificationCheck[]     // Check types to run
    requireArchitectApproval?: boolean
  }

  wisdom?: {
    enabled?: boolean                // Default: true
    learnFromSuccess?: boolean       // Default: true
    learnFromFailure?: boolean       // Default: true
    patternExpiryDays?: number       // Default: 30
  }
}
```

### State Persistence

**State File:** `.loopwork/monitor-state.json`

```typescript
interface MonitorState {
  llmCallCount: number
  lastLLMCall: number
  detectedPatterns: Record<string, number>
  unknownErrorCache: Set<string>
  sessionStartTime: number
  circuitBreakerState: CircuitBreakerState
  recoveryHistory: Record<string, RecoveryHistoryEntry>
  recoveryAttempts: number
  recoverySuccesses: number
  recoveryFailures: number
}
```

### Usage

**Standalone:**
```bash
loopwork ai-monitor
```

**As Plugin:**
```typescript
import { compose, defineConfig } from 'loopwork'
import { withAIMonitor } from 'loopwork/ai-monitor'

export default compose(
  withAIMonitor({
    enabled: true,
    llmCooldown: 5 * 60 * 1000,
    circuitBreaker: {
      maxFailures: 3,
      cooldownPeriodMs: 60000
    },
    verification: {
      freshnessTTL: 5 * 60 * 1000,
      checks: ['BUILD', 'TEST', 'ERROR_FREE']
    }
  })
)(defineConfig({ cli: 'claude' }))
```

### Performance Characteristics

**Pattern Matching:**
- Instant (regex-based, <1ms per line)
- Debounced to prevent flooding (100ms default)
- No API calls for known patterns

**LLM Analysis:**
- Heavily throttled (5 min cooldown)
- Max 10 calls per session
- Only for unknown errors
- Results cached (24h TTL)

**Verification:**
- Runs after successful healing actions
- Commands executed with timeout limits
- Evidence freshness enforced (<5 min)
- Failed verification triggers circuit breaker

**State Persistence:**
- Saved after each action
- Loaded on startup
- Includes circuit breaker state
- Recovery history tracked

### Error Handling

1. **Pattern Matching Failures**: Logged, don't crash monitor
2. **Action Execution Failures**: Recorded in circuit breaker
3. **Verification Failures**: Mark healing as unsuccessful
4. **Plugin Errors**: Caught and logged, main loop continues
5. **LLM API Errors**: Respect rate limits, apply cooldown
6. **File System Errors**: Log file missing handled gracefully

### Monitoring and Observability

**Stats API:**
```typescript
monitor.getStats(): {
  llmCallCount: number
  detectedPatterns: Record<string, number>
  actionHistory: ActionHistoryEntry[]
  unknownErrorCacheSize: number
  circuitBreaker: {
    status: string
    state: CircuitBreakerState
    isOpen: boolean
    cooldownRemaining: number
  }
  taskRecovery: {
    attempts: number
    successes: number
    failures: number
    historySize: number
  }
}
```

**CLI Commands:**
```bash
loopwork ai-monitor          # Start monitor in foreground
loopwork status              # Check circuit breaker status
cat .loopwork/monitor-state.json  # View persisted state
```

### Testing

**Unit Tests:** `test/ai-monitor/*.test.ts`
- Pattern matching: `patterns.test.ts`
- Circuit breaker: `circuit-breaker.test.ts`
- Verification engine: `verification.test.ts`
- Task recovery: `task-recovery.test.ts`
- Wisdom system: `wisdom.test.ts`
- Concurrency: `concurrency.test.ts`

**Integration Tests:**
- `verification-integration.test.ts`: Full verification flow with AI Monitor
- `00-monitor-unit.test.ts`: Monitor plugin lifecycle
- `00-monitor-simple.test.ts`: Basic monitoring scenarios

**Test Coverage:**
- Evidence freshness validation
- Individual check execution (BUILD, TEST, LINT, ERROR_FREE)
- Verification result accuracy
- Command timeout handling
- Error detection in logs
- Circuit breaker state transitions
- Stale evidence rejection
- Integration with healing actions

## Backend System

### TaskBackend Interface

**File:** `src/contracts/backend.ts`

All task sources implement this interface:

```typescript
interface TaskBackend {
  readonly name: string

  // Task queries
  findNextTask(options?: FindTaskOptions): Promise<Task | null>
  getTask(taskId: string): Promise<Task | null>
  listPendingTasks(options?: FindTaskOptions): Promise<Task[]>
  countPending(options?: FindTaskOptions): Promise<number>

  // Task updates
  markInProgress(taskId: string): Promise<UpdateResult>
  markCompleted(taskId: string, comment?: string): Promise<UpdateResult>
  markFailed(taskId: string, error: string): Promise<UpdateResult>
  resetToPending(taskId: string): Promise<UpdateResult>
  addComment?(taskId: string, comment: string): Promise<UpdateResult>

  // Relationships
  getSubTasks(taskId: string): Promise<Task[]>
  getDependencies(taskId: string): Promise<Task[]>
  getDependents(taskId: string): Promise<Task[]>
  areDependenciesMet(taskId: string): Promise<boolean>

  // Creation (optional)
  createTask?(task: Omit<Task, 'id' | 'status'>): Promise<Task>
  createSubTask?(parentId: string, task: ...): Promise<Task>
  addDependency?(taskId: string, dependsOnId: string): Promise<UpdateResult>

  // Health
  ping(): Promise<PingResult>
}
```

### Task Data Model

```typescript
interface Task {
  id: string                    // Unique identifier
  title: string                 // Display title
  description: string           // Full PRD/requirements
  status: TaskStatus            // pending | in-progress | completed | failed
  priority: Priority            // high | medium | low
  feature?: string              // Feature label for grouping
  parentId?: string             // Parent task (for sub-tasks)
  dependsOn?: string[]          // Task dependencies
  metadata?: TaskMetadata       // External system IDs
  url?: string                  // Link to source (GitHub issue, etc.)
  prdFile?: string              // Path to PRD file
}

type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'failed'
type Priority = 'high' | 'medium' | 'low'

interface TaskMetadata {
  asanaGid?: string             // Asana task ID
  everhourId?: string           // Everhour task ID
  todoistId?: string            // Todoist task ID
  [key: string]: unknown        // Custom fields
}
```

### Built-in Backends

#### JSON Backend

**File:** `src/backends/json.ts`

Adapts local JSON files + markdown PRDs to TaskBackend interface.

**File structure:**
```
.specs/tasks/
├── tasks.json              # Task registry
├── TASK-001.md            # PRD files (one per task)
├── TASK-001a.md           # Sub-task PRDs
└── TASK-002.md
```

**tasks.json format:**
```json
{
  "tasks": [
    {
      "id": "TASK-001",
      "status": "pending",
      "priority": "high",
      "feature": "auth",
      "parentId": null,
      "dependsOn": [],
      "metadata": { "asanaGid": "123" }
    }
  ]
}
```

**Features:**
- File locking with stale detection (prevents race conditions)
- PRD file loading with metadata extraction
- In-memory caching with lock validation
- Sub-task hierarchy support

**Lock mechanism:**
```
Lock file: .specs/tasks/tasks.json.lock
- Contains PID of process holding lock
- Considered stale after 30 seconds
- Auto-removed if process is dead
- Retry interval: 100ms
- Timeout: 5 seconds (configurable)
```

#### GitHub Backend

**File:** `src/backends/github.ts`

Uses GitHub Issues with labels for task tracking.

**Issue labels:**
- `loopwork-task` - Identifies managed tasks
- `loopwork:pending` | `loopwork:in-progress` | `loopwork:failed` - Status
- `priority:high|medium|low` - Priority
- `loopwork:sub-task` - Marks as sub-task
- `loopwork:blocked` - Task is blocked

**PRD in issue body:**
```markdown
## Description
Task requirements and context here

Parent: #123
Depends on: #100, #101
```

**Features:**
- Exponential backoff retry for rate limits
- Issue title ↔ task title
- Issue body ↔ task description
- Label-based status tracking
- Relationship tracking via comment metadata

## CLI Execution Engine

**File:** `src/core/cli.ts`

### Model Pools

```typescript
// Primary models (fast, capable)
export const EXEC_MODELS: CliConfig[] = [
  { name: 'sonnet-claude', cli: 'claude', model: 'sonnet' },
  { name: 'sonnet-opencode', cli: 'opencode', model: 'google/antigravity-claude-sonnet-4-5' },
  { name: 'gemini-3-flash', cli: 'opencode', model: 'google/antigravity-gemini-3-flash' },
]

// Fallback models (slower but more capable)
export const FALLBACK_MODELS: CliConfig[] = [
  { name: 'opus-claude', cli: 'claude', model: 'opus' },
  { name: 'gemini-3-pro', cli: 'opencode', model: 'google/antigravity-gemini-3-pro' },
]
```

### CLI Detection

```typescript
// Detection strategy:
1. Try `which <cli>` (check PATH)
2. Try known installation paths:
   - Claude: ~/.nvm/versions/node/*/bin/claude, /usr/local/bin/claude
   - OpenCode: ~/.opencode/bin/opencode, /usr/local/bin/opencode
3. If none found, throw LoopworkError with installation instructions
```

### Execution Flow

```
Input: Task (id, title, description, etc.)
    ↓
Build prompt (task context + success/failure criteria)
    ↓
Spawn CLI process (primary model from EXEC_MODELS)
    ↓
Stream output to console + log file
    ↓
Process exits
    ↓
Parse output:
  - Check for errors
  - Detect rate limits (429, RESOURCE_EXHAUSTED)
  - Detect timeouts
    ↓
Success? Mark task complete
Rate limited? Wait 60s, retry same model
Timeout? Kill process (SIGTERM → 5s → SIGKILL), try next model
Error? Try next model in pool
All models failed? Throw error, mark task failed
```

### Auto-Retry Logic

```
exec(task)
  ├─ Try model[0] (sonnet-claude)
  │  └─ Rate limited? Wait 60s, retry same model
  │  └─ Timeout? Try next model
  │  └─ Error? Try next model
  │
  ├─ Try model[1] (sonnet-opencode)
  │  └─ (same retry logic)
  │
  ├─ Try model[2] (gemini-3-flash)
  │  └─ (same retry logic)
  │
  ├─ Primary models exhausted? Activate fallback
  │
  ├─ Try fallback[0] (opus-claude)
  │  └─ (same retry logic)
  │
  ├─ Try fallback[1] (gemini-3-pro)
  │  └─ (same retry logic)
  │
  └─ All models failed? Throw error
```

### Timeout Handling

```
CLI process running
    ↓
Check if exceeded timeout (config.timeout)
    ↓
Send SIGTERM (graceful shutdown)
    ↓
Wait 5 seconds (SIGKILL_DELAY_MS)
    ↓
If still running: Send SIGKILL (force kill)
    ↓
Try next model
```

## State Management

**File:** `src/core/state.ts`

### State Files

**Location:** `.loopwork/` directory

```
.loopwork/
├── state-default.json           # Current namespace state
├── state-default.lock           # Lock file (directory)
├── state-prod.json              # For namespace 'prod'
├── state-prod.lock
├── monitor-state.json           # Daemon process tracking
├── default-restart-args.json    # Saved start arguments
├── prod-restart-args.json
└── sessions/                    # Session logs
    └── default/
        └── 2026-01-25-103045/
            ├── loopwork.log
            └── logs/
                ├── iteration-1-prompt.md
                ├── iteration-1-output.txt
                └── ...
```

### State Format

```json
{
  "namespace": "default",
  "currentTaskId": "TASK-001",
  "iteration": 5,
  "completedTasks": ["TASK-001", "TASK-002"],
  "failedTasks": ["TASK-003"],
  "failureCount": 0,
  "lastUpdated": "2026-01-25T10:30:45.123Z"
}
```

### Lock Mechanism

**Lock file:** `.loopwork/state-{namespace}.lock/`

```typescript
// Acquire lock
fs.mkdirSync(lockFile)                      // Atomic directory create
fs.writeFileSync(`${lockFile}/pid`, process.pid)

// Stale detection
if (!process.kill(pidFromLock, 0)) {        // Process doesn't exist
  fs.rmSync(lockFile, { recursive: true })  // Remove stale lock
}

// Release
fs.rmSync(lockFile, { recursive: true })
```

**Purpose:** Prevent concurrent loopwork instances in same namespace

## Process Management

**File:** `src/monitor/index.ts`

### LoopworkMonitor Class

```typescript
class LoopworkMonitor {
  async start(namespace: string, args: string[]): Promise<{ success: boolean; pid?: number }>
  stop(namespace: string): { success: boolean; error?: string }
  stopAll(): { stopped: string[]; errors: string[] }
  getStatus(): { running: LoopProcess[]; namespaces: Namespace[] }
}

interface LoopProcess {
  namespace: string
  pid: number
  startedAt: string
  logFile: string
  args: string[]
}
```

### Monitor State

**File:** `.loopwork/monitor-state.json`

```json
{
  "processes": [
    {
      "namespace": "prod",
      "pid": 12345,
      "startedAt": "2026-01-25T10:30:45.123Z",
      "logFile": "/path/to/logs/2026-01-25-103045.log",
      "args": ["--feature", "critical", "--max-iterations", "50"]
    }
  ]
}
```

### Daemon Startup Flow

```
loopwork start -d --namespace prod --feature auth
    ↓
Validate: namespace not already running
    ↓
Create session directory: .loopwork/sessions/prod/{timestamp}/
    ↓
Spawn loopwork run process
  - Detach from parent (daemon mode)
  - Redirect stdout/stderr to log file
  - Pass args to loopwork run
    ↓
Save to monitor-state.json: { namespace, pid, logFile, args }
    ↓
Return immediately (process runs in background)
```

### Orphan Detection

**File:** `src/core/process-management/orphan-detector.ts`

```typescript
interface OrphanInfo {
  pid: number
  reason: 'parent-dead' | 'stale'
  process: ProcessInfo
}

class OrphanDetector {
  scan(): Promise<OrphanInfo[]>
}
```

**Detection strategy (v0.3.4+):**
1. Check tracked processes in registry
2. For each tracked process:
   - Dead parent: Parent PID no longer exists → orphan
   - Stale: Running longer than 2x timeout → orphan
3. Return only tracked orphans

> **Note:** Pattern-based "untracked" detection was removed in v0.3.4 because it was
> killing users' independent CLI sessions that weren't spawned by loopwork.

### Orphan Killer

**File:** `src/core/orphan-killer.ts`

```typescript
class OrphanKiller {
  kill(pid: number): { success: boolean; signal: string; error?: string }
  killAll(pattern?: string): { killed: number; errors: string[] }
}

// Kill strategy:
1. Send SIGTERM (graceful)
2. Wait 5 seconds
3. If still alive: Send SIGKILL (force kill)
```

## Data Flow

### Main Task Execution Loop

```
loopwork run
    ↓
1. Load config file
    └─ Apply plugins onConfigLoad hooks
    ↓
2. Create backend (JSON, GitHub, custom)
    ↓
3. Acquire state lock
    └─ Prevent concurrent instances
    ↓
4. Create CLI executor
    └─ Detect claude/opencode/gemini CLIs
    ↓
5. Run plugins onBackendReady hooks
    ↓
6. Load saved state (if --resume)
    ↓
7. Run plugins onLoopStart hooks
    ↓
8. LOOP (up to maxIterations):
    ├─ Check circuit breaker (5 failures → stop)
    ├─ Find next pending task
    │  └─ Apply feature/priority filters
    ├─ Run plugins onTaskStart hooks
    ├─ Generate prompt (PRD + success criteria)
    ├─ Execute CLI with auto-retry
    │  ├─ Try primary models (Sonnet, Gemini Flash)
    │  ├─ Rate limit? Wait 60s, retry
    │  ├─ Timeout? Kill, try next model
    │  └─ Error? Try next model
    ├─ Parse output
    ├─ If success:
    │  ├─ Mark task completed
    │  ├─ Run plugins onTaskComplete hooks
    │  ├─ Update external systems (Asana, Todoist, etc.)
    │  └─ Continue loop
    ├─ If failure:
    │  ├─ Mark task failed
    │  ├─ Run plugins onTaskFailed hooks
    │  ├─ Increment failure counter
    │  └─ Continue loop
    └─ Save state after each task
    ↓
9. Loop ends (no more tasks or maxIterations reached)
    ↓
10. Run plugins onLoopEnd hooks
    ↓
11. Release state lock
    ↓
12. Exit
```

### Plugin Hook Timeline

```
BEFORE LOOP:
  onConfigLoad → onBackendReady → onLoopStart

PER TASK:
  onTaskStart → [execution] → onTaskComplete
  OR
  onTaskStart → [execution] → onTaskFailed

AFTER LOOP:
  onLoopEnd

ERROR HANDLING:
  - Plugin errors are caught and logged
  - Main loop continues even if plugin fails
  - No plugin can crash the automation
```

## Command Reference

| Command | Purpose | Mode |
|---------|---------|------|
| `loopwork run` | Execute task loop once | Foreground |
| `loopwork start` | Execute task loop | Foreground (default) or Daemon |
| `loopwork start -d` | Execute as daemon | Background |
| `loopwork kill [ns]` | Stop daemon | N/A |
| `loopwork restart [ns]` | Restart with saved args | Background |
| `loopwork status` | Check running processes | N/A |
| `loopwork logs [ns]` | View logs | N/A |
| `loopwork dashboard` | Interactive TUI | Interactive |
| `loopwork init` | Setup wizard | Interactive |
| `loopwork task-new` | Create new task | Interactive |
| `loopwork ai-monitor` | Auto-healer | Foreground |

### Process Management Commands

These commands help you manage running loopwork processes:

#### `loopwork status`

Show status of all running loopwork processes.

```bash
loopwork status
```

**Output includes:**
- Running processes with PID, namespace, and start time
- Log file locations
- Command arguments used to start each process

#### `loopwork kill`

Kill a running loopwork process (foreground or daemon).

```bash
# Kill default namespace
loopwork kill

# Kill specific namespace
loopwork kill prod

# Kill all running processes
loopwork kill --all
```

**Options:**
| Option | Description |
|--------|-------------|
| `[namespace]` | Namespace to kill (default: "default") |
| `--all` | Kill all running loopwork processes |

**Kill strategy:**
1. Send SIGTERM (graceful shutdown)
2. Wait 5 seconds for cleanup
3. If still running: Send SIGKILL (force kill)

#### `loopwork stop`

Stop a running loopwork daemon (started with `loopwork start -d`).

```bash
# Stop default namespace daemon
loopwork stop

# Stop specific namespace daemon
loopwork stop prod

# Stop all daemons
loopwork stop --all
```

**Options:**
| Option | Description |
|--------|-------------|
| `[namespace]` | Namespace to stop (default: "default") |
| `--all` | Stop all running daemons |

**Difference between `kill` and `stop`:**
- `kill` - Works on any loopwork process (foreground or daemon)
- `stop` - Specifically for daemons, updates monitor state cleanly

#### Quick Reference

| Scenario | Command |
|----------|---------|
| Check what's running | `loopwork status` |
| Stop foreground process | `Ctrl+C` |
| Stop a daemon | `loopwork stop` or `loopwork kill` |
| Stop specific namespace | `loopwork kill my-namespace` |
| Emergency stop all | `loopwork kill --all` |
| View logs after stopping | `loopwork logs [namespace]` |

#### Troubleshooting Orphan Processes

If processes become orphaned (parent died but children still running):

```bash
# Check for orphan processes
ps aux | grep -E "loopwork|claude|opencode" | grep -v grep

# Force kill by PID
kill -9 <PID>

# Use loopwork's orphan detection (only kills tracked processes)
loopwork kill --orphans

# Or enable automatic orphan watch in config
```

> **Note (v0.3.4+):** `loopwork kill --orphans` only kills processes that loopwork
> actually spawned (tracked in registry). Independent CLI sessions won't be affected.

**State files cleaned up on kill/stop:**
- `.loopwork/state-{namespace}.lock` - Process lock
- `.loopwork/monitor-state.json` - Daemon registry (updated)

## Key Constants

**File:** `src/core/constants.ts`

```typescript
// File locking
DEFAULT_LOCK_TIMEOUT_MS = 5000              // Timeout acquiring lock
LOCK_STALE_TIMEOUT_MS = 30000               // Lock age before stale
LOCK_RETRY_DELAY_MS = 100                   // Retry interval

// CLI execution
RATE_LIMIT_WAIT_MS = 60000                  // Wait when rate limited
PROGRESS_UPDATE_INTERVAL_MS = 2000          // Progress bar update freq
SIGKILL_DELAY_MS = 5000                     // SIGTERM → SIGKILL delay

// GitHub API
GITHUB_RETRY_BASE_DELAY_MS = 1000           // Exponential backoff base
GITHUB_MAX_RETRIES = 3                      // Max retry attempts
```

## Dependency Graph

```
src/index.ts (CLI entry)
    ├─ src/commands/
    │   ├── run.ts ────────────────────┐
    │   ├── start.ts                   │
    │   ├── init.ts                    │
    │   ├── kill.ts                    │
    │   ├── logs.ts                    │
    │   ├── status.ts                  │
    │   ├── restart.ts                 │
    │   ├── dashboard.ts               │
    │   └── ai-monitor.ts              │
    │                                  │
    ├─ src/core/                      │
    │   ├── config.ts ────────────────→ LoopworkConfig
    │   ├── cli.ts ──────────────────→ CLI execution, model pools
    │   ├── state.ts ────────────────→ State management, locks
    │   ├── utils.ts ────────────────→ Logger, utilities
    │   └── errors.ts ───────────────→ Error handling
    │                                  │
    ├─ src/backends/                   │
    │   ├── json.ts ──────────────────→ JSON file adapter
    │   ├── github.ts ────────────────→ GitHub Issues adapter
    │   ├── plugin.ts ────────────────→ Backend wrappers
    │   └── types.ts ─────────────────→ TaskBackend interface
    │                                  │
    ├─ src/plugins/                    │
    │   ├── index.ts ──────────────────→ Plugin registry, compose()
    │   ├── claude-code.ts ──────────→ Claude Code integration
    │   └── ipc.ts ──────────────────→ IPC messaging
    │                                  │
    ├─ src/monitor/                    │
    │   └── index.ts ──────────────────→ Daemon management
    │                                  │
    ├─ src/dashboard/                  │
    │   ├── cli.ts ──────────────────→ TUI launcher
    │   └── kanban.tsx ──────────────→ React Ink UI
    │                                  │
    ├─ src/mcp/                        │
    │   └── server.ts ───────────────→ MCP Protocol server
    │                                  │
    └─ src/contracts/                  │
        ├── config.ts ────────────────→ LoopworkConfig interface
        ├── plugin.ts ────────────────→ LoopworkPlugin interface
        ├── backend.ts ──────────────→ TaskBackend interface
        ├── task.ts ─────────────────→ Task data model
        ├── cli.ts ──────────────────→ CLI executor config
        └── executor.ts ─────────────→ ICliExecutor interface
```

## Architecture Patterns

### Composition Pattern

Config composition allows combining plugins like building blocks:

```typescript
compose(
  withJSONBackend(),
  withPlugin(myPlugin),
  withTelegram({ ... }),
  withCostTracking({ ... })
)(defineConfig({ ... }))
```

Each wrapper receives and transforms the config, building a final configuration.

### Factory Pattern

Backends and plugins are created through factory functions:

```typescript
export function withJSONBackend(config): ConfigWrapper { ... }
export function createTelegramPlugin(options): LoopworkPlugin { ... }
```

### Hook Pattern

Plugins react to lifecycle events through hooks, enabling non-invasive extensions:

```typescript
interface LoopworkPlugin {
  onConfigLoad?: (config) => config
  onBackendReady?: (backend) => void
  onLoopStart?: (namespace) => void
  onTaskStart?: (context) => void
  onTaskComplete?: (context, result) => void
  onTaskFailed?: (context, error) => void
  onLoopEnd?: (stats) => void
}
```

### Adapter Pattern

Backends adapt different task sources (JSON, GitHub, etc.) to a common TaskBackend interface:

```typescript
interface TaskBackend {
  findNextTask(): Promise<Task | null>
  markCompleted(taskId): Promise<UpdateResult>
  // ... 16 total methods
}
```

### Error Handling Pattern

Plugins are fault-tolerant; errors don't crash the main loop:

```typescript
async runHook(hookName, ...args) {
  for (const plugin of this.plugins) {
    try {
      await hook.apply(plugin, args)
    } catch (error) {
      logger.error(`Plugin ${plugin.name} error in ${hookName}: ${error}`)
      // Continue to next plugin
    }
  }
}
```

## File Locking Strategy

JSON backend and state management use filesystem-based locking to prevent concurrent access:

```
Acquiring lock:
  1. Create lock file with atomic flag (O_CREAT | O_EXCL)
  2. Write process PID to lock file
  3. Success = lock acquired

Checking for stale lock:
  1. Read PID from existing lock
  2. Try `process.kill(pid, 0)` (signal 0 = no-op, just check)
  3. If fails: process is dead, lock is stale
  4. Remove stale lock and retry

Releasing lock:
  1. Delete lock file
  2. Continue

Timeout:
  - Default: 5 seconds
  - Retry interval: 100ms
  - ~50 retry attempts before giving up
```

This simple strategy works reliably for preventing concurrent writes to task files and state.

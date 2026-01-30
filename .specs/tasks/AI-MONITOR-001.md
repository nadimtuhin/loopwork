# AI-MONITOR-001: AI Monitor - Intelligent Log Watcher & Auto-Healer

## Overview
An intelligent meta-monitor that watches loopwork execution logs in real-time, detects issues (like missing PRD files, rate limits, config errors), and automatically takes corrective actions to keep the loop running smoothly.

## Background
Currently, loopwork logs issues to the console but requires manual intervention when problems occur. For example, when a PRD file is missing, the loop continues but the task fails. The AI Monitor will detect these patterns and auto-fix recoverable issues.

## Goals
1. **Real-time Log Watching**: Event-driven monitoring of loopwork output logs
2. **Pattern Detection**: Match known error patterns and categorize them
3. **Auto-Healing**: Automatically fix recoverable issues (create missing PRDs, pause on rate limits)
4. **LLM Fallback**: For unknown errors, send to LLM for analysis and suggested fixes
5. **Notifications**: Alert users for critical issues requiring manual intervention

## Non-Goals
- Replacing the existing logging system
- Modifying loopwork core execution flow
- Real-time code execution (only monitoring)

## Architecture

### Component Design
```
┌─────────────────────────────────────────────────────┐
│                    loopwork run                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐      │
│  │  Task    │───▶│   CLI    │───▶│  Logs    │      │
│  │ Backend  │    │ Executor │    │ (files)  │      │
│  └──────────┘    └──────────┘    └────┬─────┘      │
└───────────────────────────────────────┼────────────┘
                                        │ tail (event-driven)
┌───────────────────────────────────────▼────────────┐
│                   AI Monitor                        │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐      │
│  │   Log    │───▶│ Pattern  │───▶│  Action  │      │
│  │ Watcher  │    │ Detector │    │ Executor │      │
│  └──────────┘    └──────────┘    └──────────┘      │
│                        │                            │
│              ┌─────────▼─────────┐                 │
│              │   LLM Analyzer    │                 │
│              │ (for unknown issues)│                │
│              └───────────────────┘                 │
└─────────────────────────────────────────────────────┘
```

### Detection Rules

| Pattern | Severity | Auto-Action |
|---------|----------|-------------|
| `PRD file not found: {path}` | WARN | Create stub PRD from task metadata |
| `Rate limit` | HIGH | Pause 60s, notify user |
| `{ENV_VAR} is required` | ERROR | Log warning, disable plugin, continue |
| `Task failed X times` | HIGH | Circuit break, alert user |
| `Timeout exceeded` | WARN | Log, let loop try next model |
| `No pending tasks` | INFO | Clean exit |
| Task early exit (no completion) | MEDIUM | Analyze failure, enhance PRD/docs/tests for retry |
| Unknown error | MEDIUM | Send to LLM for analysis |

### Action Types
```typescript
type MonitorAction =
  | { type: 'auto-fix', fn: () => Promise<void> }
  | { type: 'pause', reason: string, duration: number }
  | { type: 'skip', target: 'task' | 'plugin' }
  | { type: 'notify', channel: 'telegram' | 'discord' | 'log' }
  | { type: 'analyze', prompt: string }
  | { type: 'enhance-task', target: 'prd' | 'tests' | 'docs' }
```

### Task Recovery (Early Exit Enhancement)

When a task exits early without completion, the monitor analyzes WHY and enhances the task context for retry:

```
Task TELE-010 starts
    ↓
CLI exits early (timeout, error, insufficient context)
    ↓
Monitor detects: "Task exited without completion"
    ↓
Monitor analyzes failure reason:
  - PRD too vague? → Enhance PRD with more detail
  - Missing test cases? → Generate test scaffolding
  - Missing docs? → Add context from codebase
  - Wrong assumptions? → Add clarifications
  - Scope too large? → Split into sub-tasks
    ↓
Monitor updates task artifacts
    ↓
Loop retries with better context
```

**Exit Reason Detection:**

| Exit Reason | Detection Pattern | Recovery Action |
|-------------|-------------------|-----------------|
| PRD too vague | "unclear requirements", "need more detail", repeated questions | Expand PRD with specifics, add file references |
| Missing tests | Task involves code but no test file exists | Generate test scaffolding in PRD |
| Context missing | "cannot find", "where is" repeated in logs | Add file paths and code snippets to PRD |
| Scope too large | Timeout without progress, multiple failed areas | Split task into sub-tasks |
| Wrong approach | Multiple failed attempts at same thing | Add "Non-Goals" or constraints to PRD |

**PRD Enhancement Example:**

```markdown
# BEFORE (vague PRD that caused early exit):
## Goal
Add IPC between bot and loop.

# AFTER (enhanced by monitor):
## Goal
Add JSON-based IPC between Telegram bot (packages/telegram)
and loopwork subprocess using stdout with __IPC__ delimiters.

## Key Files (added by monitor)
- packages/telegram/src/bot.ts:245 - streamOutput() method
- packages/loopwork/src/plugins/ipc.ts - new file to create

## Context (added by monitor)
The bot spawns loopwork via Bun.spawn() and streams stdout.
See existing pattern in bot.ts streamOutput() method.

## Approach Hints (added by monitor)
- Use existing stdout streaming, add message parsing
- Reference architecture section for IPC protocol format
- Don't modify core loopwork - use plugin system
```

**Implementation:**

```typescript
interface TaskRecoveryAnalysis {
  taskId: string
  exitReason: 'vague_prd' | 'missing_tests' | 'missing_context' | 'scope_large' | 'wrong_approach'
  evidence: string[]           // Log lines that indicate the reason
  enhancement: TaskEnhancement
}

interface TaskEnhancement {
  prdAdditions?: {
    keyFiles?: string[]        // File paths to add
    context?: string           // Additional context
    approachHints?: string[]   // Suggestions
    nonGoals?: string[]        // What NOT to do
  }
  splitInto?: string[]         // Sub-task titles if scope too large
  testScaffolding?: string     // Test file content to add
}

async function analyzeEarlyExit(taskId: string, logs: string[]): Promise<TaskRecoveryAnalysis> {
  // 1. Detect exit reason from log patterns
  const exitReason = detectExitReason(logs)

  // 2. Gather enhancement context
  const taskMeta = await backend.getTask(taskId)
  const prdContent = await readPRD(taskId)
  const relevantFiles = await findRelevantFiles(taskMeta)

  // 3. Generate enhancement
  const enhancement = await generateEnhancement(exitReason, taskMeta, prdContent, relevantFiles)

  return { taskId, exitReason, evidence: logs.slice(-20), enhancement }
}
```

## Patterns from Research

Based on analysis of oh-my-opencode and oh-my-claudecode, the following patterns should be implemented:

### From oh-my-opencode

#### 1. Concurrency Control System
Per-provider/model limits with key-based queuing:

```typescript
interface ConcurrencyConfig {
  default: number           // Default: 3
  providers: {
    claude: number          // e.g., 2
    gemini: number          // e.g., 3
  }
  models: {
    'claude-opus': number   // e.g., 1 (expensive)
  }
}

class ConcurrencyManager {
  async acquire(key: string): Promise<void>  // Wait for slot
  release(key: string): void                  // Free slot
}
```

#### 2. Dual Monitoring Strategy
Event-driven + polling for reliability:

```typescript
// Event-driven: Real-time (chokidar/fs.watch)
watcher.on('change', () => handleLogChange())

// Polling: Reliability (2-second interval)
setInterval(() => checkForNewErrors(), 2000)
```

#### 3. Stale Monitor Detection
3-minute timeout for inactive monitors, 30-minute max lifetime:

```typescript
interface MonitorTimeouts {
  staleDetectionMs: 180000   // 3 minutes - restart monitor
  maxLifetimeMs: 1800000     // 30 minutes - terminate
  healthCheckIntervalMs: 5000
}
```

#### 4. Error Recovery Strategies
Multiple recovery strategies with graceful degradation:

```typescript
type RecoveryStrategy =
  | 'context-truncation'   // Reduce log context size
  | 'model-fallback'       // Try cheaper/different model
  | 'task-restart'         // Restart healing from scratch
  | 'circuit-breaker'      // Stop trying, alert user
```

### From oh-my-claudecode

#### 5. Verification-Before-Completion Protocol
**Iron Law:** NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE

```typescript
interface VerificationEvidence {
  claim: string           // "Fixed type errors"
  command: string         // "tsc --noEmit"
  output: string          // Actual command output
  timestamp: Date         // When verified
  passed: boolean         // Did it pass?
  fresh: boolean          // < 5 minutes old
}

// Red flags that require stopping and verifying:
// - Using "should", "probably", "seems to"
// - Claiming completion without fresh test/build run
```

#### 6. Circuit Breaker Pattern
Prevents infinite healing loops:

```typescript
interface CircuitBreakerState {
  consecutiveFailures: number
  maxFailures: number        // Default: 3
  cooldownPeriodMs: number   // Default: 60000
  lastFailureTime: number
  state: 'closed' | 'open' | 'half-open'
}
```

#### 7. Notepad Wisdom System
Learn from healing attempts:

```
.loopwork/ai-monitor/
├── state.json              # Current monitor state
├── learned-patterns.json   # Error signatures that worked
├── healing-history.json    # Success/failure tracking
└── notepads/
    └── {session}/
        ├── learnings.md    # What we discovered
        ├── decisions.md    # Choices made
        └── issues.md       # Problems encountered
```

#### 8. Delegation-First with Smart Model Routing
Never do work directly - delegate to specialized agents:

```typescript
const healingCategories = {
  'syntax-error': {
    agent: 'executor-low',
    model: 'haiku',
    temperature: 0.1,
    maxAttempts: 2
  },
  'type-error': {
    agent: 'executor',
    model: 'sonnet',
    temperature: 0.2,
    maxAttempts: 3
  },
  'complex-debug': {
    agent: 'architect',
    model: 'opus',
    temperature: 0.3,
    extendedThinking: true
  }
}
```

#### 9. Three-Layer Skill Composition
Composable behaviors for monitor modes:

```
[Guarantee Layer]    "cannot stop until log clean"
        ↓
[Enhancement Layer]  auto-heal + notify + learn
        ↓
[Execution Layer]    log-watcher + pattern-matcher
```

### Combined Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     AI Monitor System                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Concurrency │  │   Circuit   │  │   Wisdom    │         │
│  │   Manager   │  │   Breaker   │  │   System    │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                 │
│  ┌──────▼────────────────▼────────────────▼──────┐         │
│  │              Monitor Orchestrator              │         │
│  │  - Event-driven + Polling (dual monitoring)   │         │
│  │  - Stale detection (3-min timeout)            │         │
│  │  - Max lifetime enforcement (30-min)          │         │
│  └──────────────────────┬────────────────────────┘         │
│                         │                                   │
│  ┌──────────────────────▼────────────────────────┐         │
│  │              Pattern Detector                  │         │
│  │  - Regex patterns for known errors            │         │
│  │  - Learned patterns from wisdom system        │         │
│  │  - Severity classification                    │         │
│  └──────────────────────┬────────────────────────┘         │
│                         │                                   │
│  ┌──────────────────────▼────────────────────────┐         │
│  │           Healing Strategy Selector            │         │
│  │  - Category-based model routing               │         │
│  │  - Delegate to specialized agents             │         │
│  │  - Recovery strategy fallbacks                │         │
│  └──────────────────────┬────────────────────────┘         │
│                         │                                   │
│  ┌──────────────────────▼────────────────────────┐         │
│  │           Verification Engine                  │         │
│  │  - Fresh evidence required (< 5 min)          │         │
│  │  - BUILD/TEST/LINT checks                     │         │
│  │  - Update wisdom on success/failure           │         │
│  └───────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

### Enhanced Configuration

```typescript
// loopwork.config.ts
withAIMonitor({
  // Concurrency (from oh-my-opencode)
  concurrency: {
    default: 3,
    providers: { claude: 2, gemini: 3 },
    models: { 'claude-opus': 1 }
  },

  // Timeouts (from oh-my-opencode)
  timeouts: {
    staleDetectionMs: 180000,
    maxLifetimeMs: 1800000,
    healthCheckIntervalMs: 5000
  },

  // Circuit breaker (from oh-my-claudecode)
  circuitBreaker: {
    maxFailures: 3,
    cooldownPeriodMs: 60000,
    halfOpenAttempts: 1
  },

  // Verification (from oh-my-claudecode)
  verification: {
    freshnessTTL: 300000,  // 5 minutes
    checks: ['BUILD', 'TEST', 'LINT'],
    requireArchitectApproval: false
  },

  // Healing categories (combined)
  healingCategories: {
    'prd-not-found': { agent: 'executor-low', model: 'haiku' },
    'syntax-error': { agent: 'executor-low', model: 'haiku' },
    'type-error': { agent: 'executor', model: 'sonnet' },
    'test-failure': { agent: 'executor', model: 'sonnet' },
    'complex-debug': { agent: 'architect', model: 'opus' }
  },

  // Recovery strategies (from oh-my-opencode)
  recovery: {
    strategies: ['context-truncation', 'model-fallback', 'task-restart'],
    maxRetries: 3,
    backoffMs: 1000
  },

  // Wisdom system (from oh-my-claudecode)
  wisdom: {
    enabled: true,
    learnFromSuccess: true,
    learnFromFailure: true,
    patternExpiryDays: 30
  }
})
```

### Call Frequency & Cost Control
```typescript
const AI_MONITOR_CONFIG = {
  // LLM calls (heavily throttled)
  llmCooldown: 5 * 60 * 1000,     // 5 min between LLM calls
  llmMaxPerSession: 10,           // Max 10 LLM calls per session
  llmModel: 'haiku',              // Use cheapest model

  // Pattern matching (free, instant)
  patternCheckDebounce: 100,      // Debounce rapid log lines

  // Caching
  cacheUnknownErrors: true,       // Don't re-analyze same error
  cacheTTL: 24 * 60 * 60 * 1000,  // 24h cache
}
```

## File Structure
```
packages/loopwork/src/ai-monitor/
├── index.ts           # Main AIMonitor class
├── watcher.ts         # Log file watcher (chokidar/tail)
├── patterns.ts        # Known pattern matchers with regex
├── actions/
│   ├── index.ts       # Action executor
│   ├── create-prd.ts  # Auto-create missing PRD
│   ├── pause-loop.ts  # Pause/resume control
│   ├── notify.ts      # Send alerts via plugins
│   └── analyze.ts     # LLM fallback analysis
└── cli.ts             # `loopwork ai-monitor` command
```

## Implementation Plan

### Phase 1: Core Infrastructure
1. Create `AIMonitor` class with event emitter pattern
2. Implement `LogWatcher` using chokidar for file watching
3. Create pattern registry with regex matchers
4. Add basic action executor framework

### Phase 2: Pattern Detection & Actions
1. Implement "PRD not found" detection and auto-create action
2. Implement rate limit detection and pause action
3. Implement config error detection and skip action
4. Add notification hooks

### Phase 3: LLM Integration
1. Add LLM analyzer for unknown errors
2. Implement response caching
3. Add throttling and cost controls

### Phase 4: CLI & Integration
1. Create `loopwork ai-monitor` command
2. Add `--with-ai-monitor` flag to `loopwork start`
3. Write tests and documentation

## Usage
```bash
# Start main loop
loopwork start

# In another terminal - start AI monitor
loopwork ai-monitor --watch

# Or integrated mode
loopwork start --with-ai-monitor
```

## Success Criteria
- [ ] Log watcher detects new lines within 100ms (event-driven)
- [ ] Pattern matcher correctly identifies all known error types
- [ ] Auto-create PRD action generates valid stub from task metadata
- [ ] Task recovery detects early exits and enhances PRD/docs/tests for retry
- [ ] Rate limit pause action halts execution for correct duration
- [ ] LLM analyzer called max 10 times per session
- [ ] Unknown errors cached to prevent duplicate analysis
- [ ] Notifications sent via configured channels
- [ ] All tests pass
- [ ] Documentation complete

## Testing Strategy

### Unit Tests
- `test/ai-monitor/patterns.test.ts` - Pattern matching
- `test/ai-monitor/actions.test.ts` - Action execution
- `test/ai-monitor/watcher.test.ts` - Log watching

### Integration Tests
- Full flow: loopwork runs → error logged → monitor detects → action taken
- LLM fallback with mocked responses

## Security Considerations
1. LLM prompts must not include sensitive data from logs
2. Auto-created PRDs should be marked as stubs requiring review
3. Pause action should have maximum duration to prevent indefinite hangs
4. File watching should be scoped to loopwork output directories only

## Dependencies
- `chokidar` - File watching (already in project)
- Existing notification plugins (Telegram, Discord)
- Anthropic SDK for LLM analysis (optional)

## Future Enhancements
- Web dashboard showing monitor status
- Custom pattern definitions via config
- Machine learning for pattern discovery
- Integration with incident management (PagerDuty, OpsGenie)

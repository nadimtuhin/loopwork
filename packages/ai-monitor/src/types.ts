/**
 * AI Monitor Types
 * Defines core types for the AI-powered log monitoring and auto-healing system
 */

export type ErrorSeverity = 'INFO' | 'WARN' | 'ERROR' | 'HIGH'

export type RecoveryStrategy =
  | 'context-truncation'   // Reduce log context size
  | 'model-fallback'       // Try cheaper/different model
  | 'task-restart'         // Restart healing from scratch
  | 'circuit-breaker'      // Stop trying, alert user

export type ExitReason =
  | 'vague_prd'           // PRD needs more detail
  | 'missing_tests'       // Test scaffolding needed
  | 'missing_context'     // File paths/snippets needed
  | 'scope_large'         // Should split into subtasks
  | 'wrong_approach'      // Constraints/non-goals needed

export type MonitorActionType =
  | 'auto-fix'
  | 'pause'
  | 'skip'
  | 'notify'
  | 'analyze'
  | 'enhance-task'

export interface MonitorAction {
  type: MonitorActionType
  fn?: () => Promise<void>
  reason?: string
  duration?: number
  target?: 'task' | 'plugin' | 'prd' | 'tests' | 'docs'
  channel?: 'telegram' | 'discord' | 'log'
  prompt?: string
}

export interface ErrorPattern {
  name: string
  regex: RegExp
  severity: ErrorSeverity
  action: MonitorAction
  category?: string
  description?: string
}

export interface TaskRecoveryAnalysis {
  taskId: string
  exitReason: ExitReason
  evidence: string[]           // Log lines that indicate the reason
  enhancement: TaskEnhancement
  strategy?: RecoveryStrategy
  timestamp: Date
}

export interface TaskEnhancement {
  prdAdditions?: {
    keyFiles?: string[]        // File paths to add
    context?: string           // Additional context
    approachHints?: string[]   // Suggestions
    nonGoals?: string[]        // What NOT to do
  }
  splitInto?: string[]         // Sub-task titles if scope too large
  testScaffolding?: string     // Test file content to add
}

export interface VerificationEvidence {
  claim: string              // "Fixed type errors"
  command: string            // "tsc --noEmit"
  output: string             // Actual command output
  timestamp: Date            // When verified
  passed: boolean            // Did it pass?
  fresh: boolean             // < 5 minutes old
}

export interface CircuitBreakerState {
  consecutiveFailures: number
  maxFailures: number        // Default: 3
  cooldownPeriodMs: number   // Default: 60000
  lastFailureTime: number
  state: 'closed' | 'open' | 'half-open'
}

export interface ConcurrencyConfig {
  default: number              // Default: 3
  providers: {
    [key: string]: number      // e.g., claude: 2, gemini: 3
  }
  models: {
    [key: string]: number      // e.g., 'claude-opus': 1
  }
}

export interface MonitorTimeouts {
  staleDetectionMs: number     // Default: 180000 (3 minutes)
  maxLifetimeMs: number        // Default: 1800000 (30 minutes)
  healthCheckIntervalMs: number // Default: 5000
}

export interface HealingCategory {
  agent: string
  model: 'haiku' | 'sonnet' | 'opus'
  temperature: number
  maxAttempts: number
  extendedThinking?: boolean
}

export interface AIMonitorConfig {
  enabled: boolean

  // Concurrency (from oh-my-opencode)
  concurrency: ConcurrencyConfig

  // Timeouts (from oh-my-opencode)
  timeouts: MonitorTimeouts

  // Circuit breaker (from oh-my-claudecode)
  circuitBreaker: {
    maxFailures: number
    cooldownPeriodMs: number
    halfOpenAttempts: number
  }

  // Verification (from oh-my-claudecode)
  verification: {
    freshnessTTL: number       // Default: 300000 (5 minutes)
    checks: any[]
    requireArchitectApproval: boolean
  }

  // Healing categories (combined)
  healingCategories: {
    [key: string]: HealingCategory
  }

  // Recovery strategies (from oh-my-opencode)
  recovery: {
    strategies: RecoveryStrategy[]
    maxRetries: number
    backoffMs: number
  }

  // Wisdom system (from oh-my-claudecode)
  wisdom: {
    enabled: boolean
    learnFromSuccess: boolean
    learnFromFailure: boolean
    patternExpiryDays: number
  }

  // LLM calls (heavily throttled)
  llm: {
    cooldownMs: number         // Default: 300000 (5 minutes)
    maxPerSession: number      // Default: 10
    model: 'haiku' | 'sonnet' | 'opus'
  }

  // Pattern matching (free, instant)
  patternCheckDebounce: number // Default: 100ms

  // Caching
  cache: {
    enabled: boolean
    ttlMs: number              // Default: 86400000 (24 hours)
  }

  // Monitoring strategy
  monitoring: {
    eventDriven: boolean       // Default: true (chokidar)
    polling: boolean           // Default: true (reliability fallback)
    pollingIntervalMs: number  // Default: 2000
  }

  // State directory
  stateDir: string             // Default: '.loopwork/ai-monitor'
}

export interface RecoveryHistoryEntry {
  taskId: string
  exitReason: string
  timestamp: number
  success: boolean
}

export interface MonitorState {
  sessionId: string
  startTime: Date
  lastActivity: Date
  isActive: boolean
  consecutiveFailures: number
  totalHeals: number
  totalFailures: number
  circuitBreaker: CircuitBreakerState
  llmCallsCount: number
  lastLLMCall: number
  detectedPatterns: Record<string, number>
  unknownErrorCache: Set<string>
  recoveryHistory: Record<string, RecoveryHistoryEntry>
  recoveryAttempts: number
  recoverySuccesses: number
  recoveryFailures: number
}

export interface LearnedPattern {
  signature: string             // Hash of error pattern
  pattern: ErrorPattern
  successCount: number
  failureCount: number
  lastSeen: Date
  expiresAt: Date
}

export interface HealingHistory {
  timestamp: Date
  taskId: string
  errorPattern: string
  action: MonitorAction
  success: boolean
  duration: number
  evidence?: VerificationEvidence
}

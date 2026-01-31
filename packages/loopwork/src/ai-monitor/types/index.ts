/**
 * AI Monitor - Intelligent Log Watcher & Auto-Healer
 *
 * A meta-monitor that watches loopwork execution logs, detects issues,
 * and automatically takes corrective actions to keep the loop running smoothly.
 */

/**
 * Monitor action types
 */
export type MonitorAction =
  | { type: 'auto-fix', fn: () => Promise<void> }
  | { type: 'pause', reason: string, duration: number }
  | { type: 'skip', target: 'task' | 'plugin' }
  | { type: 'notify', channel: 'telegram' | 'discord' | 'log', message: string }
  | { type: 'analyze', prompt: string }
  | { type: 'enhance-task', target: 'prd' | 'tests' | 'docs', taskId: string }
  | { type: 'circuit-break' }
  | { type: 'retry-task' }

/**
 * Severity levels for detected patterns
 */
export type Severity = 'INFO' | 'WARN' | 'HIGH' | 'ERROR' | 'CRITICAL' | 'MEDIUM'

/**
 * Pattern match result
 */
export interface PatternMatch {
  pattern: string
  severity: Severity
  matches: RegExpMatchArray | null
  action?: MonitorAction
  line: string
  timestamp: Date
}

/**
 * Pattern definition for error detection
 */
export interface ErrorPattern {
  name: string
  pattern: RegExp
  severity: Severity
  autoAction?: (match: RegExpMatchArray) => MonitorAction
}

/**
 * Recovery strategies for healing attempts
 */
export type RecoveryStrategy =
  | 'context-truncation'
  | 'model-fallback'
  | 'task-restart'
  | 'circuit-breaker'
  | 'prd-enhancement'
  | 'manual-intervention'

/**
 * Circuit breaker state
 */
export interface CircuitBreakerState {
  consecutiveFailures: number
  maxFailures: number
  cooldownPeriodMs: number
  lastFailureTime: number
  state: 'closed' | 'open' | 'half-open'
  halfOpenAttempts: number
}

/**
 * Concurrency configuration per provider/model
 */
export interface ConcurrencyConfig {
  default: number
  providers: Record<string, number>
  models: Record<string, number>
}

/**
 * Concurrency slot request
 */
export interface SlotRequest {
  key: string
  timeout: number
  resolver: (granted: boolean) => void
}

/**
 * Healing attempt record
 */
export interface HealingAttempt {
  id: string
  pattern: string
  strategy: RecoveryStrategy
  timestamp: Date
  success: boolean
  error?: string
  durationMs: number
}

/**
 * Learned pattern entry
 */
export interface LearnedPattern {
  signature: string
  pattern: RegExp
  successCount: number
  failureCount: number
  lastUsed: Date
  action: MonitorAction
}

/**
 * Wisdom system configuration
 */
export interface WisdomConfig {
  enabled: boolean
  learnFromSuccess: boolean
  learnFromFailure: boolean
  patternExpiryDays: number
  storagePath: string
}

/**
 * LLM analyzer configuration
 */
export interface LLMAnalyzerConfig {
  enabled: boolean
  model: string
  maxCallsPerSession: number
  cooldownMs: number
  cacheEnabled: boolean
  cacheTTL: number
}

/**
 * Task recovery analysis result
 */
export interface TaskRecoveryAnalysis {
  taskId: string
  exitReason: 'vague_prd' | 'missing_tests' | 'missing_context' | 'scope_large' | 'wrong_approach' | 'unknown'
  evidence: string[]
  enhancement: TaskEnhancement
}

/**
 * Task enhancement suggestions
 */
export interface TaskEnhancement {
  prdAdditions?: {
    keyFiles?: string[]
    context?: string
    approachHints?: string[]
    nonGoals?: string[]
  }
  splitInto?: string[]
  testScaffolding?: string
}

/**
 * Monitor statistics
 */
export interface MonitorStats {
  patternsDetected: number
  actionsExecuted: number
  healingSuccess: number
  healingFailures: number
  llmCalls: number
  startTime: Date
}

/**
 * Monitor configuration
 */
export interface AIMonitorConfig {
  enabled: boolean
  logPaths: string[]
  watchMode: 'event-driven' | 'polling' | 'dual'
  pollingIntervalMs: number

  // Concurrency
  concurrency: ConcurrencyConfig

  // Timeouts
  staleDetectionMs: number
  maxLifetimeMs: number
  healthCheckIntervalMs: number

  // Circuit breaker
  circuitBreaker: {
    maxFailures: number
    cooldownPeriodMs: number
    halfOpenAttempts: number
  }

  // Verification
  verification: {
    freshnessTTL: number
    checks: Array<'BUILD' | 'TEST' | 'LINT'>
    requireArchitectApproval: boolean
  }

  // Healing categories
  healingCategories: Record<string, {
    agent: string
    model: string
    maxAttempts: number
    temperature?: number
    extendedThinking?: boolean
  }>

  // Recovery strategies
  recovery: {
    strategies: RecoveryStrategy[]
    maxRetries: number
    backoffMs: number
  }

  // Wisdom system
  wisdom: WisdomConfig

  // LLM analyzer
  llmAnalyzer: LLMAnalyzerConfig

  // Task recovery
  taskRecovery: {
    enabled: boolean
    autoEnhanceOnFailure: boolean
    maxAnalysisLines: number
  }
}

/**
 * Log event
 */
export interface LogEvent {
  timestamp: Date
  level: string
  message: string
  line: string
  file?: string
}

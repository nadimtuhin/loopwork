import { logger } from '../core/utils'
import { LogWatcher } from './watcher'
import { PatternDetector } from './patterns'
import { CircuitBreaker } from './circuit-breaker'
import { VerificationEngine } from './verification'
import type {
  AIMonitorConfig,
  PatternMatch as PatternMatchResult,
  MonitorStats,
  HealingAttempt,
  LogEvent,
} from './types'

/**
 * AI Monitor - Intelligent Log Watcher & Auto-Healer
 *
 * Monitors loopwork execution logs in real-time, detects issues,
 * and automatically takes corrective actions to keep the loop running smoothly.
 */
export class AIMonitor {
  private config: AIMonitorConfig
  private logWatcher: LogWatcher
  private patternDetector: PatternDetector
  private actionExecutor: ActionExecutor
  private circuitBreaker: CircuitBreaker
  private running = false
  private stats: MonitorStats

  // Healing history
  private healingHistory: HealingAttempt[] = []

  // Event tracking
  private onLogLineCallbacks: Set<(event: LogEvent) => void> = new Set()

  constructor(config: AIMonitorConfig) {
    this.config = {
      // Apply defaults
      watchMode: 'event-driven',
      pollingIntervalMs: 2000,
      staleDetectionMs: 180000, // 3 minutes
      maxLifetimeMs: 1800000, // 30 minutes
      healthCheckIntervalMs: 5000,
      concurrency: {
        default: 3,
        providers: {},
        models: {},
      },
      circuitBreaker: {
        maxFailures: 3,
        cooldownPeriodMs: 60000,
        halfOpenAttempts: 1,
      },
      verification: {
        freshnessTTL: 300000, // 5 minutes
        checks: ['BUILD', 'TEST', 'LINT'],
        requireArchitectApproval: false,
      },
      healingCategories: {
        'prd-not-found': { agent: 'executor-low', model: 'haiku', maxAttempts: 2 },
        'syntax-error': { agent: 'executor-low', model: 'haiku', maxAttempts: 2 },
        'type-error': { agent: 'executor', model: 'sonnet', maxAttempts: 3 },
        'test-failure': { agent: 'executor', model: 'sonnet', maxAttempts: 3 },
        'complex-debug': { agent: 'architect', model: 'opus', temperature: 0.3, extendedThinking: true },
      },
      recovery: {
        strategies: ['context-truncation', 'model-fallback', 'task-restart'],
        maxRetries: 3,
        backoffMs: 1000,
      },
      wisdom: {
        enabled: true,
        learnFromSuccess: true,
        learnFromFailure: true,
        patternExpiryDays: 30,
        storagePath: '.loopwork/ai-monitor',
      },
      llmAnalyzer: {
        enabled: false,
        model: 'haiku',
        maxCallsPerSession: 10,
        cooldownMs: 300000, // 5 minutes
        cacheEnabled: true,
        cacheTTL: 86400000, // 24 hours
      },
      taskRecovery: {
        enabled: true,
        autoEnhanceOnFailure: true,
        maxAnalysisLines: 200,
      },
      ...config,
    }

    // Initialize components
    this.logWatcher = new LogWatcher(
      this.config.logPaths || [],
      {
        mode: this.config.watchMode,
        pollingIntervalMs: this.config.pollingIntervalMs,
      }
    )

    this.patternDetector = new PatternDetector(this.config.customPatterns)
    this.actionExecutor = new ActionExecutor({
      stateManager: this.config.stateManager,
      namespace: this.config.namespace,
    })
    this.circuitBreaker = new CircuitBreaker(this.config.circuitBreaker)

    // Initialize stats
    this.stats = {
      patternsDetected: 0,
      actionsExecuted: 0,
      healingSuccess: 0,
      healingFailures: 0,
      llmCalls: 0,
      startTime: new Date(),
    }

    // Wire up components
    this.setupEventHandlers()
  }

  /**
   * Setup event handlers between components
   */
  private setupEventHandlers(): void {
    // LogWatcher -> PatternDetector
    this.logWatcher.on('line', (event) => {
      this.stats.patternsDetected++
      const match = this.patternDetector.detect(event.line)

      if (match) {
        this.handlePatternMatch(match, event)
      }
    })

    // PatternDetector -> ActionExecutor
    // (Handled in handlePatternMatch)

    // Circuit breaker monitoring
    this.actionExecutor.on('healing-failed', () => {
      this.stats.healingFailures++
      this.checkCircuitBreaker()
    })

    this.actionExecutor.on('healing-success', () => {
      this.stats.healingSuccess++
      this.recordHealingSuccess()
    })

    // LLM call tracking
    this.actionExecutor.on('llm-call', () => {
      this.stats.llmCalls++
    })

    // Emit log events to external listeners
    this.logWatcher.on('line', (event) => {
      const logEvent: LogEvent = {
        timestamp: event.timestamp,
        level: this.detectLogLevel(event.line),
        message: event.line,
        file: event.file,
      }

      for (const callback of this.onLogLineCallbacks) {
        try {
          callback(logEvent)
        } catch (error) {
          logger.error(`Error in log line callback: ${error}`)
        }
      }
    })
  }

  /**
   * Detect log level from line content
   */
  private detectLogLevel(line: string): LogEvent['level'] {
    const lowerLine = line.toLowerCase()
    if (lowerLine.includes('error') || lowerLine.includes('failed')) return 'error'
    if (lowerLine.includes('warn')) return 'warn'
    if (lowerLine.includes('info')) return 'info'
    if (lowerLine.includes('debug')) return 'debug'
    return 'info'
  }

  /**
   * Handle detected pattern
   */
  private async handlePatternMatch(match: PatternMatchResult, _event: LogEvent): Promise<void> {
    this.stats.actionsExecuted++

    try {
      // Check circuit breaker first
      if (this.circuitBreaker.isOpen()) {
        logger.warn(`[AI-Monitor] Circuit breaker OPEN - skipping action: ${match.pattern}`)
        await this.actionExecutor.execute({
          type: 'notify',
          channel: 'log',
          message: `[SKIPPED] ${match.pattern}: Circuit breaker active`,
          patternName: match.pattern,
        })
        return
      }

      // Execute the pattern's action
      if (match.action) {
        await this.actionExecutor.execute(match.action)
        this.recordHealingAttempt(match.pattern, match.action.type || 'unknown', true)
      } else {
        // No action defined, just log
        logger.info(`[AI-Monitor] Pattern detected: ${match.pattern} (${match.severity})`)
      }
    } catch (error) {
      logger.error(`[AI-Monitor] Error executing action for ${match.pattern}: ${error}`)
      this.recordHealingAttempt(match.pattern, match.action?.type || 'error', false, String(error))

      // Check circuit breaker conditions
      if (match.severity === 'HIGH' || match.severity === 'ERROR') {
        this.checkCircuitBreaker()
      }
    }
  }

  /**
   * Record healing attempt for wisdom system
   */
  private recordHealingAttempt(
    pattern: string,
    actionType: string,
    success: boolean,
    error?: string
  ): void {
    const attempt: HealingAttempt = {
      id: `attempt-${Date.now()}-${pattern}-${actionType}`,
      pattern,
      actionType,
      timestamp: new Date(),
      success,
      error,
    }

    this.healingHistory.push(attempt)

    // Keep only last 1000 attempts
    if (this.healingHistory.length > 1000) {
      this.healingHistory = this.healingHistory.slice(-1000)
    }
  }

  /**
   * Record successful healing for wisdom learning
   */
  private recordHealingSuccess(): void {
    // This would update the wisdom system with learned patterns
    // Implementation would save to .loopwork/ai-monitor/learned-patterns.json
    logger.debug('[AI-Monitor] Recording successful healing for wisdom system')
  }

  /**
   * Check and update circuit breaker state
   */
  private checkCircuitBreaker(): void {
    const stats = this.circuitBreaker.getStats()

    // Open circuit after consecutive failures
    if (stats.consecutiveFailures >= this.config.circuitBreaker.maxFailures) {
      logger.warn(
        `[AI-Monitor] Circuit breaker OPEN after ${stats.consecutiveFailures} consecutive failures`
      )
      await this.actionExecutor.execute({
        type: 'notify',
        channel: 'log',
        message: 'Circuit breaker activated. Manual intervention required.',
      })
    }
  }

  /**
   * Start monitoring
   */
  start(): void {
    if (this.running) {
      logger.warn('[AI-Monitor] Already running')
      return
    }

    logger.info(`[AI-Monitor] Starting in ${this.config.watchMode} mode`)
    logger.info(`[AI-Monitor] Watching: ${this.config.logPaths?.join(', ')}`)

    this.running = true
    this.stats.startTime = new Date()

    this.logWatcher.start()

    // Start stale detection and health check
    this.startHealthChecks()
  }

  /**
   * Stop monitoring
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return
    }

    logger.info('[AI-Monitor] Stopping...')
    this.running = false

    await this.logWatcher.stop()
  }

  /**
   * Register external event handler
   */
  on(event: string, callback: (event: LogEvent) => void): void {
    this.onLogLineCallbacks.add(callback)
  }

  /**
   * Start health checks for stale detection and max lifetime
   */
  private startHealthChecks(): void {
    // Health check interval
    const healthInterval = setInterval(() => {
      if (!this.running) {
        clearInterval(healthInterval)
        return
      }

      const elapsed = Date.now() - this.stats.startTime.getTime()

      // Stale detection
      if (elapsed > this.config.staleDetectionMs) {
        const lastActivity = Date.now() - this.getLastActivityTime()
        if (lastActivity > this.config.staleDetectionMs) {
          logger.warn('[AI-Monitor] Stale monitor detected (no activity for 3 min)')
          // Could trigger restart or alert
        }
      }

      // Max lifetime enforcement
      if (elapsed > this.config.maxLifetimeMs) {
        logger.warn('[AI-Monitor] Max lifetime exceeded (30 min), shutting down')
        this.stop()
        clearInterval(healthInterval)
        return
      }
    }, this.config.healthCheckIntervalMs)
  }

  /**
   * Get time of last activity
   */
  private getLastActivityTime(): number {
    if (this.healingHistory.length === 0) {
      return Date.now() - this.stats.startTime.getTime()
    }

    const lastAttempt = this.healingHistory[this.healingHistory.length - 1]
    return Date.now() - lastAttempt.timestamp.getTime()
  }

  /**
   * Get current statistics
   */
  getStats(): MonitorStats {
    return {
      ...this.stats,
      elapsed: Date.now() - this.stats.startTime.getTime(),
      uptime: this.running,
    }
  }

  /**
   * Get circuit breaker stats
   */
  getCircuitBreakerStats(): CircuitBreakerStatsResult {
    return this.circuitBreaker.getStats()
  }

  /**
   * Get healing history
   */
  getHealingHistory(limit = 100): HealingAttempt[] {
    return this.healingHistory.slice(-limit)
  }
}

/**
 * Create AI Monitor instance
 */
export function createAIMonitor(config: AIMonitorConfig): AIMonitor {
  return new AIMonitor(config)
}

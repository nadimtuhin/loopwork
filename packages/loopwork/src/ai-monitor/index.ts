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

export class AIMonitor {
  private config: AIMonitorConfig
  private logWatcher: LogWatcher
  private patternDetector: PatternDetector
  private circuitBreaker: CircuitBreaker
  private verificationEngine: VerificationEngine
  private running = false
  private stats: MonitorStats
  private healingHistory: HealingAttempt[] = []
  private onLogLineCallbacks: Set<(event: LogEvent) => void> = new Set()

  constructor(config: Partial<AIMonitorConfig> = {}) {
    this.config = {
      enabled: true,
      logPaths: [],
      watchMode: 'event-driven',
      pollingIntervalMs: 2000,
      staleDetectionMs: 180000,
      maxLifetimeMs: 1800000,
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
        freshnessTTL: 300000,
        checks: ['BUILD', 'TEST', 'LINT'],
        requireArchitectApproval: false,
      },
      healingCategories: {},
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
        cooldownMs: 300000,
        cacheEnabled: true,
        cacheTTL: 86400000,
      },
      taskRecovery: {
        enabled: true,
        autoEnhanceOnFailure: true,
        maxAnalysisLines: 200,
      },
      ...config,
    } as AIMonitorConfig

    this.logWatcher = new LogWatcher(
      this.config.logPaths || [],
      {
        mode: this.config.watchMode,
        pollingIntervalMs: this.config.pollingIntervalMs,
      }
    )

    this.patternDetector = new PatternDetector()
    this.circuitBreaker = new CircuitBreaker(this.config.circuitBreaker)
    this.verificationEngine = new VerificationEngine({
      freshnessTTL: this.config.verification.freshnessTTL,
      checks: this.config.verification.checks.map(type => ({
        type,
        required: true,
      })),
      requireArchitectApproval: this.config.verification.requireArchitectApproval,
    })

    this.stats = {
      patternsDetected: 0,
      actionsExecuted: 0,
      healingSuccess: 0,
      healingFailures: 0,
      llmCalls: 0,
      startTime: new Date(),
    }

    this.setupEventHandlers()
  }

  private setupEventHandlers(): void {
    this.logWatcher.on('line', (event) => {
      this.stats.patternsDetected++
      const match = this.patternDetector.detect(event.line)

      if (match) {
        const logEvent: LogEvent = {
          timestamp: event.timestamp,
          level: this.detectLogLevel(event.line),
          message: event.line,
          line: event.line,
          file: event.file,
        }
        this.handlePatternMatch(match, logEvent)
      }
    })

    this.logWatcher.on('line', (event) => {
      const logEvent: LogEvent = {
        timestamp: event.timestamp,
        level: this.detectLogLevel(event.line),
        message: event.line,
        line: event.line,
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

  private detectLogLevel(line: string): LogEvent['level'] {
    const lowerLine = line.toLowerCase()
    if (lowerLine.includes('error') || lowerLine.includes('failed')) return 'error'
    if (lowerLine.includes('warn')) return 'warn'
    if (lowerLine.includes('info')) return 'info'
    if (lowerLine.includes('debug')) return 'debug'
    return 'info'
  }

  private async handlePatternMatch(match: PatternMatchResult, _event: LogEvent): Promise<void> {
    this.stats.actionsExecuted++

    try {
      if (this.circuitBreaker.isOpen()) {
        logger.warn(`[AI-Monitor] Circuit breaker OPEN - skipping action: ${match.pattern}`)
        return
      }

      if (match.action) {
        await this.executeAction(match.action)
        this.recordHealingAttempt(match.pattern, match.action.type || 'unknown', true)
      } else {
        logger.info(`[AI-Monitor] Pattern detected: ${match.pattern} (${match.severity})`)
      }
    } catch (error) {
      logger.error(`[AI-Monitor] Error executing action for ${match.pattern}: ${error}`)
      this.recordHealingAttempt(match.pattern, match.action?.type || 'error', false, String(error))

      if (match.severity === 'HIGH' || match.severity === 'ERROR') {
        this.checkCircuitBreaker()
      }
    }
  }

  private async executeAction(action: { type: string; fn?: () => Promise<void> }): Promise<void> {
    if (action.type === 'auto-fix' && action.fn) {
      await action.fn()
      
      const verificationResult = await this.verificationEngine.verify(`Healing action: ${action.type}`)
      
      if (verificationResult.passed) {
        this.stats.healingSuccess++
        logger.info('[AI-Monitor] Healing action verified successfully')
      } else {
        this.stats.healingFailures++
        logger.error(`[AI-Monitor] Healing action failed verification: ${verificationResult.failedChecks.join(', ')}`)
        this.checkCircuitBreaker()
      }
    }
  }

  private recordHealingAttempt(
    pattern: string,
    actionType: string,
    success: boolean,
    error?: string
  ): void {
    const attempt: HealingAttempt = {
      id: `attempt-${Date.now()}-${pattern}-${actionType}`,
      pattern,
      strategy: actionType as HealingAttempt['strategy'],
      timestamp: new Date(),
      success,
      error,
      durationMs: 0,
    }

    this.healingHistory.push(attempt)

    if (this.healingHistory.length > 1000) {
      this.healingHistory = this.healingHistory.slice(-1000)
    }
  }

  private checkCircuitBreaker(): void {
    const stats = this.circuitBreaker.getStats()

    if (stats.consecutiveFailures >= this.config.circuitBreaker.maxFailures) {
      logger.warn(
        `[AI-Monitor] Circuit breaker OPEN after ${stats.consecutiveFailures} consecutive failures`
      )
    }
  }

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
    this.startHealthChecks()
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return
    }

    logger.info('[AI-Monitor] Stopping...')
    this.running = false

    await this.logWatcher.stop()
  }

  on(event: string, callback: (event: LogEvent) => void): void {
    this.onLogLineCallbacks.add(callback)
  }

  private startHealthChecks(): void {
    const healthInterval = setInterval(() => {
      if (!this.running) {
        clearInterval(healthInterval)
        return
      }

      const elapsed = Date.now() - this.stats.startTime.getTime()

      if (elapsed > this.config.staleDetectionMs) {
        const lastActivity = Date.now() - this.getLastActivityTime()
        if (lastActivity > this.config.staleDetectionMs) {
          logger.warn('[AI-Monitor] Stale monitor detected (no activity for 3 min)')
        }
      }

      if (elapsed > this.config.maxLifetimeMs) {
        logger.warn('[AI-Monitor] Max lifetime exceeded (30 min), shutting down')
        this.stop()
        clearInterval(healthInterval)
        return
      }
    }, this.config.healthCheckIntervalMs)
  }

  private getLastActivityTime(): number {
    if (this.healingHistory.length === 0) {
      return Date.now() - this.stats.startTime.getTime()
    }

    const lastAttempt = this.healingHistory[this.healingHistory.length - 1]
    return Date.now() - lastAttempt.timestamp.getTime()
  }

  getStats(): MonitorStats & { elapsed: number; uptime: boolean } {
    return {
      ...this.stats,
      elapsed: Date.now() - this.stats.startTime.getTime(),
      uptime: this.running,
    }
  }

  getCircuitBreakerStats() {
    return this.circuitBreaker.getStats()
  }

  getHealingHistory(limit = 100): HealingAttempt[] {
    return this.healingHistory.slice(-limit)
  }

  getVerificationEngine(): VerificationEngine {
    return this.verificationEngine
  }
}

export function createAIMonitor(config: AIMonitorConfig): AIMonitor {
  return new AIMonitor(config)
}

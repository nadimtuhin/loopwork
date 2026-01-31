/**
 * AI Monitor - Intelligent log watcher and auto-healer
 *
 * Monitors loopwork execution logs in real-time, detects known error patterns,
 * and automatically takes corrective actions to keep the loop running smoothly.
 */

import fs from 'fs'
import path from 'path'
import { EventEmitter } from 'events'
import type { LoopworkPlugin, TaskContext, PluginTaskResult, LoopStats } from '@loopwork-ai/loopwork/contracts'
import type { LoopworkConfig } from '@loopwork-ai/loopwork/contracts'
import type { TaskBackend } from '@loopwork-ai/loopwork/contracts'
import { logger } from './utils'
import { LogWatcher, type LogLine } from './watcher'
import { matchPattern, getPatternByName } from './patterns'
import { ActionExecutor, type Action } from './actions'
import { CircuitBreaker } from './circuit-breaker'
import { analyzeEarlyExit, enhanceTask } from './task-recovery'
import { VerificationEngine } from './verification'
import { WisdomSystem } from './wisdom'
import { ConcurrencyManager } from './concurrency'
import type {
  AIMonitorConfig,
  MonitorState,
  RecoveryHistoryEntry,
  MonitorTimeouts
} from './types'

// Export task recovery functions
export {
  detectExitReason,
  findRelevantFiles,
  generateEnhancement,
  analyzeEarlyExit,
  enhanceTask
} from './task-recovery'

// Export concurrency manager
export {
  ConcurrencyManager,
  createConcurrencyManager,
  parseKey
} from './concurrency'

// Export circuit breaker
export {
  CircuitBreaker,
  createCircuitBreaker
} from './circuit-breaker'

// Export verification engine
export {
  VerificationEngine,
  createVerificationEngine,
  type VerificationCheckType,
  type VerificationCheck,
  type CheckResult,
  type VerificationResult,
  type VerificationEngineConfig
} from './verification'

// Export wisdom system
export {
  WisdomSystem,
  createWisdomSystem,
  type LearnedPattern,
  type WisdomStore,
  type WisdomConfig
} from './wisdom'

// Export log watcher
export {
  LogWatcher,
  type LogLine,
  type LogWatcherOptions
} from './watcher'

// Export patterns
export {
  ERROR_PATTERNS,
  matchPattern,
  getPatternByName,
  isKnownPattern,
  getPatternsBySeverity,
  type PatternMatch,
  type ErrorPattern,
  type PatternSeverity
} from './patterns'

// Export action framework
export {
  ActionExecutor,
  type Action,
  type ActionResult,
  type ActionStats,
  type ActionType
} from './actions'

// Export LLM analyzer (AI-MONITOR-001h)
export {
  LLMAnalyzer,
  createLLMAnalyzer,
  type ErrorAnalysis,
  type LLMCacheEntry,
  type LLMAnalyzerOptions
} from './llm-analyzer'

// Export analyze action utilities
export {
  executeAnalyze,
  getCachedAnalysis,
  cacheAnalysisResult,
  hashError,
  loadAnalysisCache,
  saveAnalysisCache,
  cleanupCache,
  shouldThrottleLLM,
  type AnalysisResult,
  type ThrottleState
} from './actions/analyze'

// Export types
export type * from './types'

let LoopworkState: any

class FallbackLoopworkState {
  paths: any
  constructor(options?: { projectRoot?: string } | string) {
    const projectRoot = typeof options === 'string' ? options : options?.projectRoot || process.cwd()
    const stateDir = path.join(projectRoot, '.loopwork')
    this.paths = {
      aiMonitor: () => path.join(stateDir, 'monitor-state.json')
    }
  }
}

try {
  const loopwork = require('@loopwork-ai/loopwork')
  LoopworkState = loopwork.LoopworkState || FallbackLoopworkState
} catch {
  LoopworkState = FallbackLoopworkState
}

/**
 * AI Monitor Plugin
 *
 * Implements LoopworkPlugin interface to integrate with the main loop.
 * Uses lifecycle hooks to capture events and monitor execution.
 */
const DEFAULT_MONITOR_CONFIG: AIMonitorConfig = {
  enabled: true,
  concurrency: {
    default: 3,
    providers: { claude: 2, gemini: 3 },
    models: { 'claude-opus': 1 }
  },
  timeouts: {
    staleDetectionMs: 180000,
    maxLifetimeMs: 1800000,
    healthCheckIntervalMs: 5000
  },
  circuitBreaker: {
    maxFailures: 3,
    cooldownPeriodMs: 60000,
    halfOpenAttempts: 1
  },
  verification: {
    freshnessTTL: 300000,
    checks: ['BUILD', 'TEST', 'LINT'],
    requireArchitectApproval: false
  },
  healingCategories: {
    'prd-not-found': { agent: 'executor-low', model: 'haiku', temperature: 0.1, maxAttempts: 2 },
    'syntax-error': { agent: 'executor-low', model: 'haiku', temperature: 0.1, maxAttempts: 2 },
    'type-error': { agent: 'executor', model: 'sonnet', temperature: 0.2, maxAttempts: 3 },
    'test-failure': { agent: 'executor', model: 'sonnet', temperature: 0.2, maxAttempts: 3 },
    'complex-debug': { agent: 'architect', model: 'opus', temperature: 0.3, maxAttempts: 1 }
  },
  recovery: {
    strategies: ['context-truncation', 'model-fallback', 'task-restart'],
    maxRetries: 3,
    backoffMs: 1000
  },
  wisdom: {
    enabled: true,
    learnFromSuccess: true,
    learnFromFailure: true,
    patternExpiryDays: 30
  },
  llm: {
    cooldownMs: 300000,
    maxPerSession: 10,
    model: 'haiku'
  },
  patternCheckDebounce: 100,
  cache: {
    enabled: true,
    ttlMs: 86400000
  },
  monitoring: {
    eventDriven: true,
    polling: true,
    pollingIntervalMs: 2000
  },
  stateDir: '.loopwork/ai-monitor'
}

export class AIMonitor extends EventEmitter implements LoopworkPlugin {
  readonly name = 'ai-monitor'
  readonly classification = 'enhancement'

  private config: AIMonitorConfig
  private watcher: LogWatcher | null = null
  private executor: ActionExecutor
  private circuitBreaker: CircuitBreaker
  private verificationEngine: VerificationEngine
  private wisdomSystem: WisdomSystem
  private concurrencyManager: ConcurrencyManager
  private state: MonitorState
  private stateFile: string
  private logFile: string | null = null
  private namespace: string = 'default'
  private backend: TaskBackend | null = null
  private projectRoot: string = process.cwd()
  private healthCheckTimer: NodeJS.Timeout | null = null
  private lifetimeTimer: NodeJS.Timeout | null = null

  static readonly ERROR_DETECTED = 'error-detected'
  static readonly HEALING_STARTED = 'healing-started'
  static readonly HEALING_COMPLETED = 'healing-completed'

  constructor(config: Partial<AIMonitorConfig> = {}) {
    super()
    this.config = {
      ...DEFAULT_MONITOR_CONFIG,
      ...config,
      enabled: config.enabled ?? DEFAULT_MONITOR_CONFIG.enabled,
      concurrency: { ...DEFAULT_MONITOR_CONFIG.concurrency, ...config.concurrency },
      timeouts: { ...DEFAULT_MONITOR_CONFIG.timeouts, ...config.timeouts },
      circuitBreaker: { ...DEFAULT_MONITOR_CONFIG.circuitBreaker, ...config.circuitBreaker },
      verification: { ...DEFAULT_MONITOR_CONFIG.verification, ...config.verification },
      healingCategories: { ...DEFAULT_MONITOR_CONFIG.healingCategories, ...config.healingCategories },
      recovery: { ...DEFAULT_MONITOR_CONFIG.recovery, ...config.recovery },
      wisdom: { ...DEFAULT_MONITOR_CONFIG.wisdom, ...config.wisdom },
      llm: { ...DEFAULT_MONITOR_CONFIG.llm, ...config.llm },
      cache: { ...DEFAULT_MONITOR_CONFIG.cache, ...config.cache },
      monitoring: { ...DEFAULT_MONITOR_CONFIG.monitoring, ...config.monitoring }
    }

    this.executor = new ActionExecutor({
      namespace: this.namespace,
      llmModel: this.config.llm.model,
      projectRoot: this.projectRoot,
      llmCooldown: this.config.llm.cooldownMs,
      llmMaxPerSession: this.config.llm.maxPerSession,
      healingCategories: this.config.healingCategories
    })
    this.circuitBreaker = new CircuitBreaker(this.config.circuitBreaker)
    this.verificationEngine = new VerificationEngine(this.config.verification)
    this.wisdomSystem = new WisdomSystem(this.config.wisdom)
    this.concurrencyManager = new ConcurrencyManager(this.config.concurrency)
    this.stateFile = ''
    this.state = this.initializeState()
  }

  private initializeState(): MonitorState {
    return {
      sessionId: `session-${Date.now()}`,
      startTime: new Date(),
      lastActivity: new Date(),
      isActive: true,
      consecutiveFailures: 0,
      totalHeals: 0,
      totalFailures: 0,
      circuitBreaker: this.circuitBreaker.getState(),
      llmCallsCount: 0,
      lastLLMCall: 0,
      detectedPatterns: {},
      unknownErrorCache: new Set<string>(),
      recoveryHistory: {},
      recoveryAttempts: 0,
      recoverySuccesses: 0,
      recoveryFailures: 0
    }
  }

  private loadState(): void {
    if (!fs.existsSync(this.stateFile)) {
      return
    }

    try {
      const data = fs.readFileSync(this.stateFile, 'utf8')
      const loaded = JSON.parse(data)

      this.state.sessionId = loaded.sessionId || this.state.sessionId
      this.state.startTime = loaded.startTime ? new Date(loaded.startTime) : this.state.startTime
      this.state.lastActivity = loaded.lastActivity ? new Date(loaded.lastActivity) : this.state.lastActivity
      this.state.llmCallsCount = loaded.llmCallsCount || 0
      this.state.lastLLMCall = loaded.lastLLMCall || 0
      this.state.detectedPatterns = loaded.detectedPatterns || {}
      this.state.unknownErrorCache = new Set(loaded.unknownErrorCache || [])
      this.state.recoveryHistory = loaded.recoveryHistory || {}
      this.state.recoveryAttempts = loaded.recoveryAttempts || 0
      this.state.recoverySuccesses = loaded.recoverySuccesses || 0
      this.state.recoveryFailures = loaded.recoveryFailures || 0

      if (loaded.circuitBreaker) {
        this.circuitBreaker.loadState(loaded.circuitBreaker)
      }

      logger.debug(`AI Monitor state loaded from ${this.stateFile}`)
    } catch (error) {
      logger.warn(`Failed to load AI Monitor state: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private saveState(): void {
    try {
      const data = {
        ...this.state,
        startTime: this.state.startTime.toISOString(),
        lastActivity: this.state.lastActivity.toISOString(),
        unknownErrorCache: Array.from(this.state.unknownErrorCache),
        circuitBreaker: this.circuitBreaker.getState(),
        savedAt: new Date().toISOString()
      }

      const dir = path.dirname(this.stateFile)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      fs.writeFileSync(this.stateFile, JSON.stringify(data, null, 2))
      logger.debug(`AI Monitor state saved to ${this.stateFile}`)
    } catch (error) {
      logger.warn(`Failed to save AI Monitor state: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async onConfigLoad(config: LoopworkConfig): Promise<LoopworkConfig> {
    if (!this.config.enabled) {
      return config
    }

    const projectRoot = (config.projectRoot as string) || process.cwd()
    this.projectRoot = projectRoot
    const loopworkState = new LoopworkState({ projectRoot })
    this.stateFile = loopworkState.paths.aiMonitor()

    this.loadState()

    logger.debug('AI Monitor initialized')
    return config
  }

  async onBackendReady(backend: TaskBackend): Promise<void> {
    if (!this.config.enabled) return
    this.backend = backend
  }

  async onLoopStart(namespace: string): Promise<void> {
    if (!this.config.enabled) return

    this.namespace = namespace
    this.state.isActive = true
    this.state.lastActivity = new Date()

    this.executor = new ActionExecutor({
      namespace: this.namespace,
      llmModel: this.config.llm.model,
      projectRoot: this.projectRoot,
      llmCooldown: this.config.llm.cooldownMs,
      llmMaxPerSession: this.config.llm.maxPerSession,
      healingCategories: this.config.healingCategories
    })

    if (logger.logFile) {
      this.logFile = logger.logFile
      await this.startWatching()
    }

    this.startOrchestrator()
  }

  async onLoopEnd(_stats: LoopStats): Promise<void> {
    if (!this.config.enabled) return

    this.stopOrchestrator()
    this.stopWatching()
    this.state.isActive = false
    this.saveState()
  }

  async onTaskStart(context: TaskContext): Promise<void> {
    if (!this.config.enabled) return
    this.state.lastActivity = new Date()
  }

  async onTaskComplete(context: TaskContext, result: PluginTaskResult): Promise<void> {
    if (!this.config.enabled) return
    this.state.lastActivity = new Date()
  }

  async onTaskFailed(context: TaskContext, error: string): Promise<void> {
    if (!this.config.enabled) return
    this.state.lastActivity = new Date()

    if (this.config.recovery.maxRetries > 0 && this.backend) {
      await this.recoverTask(context.task.id)
    }
  }

  private startOrchestrator(): void {
    this.healthCheckTimer = setInterval(() => this.checkHealth(), this.config.timeouts.healthCheckIntervalMs)
    this.lifetimeTimer = setInterval(() => this.checkLifetime(), 60000)
  }

  private stopOrchestrator(): void {
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer)
    if (this.lifetimeTimer) clearInterval(this.lifetimeTimer)
  }

  private checkHealth(): void {
    const inactiveMs = Date.now() - this.state.lastActivity.getTime()
    if (inactiveMs > this.config.timeouts.staleDetectionMs) {
      logger.warn(`AI Monitor: Stale monitor detected (${Math.round(inactiveMs / 1000)}s inactive)`)
      this.emit('stale', { inactiveMs })
    }
  }

  private checkLifetime(): void {
    const lifetimeMs = Date.now() - this.state.startTime.getTime()
    if (lifetimeMs > this.config.timeouts.maxLifetimeMs) {
      logger.error(`AI Monitor: Max lifetime reached (${Math.round(lifetimeMs / 60000)} minutes)`)
      this.emit('max-lifetime', { lifetimeMs })
      this.stopWatching()
      this.state.isActive = false
    }
  }

  private async getRecentLogs(maxLines: number = 50): Promise<string[]> {
    if (!this.logFile || !fs.existsSync(this.logFile)) {
      return []
    }

    try {
      const content = fs.readFileSync(this.logFile, 'utf-8')
      const lines = content.split('\n').filter(line => line.trim())
      return lines.slice(-maxLines)
    } catch (error) {
      return []
    }
  }

  private async recoverTask(taskId: string): Promise<void> {
    if (!this.circuitBreaker.canProceed() || !this.backend) return

    try {
      const logs = await this.getRecentLogs(this.config.recovery.maxRetries * 20)
      if (logs.length === 0) return

      this.state.recoveryAttempts++
      const analysis = await analyzeEarlyExit(taskId, logs, this.backend, this.projectRoot)

      const historyKey = `${taskId}:${analysis.exitReason}`
      if (this.state.recoveryHistory[historyKey]) return

      logger.info(`AI Monitor: Enhancing task ${taskId} for retry (reason: ${analysis.exitReason}, strategy: ${analysis.strategy})`)
      await enhanceTask(analysis, this.backend, this.projectRoot)

      this.state.recoveryHistory[historyKey] = {
        taskId,
        exitReason: analysis.exitReason,
        timestamp: Date.now(),
        success: true
      }
      this.state.recoverySuccesses++
      this.circuitBreaker.recordSuccess()
    } catch (error) {
      this.state.recoveryFailures++
      this.circuitBreaker.recordFailure()
    } finally {
      this.saveState()
    }
  }

  async startWatching(): Promise<void> {
    if (!this.logFile || this.watcher) return

    this.watcher = new LogWatcher({
      logFile: this.logFile,
      debounceMs: this.config.patternCheckDebounce,
      pollIntervalMs: this.config.monitoring.pollingIntervalMs,
      usePolling: this.config.monitoring.polling
    })

    this.watcher.on('line', (logLine: LogLine) => {
      this.state.lastActivity = new Date()
      this.handleLogLine(logLine)
    })

    this.watcher.on('error', (error: Error) => {
      logger.error(`AI Monitor watcher error: ${error.message}`)
    })

    await this.watcher.start()
  }

  stopWatching(): void {
    if (this.watcher) {
      this.watcher.stop()
      this.watcher = null
    }
  }

  private async handleLogLine(logLine: LogLine): Promise<void> {
    if (!this.circuitBreaker.canProceed()) return

    const match = matchPattern(logLine.line)

    if (!match) {
      if (this.shouldAnalyzeUnknownError(logLine.line)) {
        await this.analyzeUnknownError(logLine.line)
      }
      return
    }

    this.state.detectedPatterns[match.pattern] = (this.state.detectedPatterns[match.pattern] || 0) + 1

    this.emit(AIMonitor.ERROR_DETECTED, {
      pattern: match.pattern,
      severity: match.severity,
      context: match.context,
      rawLine: logLine.line,
      timestamp: logLine.timestamp
    })

    const action = this.executor.determineAction(match)
    if (action) {
      await this.executeAction(action)
    }
  }

  private shouldAnalyzeUnknownError(line: string): boolean {
    if (!line.match(/error|failed|exception|critical/i)) return false
    if (this.config.cache.enabled && this.state.unknownErrorCache.has(line)) return false
    if (this.state.llmCallsCount >= this.config.llm.maxPerSession) return false

    const timeSinceLastCall = Date.now() - this.state.lastLLMCall
    if (timeSinceLastCall < this.config.llm.cooldownMs) return false

    return true
  }

  private async analyzeUnknownError(line: string): Promise<void> {
    const key = `llm:${this.config.llm.model}`
    try {
      await this.concurrencyManager.acquire(key, 30000)
      
      this.state.llmCallsCount++
      this.state.lastLLMCall = Date.now()
      if (this.config.cache.enabled) {
        this.state.unknownErrorCache.add(line)
      }

      const action: Action = {
        type: 'analyze',
        pattern: 'unknown-error',
        context: { rawLine: line },
        prompt: line
      }

      await this.executeAction(action)
    } catch (error) {
      logger.debug(`LLM concurrency error: ${error}`)
    } finally {
      this.concurrencyManager.release(key)
    }
  }

  private async executeAction(action: Action): Promise<void> {
    this.emit(AIMonitor.HEALING_STARTED, {
      actionType: action.type,
      pattern: action.pattern,
      timestamp: new Date()
    })

    const result = await this.executor.executeAction(action)
    const errorPattern = getPatternByName(action.pattern)

    let success = false
    if (result.success) {
      if (errorPattern) this.wisdomSystem.recordSuccess(errorPattern, `${action.type} action succeeded`)
      if (action.type === 'auto-fix') {
        await this.verifyHealingAction(action)
      } else {
        this.circuitBreaker.recordSuccess()
      }
      success = true
    } else {
      if (errorPattern) this.wisdomSystem.recordFailure(errorPattern, result.error || 'Unknown error')
      this.circuitBreaker.recordFailure()
    }

    this.emit(AIMonitor.HEALING_COMPLETED, {
      actionType: action.type,
      pattern: action.pattern,
      success,
      error: result.error || null,
      timestamp: new Date()
    })

    this.saveState()
  }

  private async verifyHealingAction(action: Action): Promise<void> {
    try {
      const verificationResult = await this.verificationEngine.verify(
        `Healing action for ${action.pattern}`
      )

      if (verificationResult.passed) {
        this.circuitBreaker.recordSuccess()
      } else {
        this.circuitBreaker.recordFailure()
      }
    } catch (error) {
      this.circuitBreaker.recordFailure()
    }
  }

  getStats() {
    return {
      llmCallCount: this.state.llmCallsCount,
      detectedPatterns: { ...this.state.detectedPatterns },
      actionHistory: this.executor.getHistory(),
      unknownErrorCacheSize: this.state.unknownErrorCache.size,
      circuitBreaker: {
        status: this.circuitBreaker.getStatus(),
        state: this.circuitBreaker.getState(),
        isOpen: this.circuitBreaker.isOpen(),
        cooldownRemaining: this.circuitBreaker.getCooldownRemaining()
      },
      taskRecovery: {
        attempts: this.state.recoveryAttempts,
        successes: this.state.recoverySuccesses,
        failures: this.state.recoveryFailures,
        historySize: Object.keys(this.state.recoveryHistory).length
      },
      concurrency: this.concurrencyManager.getStats()
    }
  }

  resetCircuitBreaker(): void {
    this.circuitBreaker.reset()
    this.saveState()
  }
}

/**
 * Factory function to create AI Monitor plugin
 */
export function createAIMonitor(config?: Partial<AIMonitorConfig>): LoopworkPlugin {
  return new AIMonitor(config)
}

/**
 * Export config wrapper for composition
 */
export function withAIMonitor(config?: AIMonitorConfig) {
  return (baseConfig: LoopworkConfig): LoopworkConfig => {
    const monitor = createAIMonitor(config)
    return {
      ...baseConfig,
      plugins: [...(baseConfig.plugins || []), monitor]
    }
  }
}

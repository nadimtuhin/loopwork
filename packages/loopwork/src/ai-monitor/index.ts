/**
 * AI Monitor - Intelligent log watcher and auto-healer
 *
 * Monitors loopwork execution logs in real-time, detects known error patterns,
 * and automatically takes corrective actions to keep the loop running smoothly.
 */

import fs from 'fs'
import path from 'path'
import type { LoopworkPlugin, TaskContext, PluginTaskResult, LoopStats } from '../contracts/plugin'
import type { LoopworkConfig } from '../contracts/config'
import type { TaskBackend } from '../contracts/backend'
import { logger } from '../core/utils'
import { LogWatcher, type LogLine } from './watcher'
import { matchPattern, getPatternByName } from './patterns'
import { ActionExecutor, type Action } from './actions'
import { CircuitBreaker } from './circuit-breaker'
import { analyzeEarlyExit, enhanceTask } from './task-recovery'
import { VerificationEngine, type VerificationEngineConfig } from './verification'
import { WisdomSystem, type WisdomConfig } from './wisdom'
import { LoopworkState } from '../core/loopwork-state'

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

// Export types
export type * from './types'

export interface AIMonitorConfig {
  enabled?: boolean
  llmCooldown?: number
  llmMaxPerSession?: number
  llmModel?: string
  anthropicApiKey?: string
  patternCheckDebounce?: number
  cacheUnknownErrors?: boolean
  cacheTTL?: number
  circuitBreaker?: {
    maxFailures?: number
    cooldownPeriodMs?: number
    maxHalfOpenAttempts?: number
  }
  taskRecovery?: {
    enabled?: boolean
    maxLogLines?: number
    minFailureCount?: number
  }
  verification?: VerificationEngineConfig
  wisdom?: WisdomConfig
}

export interface RecoveryHistoryEntry {
  taskId: string
  exitReason: string
  timestamp: number
  success: boolean
}

export interface MonitorState {
  llmCallCount: number
  lastLLMCall: number
  detectedPatterns: Record<string, number>
  unknownErrorCache: Set<string>
  sessionStartTime: number
  circuitBreakerState?: import('./types').CircuitBreakerState
  recoveryHistory: Record<string, RecoveryHistoryEntry>
  recoveryAttempts: number
  recoverySuccesses: number
  recoveryFailures: number
}

/**
 * AI Monitor Plugin
 *
 * Implements LoopworkPlugin interface to integrate with the main loop.
 * Uses lifecycle hooks to capture events and monitor execution.
 */
export class AIMonitor implements LoopworkPlugin {
  readonly name = 'ai-monitor'

  private config: AIMonitorConfig
  private watcher: LogWatcher | null = null
  private executor: ActionExecutor
  private circuitBreaker: CircuitBreaker
  private verificationEngine: VerificationEngine
  private wisdomSystem: WisdomSystem
  private state: MonitorState
  private stateFile: string
  private logFile: string | null = null
  private namespace: string = 'default'
  private backend: TaskBackend | null = null
  private projectRoot: string = process.cwd()

  constructor(config: AIMonitorConfig = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      llmCooldown: config.llmCooldown ?? 5 * 60 * 1000, // 5 minutes
      llmMaxPerSession: config.llmMaxPerSession ?? 10,
      llmModel: config.llmModel ?? 'haiku',
      patternCheckDebounce: config.patternCheckDebounce ?? 100,
      cacheUnknownErrors: config.cacheUnknownErrors ?? true,
      cacheTTL: config.cacheTTL ?? 24 * 60 * 60 * 1000, // 24 hours
      circuitBreaker: {
        maxFailures: config.circuitBreaker?.maxFailures ?? 3,
        cooldownPeriodMs: config.circuitBreaker?.cooldownPeriodMs ?? 60000,
        maxHalfOpenAttempts: config.circuitBreaker?.maxHalfOpenAttempts ?? 1
      },
      taskRecovery: {
        enabled: config.taskRecovery?.enabled ?? true,
        maxLogLines: config.taskRecovery?.maxLogLines ?? 50,
        minFailureCount: config.taskRecovery?.minFailureCount ?? 1
      }
    }

    this.executor = new ActionExecutor({
      llmModel: this.config.llmModel,
      anthropicApiKey: this.config.anthropicApiKey,
      projectRoot: this.projectRoot
    })
    this.circuitBreaker = new CircuitBreaker(this.config.circuitBreaker)
    this.verificationEngine = new VerificationEngine(this.config.verification)
    this.wisdomSystem = new WisdomSystem(this.config.wisdom)
    this.stateFile = '' // Will be set in onConfigLoad
    this.state = this.initializeState()
  }

  /**
   * Initialize monitor state
   */
  private initializeState(): MonitorState {
    return {
      llmCallCount: 0,
      lastLLMCall: 0,
      detectedPatterns: {},
      unknownErrorCache: new Set<string>(),
      sessionStartTime: Date.now(),
      recoveryHistory: {},
      recoveryAttempts: 0,
      recoverySuccesses: 0,
      recoveryFailures: 0
    }
  }

  /**
   * Load state from disk if exists
   */
  private loadState(): void {
    if (!fs.existsSync(this.stateFile)) {
      return
    }

    try {
      const data = fs.readFileSync(this.stateFile, 'utf8')
      const loaded = JSON.parse(data)

      this.state.llmCallCount = loaded.llmCallCount || 0
      this.state.lastLLMCall = loaded.lastLLMCall || 0
      this.state.detectedPatterns = loaded.detectedPatterns || {}
      this.state.unknownErrorCache = new Set(loaded.unknownErrorCache || [])
      this.state.recoveryHistory = loaded.recoveryHistory || {}
      this.state.recoveryAttempts = loaded.recoveryAttempts || 0
      this.state.recoverySuccesses = loaded.recoverySuccesses || 0
      this.state.recoveryFailures = loaded.recoveryFailures || 0

      // Load circuit breaker state if available
      if (loaded.circuitBreakerState) {
        this.circuitBreaker.loadState(loaded.circuitBreakerState)
      }

      logger.debug(`AI Monitor state loaded from ${this.stateFile}`)
    } catch (error) {
      logger.warn(`Failed to load AI Monitor state: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Save state to disk
   */
  private saveState(): void {
    try {
      const data = {
        llmCallCount: this.state.llmCallCount,
        lastLLMCall: this.state.lastLLMCall,
        detectedPatterns: this.state.detectedPatterns,
        unknownErrorCache: Array.from(this.state.unknownErrorCache),
        circuitBreakerState: this.circuitBreaker.getState(),
        recoveryHistory: this.state.recoveryHistory,
        recoveryAttempts: this.state.recoveryAttempts,
        recoverySuccesses: this.state.recoverySuccesses,
        recoveryFailures: this.state.recoveryFailures,
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

  /**
   * Plugin lifecycle: Called when config is loaded
   */
  async onConfigLoad(config: LoopworkConfig): Promise<LoopworkConfig> {
    if (!this.config.enabled) {
      logger.debug('AI Monitor disabled via config')
      return config
    }

    // Set state file path using LoopworkState
    const projectRoot = (config.projectRoot as string) || process.cwd()
    this.projectRoot = projectRoot
    const loopworkState = new LoopworkState({ projectRoot })
    this.stateFile = loopworkState.paths.aiMonitor()

    // Load existing state
    this.loadState()

    logger.debug('AI Monitor initialized')
    return config
  }

  /**
   * Plugin lifecycle: Called when backend is initialized
   */
  async onBackendReady(backend: TaskBackend): Promise<void> {
    if (!this.config.enabled) return

    this.backend = backend
    logger.debug('AI Monitor: backend ready')
  }

  /**
   * Plugin lifecycle: Called when loop starts
   */
  async onLoopStart(namespace: string): Promise<void> {
    if (!this.config.enabled) return

    this.namespace = namespace

    // Update executor with namespace
    this.executor = new ActionExecutor({
      namespace: this.namespace,
      llmModel: this.config.llmModel,
      anthropicApiKey: this.config.anthropicApiKey,
      projectRoot: this.projectRoot
    })

    // Determine log file path from logger
    if (logger.logFile) {
      this.logFile = logger.logFile
      logger.debug(`AI Monitor watching log file: ${this.logFile}`)

      // Start watching the log file
      await this.startWatching()
    } else {
      logger.warn('AI Monitor: No log file configured, monitoring disabled')
    }
  }

  /**
   * Plugin lifecycle: Called when loop ends
   */
  async onLoopEnd(_stats: LoopStats): Promise<void> {
    if (!this.config.enabled) return

    this.stopWatching()
    this.saveState()

    logger.debug(`AI Monitor session ended: ${this.state.llmCallCount} LLM calls, ${Object.keys(this.state.detectedPatterns).length} unique patterns detected`)
  }

  /**
   * Plugin lifecycle: Called when task starts
   */
  async onTaskStart(context: TaskContext): Promise<void> {
    if (!this.config.enabled) return

    logger.debug(`AI Monitor tracking task: ${context.task.id}`)
  }

  /**
   * Plugin lifecycle: Called when task completes
   */
  async onTaskComplete(context: TaskContext, result: PluginTaskResult): Promise<void> {
    if (!this.config.enabled) return

    logger.debug(`AI Monitor: Task ${context.task.id} completed in ${result.duration}ms`)
  }

  /**
   * Plugin lifecycle: Called when task fails
   */
  async onTaskFailed(context: TaskContext, error: string): Promise<void> {
    if (!this.config.enabled) return

    logger.debug(`AI Monitor: Task ${context.task.id} failed: ${error}`)

    // Trigger task recovery if enabled
    if (this.config.taskRecovery?.enabled && this.backend) {
      await this.recoverTask(context.task.id)
    }
  }

  /**
   * Get recent log lines from the log file
   */
  private async getRecentLogs(maxLines: number = 50): Promise<string[]> {
    if (!this.logFile || !fs.existsSync(this.logFile)) {
      return []
    }

    try {
      const content = fs.readFileSync(this.logFile, 'utf-8')
      const lines = content.split('\n').filter(line => line.trim())
      return lines.slice(-maxLines)
    } catch (error) {
      logger.debug(`Failed to read log file: ${error instanceof Error ? error.message : String(error)}`)
      return []
    }
  }

  /**
   * Attempt to recover a failed task by analyzing logs and enhancing task context
   */
  private async recoverTask(taskId: string): Promise<void> {
    // Check circuit breaker first
    if (!this.circuitBreaker.canProceed()) {
      logger.debug(`AI Monitor: Skipping task recovery (circuit breaker is ${this.circuitBreaker.getStatus()})`)
      return
    }

    // Check if backend is available
    if (!this.backend) {
      logger.debug('AI Monitor: Backend not available, skipping task recovery')
      return
    }

    try {
      // Collect recent logs
      const maxLogLines = this.config.taskRecovery?.maxLogLines ?? 50
      const logs = await this.getRecentLogs(maxLogLines)

      if (logs.length === 0) {
        logger.debug('AI Monitor: No logs available for recovery analysis')
        return
      }

      // Analyze the failure
      logger.debug(`AI Monitor: Analyzing failure for task ${taskId}`)
      this.state.recoveryAttempts++

      const analysis = await analyzeEarlyExit(taskId, logs, this.backend, this.projectRoot)

      // Check if we've already enhanced for this reason
      const historyKey = `${taskId}:${analysis.exitReason}`
      if (this.state.recoveryHistory[historyKey]) {
        logger.debug(`AI Monitor: Task ${taskId} already enhanced for ${analysis.exitReason}, skipping`)
        return
      }

      // Apply enhancements
      logger.info(`AI Monitor: Enhancing task ${taskId} for retry (reason: ${analysis.exitReason})`)
      await enhanceTask(analysis, this.backend, this.projectRoot)

      // Record success
      this.state.recoveryHistory[historyKey] = {
        taskId,
        exitReason: analysis.exitReason,
        timestamp: Date.now(),
        success: true
      }
      this.state.recoverySuccesses++
      this.circuitBreaker.recordSuccess()

      logger.success(`AI Monitor: Task ${taskId} enhanced successfully`)
    } catch (error) {
      // Record failure
      const errorMsg = error instanceof Error ? error.message : String(error)
      logger.warn(`AI Monitor: Task recovery failed for ${taskId}: ${errorMsg}`)

      this.state.recoveryFailures++
      this.circuitBreaker.recordFailure()
    } finally {
      // Save state after recovery attempt
      this.saveState()
    }
  }

  /**
   * Start watching the log file
   */
  private async startWatching(): Promise<void> {
    if (!this.logFile || this.watcher) return

    this.watcher = new LogWatcher({
      logFile: this.logFile,
      debounceMs: this.config.patternCheckDebounce
    })

    // Handle new log lines
    this.watcher.on('line', (logLine: LogLine) => {
      this.handleLogLine(logLine)
    })

    // Handle watcher errors
    this.watcher.on('error', (error: Error) => {
      logger.error(`AI Monitor watcher error: ${error.message}`)
    })

    await this.watcher.start()
  }

  /**
   * Stop watching the log file
   */
  private stopWatching(): void {
    if (this.watcher) {
      this.watcher.stop()
      this.watcher = null
    }
  }

  /**
   * Handle a new log line
   */
  private async handleLogLine(logLine: LogLine): Promise<void> {
    // Check circuit breaker before processing
    if (!this.circuitBreaker.canProceed()) {
      logger.debug(`AI Monitor: circuit breaker is open, skipping action (${this.circuitBreaker.getStatus()})`)
      return
    }

    const match = matchPattern(logLine.line)

    if (!match) {
      // Unknown pattern - could trigger LLM analysis with throttling
      if (this.shouldAnalyzeUnknownError(logLine.line)) {
        await this.analyzeUnknownError(logLine.line)
      }
      return
    }

    // Track pattern detection
    this.state.detectedPatterns[match.pattern] = (this.state.detectedPatterns[match.pattern] || 0) + 1

    logger.debug(`AI Monitor detected: ${match.pattern} (severity: ${match.severity})`)

    // Determine and execute action
    const action = this.executor.determineAction(match)
    if (action) {
      await this.executeAction(action)
    }
  }

  /**
   * Check if an unknown error should be analyzed
   */
  private shouldAnalyzeUnknownError(line: string): boolean {
    // Only analyze lines that look like errors
    if (!line.match(/error|failed|exception|critical/i)) {
      return false
    }

    // Check cache
    if (this.config.cacheUnknownErrors && this.state.unknownErrorCache.has(line)) {
      logger.debug('AI Monitor: Using cached error analysis (skipping LLM call)')
      return false
    }

    // Check LLM call limits
    if (this.state.llmCallCount >= (this.config.llmMaxPerSession || 10)) {
      logger.warn(`AI Monitor: LLM call limit reached (${this.state.llmCallCount}/${this.config.llmMaxPerSession} calls used)`)
      return false
    }

    // Check cooldown
    const timeSinceLastCall = Date.now() - this.state.lastLLMCall
    if (timeSinceLastCall < (this.config.llmCooldown || 0)) {
      const remainingSeconds = Math.ceil((this.config.llmCooldown! - timeSinceLastCall) / 1000)
      logger.warn(`AI Monitor: LLM cooldown active (${remainingSeconds}s remaining)`)
      return false
    }

    return true
  }

  /**
   * Analyze unknown error using LLM
   */
  private async analyzeUnknownError(line: string): Promise<void> {
    logger.info(`AI Monitor: Analyzing unknown error with LLM (${this.state.llmCallCount + 1}/${this.config.llmMaxPerSession})`)

    // Update state
    this.state.llmCallCount++
    this.state.lastLLMCall = Date.now()
    if (this.config.cacheUnknownErrors) {
      this.state.unknownErrorCache.add(line)
    }

    const action: Action = {
      type: 'analyze',
      pattern: 'unknown-error',
      context: { rawLine: line },
      prompt: line
    }

    await this.executeAction(action)
  }

  /**
   * Execute an action
   */
  private async executeAction(action: Action): Promise<void> {
    logger.debug(`AI Monitor executing action: ${action.type} for pattern ${action.pattern}`)

    const result = await this.executor.executeAction(action)
    const errorPattern = getPatternByName(action.pattern)

    if (result.success) {
      logger.debug(`AI Monitor action completed: ${action.type}`)

      // Record successful healing in wisdom system
      if (errorPattern) {
        this.wisdomSystem.recordSuccess(errorPattern, `${action.type} action succeeded`)
      }

      // Run verification for auto-fix actions
      if (action.type === 'auto-fix') {
        await this.verifyHealingAction(action)
      } else {
        this.circuitBreaker.recordSuccess()
      }
    } else {
      logger.warn(`AI Monitor action failed: ${result.error}`)

      // Record failed healing in wisdom system
      if (errorPattern) {
        this.wisdomSystem.recordFailure(errorPattern, result.error || 'Unknown error')
      }

      this.circuitBreaker.recordFailure()
    }

    // Save state after each action to persist circuit breaker state
    this.saveState()
  }

  /**
   * Verify healing action success using verification engine
   */
  private async verifyHealingAction(action: Action): Promise<void> {
    try {
      logger.debug(`AI Monitor: Verifying healing action for pattern ${action.pattern}`)

      // Run verification checks
      const verificationResult = await this.verificationEngine.verify(
        `Healing action for ${action.pattern}`,
        undefined // taskId not available here
      )

      if (verificationResult.passed) {
        logger.success(`AI Monitor: Verification passed for ${action.pattern}`)
        this.circuitBreaker.recordSuccess()
      } else {
        logger.warn(`AI Monitor: Verification failed for ${action.pattern}: ${verificationResult.failedChecks.join(', ')}`)
        this.circuitBreaker.recordFailure()
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      logger.warn(`AI Monitor: Verification error for ${action.pattern}: ${errorMsg}`)
      this.circuitBreaker.recordFailure()
    }
  }

  /**
   * Get monitor statistics
   */
  getStats() {
    return {
      llmCallCount: this.state.llmCallCount,
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
      }
    }
  }

  /**
   * Manually reset the circuit breaker
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.reset()
    this.saveState()
  }
}

/**
 * Factory function to create AI Monitor plugin
 */
export function createAIMonitor(config?: AIMonitorConfig): LoopworkPlugin {
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

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
import { logger } from '../core/utils'
import { LogWatcher, type LogLine } from './watcher'
import { matchPattern } from './patterns'
import { ActionExecutor, type Action } from './actions'

export interface AIMonitorConfig {
  enabled?: boolean
  llmCooldown?: number
  llmMaxPerSession?: number
  llmModel?: string
  patternCheckDebounce?: number
  cacheUnknownErrors?: boolean
  cacheTTL?: number
}

export interface MonitorState {
  llmCallCount: number
  lastLLMCall: number
  detectedPatterns: Record<string, number>
  unknownErrorCache: Set<string>
  sessionStartTime: number
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
  private state: MonitorState
  private stateFile: string
  private logFile: string | null = null
  private namespace: string = 'default'

  constructor(config: AIMonitorConfig = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      llmCooldown: config.llmCooldown ?? 5 * 60 * 1000, // 5 minutes
      llmMaxPerSession: config.llmMaxPerSession ?? 10,
      llmModel: config.llmModel ?? 'haiku',
      patternCheckDebounce: config.patternCheckDebounce ?? 100,
      cacheUnknownErrors: config.cacheUnknownErrors ?? true,
      cacheTTL: config.cacheTTL ?? 24 * 60 * 60 * 1000, // 24 hours
    }

    this.executor = new ActionExecutor({
      llmModel: this.config.llmModel
    })
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
      sessionStartTime: Date.now()
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

    // Set state file path
    const projectRoot = (config.projectRoot as string) || process.cwd()
    this.stateFile = path.join(projectRoot, '.loopwork/monitor-state.json')

    // Load existing state
    this.loadState()

    logger.debug('AI Monitor initialized')
    return config
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
      llmModel: this.config.llmModel
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
      return false
    }

    // Check LLM call limits
    if (this.state.llmCallCount >= (this.config.llmMaxPerSession || 10)) {
      logger.debug('AI Monitor: LLM call limit reached')
      return false
    }

    // Check cooldown
    const timeSinceLastCall = Date.now() - this.state.lastLLMCall
    if (timeSinceLastCall < (this.config.llmCooldown || 0)) {
      logger.debug(`AI Monitor: LLM cooldown active (${Math.ceil((this.config.llmCooldown! - timeSinceLastCall) / 1000)}s remaining)`)
      return false
    }

    return true
  }

  /**
   * Analyze unknown error using LLM
   */
  private async analyzeUnknownError(line: string): Promise<void> {
    logger.debug(`AI Monitor: Analyzing unknown error with LLM`)

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
      prompt: `Analyze this loopwork error log entry and suggest a fix:
${line}

Return your analysis in this JSON format:
{
  "cause": "Short description of the root cause",
  "fix": "Specific action to fix it",
  "severity": "low" | "medium" | "high"
}`
    }

    await this.executeAction(action)
  }

  /**
   * Execute an action
   */
  private async executeAction(action: Action): Promise<void> {
    logger.debug(`AI Monitor executing action: ${action.type} for pattern ${action.pattern}`)

    const result = await this.executor.executeAction(action)

    if (result.success) {
      logger.debug(`AI Monitor action completed: ${action.type}`)
    } else {
      logger.warn(`AI Monitor action failed: ${result.error}`)
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
      unknownErrorCacheSize: this.state.unknownErrorCache.size
    }
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

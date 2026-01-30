/**
 * Parallel Runner for Loopwork
 *
 * Orchestrates parallel task execution with:
 * - Worker pool pattern using Promise.allSettled
 * - Atomic task claiming to prevent race conditions
 * - Shared CliExecutor across workers
 * - Coordinator-level circuit breaker
 * - Configurable failure modes
 */

import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import type { Config } from './config'
import type { TaskBackend, FindTaskOptions } from '../contracts/backend'
import type { Task } from '../contracts/task'
import type { ICliExecutor } from '../contracts/executor'
import type { TaskContext, LoopStats } from '../contracts/plugin'
import type { RunLogger } from '../commands/run'
import { logger as defaultLogger } from './utils'
import { LoopworkError } from './errors'

/**
 * Worker colors for console output
 */
const WORKER_COLORS = [
  chalk.cyan,
  chalk.magenta,
  chalk.yellow,
  chalk.green,
  chalk.blue,
]

/**
 * Failure categories for self-healing analysis
 */
type FailureCategory = 'rate_limit' | 'timeout' | 'memory' | 'unknown'

/**
 * Tracked failure for pattern analysis
 */
interface TrackedFailure {
  timestamp: number
  category: FailureCategory
  error: string
}

/**
 * Self-healing configuration adjustments
 */
interface SelfHealingAdjustment {
  workers?: number
  taskDelay?: number
  timeout?: number
  reason: string
}

/**
 * Result from a single worker execution cycle
 */
interface WorkerResult {
  workerId: number
  taskId: string | null
  success: boolean
  error?: string
  duration?: number
}

/**
 * Parallel runner state for resume functionality
 */
export interface ParallelState {
  parallel: number
  completedIterations: number
  interruptedTasks: string[]
  startedAt: number
  namespace: string
  sessionId: string
}

/**
 * Options for ParallelRunner
 */
export interface ParallelRunnerOptions {
  config: Config
  backend: TaskBackend
  cliExecutor: ICliExecutor
  logger?: RunLogger
  onTaskStart?: (context: TaskContext) => Promise<void>
  onTaskComplete?: (context: TaskContext, result: { output: string; duration: number; success: boolean }) => Promise<void>
  onTaskFailed?: (context: TaskContext, error: string) => Promise<void>
  buildPrompt: (task: Task, retryContext?: string) => string
}

/**
 * Statistics for a parallel run
 */
export interface ParallelRunStats extends LoopStats {
  workers: number
  tasksPerWorker: number[]
}

export class ParallelRunner {
  private config: Config
  private backend: TaskBackend
  private cliExecutor: ICliExecutor
  private logger: RunLogger
  private workers: number
  private onTaskStart?: (context: TaskContext) => Promise<void>
  private onTaskComplete?: (context: TaskContext, result: { output: string; duration: number; success: boolean }) => Promise<void>
  private onTaskFailed?: (context: TaskContext, error: string) => Promise<void>
  private buildPrompt: (task: Task, retryContext?: string) => string

  // Circuit breaker state
  private consecutiveFailures = 0
  private circuitBreakerThreshold: number
  private recentFailures: TrackedFailure[] = []
  private selfHealingAttempts = 0
  private maxSelfHealingAttempts = 3
  private originalWorkers: number
  private originalTaskDelay: number
  private originalTimeout: number

  // Tracking
  private tasksCompleted = 0
  private tasksFailed = 0
  private iterationCount = 0
  private isAborted = false
  private interruptedTasks: string[] = []
  private tasksPerWorker: number[] = []
  private retryCount: Map<string, number> = new Map()

  constructor(options: ParallelRunnerOptions) {
    this.config = options.config
    this.backend = options.backend
    this.cliExecutor = options.cliExecutor
    this.logger = options.logger || defaultLogger
    this.workers = options.config.parallel || 2
    this.onTaskStart = options.onTaskStart
    this.onTaskComplete = options.onTaskComplete
    this.onTaskFailed = options.onTaskFailed
    this.buildPrompt = options.buildPrompt
    this.circuitBreakerThreshold = options.config.circuitBreakerThreshold ?? 5
    this.tasksPerWorker = new Array(this.workers).fill(0)
    // Save original values for self-healing reset
    this.originalWorkers = this.workers
    this.originalTaskDelay = options.config.taskDelay ?? 2000
    this.originalTimeout = options.config.timeout || 600
  }

  /**
   * Run the parallel execution loop
   */
  async run(options?: FindTaskOptions): Promise<ParallelRunStats> {
    const startTime = Date.now()
    const namespace = this.config.namespace || 'default'
    const maxIterations = this.config.maxIterations || 50

    this.logger.info(`Starting parallel execution with ${this.workers} workers`)
    this.logger.info(`Failure mode: ${this.config.parallelFailureMode}`)
    this.logger.info('─────────────────────────────────────')

    // Main loop - runs until no more tasks or max iterations reached
    while (this.iterationCount < maxIterations && !this.isAborted) {
      // Check circuit breaker before starting new iteration
      if (this.consecutiveFailures >= this.circuitBreakerThreshold) {
        // Attempt self-healing before giving up
        const healed = this.attemptSelfHealing()

        if (!healed) {
          throw new LoopworkError(
            `Circuit breaker activated: ${this.consecutiveFailures} consecutive task failures (${this.selfHealingAttempts} self-healing attempts exhausted)`,
            [
              'The circuit breaker stops execution after too many failures to prevent wasting resources',
              'Self-healing was attempted but could not recover from the failure pattern',
              'Resume from the last successful state: npx loopwork --resume',
              `Adjust threshold in config: circuitBreakerThreshold (current: ${this.circuitBreakerThreshold})`,
              'Review failed task logs in the output directory for patterns',
            ]
          )
        }

        // Healing applied - add a cooldown delay before retrying
        this.logger.info('Waiting 30s before resuming with adjusted configuration...')
        await new Promise(r => setTimeout(r, 30000))
      }

      this.iterationCount++

      // Launch workers in parallel
      const workerPromises = Array.from({ length: this.workers }, (_, i) =>
        this.runWorker(i, options, namespace)
      )

      // Wait for all workers to complete this round
      const results = await Promise.allSettled(workerPromises)

      // Process results
      let allIdle = true
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const workerResult = result.value
          if (workerResult.taskId) {
            allIdle = false
            if (workerResult.success) {
              this.consecutiveFailures = 0
              this.recentFailures = [] // Clear failures on success
            } else {
              this.consecutiveFailures++
              this.trackFailure(workerResult.error || 'Unknown error')
              if (this.config.parallelFailureMode === 'abort-all') {
                this.isAborted = true
                this.logger.error('Aborting all workers due to task failure (abort-all mode)')
                break
              }
            }
          }
        } else {
          // Worker threw an error
          this.consecutiveFailures++
          const errorMsg = String(result.reason)
          this.trackFailure(errorMsg)
          this.logger.error(`Worker error: ${errorMsg}`)
          if (this.config.parallelFailureMode === 'abort-all') {
            this.isAborted = true
            break
          }
        }
      }

      // If all workers were idle (no tasks claimed), we're done
      if (allIdle) {
        this.logger.info('No more pending tasks')
        break
      }

      // Small delay between iterations
      await new Promise(r => setTimeout(r, this.config.taskDelay ?? 2000))
    }

    const duration = (Date.now() - startTime) / 1000

    return {
      completed: this.tasksCompleted,
      failed: this.tasksFailed,
      duration,
      workers: this.workers,
      tasksPerWorker: this.tasksPerWorker,
    }
  }

  /**
   * Run a single worker
   */
  private async runWorker(
    workerId: number,
    options: FindTaskOptions | undefined,
    namespace: string
  ): Promise<WorkerResult> {
    const color = WORKER_COLORS[workerId % WORKER_COLORS.length]
    const prefix = color(`[W${workerId}]`)

    // Get next task - in dry-run mode, just peek without claiming
    let task: Task | null = null
    try {
      if (this.config.dryRun) {
        // Dry-run: peek at task without marking in-progress
        task = await this.backend.findNextTask(options)
      } else if (this.backend.claimTask) {
        // Normal: claim task atomically (marks in-progress)
        task = await this.backend.claimTask(options)
      } else {
        // Fallback for backends that don't implement claimTask
        task = await this.backend.findNextTask(options)
        if (task) {
          await this.backend.markInProgress(task.id)
        }
      }
    } catch (error) {
      this.logger.error(`${prefix} Failed to claim task: ${error}`)
      return { workerId, taskId: null, success: false, error: String(error) }
    }

    if (!task) {
      return { workerId, taskId: null, success: true }
    }

    this.tasksPerWorker[workerId]++
    this.logger.info(`${prefix} Claimed task ${task.id}: ${task.title}`)

    const taskStartTime = Date.now()

    // Create task context
    const taskContext: TaskContext = {
      task,
      iteration: this.iterationCount,
      startTime: new Date(),
      namespace,
    }

    // Notify task start
    if (this.onTaskStart) {
      await this.onTaskStart(taskContext)
    }

    // Track as interrupted until completed
    this.interruptedTasks.push(task.id)

    if (this.config.dryRun) {
      this.logger.warn(`${prefix} [DRY RUN] Would execute: ${task.id}`)
      this.interruptedTasks = this.interruptedTasks.filter(id => id !== task!.id)
      return { workerId, taskId: task.id, success: true }
    }

    // Build prompt and execute
    const retryContext = '' // Retry context managed per-task
    const prompt = this.buildPrompt(task, retryContext)

    // Create worker-specific log files
    const logDir = path.join(this.config.outputDir, 'logs')
    fs.mkdirSync(logDir, { recursive: true })

    const promptFile = path.join(logDir, `iteration-${this.iterationCount}-worker-${workerId}-prompt.md`)
    const outputFile = path.join(logDir, `iteration-${this.iterationCount}-worker-${workerId}-output.txt`)

    fs.writeFileSync(promptFile, prompt)

    try {
      const exitCode = await this.cliExecutor.execute(
        prompt,
        outputFile,
        this.config.timeout || 600,
        task.id
      )

      const duration = (Date.now() - taskStartTime) / 1000

      if (exitCode === 0) {
        const comment = `Completed by Loopwork (parallel worker ${workerId})\n\nSession: ${this.config.sessionId}\nIteration: ${this.iterationCount}`
        await this.backend.markCompleted(task.id, comment)

        let output = ''
        try {
          if (fs.existsSync(outputFile)) {
            output = fs.readFileSync(outputFile, 'utf-8')
          }
        } catch {}

        if (this.onTaskComplete) {
          await this.onTaskComplete(taskContext, { output, duration, success: true })
        }

        this.tasksCompleted++
        this.retryCount.delete(task.id)
        this.interruptedTasks = this.interruptedTasks.filter(id => id !== task!.id)
        this.logger.success(`${prefix} Task ${task.id} completed in ${duration.toFixed(1)}s`)

        return { workerId, taskId: task.id, success: true, duration }
      } else {
        // Task failed
        const currentRetries = this.retryCount.get(task.id) || 0
        const maxRetries = this.config.maxRetries ?? 3

        if (currentRetries < maxRetries - 1) {
          // Reset to pending for retry
          this.retryCount.set(task.id, currentRetries + 1)
          await this.backend.resetToPending(task.id)
          this.logger.warn(`${prefix} Task ${task.id} failed, resetting for retry (${currentRetries + 2}/${maxRetries})`)
          this.interruptedTasks = this.interruptedTasks.filter(id => id !== task!.id)
          return { workerId, taskId: task.id, success: false, error: 'Task failed, scheduled for retry' }
        } else {
          // Max retries reached - read output file to get actual error for categorization
          let outputContent = ''
          try {
            if (fs.existsSync(outputFile)) {
              outputContent = fs.readFileSync(outputFile, 'utf-8')
              // Get last 500 chars for error analysis
              outputContent = outputContent.slice(-500)
            }
          } catch {}

          const errorMsg = `Max retries (${maxRetries}) reached\n\nSession: ${this.config.sessionId}\nIteration: ${this.iterationCount}`
          await this.backend.markFailed(task.id, errorMsg)

          if (this.onTaskFailed) {
            await this.onTaskFailed(taskContext, errorMsg)
          }

          this.tasksFailed++
          this.retryCount.delete(task.id)
          this.interruptedTasks = this.interruptedTasks.filter(id => id !== task!.id)
          this.logger.error(`${prefix} Task ${task.id} failed after ${maxRetries} attempts`)

          // Return with actual output for better failure categorization
          const fullError = outputContent ? `${errorMsg}\n\nOutput: ${outputContent}` : errorMsg
          return { workerId, taskId: task.id, success: false, error: fullError, duration }
        }
      }
    } catch (error) {
      // Execution error - reset task to pending
      await this.backend.resetToPending(task.id).catch(() => {})
      this.logger.error(`${prefix} Execution error for ${task.id}: ${error}`)
      return { workerId, taskId: task.id, success: false, error: String(error) }
    }
  }

  /**
   * Abort execution (for cleanup/signal handling)
   */
  abort(): void {
    this.isAborted = true
    this.logger.warn('Parallel runner aborted')
  }

  /**
   * Get current state for resume functionality
   */
  getState(): ParallelState {
    return {
      parallel: this.workers,
      completedIterations: this.iterationCount,
      interruptedTasks: this.interruptedTasks,
      startedAt: Date.now(),
      namespace: this.config.namespace || 'default',
      sessionId: this.config.sessionId,
    }
  }

  /**
   * Reset interrupted tasks to pending (for resume)
   */
  async resetInterruptedTasks(taskIds: string[]): Promise<void> {
    for (const taskId of taskIds) {
      try {
        await this.backend.resetToPending(taskId)
        this.logger.info(`Reset interrupted task ${taskId} to pending`)
      } catch (error) {
        this.logger.warn(`Failed to reset task ${taskId}: ${error}`)
      }
    }
  }

  /**
   * Get statistics
   */
  getStats(): { completed: number; failed: number; iterations: number } {
    return {
      completed: this.tasksCompleted,
      failed: this.tasksFailed,
      iterations: this.iterationCount,
    }
  }

  /**
   * Categorize a failure based on error message patterns
   */
  private categorizeFailure(error: string): FailureCategory {
    const lowerError = error.toLowerCase()

    if (lowerError.includes('rate limit') ||
        lowerError.includes('429') ||
        lowerError.includes('too many requests') ||
        lowerError.includes('overloaded')) {
      return 'rate_limit'
    }

    if (lowerError.includes('timeout') ||
        lowerError.includes('etimedout') ||
        lowerError.includes('timed out')) {
      return 'timeout'
    }

    if (lowerError.includes('memory') ||
        lowerError.includes('oom') ||
        lowerError.includes('out of memory')) {
      return 'memory'
    }

    return 'unknown'
  }

  /**
   * Track a failure for pattern analysis
   */
  private trackFailure(error: string): void {
    const category = this.categorizeFailure(error)
    this.recentFailures.push({
      timestamp: Date.now(),
      category,
      error,
    })

    // Keep only last 10 failures for analysis
    if (this.recentFailures.length > 10) {
      this.recentFailures.shift()
    }
  }

  /**
   * Analyze failure patterns and determine healing action
   */
  private analyzeFailurePatterns(): SelfHealingAdjustment | null {
    if (this.recentFailures.length < this.circuitBreakerThreshold) {
      return null
    }

    // Count failure categories in recent failures
    const categoryCounts: Record<FailureCategory, number> = {
      rate_limit: 0,
      timeout: 0,
      memory: 0,
      unknown: 0,
    }

    for (const failure of this.recentFailures) {
      categoryCounts[failure.category]++
    }

    // Determine dominant failure pattern (needs at least 60% of recent failures)
    const total = this.recentFailures.length
    const threshold = Math.ceil(total * 0.6)

    // Rate limit pattern - reduce parallelism and increase delay
    if (categoryCounts.rate_limit >= threshold) {
      const newWorkers = Math.max(1, Math.floor(this.workers / 2))
      const newDelay = Math.min(30000, (this.config.taskDelay ?? 2000) * 2)
      return {
        workers: newWorkers,
        taskDelay: newDelay,
        reason: `Rate limit detected (${categoryCounts.rate_limit}/${total} failures). Reducing workers from ${this.workers} to ${newWorkers}, increasing delay to ${newDelay / 1000}s`,
      }
    }

    // Timeout pattern - increase timeout
    if (categoryCounts.timeout >= threshold) {
      const newTimeout = Math.min(1800, (this.config.timeout || 600) * 1.5)
      return {
        timeout: Math.round(newTimeout),
        reason: `Timeout detected (${categoryCounts.timeout}/${total} failures). Increasing timeout to ${newTimeout}s`,
      }
    }

    // Memory pattern - reduce parallelism
    if (categoryCounts.memory >= threshold) {
      const newWorkers = Math.max(1, Math.floor(this.workers / 2))
      return {
        workers: newWorkers,
        reason: `Memory pressure detected (${categoryCounts.memory}/${total} failures). Reducing workers from ${this.workers} to ${newWorkers}`,
      }
    }

    // Unknown pattern - conservative reduction
    return {
      workers: Math.max(1, this.workers - 1),
      taskDelay: Math.min(10000, (this.config.taskDelay ?? 2000) + 2000),
      reason: `Unknown failure pattern (${categoryCounts.unknown}/${total} failures). Reducing workers and increasing delay`,
    }
  }

  /**
   * Apply self-healing adjustments
   */
  private applySelfHealing(adjustment: SelfHealingAdjustment): void {
    this.logger.warn('─────────────────────────────────────')
    this.logger.warn(chalk.yellow('🔄 Self-Healing Activated'))
    this.logger.warn(adjustment.reason)

    if (adjustment.workers !== undefined) {
      this.workers = adjustment.workers
      this.tasksPerWorker = new Array(this.workers).fill(0)
    }

    if (adjustment.taskDelay !== undefined) {
      this.config.taskDelay = adjustment.taskDelay
    }

    if (adjustment.timeout !== undefined) {
      this.config.timeout = adjustment.timeout
    }

    // Reset circuit breaker after healing
    this.consecutiveFailures = 0
    this.recentFailures = []
    this.selfHealingAttempts++

    this.logger.warn(`Self-healing attempt ${this.selfHealingAttempts}/${this.maxSelfHealingAttempts}`)
    this.logger.warn(`New configuration: ${this.workers} workers, ${this.config.taskDelay}ms delay, ${this.config.timeout}s timeout`)
    this.logger.warn('─────────────────────────────────────')
  }

  /**
   * Attempt self-healing or throw circuit breaker error
   * Returns true if healing was applied, false if should stop
   */
  private attemptSelfHealing(): boolean {
    // Check if we've exhausted self-healing attempts
    if (this.selfHealingAttempts >= this.maxSelfHealingAttempts) {
      return false
    }

    // Analyze failure patterns
    const adjustment = this.analyzeFailurePatterns()

    if (adjustment) {
      this.applySelfHealing(adjustment)
      return true
    }

    return false
  }
}

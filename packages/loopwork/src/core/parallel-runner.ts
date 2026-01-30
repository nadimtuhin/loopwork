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
        throw new LoopworkError(
          `Circuit breaker activated: ${this.consecutiveFailures} consecutive task failures`,
          [
            'The circuit breaker stops execution after too many failures to prevent wasting resources',
            'Resume from the last successful state: npx loopwork --resume',
            `Adjust threshold in config: circuitBreakerThreshold (current: ${this.circuitBreakerThreshold})`,
            'Review failed task logs in the output directory for patterns',
          ]
        )
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
            } else {
              this.consecutiveFailures++
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
          this.logger.error(`Worker error: ${result.reason}`)
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
          // Max retries reached
          const errorMsg = `Max retries (${maxRetries}) reached\n\nSession: ${this.config.sessionId}\nIteration: ${this.iterationCount}`
          await this.backend.markFailed(task.id, errorMsg)

          if (this.onTaskFailed) {
            await this.onTaskFailed(taskContext, errorMsg)
          }

          this.tasksFailed++
          this.retryCount.delete(task.id)
          this.interruptedTasks = this.interruptedTasks.filter(id => id !== task!.id)
          this.logger.error(`${prefix} Task ${task.id} failed after ${maxRetries} attempts`)

          return { workerId, taskId: task.id, success: false, error: errorMsg, duration }
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
}

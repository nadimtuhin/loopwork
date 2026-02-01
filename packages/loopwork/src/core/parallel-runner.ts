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
import type { RunLogger } from '../contracts/logger'
import { logger as defaultLogger } from './utils'
import { LoopworkError } from './errors'
import { Debugger } from './debugger'
import type { IMessageBus } from '../contracts/messaging'
import { createMessageBus as _createMessageBus } from './message-bus'
import { failureState } from './failure-state'
import { RetryBudget } from './retry-budget'
import { getRetryPolicy, isRetryableError, calculateBackoff } from './retry'
import { isRateLimitError } from '@loopwork-ai/resilience'
import { CheckpointIntegrator } from './checkpoint-integrator'
import type { IPluginRegistry } from '@loopwork-ai/contracts'

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
type FailureCategory = 'rate_limit' | 'timeout' | 'memory' | 'cli_cache' | 'unknown'

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
  pluginRegistry: IPluginRegistry
  onTaskStart?: (context: TaskContext) => Promise<void>
  onTaskComplete?: (context: TaskContext, result: { output: string; duration: number; success: boolean }) => Promise<void>
  onTaskFailed?: (context: TaskContext, error: string) => Promise<void>
  onTaskRetry?: (context: TaskContext, error: string) => Promise<void>
  onTaskAbort?: (context: TaskContext) => Promise<void>
  onWorkerStatus?: (status: {
    totalWorkers: number
    activeWorkers: number
    pendingTasks: number
    runningTasks: number
    completedTasks: number
    failedTasks: number
  }) => Promise<void>
  buildPrompt: (task: Task, retryContext?: string) => string
  debugger?: Debugger
  messageBus?: IMessageBus
  enableMessaging?: boolean
  retryBudget?: RetryBudget
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
  private pluginRegistry: IPluginRegistry
  private workers: number
  private onTaskStart?: (context: TaskContext) => Promise<void>
  private onTaskComplete?: (context: TaskContext, result: { output: string; duration: number; success: boolean }) => Promise<void>
  private onTaskFailed?: (context: TaskContext, error: string) => Promise<void>
  private onTaskRetry?: (context: TaskContext, error: string) => Promise<void>
  private onTaskAbort?: (context: TaskContext) => Promise<void>
  private onWorkerStatus?: (status: {
    totalWorkers: number
    activeWorkers: number
    pendingTasks: number
    runningTasks: number
    completedTasks: number
    failedTasks: number
  }) => Promise<void>
  private buildPrompt: (task: Task, retryContext?: string) => string
  private debugger?: Debugger
  private retryBudget: RetryBudget
  private checkpointIntegrator?: CheckpointIntegrator

  // Circuit breaker state
  private consecutiveFailures = 0
  private circuitBreakerThreshold: number
  private recentFailures: TrackedFailure[] = []
  private selfHealingAttempts = 0
  private maxSelfHealingAttempts = 3
  private selfHealingCooldown: number // Cooldown delay after healing (ms)
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
  private lastErrors: Map<string, string> = new Map()
  private activeContexts: Map<string, TaskContext> = new Map()

  // Periodic cleanup
  private lastCleanupTime: number = 0
  private cleanupInterval: number

  constructor(options: ParallelRunnerOptions) {
    this.config = options.config
    this.backend = options.backend
    this.cliExecutor = options.cliExecutor
    this.logger = options.logger || defaultLogger
    this.pluginRegistry = options.pluginRegistry
    this.workers = options.config.parallel || 2
    this.onTaskStart = options.onTaskStart
    this.onTaskComplete = options.onTaskComplete
    this.onTaskFailed = options.onTaskFailed
    this.onTaskRetry = options.onTaskRetry
    this.onTaskAbort = options.onTaskAbort
    this.onWorkerStatus = options.onWorkerStatus
    this.buildPrompt = options.buildPrompt
    this.debugger = options.debugger
    this.circuitBreakerThreshold = options.config.circuitBreakerThreshold ?? 5
    this.tasksPerWorker = new Array(this.workers).fill(0)
    // Save original values for self-healing reset
    this.originalWorkers = this.workers
    this.originalTaskDelay = options.config.taskDelay ?? 2000
    this.originalTimeout = options.config.timeout || 600
    // Self-healing cooldown (default 30s, can be reduced for testing)
    this.selfHealingCooldown = options.config.selfHealingCooldown ?? 30000
    // Cleanup interval (default 5 minutes)
    this.cleanupInterval = options.config.orphanWatch?.interval ?? 300000

    // Initialize retry budget
    if (options.retryBudget) {
      this.retryBudget = options.retryBudget
    } else {
      const budgetConfig = this.config.retryBudget || {
        maxRetries: 50,
        windowMs: 3600000
      }
      this.retryBudget = new RetryBudget(
        budgetConfig.maxRetries || 50,
        budgetConfig.windowMs || 3600000,
        budgetConfig.persistence !== false
      )
    }

    // Initialize checkpoint integrator
    if (this.config.checkpoint?.enabled) {
      this.checkpointIntegrator = new CheckpointIntegrator(this.config.checkpoint, this.config.projectRoot)
    }
  }

  /**
   * Emit worker status update
   */
  private async emitWorkerStatus(activeWorkers: number, pendingTasks: number, runningTasks: number): Promise<void> {
    if (this.onWorkerStatus) {
      await this.onWorkerStatus({
        totalWorkers: this.workers,
        activeWorkers,
        pendingTasks,
        runningTasks,
        completedTasks: this.tasksCompleted,
        failedTasks: this.tasksFailed,
      })
    }
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

    // Run pre-flight CLI health validation
    if (this.cliExecutor.runPreflightValidation) {
      const preflight = await this.cliExecutor.runPreflightValidation(this.workers)
      
      if (!preflight.success) {
        this.logger.error(`[Preflight] ${preflight.message}`)
        throw new LoopworkError(
          'ERR_PREFLIGHT_FAILED',
          `Pre-flight validation failed: ${preflight.message}`,
          [
            'Check that your AI CLI tools are installed and accessible',
            'Run: which opencode claude gemini',
            'Try clearing CLI caches: rm -rf ~/.cache/opencode',
            'Check CLI credentials are configured correctly',
          ]
        )
      }
      
      this.logger.info(`[Preflight] ${preflight.message}`)
      
      // Warn if fewer models available than workers
      const healthStatus = this.cliExecutor.getHealthStatus?.()
      if (healthStatus && healthStatus.available < this.workers) {
        this.logger.warn(
          `[Preflight] Only ${healthStatus.available} models available for ${this.workers} workers. ` +
          `Some workers may wait for available models.`
        )
      }
    }

    // Check for reduced functionality mode
    if (this.pluginRegistry.isDegradedMode(this.config.flags)) {
      this.logger.raw(chalk.yellow('\n' + '═'.repeat(40)))
      this.logger.warn(' ⚡ REDUCED FUNCTIONALITY MODE ENABLED')
      this.logger.raw(chalk.yellow('═'.repeat(40) + '\n'))
      
      if (this.config.flags?.reducedFunctionality) {
        this.logger.warn('   Reason: --flag reducedFunctionality is set')
      }

      const disabledPlugins = this.pluginRegistry.getDisabledPluginsReport()
      if (disabledPlugins.length > 0) {
        this.logger.warn('   Disabled plugins:')
        for (const { name, reason } of disabledPlugins) {
          this.logger.warn(`     - ${name} (${reason})`)
        }
      }

      const activePluginsReport = this.pluginRegistry.getActivePluginsReport()
      if (activePluginsReport.length > 0) {
        this.logger.info('   Active plugins:')
        for (const { name, classification } of activePluginsReport) {
          this.logger.info(`     - ${name} (${classification})`)
        }
      }

      const hasEnhancements = activePluginsReport.some(p => p.classification === 'enhancement')
      if (!hasEnhancements) {
        this.logger.warn('   Note: All enhancement features disabled')
      }
    }

    this.logger.info('─────────────────────────────────────')

    if (this.debugger) {
      await this.debugger.onEvent({
        type: 'LOOP_START',
        timestamp: Date.now(),
        data: { mode: 'parallel', workers: this.workers }
      })
    }

    // Main loop - runs until no more tasks or max iterations reached
    while (this.iterationCount < maxIterations && !this.isAborted) {
      // Get pending count for status
      const pendingCount = await this.backend.countPending().catch(() => 0)
      await this.emitWorkerStatus(this.workers, pendingCount, this.activeContexts.size)

      // Trigger checkpoint at configured intervals if enabled
      if (this.checkpointIntegrator?.shouldCheckpoint(this.iterationCount)) {
        // Periodic checkpoints are non-blocking and safe
        this.checkpointIntegrator.checkpoint({
          taskId: 'parallel-loop-iteration',
          iteration: this.iterationCount,
          context: {
            tasksCompleted: this.tasksCompleted,
            tasksFailed: this.tasksFailed,
            consecutiveFailures: this.consecutiveFailures,
          },
          memory: {
            lastCheckpointTime: Date.now(),
          },
        }).catch(err => this.logger.debug(`Periodic parallel checkpoint failed: ${err}`))
      }

      // Increment checkpoint iteration counter
      this.checkpointIntegrator?.incrementIteration()

      // Check circuit breaker before starting new iteration
      if (this.consecutiveFailures >= this.circuitBreakerThreshold) {
        // Attempt self-healing before giving up
        const healed = this.attemptSelfHealing()

        if (!healed) {
          throw new LoopworkError(
            'ERR_TASK_INVALID',
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
        const cooldownSec = Math.round(this.selfHealingCooldown / 1000)
        this.logger.info(`Waiting ${cooldownSec}s before resuming with adjusted configuration...`)
        await new Promise(r => setTimeout(r, this.selfHealingCooldown))
      }

      // Periodic cleanup of stale test runners
      if (this.config.orphanWatch?.enabled) {
        await this.performPeriodicCleanup()
      }

      this.iterationCount++

        // Launch workers in parallel
        const workerOptions: FindTaskOptions = {
          ...options,
          retryCooldown: this.config.retryCooldown
        }
        const workerPromises = Array.from({ length: this.workers }, (_, i) =>
          this.runWorker(i, workerOptions, namespace)
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

    // Create final checkpoint after loop completes
    if (this.checkpointIntegrator) {
      await this.checkpointIntegrator.checkpoint({
        taskId: 'parallel-loop-complete',
        iteration: this.iterationCount,
        context: {
          tasksCompleted: this.tasksCompleted,
          tasksFailed: this.tasksFailed,
          totalIterations: this.iterationCount,
          status: 'completed',
        },
        memory: {
          completionTime: new Date().toISOString(),
        },
      })
    }

    if (this.debugger) {
      await this.debugger.onEvent({
        type: 'LOOP_END',
        timestamp: Date.now(),
        data: { completed: this.tasksCompleted, failed: this.tasksFailed, duration }
      })
    }

    return {
      completed: this.tasksCompleted,
      failed: this.tasksFailed,
      duration,
      workers: this.workers,
      tasksPerWorker: this.tasksPerWorker,
      isDegraded: this.pluginRegistry.isDegradedMode(this.config.flags),
      disabledPlugins: this.pluginRegistry.getDisabledPlugins(),
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

    // Sync persisted failure state to in-memory manager
    if (task.failureCount) {
      failureState.setFailureState(task.id, task.failureCount, task.lastError || 'Previously failed')
    }

    this.tasksPerWorker[workerId]++
    const isDegraded = this.pluginRegistry.isDegradedMode(this.config.flags)
    const degradedSuffix = isDegraded ? chalk.yellow(' (Reduced)') : ''
    this.logger.info(`${prefix} Claimed task ${task.id}: ${task.title}${degradedSuffix}`)

    if (this.debugger) {
      await this.debugger.onEvent({
        type: 'TASK_START',
        taskId: task.id,
        iteration: this.iterationCount,
        timestamp: Date.now(),
        data: { title: task.title, workerId }
      })

      await this.debugger.onEvent({
        type: 'PRE_TASK',
        taskId: task.id,
        iteration: this.iterationCount,
        timestamp: Date.now(),
        data: { workerId }
      })
    }

    const taskStartTime = Date.now()

    // Get retry policy for this task
    const retryPolicy = getRetryPolicy(task, this.config)
    const currentRetryAttempt = this.retryCount.get(task.id) || 0

    // Get model info from CLI executor (if available) or use config CLI as fallback
    const modelInfo = this.cliExecutor.getNextModel?.()
    const cli = modelInfo?.cli || this.config.cli || 'unknown'
    const model = modelInfo?.model
    const displayName = modelInfo?.displayName || (model ? `${cli}/${model}` : cli)

    // Create task context
    const taskContext: TaskContext = {
      task,
      config: this.config,
      iteration: this.iterationCount,
      startTime: new Date(),
      namespace,
      flags: this.config.flags,
      retryAttempt: currentRetryAttempt,
      retryPolicy,
      lastError: this.lastErrors.get(task.id),
      cli,
      model,
      modelDisplayName: displayName,
      workerId,
    }

    this.activeContexts.set(task.id, taskContext)
    
    if (this.backend.updateTask) {
      await this.backend.updateTask(task.id, {
        metadata: {
          cli,
          model,
          modelDisplayName: displayName,
          workerId,
        }
      })
    }

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
      const exitCode = await this.cliExecutor.executeTask(
        task,
        prompt,
        outputFile,
        this.config.timeout || 600,
        {
          workerId,
          permissions: taskContext.permissions
        }
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

        if (this.debugger) {
          await this.debugger.onEvent({
            type: 'POST_TASK',
            taskId: task.id,
            iteration: this.iterationCount,
            timestamp: Date.now(),
            data: { success: true, duration, workerId }
          })
        }

        this.tasksCompleted++
        this.retryCount.delete(task.id)
        failureState.clearFailure(task.id)
        this.lastErrors.delete(task.id)
        this.activeContexts.delete(task.id)
        this.interruptedTasks = this.interruptedTasks.filter(id => id !== task!.id)

        // Create checkpoint after task completion if not skipped
        if (this.checkpointIntegrator && !this.config.checkpoint?.skipOnTaskComplete) {
          await this.checkpointIntegrator.checkpoint({
            taskId: task.id,
            iteration: this.iterationCount,
            context: {
              tasksCompleted: this.tasksCompleted,
              tasksFailed: this.tasksFailed,
              status: 'completed',
              workerId,
            },
            memory: {
              lastCompletedTask: task.id,
            },
          })
        }

        this.logger.success(`${prefix} Task ${task.id} completed in ${duration.toFixed(1)}s`)

        return { workerId, taskId: task.id, success: true, duration }
      } else {
        // Task failed - retrieve error information
        let outputContent = ''
        try {
          if (fs.existsSync(outputFile)) {
            outputContent = fs.readFileSync(outputFile, 'utf-8')
            // Get last 500 chars for error analysis
            outputContent = outputContent.slice(-500)
          }
        } catch {}

        const taskError = new Error(`Task failed with exit code ${exitCode}${outputContent ? `\n\nOutput: ${outputContent}` : ''}`)
        const currentRetries = this.retryCount.get(task.id) || 0

        // Check if error is retryable
        if (!isRetryableError(taskError, retryPolicy)) {
          this.logger.error(`${prefix} Task ${task.id} failed with non-retryable error`)
          const errorMsg = `Non-retryable error\n\nSession: ${this.config.sessionId}\nIteration: ${this.iterationCount}${outputContent ? `\n\nOutput: ${outputContent}` : ''}`
          await this.recordTaskFailure(task, errorMsg)

          if (this.onTaskFailed) {
            await this.onTaskFailed(taskContext, errorMsg)
          }

          if (this.debugger) {
            await this.debugger.onEvent({
              type: 'POST_TASK',
              taskId: task.id,
              iteration: this.iterationCount,
              timestamp: Date.now(),
              data: { success: false, error: errorMsg, workerId }
            })
          }

          this.tasksFailed++
          this.retryCount.delete(task.id)
          this.lastErrors.delete(task.id)
          this.activeContexts.delete(task.id)
          this.interruptedTasks = this.interruptedTasks.filter(id => id !== task!.id)

          // Create checkpoint after task failure if enabled
          if (this.checkpointIntegrator) {
            await this.checkpointIntegrator.checkpoint({
              taskId: task.id,
              iteration: this.iterationCount,
              context: {
                tasksCompleted: this.tasksCompleted,
                tasksFailed: this.tasksFailed,
                status: 'failed-non-retryable',
                workerId,
              },
              memory: {
                lastFailedTask: task.id,
              },
            })
          }

          return { workerId, taskId: task.id, success: false, error: errorMsg, duration }
        }

        // Check if max retries exceeded
        if (currentRetries >= retryPolicy.maxRetries) {
          const errorMsg = `Max retries (${retryPolicy.maxRetries}) reached\n\nSession: ${this.config.sessionId}\nIteration: ${this.iterationCount}${outputContent ? `\n\nOutput: ${outputContent}` : ''}`
          await this.recordTaskFailure(task, errorMsg)

          if (this.onTaskFailed) {
            await this.onTaskFailed(taskContext, errorMsg)
          }

          if (this.debugger) {
            await this.debugger.onEvent({
              type: 'POST_TASK',
              taskId: task.id,
              iteration: this.iterationCount,
              timestamp: Date.now(),
              data: { success: false, error: errorMsg, workerId }
            })
          }

          this.tasksFailed++
          this.retryCount.delete(task.id)
          this.lastErrors.delete(task.id)
          this.activeContexts.delete(task.id)
          this.interruptedTasks = this.interruptedTasks.filter(id => id !== task!.id)

          // Create checkpoint after task failure if enabled
          if (this.checkpointIntegrator) {
            await this.checkpointIntegrator.checkpoint({
              taskId: task.id,
              iteration: this.iterationCount,
              context: {
                tasksCompleted: this.tasksCompleted,
                tasksFailed: this.tasksFailed,
                status: 'failed-max-retries',
                workerId,
              },
              memory: {
                lastFailedTask: task.id,
              },
            })
          }

          this.logger.error(`${prefix} Task ${task.id} failed after ${retryPolicy.maxRetries} attempts`)
          return { workerId, taskId: task.id, success: false, error: errorMsg, duration }
        }

        // Check if we have budget for a retry
        const hasBudget = this.config.retryBudget?.enabled !== false && this.retryBudget.hasBudget()

        if (!hasBudget && this.config.retryBudget?.enabled !== false) {
          const budgetConfig = this.retryBudget.getConfig()
          this.logger.error(`${prefix} Retry budget exhausted (${budgetConfig.maxRetries} per ${budgetConfig.windowMs / 3600000}h). Cannot retry task ${task.id}.`)

          // Treat as final failure since we can't retry
          const errorMsg = `Retry budget exhausted${outputContent ? `\n\nOutput: ${outputContent}` : ''}`
          await this.recordTaskFailure(task, errorMsg)

          if (this.onTaskFailed) {
            await this.onTaskFailed(taskContext, errorMsg)
          }

          if (this.debugger) {
            await this.debugger.onEvent({
              type: 'POST_TASK',
              taskId: task.id,
              iteration: this.iterationCount,
              timestamp: Date.now(),
              data: { success: false, error: errorMsg, workerId }
            })
          }

          this.tasksFailed++
          this.retryCount.delete(task.id)
          this.lastErrors.delete(task.id)
          this.activeContexts.delete(task.id)
          this.interruptedTasks = this.interruptedTasks.filter(id => id !== task!.id)

          // Create checkpoint after task failure if enabled
          if (this.checkpointIntegrator) {
            await this.checkpointIntegrator.checkpoint({
              taskId: task.id,
              iteration: this.iterationCount,
              context: {
                tasksCompleted: this.tasksCompleted,
                tasksFailed: this.tasksFailed,
                status: 'failed-budget-exhausted',
                workerId,
              },
              memory: {
                lastFailedTask: task.id,
              },
            })
          }

          return { workerId, taskId: task.id, success: false, error: errorMsg, duration }
        }

        // Consume budget
        if (this.config.retryBudget?.enabled !== false) {
          this.retryBudget.consume()
        }

        // Calculate backoff delay
        const backoffDelay = calculateBackoff(currentRetries, retryPolicy)
        this.logger.warn(`${prefix} Task ${task.id} failed (retryable error). Waiting ${backoffDelay}ms before retry (${currentRetries + 1}/${retryPolicy.maxRetries})`)

        // Store error information for next retry attempt
        const errorInfo = `Exit code ${exitCode}${outputContent ? `\n\nOutput excerpt:\n${outputContent}` : ''}`
        this.lastErrors.set(task.id, errorInfo)

        if (this.onTaskRetry) {
          await this.onTaskRetry(taskContext, errorInfo)
        }

        // Wait for backoff period
        await new Promise(resolve => setTimeout(resolve, backoffDelay))

        // Reset to pending for retry
        this.retryCount.set(task.id, currentRetries + 1)
        await this.backend.resetToPending(task.id)
        this.interruptedTasks = this.interruptedTasks.filter(id => id !== task!.id)
        return { workerId, taskId: task.id, success: false, error: taskError.message }
      }
    } catch (error) {
      if (this.debugger) {
        await this.debugger.onEvent({
          type: 'ERROR',
          taskId: task.id,
          timestamp: Date.now(),
          error: error as unknown
        })
      }
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
   * Notify plugins that active tasks are being aborted
   */
  async notifyAbort(): Promise<void> {
    if (!this.onTaskAbort) return

    const abortPromises = Array.from(this.activeContexts.values()).map(context =>
      this.onTaskAbort!(context)
    )
    await Promise.allSettled(abortPromises)
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
   * Perform periodic cleanup of stale test runners
   */
  private async performPeriodicCleanup(): Promise<void> {
    const now = Date.now()
    if (now - this.lastCleanupTime < this.cleanupInterval) {
      return // Not time yet
    }

    this.lastCleanupTime = now

    try {
      // Import dynamically to avoid circular dependencies
      const { createStaleTestKiller } = await import('./stale-test-killer')
      const killer = createStaleTestKiller({
        projectRoot: this.config.projectRoot || process.cwd(),
        maxAge: this.config.orphanWatch?.maxAge ?? 600000,
        silent: true, // Don't spam logs
      })

      const result = await killer.kill()

      if (result.killed.length > 0) {
        this.logger.info(`Cleaned up ${result.killed.length} stale test runner(s)`)
      }
    } catch (error) {
      this.logger.debug(`Periodic cleanup failed: ${error}`)
    }
  }

  /**
   * Categorize a failure based on error message patterns
   */
  private categorizeFailure(error: string): FailureCategory {
    const lowerError = error.toLowerCase()
    
    if (isRateLimitError(error)) {
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

    // CLI cache corruption patterns
    if (lowerError.includes('enoent') && lowerError.includes('cache')) {
      return 'cli_cache'
    }
    if (lowerError.includes('cache corruption') || lowerError.includes('corrupted')) {
      return 'cli_cache'
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
      cli_cache: 0,
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

    // CLI cache corruption pattern - try to reset model selectors
    if (categoryCounts.cli_cache >= threshold) {
      return {
        reason: `CLI cache corruption detected (${categoryCounts.cli_cache}/${total} failures). Models will retry with cleared caches`,
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

  /**
   * Record task failure and handle auto-quarantine logic
   */
  private async recordTaskFailure(task: Task, errorMsg: string): Promise<void> {
    failureState.recordFailure(task.id, errorMsg)
    const failureCount = failureState.getFailureCount(task.id)
    const threshold = this.config.quarantineThreshold ?? 3

    if (failureCount >= threshold) {
      this.logger.warn(`⚠️ Task ${task.id} has failed ${failureCount} times. Moving to quarantine (DLQ).`)
      await this.backend.markQuarantined(task.id, `Exceeded quarantine threshold (${threshold}). Last error: ${errorMsg}`)
    } else {
      await this.backend.markFailed(task.id, errorMsg)
    }
  }
}

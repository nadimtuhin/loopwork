import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import type { Config } from './config'
import type { TaskBackend, FindTaskOptions } from '../contracts/backend'
import type { Task, Priority, TaskStatus } from '../contracts/task'
import type { ICliExecutor } from '../contracts/executor'
import type { TaskContext, LoopStats } from '../contracts/plugin'
import type { RunLogger } from '../contracts/logger'
import { logger as defaultLogger } from './utils'
import { LoopworkError } from './errors'
import { Debugger } from './debugger'
import type { IMessageBus } from '../contracts/messaging'
import { failureState as defaultFailureState } from './failure-state'
import { RetryBudget as DefaultRetryBudget } from './retry-budget'
import { CheckpointIntegrator as DefaultCheckpointIntegrator } from './checkpoint-integrator'
import type { IRetryBudget, ICheckpointIntegrator, IFailureState } from '../contracts/services'
import type { IPluginRegistry } from '@loopwork-ai/contracts'
import { 
  isOpencodeError, 
  attemptOpencodeSelfHealing,
  categorizeOpencodeFailure 
} from './opencode-healer'

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

type FailureCategory = 'rate_limit' | 'timeout' | 'memory' | 'cli_cache' | 'opencode_dependency' | 'opencode_cache' | 'unknown'

interface TrackedFailure {
  timestamp: number
  category: FailureCategory
  error: string
}

interface SelfHealingAdjustment {
  workers?: number
  taskDelay?: number
  timeout?: number
  reason: string
  healOpencode?: boolean
}

interface WorkerResult {
  workerId: number
  taskId: string | null
  success: boolean
  error?: string
  duration?: number
}

export interface ParallelState {
  parallel: number
  completedIterations: number
  interruptedTasks: string[]
  startedAt: number
  namespace: string
  sessionId: string
}

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
  retryBudget?: IRetryBudget
  checkpointIntegrator?: ICheckpointIntegrator
  failureState?: IFailureState
}

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
  private messageBus?: IMessageBus
  private retryBudget: IRetryBudget
  private checkpointIntegrator?: ICheckpointIntegrator
  private failureState: IFailureState

  // Circuit breaker state
  private consecutiveFailures = 0
  private circuitBreakerThreshold: number
  private recentFailures: TrackedFailure[] = []
  private selfHealingAttempts = 0
  private maxSelfHealingAttempts = 3
  private selfHealingCooldown: number 
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
    this.messageBus = options.messageBus
    this.circuitBreakerThreshold = options.config.circuitBreakerThreshold ?? 5
    this.tasksPerWorker = new Array(this.workers).fill(0)
    
    this.originalWorkers = this.workers
    this.originalTaskDelay = options.config.taskDelay ?? 2000
    this.originalTimeout = options.config.timeout || 600
    this.selfHealingCooldown = options.config.selfHealingCooldown ?? 30000
    this.cleanupInterval = options.config.orphanWatch?.interval ?? 300000

    this.failureState = options.failureState || defaultFailureState

    if (options.retryBudget) {
      this.retryBudget = options.retryBudget
    } else {
      const budgetConfig = this.config.retryBudget || {
        maxRetries: 50,
        windowMs: 3600000
      }
      this.retryBudget = new DefaultRetryBudget(
        budgetConfig.maxRetries || 50,
        budgetConfig.windowMs || 3600000,
        budgetConfig.persistence !== false
      )
    }

    if (options.checkpointIntegrator) {
      this.checkpointIntegrator = options.checkpointIntegrator
    } else if (this.config.checkpoint?.enabled) {
      this.checkpointIntegrator = new DefaultCheckpointIntegrator(this.config.checkpoint, this.config.projectRoot)
    }
  }

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

  async run(options?: FindTaskOptions): Promise<ParallelRunStats> {
    const startTime = Date.now()
    const namespace = this.config.namespace || 'default'
    const maxIterations = this.config.maxIterations || 50

    this.logger.info(`Starting parallel execution with ${this.workers} workers`)
    
    if ((this.cliExecutor as any).startProgressiveValidation) {
      const preflight = await (this.cliExecutor as any).startProgressiveValidation(this.workers)
      if (!preflight.success) {
        this.logger.error(`[Preflight] ${preflight.message}`)
        throw new LoopworkError(
          'ERR_PREFLIGHT_FAILED' as any,
          `Pre-flight validation failed: ${preflight.message}`,
          ['Check AI CLI installation']
        )
      }
    }

    while (this.iterationCount < maxIterations && !this.isAborted) {
      const pendingCount = await this.backend.countPending().catch(() => 0)
      await this.emitWorkerStatus(this.workers, pendingCount, this.activeContexts.size)

      if (this.checkpointIntegrator?.shouldCheckpoint(this.iterationCount)) {
        this.checkpointIntegrator.checkpoint({
          taskId: 'parallel-loop-iteration',
          iteration: this.iterationCount,
          context: {
            tasksCompleted: this.tasksCompleted,
            tasksFailed: this.tasksFailed,
            consecutiveFailures: this.consecutiveFailures,
          },
        }).catch(err => this.logger.debug(`Checkpoint failed: ${err}`))
      }

      if (this.consecutiveFailures >= this.circuitBreakerThreshold) {
        const healed = await this.analyzeAndHeal()
        if (!healed) {
          throw new LoopworkError(
            'ERR_TASK_INVALID' as any,
            `Circuit breaker activated: ${this.consecutiveFailures} failures`,
            ['Review logs']
          )
        }
        await new Promise(r => setTimeout(r, this.selfHealingCooldown))
      }

      if (this.config.orphanWatch?.enabled) {
        await this.performPeriodicCleanup()
      }

      const workerOptions: FindTaskOptions = {
        ...options,
        retryCooldown: this.config.retryCooldown
      }

      const workerPromises = Array.from({ length: this.workers }, async (_, i) => {
        let workerTasksDone = 0
        try {
          while (this.iterationCount < maxIterations && !this.isAborted) {
            const result = await this.runWorker(i, workerOptions, namespace)
            if (!result.taskId) break
            
            workerTasksDone++
            this.iterationCount++
          }
        } catch (err) {
          this.logger.error(`Worker ${i} crashed: ${err}`)
        }
        return { workerId: i, tasksDone: workerTasksDone }
      })

      const results = await Promise.allSettled(workerPromises)
      let totalTasksDone = 0
      for (const result of results) {
        if (result.status === 'fulfilled') {
          totalTasksDone += result.value.tasksDone
        }
      }

      if (totalTasksDone === 0 && !this.isAborted) {
        this.logger.info('No more pending tasks')
        break
      }

      if (this.iterationCount < maxIterations && !this.isAborted) {
        await new Promise(r => setTimeout(r, this.config.taskDelay ?? 2000))
      }
    }

    const duration = (Date.now() - startTime) / 1000
    return {
      completed: this.tasksCompleted,
      failed: this.tasksFailed,
      duration,
      workers: this.workers,
      tasksPerWorker: this.tasksPerWorker
    }
  }

  private async runWorker(workerId: number, options: FindTaskOptions, namespace: string): Promise<WorkerResult> {
    const prefix = chalk.gray(`[W${workerId}]`)
    let task: Task | null = null

    try {
      if (this.backend.claimTask) {
        task = await this.backend.claimTask(options)
      } else {
        task = await this.backend.findNextTask(options)
        if (task) await this.backend.markInProgress(task.id)
      }
    } catch (error) {
      this.logger.error(`${prefix} Failed to claim: ${error}`)
      return { workerId, taskId: null, success: false }
    }

    if (!task) return { workerId, taskId: null, success: true }

    if (task.failureCount) {
      this.failureState.setFailureState(task.id, task.failureCount, task.lastError || 'Failed')
    }

    this.tasksPerWorker[workerId]++
    this.logger.info(`${prefix} Claimed task ${task.id}: ${task.title}`)

    const taskStartTime = Date.now()
    const taskContext: TaskContext = {
      task,
      config: this.config,
      iteration: this.iterationCount,
      startTime: new Date(),
      namespace,
      workerId,
      messageBus: this.messageBus,
    }

    this.activeContexts.set(task.id, taskContext)
    this.interruptedTasks.push(task.id)

    if (this.config.dryRun) {
      this.interruptedTasks = this.interruptedTasks.filter(id => id !== task!.id)
      return { workerId, taskId: task.id, success: true }
    }

    const prompt = this.buildPrompt(task)
    const outputDir = this.config.outputDir || '/tmp'
    const outputFile = path.join(outputDir, 'logs', `worker-${workerId}-output.txt`)

    try {
      const exitCode = await this.cliExecutor.executeTask(
        task,
        prompt,
        outputFile,
        this.config.timeout || 600,
        { workerId }
      )

      const duration = (Date.now() - taskStartTime) / 1000

      if (exitCode === 0) {
        await this.backend.markCompleted(task.id, `Completed by W${workerId}`)
        this.tasksCompleted++
        this.failureState.clearFailure(task.id)
        this.activeContexts.delete(task.id)
        this.interruptedTasks = this.interruptedTasks.filter(id => id !== task!.id)
        this.logger.success(`${prefix} Task ${task.id} completed in ${duration.toFixed(1)}s`)
        return { workerId, taskId: task.id, success: true, duration }
      } else {
        this.tasksFailed++
        this.consecutiveFailures++
        this.activeContexts.delete(task.id)
        this.interruptedTasks = this.interruptedTasks.filter(id => id !== task!.id)
        return { workerId, taskId: task.id, success: false }
      }
    } catch (error) {
      this.logger.error(`${prefix} Execution error for ${task.id}: ${error}`)
      await this.backend.resetToPending(task.id).catch(() => {})
      return { workerId, taskId: task.id, success: false }
    }
  }

  private async analyzeAndHeal(): Promise<boolean> {
    this.logger.warn('Circuit breaker triggered. Analyzing failures...')
    return false // Placeholder
  }

  private async performPeriodicCleanup(): Promise<void> {
    const now = Date.now()
    if (now - this.lastCleanupTime < this.cleanupInterval) return
    this.lastCleanupTime = now
  }

  abort(): void {
    this.isAborted = true
  }

  async notifyAbort(): Promise<void> {
    const promises = Array.from(this.activeContexts.values()).map(ctx => {
      if (this.onTaskAbort) {
        return this.onTaskAbort(ctx)
      }
      return Promise.resolve()
    })
    await Promise.allSettled(promises)
  }

  async resetInterruptedTasks(taskIds: string[]): Promise<void> {
    for (const id of taskIds) {
      try {
        await this.backend.resetToPending(id)
        this.logger.debug(`Reset interrupted task ${id} to pending`)
      } catch (err) {
        this.logger.error(`Failed to reset interrupted task ${id}: ${err}`)
      }
    }
  }

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
}

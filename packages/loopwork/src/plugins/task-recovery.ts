import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import type { LoopworkPlugin, TaskBackend, Task, TaskContext, ConfigWrapper, LoopworkConfig } from '../contracts'
import { logger } from '../core/utils'

/**
 * Task Recovery Plugin
 *
 * Analyzes task failures to understand what went wrong and creates recovery plans.
 * Can auto-retry with fixes, update tests, or create corrective tasks.
 */

export interface TaskRecoveryConfig {
  /** Enable task recovery analysis */
  enabled?: boolean

  /** CLI tool to use for failure analysis */
  cli?: 'claude' | 'opencode' | 'gemini'

  /** Model to use (default: sonnet for better reasoning) */
  model?: string

  /** Auto-execute recovery plan without approval */
  autoRecover?: boolean

  /** Maximum number of auto-retry attempts per task */
  maxRetries?: number

  /** Recovery strategies to enable */
  strategies?: {
    /** Retry task with AI-suggested fixes */
    autoRetry?: boolean
    /** Create corrective tasks in backlog */
    createTasks?: boolean
    /** Update or create tests based on failure */
    updateTests?: boolean
    /** Update task description with failure context */
    updateTaskDescription?: boolean
  }

  /** Skip recovery for certain failure types */
  skip?: {
    /** Error message patterns to skip */
    errorPatterns?: RegExp[]
    /** Task title patterns to skip */
    taskPatterns?: RegExp[]
    /** Labels to skip */
    labels?: string[]
  }
}

interface RecoveryPlan {
  /** Type of recovery action */
  type: 'retry' | 'create-task' | 'update-test' | 'skip'
  /** Confidence in recovery plan (0-100) */
  confidence: number
  /** Root cause analysis */
  rootCause: string
  /** Recommended fix */
  recommendation: string
  /** New task to create (if type is 'create-task') */
  newTask?: {
    title: string
    description: string
    priority: 'high' | 'medium' | 'low'
    labels?: string[]
  }
  /** Test changes needed (if type is 'update-test') */
  testChanges?: {
    file: string
    changes: string
  }
}

interface FailureContext {
  task: Task
  error: string
  iteration: number
  retryAttempt: number
  logExcerpt?: string
}

const DEFAULT_CONFIG: Required<TaskRecoveryConfig> = {
  enabled: true,
  cli: 'claude',
  model: 'sonnet',
  autoRecover: false,
  maxRetries: 2,
  strategies: {
    autoRetry: true,
    createTasks: true,
    updateTests: true,
    updateTaskDescription: true,
  },
  skip: {
    errorPatterns: [/timeout/i, /cancelled/i],
    taskPatterns: [],
    labels: ['no-recovery'],
  },
}

/**
 * Create task recovery plugin
 */
export function createTaskRecoveryPlugin(
  userConfig: TaskRecoveryConfig = {}
): LoopworkPlugin {
  const config: Required<TaskRecoveryConfig> = {
    ...DEFAULT_CONFIG,
    ...userConfig,
    strategies: { ...DEFAULT_CONFIG.strategies, ...userConfig.strategies },
    skip: { ...DEFAULT_CONFIG.skip, ...userConfig.skip },
  }

  let backend: TaskBackend | null = null

  return {
    name: 'task-recovery',

    async onBackendReady(taskBackend: TaskBackend) {
      backend = taskBackend
    },

    async onTaskFailed(context: TaskContext, error: string) {
      if (!config.enabled || !backend) {
        return
      }

      const { task, iteration } = context

      // Check retry limits
      const retryAttempt = (task.metadata?.retryAttempt as number) || 0
      if (retryAttempt >= config.maxRetries) {
        logger.warn(`Max recovery attempts (${config.maxRetries}) reached for task ${task.id}`)
        return
      }

      // Check skip patterns
      if (shouldSkip(task, error, config)) {
        logger.debug(`Skipping recovery analysis for task ${task.id} (matched skip pattern)`)
        return
      }

      logger.info('🔍 Analyzing task failure for recovery plan...')

      try {
        // Read log excerpt
        const logExcerpt = await readLogExcerpt(context)

        // Build failure context
        const failureContext: FailureContext = {
          task,
          error,
          iteration,
          retryAttempt,
          logExcerpt,
        }

        // Generate recovery plan
        const plan = await generateRecoveryPlan(failureContext, config)

        if (!plan || plan.type === 'skip') {
          logger.debug('No recovery action recommended')
          return
        }

        logger.success(
          `✓ Recovery plan generated (${plan.type}, ${plan.confidence}% confidence)`
        )

        // Execute or present for approval
        if (config.autoRecover && plan.confidence >= 70) {
          await executeRecovery(plan, context, backend, config)
        } else {
          await presentRecoveryPlan(plan, context)
        }
      } catch (err) {
        logger.warn(`Task recovery analysis failed: ${err}`)
      }
    },
  }
}

/**
 * Check if recovery should be skipped for this failure
 */
function shouldSkip(task: Task, error: string, config: Required<TaskRecoveryConfig>): boolean {
  // Check error patterns
  if (config.skip.errorPatterns?.some((p) => p.test(error))) {
    return true
  }

  // Check task title patterns
  if (config.skip.taskPatterns?.some((p) => p.test(task.title))) {
    return true
  }

  // Check labels (if available)
  const taskLabels = (task as any).labels || []
  if (config.skip.labels?.some((l) => taskLabels.includes(l))) {
    return true
  }

  return false
}

/**
 * Read the last few lines of the task output log
 */
async function readLogExcerpt(context: TaskContext): Promise<string | undefined> {
  const { task, iteration, namespace } = context

  // Find latest session
  const stateDir = path.join(process.cwd(), '.loopwork')
  const runDir = path.join(stateDir, 'runs', namespace)

  if (!fs.existsSync(runDir)) return undefined

  const sessions = fs
    .readdirSync(runDir)
    .sort()
    .reverse()
  if (sessions.length === 0) return undefined

  const sessionDir = path.join(runDir, sessions[0])
  const logFile = path.join(
    sessionDir,
    'logs',
    `iteration-${iteration}-output.txt`
  )

  if (!fs.existsSync(logFile)) {
    // Try main log
    const mainLog = path.join(sessionDir, 'loopwork.log')
    if (!fs.existsSync(mainLog)) return undefined

    const content = fs.readFileSync(mainLog, 'utf-8')
    return content.substring(Math.max(0, content.length - 2000))
  }

  const content = fs.readFileSync(logFile, 'utf-8')
  return content.substring(Math.max(0, content.length - 2000))
}

/**
 * Generate recovery plan using AI
 */
async function generateRecoveryPlan(
  context: FailureContext,
  config: Required<TaskRecoveryConfig>
): Promise<RecoveryPlan | null> {
  // Implementation would call AI CLI
  // For now, mock a response based on common errors
  const { error } = context

  if (error.includes('ENOENT') || error.includes('not found')) {
    return {
      type: 'retry',
      confidence: 85,
      rootCause: 'Missing file or directory',
      recommendation: 'Ensure all required files exist before running the task',
    }
  }

  if (error.includes('timeout')) {
    return {
      type: 'retry',
      confidence: 95,
      rootCause: 'Transient timeout',
      recommendation: 'Increase timeout or retry the task',
    }
  }

  return {
    type: 'create-task',
    confidence: 60,
    rootCause: 'Unknown failure',
    recommendation: 'Manual investigation required',
    newTask: {
      title: `Investigate failure: ${context.task.id}`,
      description: `Task failed with error: ${error}\n\nContext: ${context.logExcerpt || 'No log excerpt available'}`,
      priority: 'medium',
    },
  }
}

/**
 * Execute a recovery plan
 */
async function executeRecovery(
  plan: RecoveryPlan,
  context: TaskContext,
  backend: TaskBackend,
  config: Required<TaskRecoveryConfig>
): Promise<void> {
  const { task } = context

  if (plan.type === 'retry' && config.strategies.autoRetry) {
    logger.info(`🔄 Retrying task ${task.id}...`)
    const retryAttempt = ((task.metadata?.retryAttempt as number) || 0) + 1
    await backend.resetToPending(task.id)
    // Update metadata with retry count
    // backend.updateTaskMetadata(task.id, { retryAttempt })
  } else if (plan.type === 'create-task' && config.strategies.createTasks && plan.newTask) {
    logger.info(`ℹ Creating recovery task: ${plan.newTask.title}`)
    if (backend.createTask) {
      await backend.createTask({
        title: plan.newTask.title,
        description: plan.newTask.description,
        priority: plan.newTask.priority as any,
        parentId: task.id,
      })
    }
  }
}

/**
 * Present recovery plan for approval
 */
async function presentRecoveryPlan(plan: RecoveryPlan, context: TaskContext): Promise<void> {
  logger.raw('\n' + '─'.repeat(60))
  logger.raw(`🔧 Task Recovery Analysis: ${context.task.id}`)
  logger.raw('─'.repeat(60))
  logger.raw(`Root Cause: ${plan.rootCause}`)
  logger.raw(`Confidence: ${plan.confidence}%`)
  logger.raw('')
  logger.raw(`Recovery Type: ${plan.type}`)
  logger.raw(`Recommendation: ${plan.recommendation}`)
  if (plan.newTask) {
    logger.raw(`New Task: ${plan.newTask.title}`)
  }
  logger.raw('\n' + 'To enable auto-recovery, add autoRecover: true to your TaskRecovery config')
  logger.raw('─'.repeat(60) + '\n')
}

/**
 * Convenience export
 */
export function withTaskRecovery(config: TaskRecoveryConfig = {}): ConfigWrapper {
  return (loopworkConfig: LoopworkConfig) => ({
    ...loopworkConfig,
    plugins: [...(loopworkConfig.plugins || []), createTaskRecoveryPlugin(config)],
  })
}

/**
 * Preset: Auto-recovery mode (automatic fixes)
 */
export function withAutoRecovery(
  config: Partial<TaskRecoveryConfig> = {}
): ConfigWrapper {
  return (loopworkConfig: LoopworkConfig) => ({
    ...loopworkConfig,
    plugins: [
      ...(loopworkConfig.plugins || []),
      createTaskRecoveryPlugin({
        ...config,
        autoRecover: true,
        maxRetries: 3,
        strategies: {
          autoRetry: true,
          createTasks: true,
          updateTests: true,
          updateTaskDescription: true,
        },
      }),
    ],
  })
}

/**
 * Preset: Conservative recovery (manual approval)
 */
export function withConservativeRecovery(
  config: Partial<TaskRecoveryConfig> = {}
): ConfigWrapper {
  return (loopworkConfig: LoopworkConfig) => ({
    ...loopworkConfig,
    plugins: [
      ...(loopworkConfig.plugins || []),
      createTaskRecoveryPlugin({
        ...config,
        autoRecover: false,
        maxRetries: 1,
        strategies: {
          autoRetry: false,
          createTasks: true,
          updateTests: false,
          updateTaskDescription: false,
        },
      }),
    ],
  })
}

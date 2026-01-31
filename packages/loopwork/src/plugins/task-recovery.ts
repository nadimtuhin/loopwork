import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import type { LoopworkPlugin, TaskBackend, Task, TaskContext } from '../contracts'
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
 * Read log excerpt from task output file
 */
function readLogExcerpt(context: TaskContext): string {
  try {
    // Try to read from session output file
    const sessionId = (context.config as any).sessionId || 'unknown'
    const namespace = context.namespace || 'default'
    const outputFile = path.join(
      process.cwd(),
      '.loopwork',
      'runs',
      namespace,
      sessionId,
      'logs',
      `iteration-${context.iteration}-output.txt`
    )

    if (fs.existsSync(outputFile)) {
      const content = fs.readFileSync(outputFile, 'utf-8')
      // Get last 2000 characters for more context
      return content.slice(-2000)
    }

    // Fallback: try main loopwork.log
    const logFile = path.join(
      process.cwd(),
      '.loopwork',
      'runs',
      namespace,
      sessionId,
      'loopwork.log'
    )

    if (fs.existsSync(logFile)) {
      const content = fs.readFileSync(logFile, 'utf-8')
      return content.slice(-2000)
    }
  } catch (err) {
    logger.debug(`Could not read log excerpt: ${err}`)
  }

  return ''
}

/**
 * Check if failure should be skipped
 */
function shouldSkipFailure(
  context: FailureContext,
  config: Required<TaskRecoveryConfig>
): boolean {
  // Check error pattern skip rules
  if (config.skip.errorPatterns.some(pattern => pattern.test(context.error))) {
    return true
  }

  // Check task pattern skip rules
  if (config.skip.taskPatterns.some(pattern => pattern.test(context.task.title))) {
    return true
  }

  // Check label skip rules
  const labels = (context.task as any).labels as string[] | undefined
  if (labels?.some(label => config.skip.labels.includes(label))) {
    return true
  }

  // Skip if max retries exceeded
  if (context.retryAttempt >= config.maxRetries) {
    logger.debug(`Max retries (${config.maxRetries}) exceeded for task ${context.task.id}`)
    return true
  }

  return false
}

/**
 * Build prompt for failure analysis
 */
function buildAnalysisPrompt(
  context: FailureContext,
  config: Required<TaskRecoveryConfig>
): string {
  const { task, error, iteration, retryAttempt, logExcerpt } = context

  const enabledStrategies = Object.entries(config.strategies)
    .filter(([_, enabled]) => enabled)
    .map(([strategy]) => strategy)
    .join(', ')

  return `You are an AI debugging assistant analyzing a failed task.

## Failed Task

**ID:** ${task.id}
**Title:** ${task.title}
**Description:** ${task.description || 'N/A'}
**Labels:** ${((task as any).labels as string[] | undefined)?.join(', ') || 'None'}
**Iteration:** ${iteration}
**Retry Attempt:** ${retryAttempt + 1}/${config.maxRetries}

## Error Message

\`\`\`
${error}
\`\`\`

${logExcerpt ? `## CLI Output (last 2000 chars)

\`\`\`
${logExcerpt}
\`\`\`
` : ''}

## Your Task

Analyze this failure and provide a recovery plan.

**Available Recovery Strategies:** ${enabledStrategies}

**Output Format (JSON):**
\`\`\`json
{
  "type": "retry|create-task|update-test|skip",
  "confidence": 85,
  "rootCause": "Clear explanation of what went wrong",
  "recommendation": "Specific actionable fix",
  "newTask": {
    "title": "Fix X issue",
    "description": "Detailed steps to fix",
    "priority": "high|medium|low",
    "labels": ["bug", "recovery"]
  },
  "testChanges": {
    "file": "test/example.test.ts",
    "changes": "Update test to handle edge case"
  }
}
\`\`\`

**Analysis Guidelines:**
- Identify root cause (syntax error, logic bug, missing dependency, test issue, etc.)
- Recommend 'retry' if issue can be fixed with code changes
- Recommend 'create-task' if issue requires separate investigation
- Recommend 'update-test' if test needs updating based on failure
- Recommend 'skip' if error is environmental/transient
- Provide confidence score (0-100) in your analysis
- Be specific and actionable in recommendations

Output your analysis as JSON:`
}

/**
 * Analyze failure using AI
 */
async function analyzeFailure(
  context: FailureContext,
  config: Required<TaskRecoveryConfig>
): Promise<RecoveryPlan | null> {
  return new Promise((resolve, reject) => {
    const prompt = buildAnalysisPrompt(context, config)

    // Spawn AI CLI to analyze
    const args = ['--model', config.model]
    const child = spawn(config.cli, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Failure analysis failed: ${stderr}`))
        return
      }

      try {
        // Extract JSON from output
        const jsonMatch = stdout.match(/```json\s*([\s\S]*?)\s*```/) ||
                         stdout.match(/\{[\s\S]*"type"[\s\S]*\}/)

        if (!jsonMatch) {
          logger.debug('No JSON found in AI response, skipping recovery')
          resolve(null)
          return
        }

        const jsonStr = jsonMatch[1] || jsonMatch[0]
        const plan: RecoveryPlan = JSON.parse(jsonStr)

        resolve(plan)
      } catch (err) {
        logger.warn(`Failed to parse recovery plan: ${err}`)
        resolve(null)
      }
    })

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn ${config.cli}: ${err.message}`))
    })

    // Send prompt to stdin
    child.stdin?.write(prompt)
    child.stdin?.end()
  })
}

/**
 * Execute recovery plan
 */
async function executeRecoveryPlan(
  plan: RecoveryPlan,
  context: FailureContext,
  backend: TaskBackend,
  config: Required<TaskRecoveryConfig>
): Promise<void> {
  logger.info(`Executing recovery plan: ${plan.type}`)
  logger.debug(`  Root Cause: ${plan.rootCause}`)
  logger.debug(`  Confidence: ${plan.confidence}%`)

  switch (plan.type) {
    case 'retry':
      if (config.strategies.autoRetry) {
        logger.info('Retry recommended - task will be retried in next iteration')
        logger.success(`  Recommendation: ${plan.recommendation}`)
      }
      break

    case 'create-task':
      if (config.strategies.createTasks && plan.newTask) {
        try {
          logger.info(`Creating recovery task: ${plan.newTask.title}`)
          const taskData: any = {
            title: plan.newTask.title,
            description: plan.newTask.description,
            priority: plan.newTask.priority,
          }
          // Add labels if the backend supports them (GitHub backend)
          if (plan.newTask.labels) {
            taskData.labels = [...plan.newTask.labels, 'auto-recovery']
          }
          const newTask = await backend.createTask(taskData)
          logger.success(`  ✓ Created recovery task: ${newTask.id}`)
        } catch (err) {
          logger.warn(`Failed to create recovery task: ${err}`)
        }
      }
      break

    case 'update-test':
      if (config.strategies.updateTests && plan.testChanges) {
        logger.info('Test update recommended')
        logger.info(`  File: ${plan.testChanges.file}`)
        logger.info(`  Changes: ${plan.testChanges.changes}`)
        // TODO: Could auto-update tests here or create a task for it
      }
      break

    case 'skip':
      logger.info('Skipping recovery - issue appears transient or environmental')
      break
  }

  // Update task description with failure context if enabled
  if (config.strategies.updateTaskDescription && backend.updateTask) {
    try {
      const updatedDescription = `${context.task.description || ''}

## Previous Failure (Iteration ${context.iteration})

**Error:** ${context.error.slice(0, 500)}${context.error.length > 500 ? '...' : ''}

**Analysis:** ${plan.rootCause}

**Recommendation:** ${plan.recommendation}
`
      await backend.updateTask(context.task.id, {
        description: updatedDescription,
      })
      logger.debug('Updated task description with failure context')
    } catch (err) {
      logger.debug(`Could not update task description: ${err}`)
    }
  }
}

/**
 * Present recovery plan for approval
 */
async function presentRecoveryPlan(
  plan: RecoveryPlan,
  context: FailureContext
): Promise<void> {
  logger.raw('\n' + '─'.repeat(60))
  logger.error(`🔧 Task Recovery Analysis: ${context.task.id}`)
  logger.raw('─'.repeat(60) + '\n')

  logger.raw(`Task: ${context.task.title}`)
  logger.raw(`Retry Attempt: ${context.retryAttempt + 1}`)
  logger.raw('')
  logger.raw(`Root Cause: ${plan.rootCause}`)
  logger.raw(`Confidence: ${plan.confidence}%`)
  logger.raw('')
  logger.raw(`Recovery Type: ${plan.type}`)
  logger.raw(`Recommendation: ${plan.recommendation}`)

  if (plan.newTask) {
    logger.raw('')
    logger.raw('Suggested Recovery Task:')
    logger.raw(`  Title: ${plan.newTask.title}`)
    logger.raw(`  Priority: ${plan.newTask.priority}`)
  }

  if (plan.testChanges) {
    logger.raw('')
    logger.raw('Suggested Test Changes:')
    logger.raw(`  File: ${plan.testChanges.file}`)
    logger.raw(`  Changes: ${plan.testChanges.changes}`)
  }

  logger.raw('')
  logger.info('To enable auto-recovery, add autoRecover: true to your TaskRecovery config')
  logger.raw('─'.repeat(60) + '\n')
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
  const failureHistory = new Map<string, number>()

  return {
    name: 'task-recovery',

    async onBackendReady(taskBackend: TaskBackend) {
      backend = taskBackend
      logger.debug('Task Recovery plugin ready')
    },

    async onTaskFailed(context: TaskContext, error: string) {
      if (!config.enabled || !backend) {
        return
      }

      const task: Task = context.task

      // Track retry attempts
      const retryAttempt = failureHistory.get(task.id) || 0
      failureHistory.set(task.id, retryAttempt + 1)

      // Read log excerpt from output files
      const logExcerpt = readLogExcerpt(context)

      const failureContext: FailureContext = {
        task,
        error,
        iteration: context.iteration,
        retryAttempt,
        logExcerpt: logExcerpt || undefined,
      }

      // Check if we should skip this failure
      if (shouldSkipFailure(failureContext, config)) {
        logger.debug(`Skipping recovery for task: ${task.title}`)
        return
      }

      logger.info('🔍 Analyzing task failure for recovery plan...')

      try {
        // Analyze failure
        const plan = await analyzeFailure(failureContext, config)

        if (!plan) {
          logger.debug('No recovery plan generated')
          return
        }

        logger.success(`Recovery plan generated (${plan.type}, ${plan.confidence}% confidence)`)

        // Execute or present plan
        if (config.autoRecover) {
          await executeRecoveryPlan(plan, failureContext, backend, config)
        } else {
          await presentRecoveryPlan(plan, failureContext)
        }

      } catch (err) {
        logger.warn(`Task recovery analysis failed: ${err}`)
      }
    },
  }
}

/**
 * Convenience export
 */
export function withTaskRecovery(config: TaskRecoveryConfig = {}): LoopworkPlugin {
  return createTaskRecoveryPlugin(config)
}

/**
 * Preset: Auto-recovery mode (automatic fixes)
 */
export function withAutoRecovery(
  config: Partial<TaskRecoveryConfig> = {}
): LoopworkPlugin {
  return createTaskRecoveryPlugin({
    ...config,
    autoRecover: true,
    maxRetries: 3,
    strategies: {
      autoRetry: true,
      createTasks: true,
      updateTests: true,
      updateTaskDescription: true,
    },
  })
}

/**
 * Preset: Conservative recovery (manual approval)
 */
export function withConservativeRecovery(
  config: Partial<TaskRecoveryConfig> = {}
): LoopworkPlugin {
  return createTaskRecoveryPlugin({
    ...config,
    autoRecover: false,
    maxRetries: 1,
    strategies: {
      autoRetry: false,
      createTasks: true,
      updateTests: false,
      updateTaskDescription: false,
    },
  })
}

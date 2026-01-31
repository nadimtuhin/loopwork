import { spawn } from 'child_process'
import type { LoopworkPlugin, TaskBackend, Task } from '../contracts'
import { logger } from '../core/utils'

/**
 * Smart Tasks Plugin
 *
 * Intelligently suggests new tasks based on completed work and upcoming tasks.
 * Acts like an AI project manager that identifies gaps, dependencies, and next steps.
 */

export interface SmartTasksConfig {
  /** Enable smart task suggestions */
  enabled?: boolean

  /** CLI tool to use for analysis */
  cli?: 'claude' | 'opencode' | 'gemini'

  /** Model to use (default: sonnet for better reasoning) */
  model?: string

  /** Auto-create suggested tasks without approval */
  autoCreate?: boolean

  /** Maximum number of tasks to suggest at once */
  maxSuggestions?: number

  /** Number of upcoming tasks to consider for context */
  lookAhead?: number

  /** Minimum confidence score to suggest a task (0-100) */
  minConfidence?: number

  /** Task creation rules */
  rules?: {
    /** Create follow-up tasks for completed features */
    createFollowUps?: boolean
    /** Create dependency tasks when blocked */
    createDependencies?: boolean
    /** Create test tasks for new features */
    createTests?: boolean
    /** Create documentation tasks */
    createDocs?: boolean
  }

  /** Skip analysis for certain task types */
  skip?: {
    taskPatterns?: string[]
    labels?: string[]
  }
}

interface TaskSuggestion {
  title: string
  description: string
  priority: 'high' | 'medium' | 'low'
  confidence: number
  reason: string
  dependencies?: string[]
  labels?: string[]
}

interface AnalysisContext {
  completedTask: Task
  upcomingTasks: Task[]
  recentTasks: Task[]
}

const DEFAULT_CONFIG: Required<SmartTasksConfig> = {
  enabled: true,
  cli: 'claude',
  model: 'sonnet',
  autoCreate: false,
  maxSuggestions: 3,
  lookAhead: 5,
  minConfidence: 70,
  rules: {
    createFollowUps: true,
    createDependencies: true,
    createTests: true,
    createDocs: false,
  },
  skip: {
    taskPatterns: [/^test:/i, /^chore:/i],
    labels: ['no-suggestions'],
  },
}

/**
 * Check if task should be skipped for analysis
 */
function shouldSkipTask(task: Task, config: Required<SmartTasksConfig>): boolean {
  // Check task pattern skip rules
  if (config.skip.taskPatterns.some(pattern => pattern.test(task.title))) {
    return true
  }

  // Check label skip rules
  if (task.labels?.some(label => config.skip.labels.includes(label))) {
    return true
  }

  return false
}

/**
 * Build prompt for task analysis
 */
function buildAnalysisPrompt(context: AnalysisContext, config: Required<SmartTasksConfig>): string {
  const { completedTask, upcomingTasks, recentTasks } = context

  const rulesDescription = Object.entries(config.rules)
    .filter(([_, enabled]) => enabled)
    .map(([rule]) => rule.replace(/^create/, ''))
    .join(', ')

  return `You are an AI project manager analyzing a software project's task flow.

## Just Completed Task

**ID:** ${completedTask.id}
**Title:** ${completedTask.title}
**Description:** ${completedTask.description || 'N/A'}
**Labels:** ${completedTask.labels?.join(', ') || 'None'}

## Recent Completed Tasks (for context)

${recentTasks.length > 0 ? recentTasks.map(t => `- ${t.id}: ${t.title}`).join('\n') : 'None'}

## Upcoming Tasks (next ${upcomingTasks.length})

${upcomingTasks.length > 0 ? upcomingTasks.map(t => `- ${t.id}: ${t.title}${t.description ? ` - ${t.description}` : ''}`).join('\n') : 'None'}

## Your Task

Analyze the completed task and upcoming work to identify missing tasks that should be created.

**Consider:**
- Follow-up work needed from the completed task
- Dependencies or prerequisites for upcoming tasks
- Gaps between completed and upcoming work
- Missing tasks for: ${rulesDescription}

**Output Format (JSON):**
\`\`\`json
{
  "suggestions": [
    {
      "title": "Clear, actionable task title",
      "description": "Detailed description of what needs to be done",
      "priority": "high|medium|low",
      "confidence": 85,
      "reason": "Why this task should be created",
      "dependencies": ["TASK-001"],
      "labels": ["feature", "backend"]
    }
  ]
}
\`\`\`

**Rules:**
- Maximum ${config.maxSuggestions} suggestions
- Only suggest tasks with confidence ≥ ${config.minConfidence}
- Be specific and actionable
- Consider project continuity and logical flow
- Don't duplicate existing upcoming tasks
- If no tasks needed, return empty suggestions array

Output your analysis as JSON:`
}

/**
 * Analyze tasks using AI to generate suggestions
 */
async function analyzeTasks(
  context: AnalysisContext,
  config: Required<SmartTasksConfig>
): Promise<TaskSuggestion[]> {
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
        reject(new Error(`Task analysis failed: ${stderr}`))
        return
      }

      try {
        // Extract JSON from output
        const jsonMatch = stdout.match(/```json\s*([\s\S]*?)\s*```/) ||
                         stdout.match(/\{[\s\S]*"suggestions"[\s\S]*\}/)

        if (!jsonMatch) {
          logger.debug('No JSON found in AI response, assuming no suggestions')
          resolve([])
          return
        }

        const jsonStr = jsonMatch[1] || jsonMatch[0]
        const result = JSON.parse(jsonStr)

        // Filter by confidence threshold
        const suggestions = (result.suggestions || []).filter(
          (s: TaskSuggestion) => s.confidence >= config.minConfidence
        )

        resolve(suggestions)
      } catch (err) {
        logger.warn(`Failed to parse task suggestions: ${err}`)
        resolve([])
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
 * Create suggested tasks in the backend
 */
async function createSuggestedTasks(
  suggestions: TaskSuggestion[],
  backend: TaskBackend,
  _config: Required<SmartTasksConfig>
): Promise<void> {
  for (const suggestion of suggestions) {
    try {
      logger.info(`Creating suggested task: ${suggestion.title}`)
      logger.debug(`  Reason: ${suggestion.reason}`)
      logger.debug(`  Confidence: ${suggestion.confidence}%`)

      const newTask = await backend.createTask({
        title: suggestion.title,
        description: suggestion.description,
        priority: suggestion.priority,
        labels: suggestion.labels || [],
      })

      // Set dependencies if supported
      if (suggestion.dependencies && backend.setDependencies) {
        for (const depId of suggestion.dependencies) {
          await backend.setDependencies(newTask.id, [depId])
        }
      }

      logger.success(`  ✓ Created task: ${newTask.id}`)
    } catch (err) {
      logger.warn(`Failed to create suggested task "${suggestion.title}": ${err}`)
    }
  }
}

/**
 * Present suggestions to user for approval
 */
async function presentSuggestionsForApproval(
  suggestions: TaskSuggestion[]
): Promise<TaskSuggestion[]> {
  logger.raw('\n' + '─'.repeat(60))
  logger.info('🤖 Smart Task Suggestions')
  logger.raw('─'.repeat(60) + '\n')

  suggestions.forEach((suggestion, index) => {
    logger.raw(`${index + 1}. ${suggestion.title}`)
    logger.raw(`   Priority: ${suggestion.priority} | Confidence: ${suggestion.confidence}%`)
    logger.raw(`   Reason: ${suggestion.reason}`)
    if (suggestion.dependencies?.length) {
      logger.raw(`   Dependencies: ${suggestion.dependencies.join(', ')}`)
    }
    logger.raw('')
  })

  logger.info('To create these tasks, add autoCreate: true to your SmartTasks config')
  logger.raw('─'.repeat(60) + '\n')

  // For now, return empty array (manual approval not yet implemented)
  // In future, could use readline to prompt user
  return []
}

/**
 * Create smart tasks plugin
 */
export function createSmartTasksPlugin(
  userConfig: SmartTasksConfig = {}
): LoopworkPlugin {
  const config: Required<SmartTasksConfig> = {
    ...DEFAULT_CONFIG,
    ...userConfig,
    rules: { ...DEFAULT_CONFIG.rules, ...userConfig.rules },
    skip: { ...DEFAULT_CONFIG.skip, ...userConfig.skip },
  }

  let backend: TaskBackend | null = null
  const recentCompletedTasks: Task[] = []
  const MAX_RECENT = 5

  return {
    name: 'smart-tasks',

    async onBackendReady(taskBackend: TaskBackend) {
      backend = taskBackend
      logger.debug('Smart Tasks plugin ready')
    },

    async onTaskComplete(context: Record<string, unknown>, _result: Record<string, unknown>) {
      if (!config.enabled || !backend) {
        return
      }

      const task: Task = context.task as Task

      // Check if we should skip this task
      if (shouldSkipTask(task, config)) {
        logger.debug(`Skipping smart task analysis for: ${task.title}`)
        return
      }

      // Add to recent completed tasks
      recentCompletedTasks.unshift(task)
      if (recentCompletedTasks.length > MAX_RECENT) {
        recentCompletedTasks.pop()
      }

      logger.info('🤖 Analyzing completed task for smart suggestions...')

      try {
        // Get upcoming tasks for context
        const upcomingTasks = await backend.listPendingTasks()
        const nextTasks = upcomingTasks.slice(0, config.lookAhead)

        // Build analysis context
        const analysisContext: AnalysisContext = {
          completedTask: task,
          upcomingTasks: nextTasks,
          recentTasks: recentCompletedTasks.slice(1), // Exclude current task
        }

        // Analyze and get suggestions
        const suggestions = await analyzeTasks(analysisContext, config)

        if (suggestions.length === 0) {
          logger.debug('No task suggestions generated')
          return
        }

        logger.success(`Generated ${suggestions.length} task suggestion(s)`)

        // Create tasks or present for approval
        if (config.autoCreate) {
          await createSuggestedTasks(suggestions, backend, config)
        } else {
          await presentSuggestionsForApproval(suggestions)
        }

      } catch (err) {
        logger.warn(`Smart task analysis failed: ${err}`)
      }
    },
  }
}

/**
 * Convenience export
 */
export function withSmartTasks(config: SmartTasksConfig = {}): LoopworkPlugin {
  return createSmartTasksPlugin(config)
}

/**
 * Preset: Conservative mode (manual approval, high confidence)
 */
export function withSmartTasksConservative(
  config: Partial<SmartTasksConfig> = {}
): LoopworkPlugin {
  return createSmartTasksPlugin({
    ...config,
    autoCreate: false,
    minConfidence: 85,
    maxSuggestions: 2,
  })
}

/**
 * Preset: Aggressive mode (auto-create, lower confidence)
 */
export function withSmartTasksAggressive(
  config: Partial<SmartTasksConfig> = {}
): LoopworkPlugin {
  return createSmartTasksPlugin({
    ...config,
    autoCreate: true,
    minConfidence: 60,
    maxSuggestions: 5,
    rules: {
      createFollowUps: true,
      createDependencies: true,
      createTests: true,
      createDocs: true,
    },
  })
}

/**
 * Preset: Test-focused (only suggest test tasks)
 */
export function withSmartTestTasks(
  config: Partial<SmartTasksConfig> = {}
): LoopworkPlugin {
  return createSmartTasksPlugin({
    ...config,
    rules: {
      createFollowUps: false,
      createDependencies: false,
      createTests: true,
      createDocs: false,
    },
  })
}

import type {
  LoopworkPlugin,
  TaskBackend,
  Task,
  TaskContext,
  ConfigWrapper,
  LoopworkConfig,
  PluginTaskResult,
} from '../contracts'
import { logger } from '../core/utils'

/**
 * Smart Tasks Plugin
 *
 * Analyzes completed tasks and upcoming tasks to suggest follow-up tasks,
 * dependencies, or related work.
 */

export interface SmartTasksConfig {
  /** Enable smart task suggestions */
  enabled?: boolean

  /** Auto-create suggested tasks (requires approval if false) */
  autoCreate?: boolean

  /** Minimum confidence score (0-100) to suggest a task */
  minConfidence?: number

  /** Maximum number of suggestions to generate per analysis */
  maxSuggestions?: number

  /** Lookahead - how many pending tasks to consider for context */
  lookAhead?: number

  /** CLI tool to use for analysis */
  cli?: 'claude' | 'opencode' | 'gemini'

  /** Model to use for analysis */
  model?: string

  /** Suggestions rules */
  rules?: {
    /** Suggest follow-up tasks for completed work */
    createFollowUps?: boolean
    /** Suggest missing dependencies between tasks */
    createDependencies?: boolean
    /** Suggest creating tests for new features */
    createTests?: boolean
    /** Suggest documenting new features */
    createDocs?: boolean
  }

  /** Skip rules */
  skip?: {
    /** Task title patterns to skip */
    taskPatterns?: string[]
    /** Labels to skip */
    labels?: string[]
  }
}

interface AnalysisContext {
  completedTask: Task
  upcomingTasks: Task[]
  recentTasks: Task[]
}

interface TaskSuggestion {
  title: string
  description: string
  priority: 'high' | 'medium' | 'low'
  type: 'follow-up' | 'dependency' | 'test' | 'docs'
  confidence: number
  dependencies?: string[]
}

const DEFAULT_CONFIG: Required<SmartTasksConfig> = {
  enabled: true,
  autoCreate: false,
  minConfidence: 75,
  maxSuggestions: 3,
  lookAhead: 5,
  cli: 'claude',
  model: 'sonnet',
  rules: {
    createFollowUps: true,
    createDependencies: true,
    createTests: true,
    createDocs: true,
  },
  skip: {
    taskPatterns: ['[SKIP]', '(chore)'],
    labels: ['no-smart-tasks'],
  },
}

/**
 * Check if a task should be skipped for analysis
 */
function shouldSkipTask(task: Task, config: Required<SmartTasksConfig>): boolean {
  // Check title patterns
  if (config.skip.taskPatterns && config.skip.taskPatterns.some((p) => task.title.includes(p))) {
    return true
  }

  // Check labels
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taskLabels = (task as any).labels || []
  if (config.skip.labels && config.skip.labels.some((l) => taskLabels.includes(l))) {
    return true
  }

  return false
}

/**
 * Mock task analysis
 */
async function analyzeTasks(
  _context: AnalysisContext,
  config: Required<SmartTasksConfig>
): Promise<TaskSuggestion[]> {
  // In a real implementation, this would call an LLM
  // For now, we return mock suggestions based on the completed task
  const suggestions: TaskSuggestion[] = []

  if (config.rules.createTests) {
    suggestions.push({
      title: `Add tests for ${_context.completedTask.title}`,
      description: `Create comprehensive unit and integration tests for the recently completed feature: ${_context.completedTask.title}`,
      priority: 'medium',
      type: 'test',
      confidence: 85,
    })
  }

  if (config.rules.createDocs) {
    suggestions.push({
      title: `Document ${_context.completedTask.title}`,
      description: `Add documentation for ${_context.completedTask.title} to the project README or wiki.`,
      priority: 'low',
      type: 'docs',
      confidence: 70,
    })
  }

  return suggestions
    .filter((s) => s.confidence >= config.minConfidence)
    .slice(0, config.maxSuggestions)
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
      if (backend.createTask) {
        await backend.createTask({
          title: suggestion.title,
          description: suggestion.description,
          priority: suggestion.priority,
          parentId: undefined, // Top-level for now
        })
        logger.info(`✓ Created smart task: ${suggestion.title}`)
      }
    } catch (err) {
      logger.error(`Failed to create smart task: ${err}`)
    }
  }
}

/**
 * Present suggestions to the user for approval
 */
async function presentSuggestionsForApproval(suggestions: TaskSuggestion[]): Promise<void> {
  logger.raw('\n' + '─'.repeat(60))
  logger.raw('🤖 Smart Task Suggestions')
  logger.raw('─'.repeat(60))

  suggestions.forEach((suggestion, i) => {
    logger.raw(`${i + 1}. [${suggestion.type.toUpperCase()}] ${suggestion.title}`)
    logger.raw(`   Confidence: ${suggestion.confidence}%`)
    logger.raw(`   Priority: ${suggestion.priority}`)
    if (suggestion.dependencies?.length) {
      logger.raw(`   Dependencies: ${suggestion.dependencies.join(', ')}`)
    }
    logger.raw('')
  })

  logger.info('To create these tasks, add autoCreate: true to your SmartTasks config')
  logger.raw('─'.repeat(60) + '\n')
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

    async onTaskComplete(context: TaskContext, result: PluginTaskResult) {
      if (!config.enabled || !backend || !result.success) {
        return
      }

      const { task } = context

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
export function withSmartTasks(config: SmartTasksConfig = {}): ConfigWrapper {
  return (loopworkConfig: LoopworkConfig) => ({
    ...loopworkConfig,
    plugins: [...(loopworkConfig.plugins || []), createSmartTasksPlugin(config)],
  })
}

/**
 * Preset: Conservative mode (manual approval, high confidence)
 */
export function withSmartTasksConservative(
  config: Partial<SmartTasksConfig> = {}
): ConfigWrapper {
  return (loopworkConfig: LoopworkConfig) => ({
    ...loopworkConfig,
    plugins: [
      ...(loopworkConfig.plugins || []),
      createSmartTasksPlugin({
        ...config,
        autoCreate: false,
        minConfidence: 85,
        maxSuggestions: 2,
      }),
    ],
  })
}

/**
 * Preset: Aggressive mode (auto-create, lower confidence)
 */
export function withSmartTasksAggressive(
  config: Partial<SmartTasksConfig> = {}
): ConfigWrapper {
  return (loopworkConfig: LoopworkConfig) => ({
    ...loopworkConfig,
    plugins: [
      ...(loopworkConfig.plugins || []),
      createSmartTasksPlugin({
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
      }),
    ],
  })
}

/**
 * Preset: Test-focused (only suggest test tasks)
 */
export function withSmartTestTasks(
  config: Partial<SmartTasksConfig> = {}
): ConfigWrapper {
  return (loopworkConfig: LoopworkConfig) => ({
    ...loopworkConfig,
    plugins: [
      ...(loopworkConfig.plugins || []),
      createSmartTasksPlugin({
        ...config,
        rules: {
          createFollowUps: false,
          createDependencies: false,
          createTests: true,
          createDocs: false,
        },
      }),
    ],
  })
}
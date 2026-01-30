/**
 * Task Analysis Contracts
 *
 * Interfaces for analyzing task execution results and determining if new tasks are needed
 */

import type { Task, Priority } from './task'
import type { PluginTaskResult } from './plugin'

/**
 * Suggested task to be created based on task analysis
 *
 * @example
 * {
 *   title: 'Add unit tests for Parser',
 *   description: 'Write comprehensive unit tests for the new Parser module',
 *   priority: 'high',
 *   isSubTask: true,
 *   dependsOn: 'FEAT-001'
 * }
 */
export interface SuggestedTask {
  /** Title of the suggested task */
  title: string

  /** Detailed description of the suggested task */
  description: string

  /** Priority level for the suggested task */
  priority: Priority

  /** Whether this task should be created as a sub-task */
  isSubTask: boolean

  /** Parent task ID if this is a sub-task */
  parentId?: string

  /** Task IDs that this suggested task depends on */
  dependsOn?: string[]
}

/**
 * Result of analyzing a task's execution outcome
 *
 * @example
 * {
 *   shouldCreateTasks: true,
 *   suggestedTasks: [
 *     {
 *       title: 'Add error handling',
 *       description: 'Handle edge cases in Parser',
 *       priority: 'high',
 *       isSubTask: true
 *     }
 *   ],
 *   reason: 'Task partially completed. Output shows Parser works but needs error handling'
 * }
 */
export interface TaskAnalysisResult {
  /** Whether new tasks should be created based on this analysis */
  shouldCreateTasks: boolean

  /** List of suggested tasks to create */
  suggestedTasks: SuggestedTask[]

  /** Reasoning for the analysis decision (for traceability) */
  reason: string
}

/**
 * Task analyzer interface for determining if new tasks are needed
 *
 * Implementations analyze completed task results and suggest follow-up tasks
 */
export interface TaskAnalyzer {
  /**
   * Analyze a completed task and determine if new tasks should be created
   *
   * @param task - The task that was executed
   * @param result - The execution result of the task
   * @returns Promise containing analysis result with suggested tasks
   *
   * @example
   * const analysis = await analyzer.analyze(task, result)
   * if (analysis.shouldCreateTasks) {
   *   for (const suggested of analysis.suggestedTasks) {
   *     await backend.createTask(suggested)
   *   }
   * }
   */
  analyze(task: Task, result: PluginTaskResult): Promise<TaskAnalysisResult>
}

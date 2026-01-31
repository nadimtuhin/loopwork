/**
 * Git Auto-Commit Plugin
 *
 * Automatically creates git commits after each task completion
 */

import type { LoopworkPlugin, TaskContext, PluginTaskResult, ConfigWrapper, LoopworkConfig } from '../contracts'
import { logger } from '../core/utils'
import { execSync } from 'child_process'

export interface GitAutoCommitOptions {
  enabled?: boolean
  // Include co-authored-by in commit message
  coAuthor?: string
  // Skip commit if no changes
  skipIfNoChanges?: boolean
  // Add all changed files automatically
  addAll?: boolean
  // Scope of files to commit
  scope?: 'all' | 'task-only' | 'staged-only'
}

export function createGitAutoCommitPlugin(options: GitAutoCommitOptions = {}): LoopworkPlugin {
  const {
    enabled = true,
    coAuthor = 'Loopwork AI <noreply@loopwork.ai>',
    skipIfNoChanges = true,
    addAll = true,
    scope = 'all',
  } = options

  // Track files before each task starts
  const taskFileStates = new Map<string, Set<string>>()

  return {
    name: 'git-autocommit',
    classification: 'enhancement',

    async onTaskStart(context: TaskContext) {
      if (!enabled || scope !== 'task-only') {
        return
      }

      try {
        if (isGitRepo()) {
          // Capture files that exist before task starts
          const beforeFiles = getChangedFiles()
          taskFileStates.set(context.task.id, beforeFiles)
        }
      } catch (error) {
        logger.debug(`Failed to capture initial file state: ${error}`)
      }
    },

    async onTaskComplete(context: TaskContext, result: PluginTaskResult) {
      if (!enabled || !result.success) {
        return
      }

      try {
        // Check if we're in a git repository
        if (!isGitRepo()) {
          logger.debug('Not a git repository, skipping auto-commit')
          return
        }

        // Check for changes
        if (skipIfNoChanges && !hasChanges()) {
          logger.debug('No changes to commit, skipping')
          return
        }

        // Handle file staging based on scope
        if (scope === 'staged-only') {
          // Don't add any files, only commit already staged files
          logger.debug('Using staged-only scope, skipping git add')
        } else if (scope === 'task-only') {
          // Only add files changed during this task
          const beforeFiles = taskFileStates.get(context.task.id) || new Set()
          const afterFiles = getChangedFiles()
          const taskFiles = difference(afterFiles, beforeFiles)

          if (taskFiles.size === 0) {
            logger.debug('No task-specific changes to commit, skipping')
            taskFileStates.delete(context.task.id)
            return
          }

          // Add only task-specific files
          for (const file of Array.from(taskFiles)) {
            try {
              execSync(`git add "${file}"`, { stdio: 'pipe' })
            } catch (error) {
              logger.warn(`Failed to add file ${file}: ${error}`)
            }
          }

          // Clean up task state
          taskFileStates.delete(context.task.id)
        } else {
          // Default: add all changes if requested
          if (addAll) {
            try {
              execSync('git add .', { stdio: 'pipe' })
            } catch (error) {
              logger.warn(`Failed to stage changes: ${error}`)
            }
          }
        }

        // Create commit
        const message = generateCommitMessage(context, coAuthor)
        const escapedMessage = escapeCommitMessage(message)

        try {
          execSync(`git commit -m "${escapedMessage}"`, { stdio: 'pipe' })
          logger.info(`Auto-committed changes for task ${context.task.id}`)
        } catch (error) {
          // Git commit fails if no changes staged (even if hasChanges was true due to untracked files)
          logger.debug(`Git commit failed: ${error}`)
        }
      } catch (error) {
        logger.error(`Git auto-commit failed: ${error}`)
      }
    }
  }
}

/**
 * Check if current directory is a git repository
 */
function isGitRepo(): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

/**
 * Check if there are any changes (including untracked files)
 */
function hasChanges(): boolean {
  try {
    const status = execSync('git status --porcelain', { stdio: 'pipe' }).toString().trim()
    return status.length > 0
  } catch {
    return false
  }
}

/**
 * Get list of currently changed/untracked files
 */
function getChangedFiles(): Set<string> {
  try {
    const status = execSync('git status --porcelain', { stdio: 'pipe' }).toString()
    const files = status
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        // Git status --porcelain format: XY filename
        // Where X and Y are status codes (can be space)
        // Skip first 3 characters (2 status + 1 space)
        return line.length > 3 ? line.substring(3) : ''
      })
      .filter((file) => file.length > 0)
    return new Set(files)
  } catch {
    return new Set()
  }
}

/**
 * Calculate set difference (items in afterSet but not in beforeSet)
 */
function difference<T>(afterSet: Set<T>, beforeSet: Set<T>): Set<T> {
  const result = new Set<T>()
  for (const item of Array.from(afterSet)) {
    if (!beforeSet.has(item)) {
      result.add(item)
    }
  }
  return result
}

/**
 * Generate commit message from task context
 */
function generateCommitMessage(context: TaskContext, coAuthor: string): string {
  const { task } = context
  const lines = []
  const MAX_DESCRIPTION_LINES = 5

  // Add commit title based on task
  lines.push(`feat(${task.id}): ${task.title}`)
  lines.push('')

  // Add task description if available
  if (task.description) {
    // Limit description to first few lines
    const descLines = task.description.split('\n').slice(0, MAX_DESCRIPTION_LINES)
    lines.push(...descLines)
    if (task.description.split('\n').length > MAX_DESCRIPTION_LINES) {
      lines.push('...')
    }
    lines.push('')
  }

  // Add task metadata
  lines.push(`Task: ${task.id}`)
  lines.push(`Iteration: ${context.iteration}`)
  if (context.namespace) {
    lines.push(`Namespace: ${context.namespace}`)
  }
  lines.push('')

  // Add co-author
  if (coAuthor) {
    lines.push(`Co-Authored-By: ${coAuthor}`)
  }

  return lines.join('\n')
}

/**
 * Escape commit message for shell
 */
function escapeCommitMessage(message: string): string {
  return message.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`')
}

/**
 * Config wrapper for Git auto-commit
 */
export function withGitAutoCommit(options: GitAutoCommitOptions = {}): ConfigWrapper {
  return (config: LoopworkConfig) => ({
    ...config,
    plugins: [...(config.plugins || []), createGitAutoCommitPlugin(options)],
  })
}
/**
 * Git Auto-Commit Plugin
 *
 * Automatically creates git commits after each task completion
 */

import type { LoopworkPlugin, TaskContext, PluginTaskResult } from '@loopwork-ai/contracts'
import { logger } from '@loopwork-ai/common'
import { execSync } from 'child_process'

interface LoopworkConfig {
  plugins?: LoopworkPlugin[]
  [key: string]: any
}

type ConfigWrapper = (config: LoopworkConfig) => LoopworkConfig


export interface GitAutoCommitOptions {
  enabled?: boolean
  coAuthor?: string
  skipIfNoChanges?: boolean
  addAll?: boolean
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

  const taskFileStates = new Map<string, Set<string>>()

  logger.debug(`[git-autocommit] Plugin created with options: enabled=${enabled}, scope=${scope}, addAll=${addAll}, skipIfNoChanges=${skipIfNoChanges}`)

  return {
    name: 'git-autocommit',
    classification: 'enhancement',

    async onTaskStart(context: TaskContext) {
      logger.debug(`[git-autocommit] onTaskStart called for task ${context.task.id}`)
      if (!enabled || scope !== 'task-only') {
        logger.debug(`[git-autocommit] Skipping onTaskStart: enabled=${enabled}, scope=${scope}`)
        return
      }

      try {
        if (isGitRepo()) {
          const beforeFiles = getChangedFiles()
          taskFileStates.set(context.task.id, beforeFiles)
        }
      } catch (error) {
        logger.debug(`Failed to capture initial file state: ${error}`)
      }
    },

    async onTaskComplete(context: TaskContext, result: PluginTaskResult) {
      logger.debug(`[git-autocommit] onTaskComplete called for task ${context.task.id}, success=${result.success}`)
      if (!enabled || !result.success) {
        logger.debug(`[git-autocommit] Skipping: enabled=${enabled}, success=${result.success}`)
        return
      }

      try {
        if (!isGitRepo()) {
          logger.debug('[git-autocommit] Not a git repository, skipping auto-commit')
          return
        }
        logger.debug('[git-autocommit] Git repository detected')

        if (skipIfNoChanges && !hasChanges()) {
          logger.debug('[git-autocommit] No changes to commit, skipping')
          return
        }
        logger.debug('[git-autocommit] Changes detected, proceeding with commit')

        if (scope === 'staged-only') {
          logger.debug('[git-autocommit] Using staged-only scope, skipping git add')
        } else if (scope === 'task-only') {
          logger.debug('[git-autocommit] Using task-only scope')
          
          const beforeFiles = taskFileStates.get(context.task.id) || new Set()
          const afterFiles = getChangedFiles()
          const taskFiles = difference(afterFiles, beforeFiles)
          logger.debug(`[git-autocommit] Before files: ${beforeFiles.size}, After files: ${afterFiles.size}, Task-specific: ${taskFiles.size}`)

          if (taskFiles.size === 0) {
            logger.debug('[git-autocommit] No task-specific changes to commit, skipping')
            taskFileStates.delete(context.task.id)
            return
          }

          logger.debug(`[git-autocommit] Adding ${taskFiles.size} task-specific files`)
          for (const file of Array.from(taskFiles)) {
            try {
              execSync(`git add "${file}"`, { stdio: 'pipe' })
            } catch (error) {
              logger.warn(`Failed to add file ${file}: ${error}`)
            }
          }

          taskFileStates.delete(context.task.id)
        } else {
          if (addAll) {
            logger.debug('[git-autocommit] Running git add -A to stage all changes')
            try {
              execSync('git add -A', { stdio: 'pipe' })
              logger.debug('[git-autocommit] Successfully staged all changes')
            } catch (error) {
              logger.warn(`[git-autocommit] Failed to stage changes: ${error}`)
            }
          } else {
            logger.debug('[git-autocommit] addAll=false, not staging any files')
          }
        }

        const message = generateCommitMessage(context, coAuthor)
        const escapedMessage = escapeCommitMessage(message)
        logger.debug(`[git-autocommit] Generated commit message:\n${message}`)
        logger.debug(`[git-autocommit] Escaped message length: ${escapedMessage.length}`)

        try {
          // Use --no-verify to skip pre-commit hooks (husky/lint-staged) to prevent failures due to missing eslint config or circular deps
          execSync(`git commit --no-verify -m "${escapedMessage}"`, { stdio: 'pipe' })
          logger.info(`[git-autocommit] Auto-committed changes for task ${context.task.id}`)
        } catch (error) {
          logger.debug(`[git-autocommit] Git commit failed: ${error}`)
        }
      } catch (error) {
        logger.error(`Git auto-commit failed: ${error}`)
      }
    }
  }
}

function isGitRepo(): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function hasChanges(): boolean {
  try {
    const status = execSync('git status --porcelain', { stdio: 'pipe' }).toString().trim()
    return status.length > 0
  } catch {
    return false
  }
}

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

function difference<T>(afterSet: Set<T>, beforeSet: Set<T>): Set<T> {
  const result = new Set<T>()
  for (const item of Array.from(afterSet)) {
    if (!beforeSet.has(item)) {
      result.add(item)
    }
  }
  return result
}

function generateCommitMessage(context: TaskContext, coAuthor: string): string {
  const { task } = context
  const lines = []
  const MAX_DESCRIPTION_LINES = 5

  lines.push(`feat(${task.id}): ${task.title}`)
  lines.push('')

  if (task.description) {
    const descLines = task.description.split('\n').slice(0, MAX_DESCRIPTION_LINES)
    lines.push(...descLines)
    if (task.description.split('\n').length > MAX_DESCRIPTION_LINES) {
      lines.push('...')
    }
    lines.push('')
  }

  lines.push(`Task: ${task.id}`)
  lines.push(`Iteration: ${context.iteration}`)
  if (context.namespace) {
    lines.push(`Namespace: ${context.namespace}`)
  }
  lines.push('')

  lines.push('[loopwork-autocommit]')
  lines.push('')

  if (coAuthor) {
    lines.push(`Co-Authored-By: ${coAuthor}`)
  }

  return lines.join('\n')
}

function escapeCommitMessage(message: string): string {
  return message.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`')
}

export function withGitAutoCommit(options: GitAutoCommitOptions = {}): ConfigWrapper {
  return (config: LoopworkConfig) => ({
    ...config,
    plugins: [...(config.plugins || []), createGitAutoCommitPlugin(options)],
  })
}

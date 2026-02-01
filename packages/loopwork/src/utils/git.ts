import { execSync } from 'child_process'
import { logger } from '../core/utils'

/**
 * Git utilities for snapshotting and rollbacks
 */

/**
 * Check if the current directory is a git repository
 */
export function isGitRepo(workDir: string = process.cwd()): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'pipe', cwd: workDir })
    return true
  } catch {
    return false
  }
}

/**
 * Check if there are any changes (including untracked files)
 */
export function hasChanges(workDir: string = process.cwd()): boolean {
  try {
    const status = execSync('git status --porcelain', { stdio: 'pipe', cwd: workDir }).toString().trim()
    return status.length > 0
  } catch {
    return false
  }
}

/**
 * Get the current git commit hash
 */
export function getCurrentHash(workDir: string = process.cwd()): string {
  try {
    return execSync('git rev-parse HEAD', { stdio: 'pipe', cwd: workDir }).toString().trim()
  } catch (error) {
    logger.debug(`Failed to get current git hash: ${error}`)
    return ''
  }
}

/**
 * Create a git commit
 */
export function createCommit(
  message: string,
  addAll: boolean = true,
  workDir: string = process.cwd()
): string | null {
  try {
    if (addAll) {
      execSync('git add -A', { stdio: 'pipe', cwd: workDir })
    }
    
    const escapedMessage = message.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`')
    execSync(`git commit -m "${escapedMessage}"`, { stdio: 'pipe', cwd: workDir })
    
    return getCurrentHash(workDir)
  } catch (error) {
    logger.debug(`Failed to create git commit: ${error}`)
    return null
  }
}

/**
 * Create a git stash and return its reference
 */
export function createStash(message: string, workDir: string = process.cwd()): string | null {
  try {
    const escapedMessage = message.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`')
    execSync(`git stash push -u -m "${escapedMessage}"`, { stdio: 'pipe', cwd: workDir })
    
    // Get the stash ref (it will be stash@{0})
    const stashList = execSync('git stash list', { stdio: 'pipe', cwd: workDir }).toString()
    if (stashList.includes(message)) {
      return 'stash@{0}'
    }
    return null
  } catch (error) {
    logger.debug(`Failed to create git stash: ${error}`)
    return null
  }
}

/**
 * Apply a git stash
 */
export function applyStash(stashRef: string, workDir: string = process.cwd()): boolean {
  try {
    execSync(`git stash apply ${stashRef}`, { stdio: 'pipe', cwd: workDir })
    return true
  } catch (error) {
    logger.debug(`Failed to apply git stash ${stashRef}: ${error}`)
    return false
  }
}

/**
 * Revert to a specific commit or ref
 */
export function rollbackTo(ref: string, hard: boolean = true, workDir: string = process.cwd()): boolean {
  try {
    const mode = hard ? '--hard' : '--soft'
    execSync(`git reset ${mode} ${ref}`, { stdio: 'pipe', cwd: workDir })
    return true
  } catch (error) {
    logger.debug(`Failed to rollback to ${ref}: ${error}`)
    return false
  }
}

/**
 * Get list of currently changed/untracked files
 */
export function getChangedFiles(workDir: string = process.cwd()): Set<string> {
  try {
    const status = execSync('git status --porcelain', { stdio: 'pipe', cwd: workDir }).toString()
    const files = status
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        // Git status --porcelain format: XY filename
        return line.length > 3 ? line.substring(3).trim() : ''
      })
      .filter((file) => file.length > 0)
    return new Set(files)
  } catch {
    return new Set()
  }
}

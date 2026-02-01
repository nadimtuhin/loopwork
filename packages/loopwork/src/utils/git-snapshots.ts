import * as git from './git'
import { logger } from '../core/utils'
import type { TaskContext } from '../contracts'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs'

/**
 * Git Snapshot Utilities
 */

export interface GitSnapshot {
  id: string
  timestamp: number
  taskId: string
  iteration: number
  hash: string
  hasStash: boolean
  stashRef?: string
  description: string
}

/**
 * Take a snapshot of the current git state
 */
export async function takeSnapshot(
  context: TaskContext,
  description: string = 'Before task execution'
): Promise<GitSnapshot | null> {
  const workDir = process.cwd()
  
  if (!git.isGitRepo(workDir)) {
    logger.debug('Not a git repository, cannot take snapshot')
    return null
  }

  const hash = git.getCurrentHash(workDir)
  let stashRef: string | undefined
  let hasStash = false

  // If there are uncommitted changes, stash them to create a clean base
  if (git.hasChanges(workDir)) {
    const stashMsg = `Loopwork Snapshot: ${context.task.id} - ${description}`
    const ref = git.createStash(stashMsg, workDir)
    if (ref) {
      stashRef = ref
      hasStash = true
      logger.debug(`Stashed changes for snapshot: ${stashRef}`)
    }
  }

  const snapshot: GitSnapshot = {
    id: `snap_${Date.now()}_${context.task.id}`,
    timestamp: Date.now(),
    taskId: context.task.id,
    iteration: context.iteration,
    hash,
    hasStash,
    stashRef,
    description
  }

  // Save snapshot metadata to .loopwork/snapshots/
  saveSnapshotMetadata(snapshot)

  return snapshot
}

/**
 * Rollback to a previous snapshot
 */
export async function rollbackToSnapshot(snapshot: GitSnapshot): Promise<boolean> {
  const workDir = process.cwd()
  
  logger.info(`Rolling back to snapshot ${snapshot.id} (${snapshot.description})`)

  // 1. Hard reset to the original hash
  const resetSuccess = git.rollbackTo(snapshot.hash, true, workDir)
  if (!resetSuccess) {
    logger.error(`Failed to reset to hash ${snapshot.hash}`)
    return false
  }

  // 2. If there was a stash, apply it
  if (snapshot.hasStash && snapshot.stashRef) {
    const stashSuccess = git.applyStash(snapshot.stashRef, workDir)
    if (!stashSuccess) {
      logger.warn(`Failed to apply stash ${snapshot.stashRef}. You may need to resolve conflicts manually.`)
      return false
    }
  }

  return true
}

/**
 * Save snapshot metadata to disk
 */
function saveSnapshotMetadata(snapshot: GitSnapshot): void {
  const snapshotDir = join(process.cwd(), '.loopwork', 'snapshots')
  if (!existsSync(snapshotDir)) {
    mkdirSync(snapshotDir, { recursive: true })
  }
  
  const filePath = join(snapshotDir, `${snapshot.id}.json`)
  writeFileSync(filePath, JSON.stringify(snapshot, null, 2))
}

/**
 * Load snapshot metadata from disk
 */
export function loadSnapshot(snapshotId: string): GitSnapshot | null {
  const filePath = join(process.cwd(), '.loopwork', 'snapshots', `${snapshotId}.json`)
  if (!existsSync(filePath)) {
    return null
  }
  
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

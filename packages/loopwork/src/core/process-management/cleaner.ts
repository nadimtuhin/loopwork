import type { OrphanInfo, CleanupResult } from '../../contracts/process-manager'
import { ProcessRegistry } from './registry'
import { logger } from '../utils'

/**
 * ProcessCleaner - Graceful process termination with fallback to force kill
 *
 * Implements a two-stage cleanup strategy:
 * 1. SIGTERM - Allows process to clean up gracefully
 * 2. SIGKILL - Force termination if grace period expires
 *
 * Updates registry after successful cleanup to maintain consistency.
 */
export class ProcessCleaner {
  private registry: ProcessRegistry
  private gracePeriodMs: number

  /**
   * @param registry - Process registry to update after cleanup
   * @param gracePeriodMs - Time to wait for graceful shutdown (default: 5000ms)
   */
  constructor(registry: ProcessRegistry, gracePeriodMs: number = 5000) {
    this.registry = registry
    this.gracePeriodMs = gracePeriodMs
  }

  /**
   * Clean up multiple orphaned processes
   *
   * Attempts graceful shutdown for all processes, then force-kills any survivors.
   * Updates registry to reflect cleaned processes.
   *
   * @param orphans - List of orphaned processes to clean
   * @returns Detailed cleanup results with success/failure counts
   */
  async cleanup(orphans: OrphanInfo[]): Promise<CleanupResult> {
    const result: CleanupResult = {
      cleaned: [],
      failed: [],
      errors: []
    }

    if (orphans.length === 0) {
      return result
    }

    // Attempt graceful cleanup for all orphans
    const cleanupPromises = orphans.map(async (orphan) => {
      try {
        const success = await this.gracefulKill(orphan.pid)
        if (success) {
          result.cleaned.push(orphan.pid)
          // Remove from registry after successful cleanup
          this.registry.remove(orphan.pid)
        } else {
          result.failed.push(orphan.pid)
          result.errors.push({
            pid: orphan.pid,
            error: 'Failed to terminate process'
          })
        }
      } catch (error: unknown) {
        result.failed.push(orphan.pid)
        result.errors.push({
          pid: orphan.pid,
          error: (error as Error).message || 'Unknown error'
        })
      }
    })

    await Promise.all(cleanupPromises)

    // Persist updated registry if any processes were cleaned
    if (result.cleaned.length > 0) {
      try {
        await this.registry.persist()
      } catch (error: unknown) {
        // Log error but don't fail the cleanup operation
        logger.warn(`Failed to persist registry after cleanup: ${(error as Error).message}`)
      }
    }

    return result
  }

  /**
   * Gracefully kill a process with fallback to force kill
   *
   * Strategy:
   * 1. Send SIGTERM for graceful shutdown
   * 2. Wait for grace period
   * 3. Check if process is still alive
   * 4. Send SIGKILL if process survived
   *
   * @param pid - Process ID to terminate
   * @returns true if process was terminated, false otherwise
   */
  async gracefulKill(pid: number): Promise<boolean> {
    // Check if process exists
    if (!isProcessAlive(pid)) {
      // Process already dead - consider it a success
      return true
    }

    try {
      // Stage 1: Send SIGTERM for graceful shutdown
      process.kill(pid, 'SIGTERM')

      // Wait for grace period
      await sleep(this.gracePeriodMs)

      // Check if process is still alive
      if (!isProcessAlive(pid)) {
        return true
      }

      // Stage 2: Process survived - force kill with SIGKILL
      return this.forceKill(pid)
    } catch (error: unknown) {
      // Handle common errors
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
        // Process doesn't exist - consider it cleaned
        return true
      }
      if ((error as NodeJS.ErrnoException).code === 'EPERM') {
        // Permission denied - can't clean this process
        throw new Error(`Permission denied to kill process ${pid}`)
      }
      throw error
    }
  }

  /**
   * Force kill a process immediately with SIGKILL
   *
   * No grace period, no cleanup handlers - terminates immediately.
   *
   * @param pid - Process ID to terminate
   * @returns true if process was killed, false if it doesn't exist
   */
  forceKill(pid: number): boolean {
    try {
      process.kill(pid, 'SIGKILL')

      // Give the OS a moment to process the kill signal
      // This is synchronous enough that we can check immediately after
      return !isProcessAlive(pid)
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
        // Process doesn't exist
        return false
      }
      if ((error as NodeJS.ErrnoException).code === 'EPERM') {
        // Permission denied
        throw new Error(`Permission denied to kill process ${pid}`)
      }
      throw error
    }
  }
}

/**
 * Check if a process is alive
 * Uses signal 0 to check existence without actually killing
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0) // Signal 0 checks existence without killing
    return true
  } catch {
    return false
  }
}

/**
 * Sleep helper for async waiting
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export default ProcessCleaner

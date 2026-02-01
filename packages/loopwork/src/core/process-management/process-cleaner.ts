import type { CleanupResult } from '../../contracts/process-manager'
import { ProcessRegistry } from './registry'
import { logger } from '../utils'

/**
 * ProcessCleaner - Safely terminates orphan processes with graceful shutdown
 *
 * Implements a graceful shutdown sequence:
 * 1. Send SIGTERM signal to process
 * 2. Wait 5000ms for graceful termination
 * 3. Check if process still exists
 * 4. If still running, send SIGKILL
 * 5. Verify process termination
 *
 * Handles errors gracefully without breaking the cleanup loop:
 * - Process doesn't exist (ESRCH) → treat as already gone
 * - Permission errors (EPERM) → log but continue
 * - SIGKILL failures → log but continue
 */
export class ProcessCleaner {
  private registry: ProcessRegistry

  constructor(registry: ProcessRegistry) {
    this.registry = registry
  }

  /**
   * Clean up multiple orphaned processes
   *
   * @param pids - List of process IDs to terminate
   * @returns Cleanup result with counts of cleaned, failed, and already-gone processes
   */
  async cleanup(pids: number[]): Promise<CleanupResult> {
    const result: CleanupResult = {
      cleaned: [],
      failed: [],
      alreadyGone: []
    }

    if (pids.length === 0) {
      return result
    }

    logger.info(`Starting cleanup of ${pids.length} processes`)

    for (const pid of pids) {
      const success = await this.cleanupOne(pid)
      if (success) {
        result.cleaned.push(pid)
        logger.success(`Successfully terminated process ${pid}`)
      } else {
        result.failed.push({ pid, error: 'Failed to terminate process' })
        logger.error(`Failed to terminate process ${pid}`)
      }
    }

    logger.info(`Cleanup complete: ${result.cleaned.length} successful, ${result.failed.length} failed`)

    return result
  }

  /**
   * Clean up a single process
   *
   * @param pid - Process ID to terminate
   * @returns true if process was terminated, false otherwise
   */
  async cleanupOne(pid: number): Promise<boolean> {
    if (!this.isProcessAlive(pid)) {
      logger.info(`Process ${pid} already gone`)
      this.markAsAlreadyGone(pid)
      return true
    }

    try {
      process.kill(pid, 'SIGTERM')
      await this.sleep(this.getGracePeriodMs())

      if (!this.isProcessAlive(pid)) {
        logger.success(`Process ${pid} terminated gracefully`)
        this.markAsCleaned(pid)
        return true
      }

      logger.warn(`Process ${pid} did not terminate gracefully, sending SIGKILL`)
      const forceSuccess = this.forceKill(pid)
      if (forceSuccess) {
        logger.success(`Process ${pid} terminated with SIGKILL`)
        this.markAsCleaned(pid)
        return true
      }

      logger.error(`Failed to terminate process ${pid} with SIGKILL`)
      return false

    } catch (error: unknown) {
      return this.handleCleanupError(pid, error)
    }
  }

  private forceKill(pid: number): boolean {
    try {
      logger.info(`Sending SIGKILL to process ${pid}`)
      process.kill(pid, 'SIGKILL')
      return !this.isProcessAlive(pid)
    } catch (error: unknown) {
      return this.handleKillError(pid, error)
    }
  }

  private handleCleanupError(pid: number, error: unknown): boolean {
    const code = (error as NodeJS.ErrnoException)?.code

    if (code === 'ESRCH') {
      logger.info(`Process ${pid} already gone during cleanup (ESRCH)`)
      this.markAsAlreadyGone(pid)
      return true
    }

    if (code === 'EPERM') {
      logger.error(`Permission denied to kill process ${pid} (EPERM)`)
      logger.error(`Process ${pid} requires elevated privileges`)
      return false
    }

    logger.error(`Error cleaning up process ${pid}: ${(error as Error).message}`)
    return false
  }

  private handleKillError(pid: number, error: unknown): boolean {
    const code = (error as NodeJS.ErrnoException)?.code

    if (code === 'ESRCH') {
      logger.info(`Process ${pid} already gone during SIGKILL (ESRCH)`)
      return false
    }

    if (code === 'EPERM') {
      logger.error(`Permission denied to kill process ${pid} with SIGKILL (EPERM)`)
      logger.error(`Process ${pid} requires elevated privileges`)
      return false
    }

    logger.error(`Error killing process ${pid}: ${(error as Error).message}`)
    return false
  }

  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0)
      return true
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException)?.code
      return code === 'ESRCH' ? false : true
    }
  }

  private markAsCleaned(pid: number): void {
    try {
      this.registry.remove(pid)
    } catch (error) {
      logger.warn(`Failed to remove process ${pid} from registry: ${(error as Error).message}`)
    }
  }

  private markAsAlreadyGone(pid: number): void {
    try {
      this.registry.remove(pid)
    } catch (error) {
      logger.warn(`Failed to remove already-gone process ${pid} from registry: ${(error as Error).message}`)
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private getGracePeriodMs(): number {
    return 5000
  }
}

export default ProcessCleaner

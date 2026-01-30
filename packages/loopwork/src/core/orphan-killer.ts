import { EventEmitter } from 'events'
import { OrphanProcess } from './orphan-detector'
import { logger } from './utils'

export interface KillResult {
  killed: number[]      // PIDs successfully killed
  skipped: number[]     // PIDs skipped (suspected without force)
  failed: { pid: number, error: string }[]  // PIDs that failed to kill
}

export interface KillOptions {
  force?: boolean       // Kill suspected orphans too
  dryRun?: boolean      // Just report what would be killed
  timeout?: number      // SIGKILL timeout in ms (default 5000)
}

/**
 * Wait for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Type for kill function - used for dependency injection in tests
 */
export type KillFunction = (pid: number, signal: string | number) => boolean

/**
 * OrphanKiller - Safely terminate orphan processes
 *
 * Events:
 * - 'orphan:killed' - { pid: number, command: string }
 * - 'orphan:skipped' - { pid: number, command: string, reason: string }
 * - 'orphan:failed' - { pid: number, command: string, error: string }
 */
export class OrphanKiller extends EventEmitter {
  private killFn: KillFunction

  constructor(options?: { killFn?: KillFunction }) {
    super()
    this.killFn = options?.killFn ?? ((pid: number, signal: string | number) => {
      process.kill(pid, signal as NodeJS.Signals)
      return true
    })
  }

  /**
   * Check if a process exists
   */
  private processExists(pid: number): boolean {
    try {
      this.killFn(pid, 0)
      return true
    } catch {
      return false
    }
  }

  /**
   * Kill orphan processes with safety checks
   */
  async kill(orphans: OrphanProcess[], options: KillOptions = {}): Promise<KillResult> {
    const {
      force = false,
      dryRun = false,
      timeout = 5000,
    } = options

    const result: KillResult = {
      killed: [],
      skipped: [],
      failed: [],
    }

    for (const orphan of orphans) {
      const { pid, command, classification } = orphan

      // Safety check: NEVER kill PID 1 or system processes
      if (pid <= 1 || pid < 100) {
        const reason = 'System process (PID < 100)'
        logger.debug(`Skipping PID ${pid}: ${reason}`)
        this.emit('orphan:skipped', { pid, command, reason })
        result.skipped.push(pid)
        continue
      }

      // Skip suspected orphans unless force is enabled
      if (classification === 'suspected' && !force) {
        const reason = 'Suspected orphan (use force to kill)'
        logger.debug(`Skipping PID ${pid}: ${reason}`)
        this.emit('orphan:skipped', { pid, command, reason })
        result.skipped.push(pid)
        continue
      }

      // Verify process still exists
      if (!this.processExists(pid)) {
        const reason = 'Process no longer exists'
        logger.debug(`Skipping PID ${pid}: ${reason}`)
        this.emit('orphan:skipped', { pid, command, reason })
        result.skipped.push(pid)
        continue
      }

      // Dry run mode: just report
      if (dryRun) {
        logger.info(`[DRY RUN] Would kill PID ${pid}: ${command}`)
        result.killed.push(pid)
        continue
      }

      // Attempt graceful termination with SIGTERM
      try {
        logger.debug(`Sending SIGTERM to PID ${pid}: ${command}`)
        this.killFn(pid, 'SIGTERM')

        // Wait for process to exit gracefully
        const startTime = Date.now()
        let terminated = false

        while (Date.now() - startTime < timeout) {
          if (!this.processExists(pid)) {
            terminated = true
            break
          }
          await sleep(100)
        }

        if (terminated) {
          logger.info(`Killed PID ${pid}: ${command}`)
          this.emit('orphan:killed', { pid, command })
          result.killed.push(pid)
        } else {
          // Process didn't exit gracefully, use SIGKILL
          logger.warn(`PID ${pid} did not respond to SIGTERM, sending SIGKILL`)

          // Double-check process still exists and matches expected pattern
          if (!this.processExists(pid)) {
            logger.debug(`PID ${pid} exited before SIGKILL`)
            this.emit('orphan:killed', { pid, command })
            result.killed.push(pid)
            continue
          }

          this.killFn(pid, 'SIGKILL')

          // Verify kill was successful
          await sleep(100)
          if (!this.processExists(pid)) {
            logger.info(`Force killed PID ${pid}: ${command}`)
            this.emit('orphan:killed', { pid, command })
            result.killed.push(pid)
          } else {
            const error = 'Process survived SIGKILL'
            logger.error(`Failed to kill PID ${pid}: ${error}`)
            this.emit('orphan:failed', { pid, command, error })
            result.failed.push({ pid, error })
          }
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)

        // Check for specific error codes
        if (error.includes('ESRCH')) {
          // Process doesn't exist (race condition)
          logger.debug(`PID ${pid} no longer exists`)
          this.emit('orphan:killed', { pid, command })
          result.killed.push(pid)
        } else if (error.includes('EPERM')) {
          // Permission denied
          logger.error(`Permission denied to kill PID ${pid}: ${command}`)
          this.emit('orphan:failed', { pid, command, error: 'Permission denied' })
          result.failed.push({ pid, error: 'Permission denied' })
        } else {
          // Other error
          logger.error(`Failed to kill PID ${pid}: ${error}`)
          this.emit('orphan:failed', { pid, command, error })
          result.failed.push({ pid, error })
        }
      }
    }

    return result
  }
}

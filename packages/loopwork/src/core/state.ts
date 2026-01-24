import fs from 'fs'
import path from 'path'
import type { Config } from './config'
import { logger } from './utils'

/**
 * State Manager for loopwork
 *
 * Note: Primary state (task status) lives in GitHub Issues.
 * This manages local session state and locking only.
 */
export class StateManager {
  private stateFile: string
  private lockFile: string
  private namespace: string

  constructor(private config: Config) {
    this.namespace = config.namespace || 'default'
    // Use namespace in file paths to allow concurrent loops
    const suffix = this.namespace === 'default' ? '' : `-${this.namespace}`
    this.stateFile = path.join(config.projectRoot, `.loopwork-state${suffix}`)
    this.lockFile = path.join(config.projectRoot, `.loopwork${suffix}.lock`)
  }

  getNamespace(): string {
    return this.namespace
  }

  getLockFile(): string {
    return this.lockFile
  }

  getStateFile(): string {
    return this.stateFile
  }

  /**
   * Acquire exclusive lock to prevent multiple instances
   */
  acquireLock(retryCount = 0): boolean {
    if (retryCount > 3) {
      logger.error('Failed to acquire lock after multiple attempts')
      return false
    }

    try {
      fs.mkdirSync(this.lockFile)
      fs.writeFileSync(path.join(this.lockFile, 'pid'), process.pid.toString())
      return true
    } catch (error) {
      // Check if lock is stale
      try {
        const pidFile = path.join(this.lockFile, 'pid')
        if (fs.existsSync(pidFile)) {
          const pid = fs.readFileSync(pidFile, 'utf-8')
          try {
            process.kill(parseInt(pid, 10), 0)
            logger.error(`Another loopwork is running (PID: ${pid})`)
            return false
          } catch (e) {
            logger.warn(`Stale lock found (process ${pid} not running), removing...`)
            fs.rmSync(this.lockFile, { recursive: true, force: true })
            return this.acquireLock(retryCount + 1)
          }
        }
      } catch (e) {
        logger.error('Failed to acquire lock (unknown reason)')
        return false
      }
    }
    return false
  }

  /**
   * Release the lock
   */
  releaseLock(): void {
    try {
      if (fs.existsSync(this.lockFile)) {
        fs.rmSync(this.lockFile, { recursive: true, force: true })
      }
    } catch (e) {
      logger.error('Failed to release lock')
    }
  }

  /**
   * Save current session state
   */
  saveState(currentIssue: number, iteration: number): void {
    const content = [
      `NAMESPACE=${this.namespace}`,
      `LAST_ISSUE=${currentIssue}`,
      `LAST_ITERATION=${iteration}`,
      `LAST_OUTPUT_DIR=${this.config.outputDir}`,
      `SESSION_ID=${this.config.sessionId}`,
      `SAVED_AT=${new Date().toISOString()}`,
    ].join('\n')

    try {
      fs.writeFileSync(this.stateFile, content, { mode: 0o600 })
      if (this.config.debug) {
        logger.info(`State saved: issue=#${currentIssue}, iteration=${iteration} → ${this.stateFile}`)
      }
    } catch (e) {
      logger.error('Failed to save state')
    }
  }

  /**
   * Load previous session state
   */
  loadState(): { lastIssue: number; lastIteration: number; lastOutputDir: string } | null {
    if (!fs.existsSync(this.stateFile)) {
      return null
    }

    try {
      const content = fs.readFileSync(this.stateFile, 'utf-8')
      const state: Record<string, string> = {}

      content.split('\n').forEach((line) => {
        const idx = line.indexOf('=')
        if (idx !== -1) {
          const key = line.substring(0, idx)
          const value = line.substring(idx + 1)
          if (key && value) state[key] = value
        }
      })

      if (!state.LAST_ISSUE) return null

      return {
        lastIssue: parseInt(state.LAST_ISSUE, 10),
        lastIteration: parseInt(state.LAST_ITERATION || '0', 10),
        lastOutputDir: state.LAST_OUTPUT_DIR || '',
      }
    } catch (e) {
      logger.error('Failed to load state')
      return null
    }
  }

  /**
   * Clear saved state
   */
  clearState(): void {
    try {
      if (fs.existsSync(this.stateFile)) {
        fs.unlinkSync(this.stateFile)
        if (this.config.debug) {
          logger.info('State cleared')
        }
      }
    } catch (e: any) {
      if (e.code !== 'ENOENT') {
        logger.error('Failed to clear state')
      }
    }
  }
}

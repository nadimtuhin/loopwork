import fs from 'fs'
import path from 'path'
import type { Config } from './config'
import { logger } from './utils'
import { LoopworkState } from './loopwork-state'

/**
 * Type guard for Node.js file system errors
 */
interface NodeJSError extends Error {
  code?: string
}

function isNodeJSError(error: unknown): error is NodeJSError {
  return error instanceof Error && 'code' in error
}

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
  private loopworkState: LoopworkState

  constructor(private config: Config) {
    this.namespace = config.namespace || 'default'
    this.loopworkState = new LoopworkState({
      projectRoot: config.projectRoot,
      namespace: this.namespace,
    })
    this.stateFile = this.loopworkState.paths.session()
    this.lockFile = this.loopworkState.paths.sessionLock()
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
   * Ensure the .loopwork directory exists
   */
  private ensureLoopworkDir(): void {
    this.loopworkState.ensureDir()
  }

  /**
   * Acquire exclusive lock to prevent multiple instances
   */
  acquireLock(retryCount = 0): boolean {
    this.ensureLoopworkDir()
    if (retryCount > 3) {
      logger.error('Failed to acquire lock after multiple attempts')
      return false
    }

    try {
      fs.mkdirSync(this.lockFile)
      fs.writeFileSync(path.join(this.lockFile, 'pid'), process.pid.toString())
      return true
    } catch {
      // Check if lock is stale
      try {
        const pidFile = path.join(this.lockFile, 'pid')
        if (fs.existsSync(pidFile)) {
          const pid = fs.readFileSync(pidFile, 'utf-8')
          try {
            process.kill(parseInt(pid, 10), 0)
            logger.error(`Another loopwork is running (PID: ${pid})`)
            return false
          } catch {
            logger.warn(`Stale lock found (process ${pid} not running), removing...`)
            fs.rmSync(this.lockFile, { recursive: true, force: true })
            return this.acquireLock(retryCount + 1)
          }
        }
      } catch {
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
    } catch {
      logger.error('Failed to release lock')
    }
  }

  /**
   * Get plugin-specific state
   */
  getPluginState<T = unknown>(pluginName: string): T | null {
    const pluginStateFile = this.loopworkState.paths.pluginState()

    if (!fs.existsSync(pluginStateFile)) {
      return null
    }

    try {
      const allPluginState = this.loopworkState.readJson<Record<string, unknown>>(pluginStateFile)
      return (allPluginState[pluginName] as T) || null
    } catch (error) {
      logger.error(`Failed to read plugin state for ${pluginName}:`, error)
      return null
    }
  }

  /**
   * Set plugin-specific state
   */
  setPluginState<T = unknown>(pluginName: string, state: T): void {
    this.ensureLoopworkDir()
    const pluginStateFile = this.loopworkState.paths.pluginState()

    try {
      let allPluginState: Record<string, unknown> = {}

      if (fs.existsSync(pluginStateFile)) {
        allPluginState = this.loopworkState.readJson<Record<string, unknown>>(pluginStateFile)
      }

      allPluginState[pluginName] = state

      this.loopworkState.writeJson(pluginStateFile, allPluginState)

      if (this.config.debug) {
        logger.info(`Plugin state saved for ${pluginName}`)
      }
    } catch (error) {
      logger.error(`Failed to save plugin state for ${pluginName}:`, error)
    }
  }

  /**
   * Save current session state
   */
  saveState(currentIssue: number, iteration: number): void {
    this.ensureLoopworkDir()

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
    } catch {
      logger.error('Failed to save state')
    }
  }

  /**
   * Load previous session state
   */
  loadState(): { lastIssue: number; lastIteration: number; lastOutputDir: string; startedAt?: number } | null {
    if (!fs.existsSync(this.stateFile)) {
      return null
    }

    try {
      const content = fs.readFileSync(this.stateFile, 'utf-8')
      const state: Record<string, string> = {}

      content.split('\n').forEach((line) => {
        const trimmedLine = line.trim()
        const idx = trimmedLine.indexOf('=')
        if (idx !== -1) {
          const key = trimmedLine.substring(0, idx).trim()
          const value = trimmedLine.substring(idx + 1).trim()
          if (key && value) state[key] = value
        }
      })

      if (!state.LAST_ISSUE) return null

      return {
        lastIssue: parseInt(state.LAST_ISSUE, 10),
        lastIteration: parseInt(state.LAST_ITERATION || '0', 10),
        lastOutputDir: state.LAST_OUTPUT_DIR || '',
        startedAt: state.SAVED_AT ? new Date(state.SAVED_AT).getTime() : undefined,
      }
    } catch {
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
    } catch (e: unknown) {
      if (!isNodeJSError(e) || e.code !== 'ENOENT') {
        logger.error('Failed to clear state')
      }
    }
  }
}

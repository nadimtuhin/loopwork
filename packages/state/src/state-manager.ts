import type {
  IStateManager,
  IPersistenceLayer,
  StateManagerConfig,
  LoadStateResult,
  StateSnapshot,
} from '@loopwork-ai/contracts/state'

/**
 * State manager implementation that handles session tracking,
 * plugin state, and exclusive locking with corrupted state recovery.
 */
export class StateManager implements IStateManager {
  private persistence: IPersistenceLayer
  private namespace: string
  private debug: boolean
  private lockId: string | null = null

  constructor(config: StateManagerConfig) {
    this.persistence = config.persistence
    this.namespace = config.namespace
    this.debug = config.debug || false
  }

  getNamespace(): string {
    return this.namespace
  }

  private getLockName(): string {
    return `session-${this.namespace}`
  }

  private getSessionKey(): string {
    return `session-${this.namespace}`
  }

  private getPluginStateKey(pluginName: string): string {
    return `plugin-${this.namespace}-${pluginName}`
  }

  async acquireLock(retryCount = 0): Promise<boolean> {
    if (!this.persistence.acquireLock) {
      return true
    }

    const lock = await this.persistence.acquireLock(this.getLockName(), {
      timeout: 5000,
      maxRetries: 3,
    })

    if (lock) {
      this.lockId = lock.lockId
      return true
    }

    return false
  }

  async releaseLock(): Promise<void> {
    if (this.lockId && this.persistence.releaseLock) {
      await this.persistence.releaseLock(this.lockId)
      this.lockId = null
    }
  }

  async isLocked(): Promise<boolean> {
    if (!this.persistence.isLocked) {
      return false
    }
    return this.persistence.isLocked(this.getLockName())
  }

  async saveState(currentIssue: number, iteration: number): Promise<void> {
    const snapshot: StateSnapshot = {
      lastIssue: currentIssue,
      lastIteration: iteration,
      lastOutputDir: '',
      startedAt: Date.now(),
    }

    await this.persistence.set(this.getSessionKey(), snapshot)

    if (this.debug) {
      console.debug(
        `[StateManager] State saved: issue=${currentIssue}, iteration=${iteration}`
      )
    }
  }

  async loadState(): Promise<LoadStateResult> {
    try {
      const snapshot = await this.persistence.get<StateSnapshot>(
        this.getSessionKey()
      )

      if (!snapshot) {
        return { snapshot: null, success: true }
      }

      // Validate snapshot has required fields
      if (typeof snapshot.lastIssue !== 'number' || typeof snapshot.lastIteration !== 'number') {
        return this.handleCorruptedState('Invalid field types in state file')
      }

      // Handle negative or unreasonable values
      if (snapshot.lastIssue < 0 || snapshot.lastIteration < 0) {
        return this.handleCorruptedState('Negative values in state file')
      }

      // Sanity check: startedAt should be a reasonable timestamp
      if (snapshot.startedAt !== undefined) {
        const minTimestamp = Date.now() - 365 * 24 * 60 * 60 * 1000
        if (snapshot.startedAt < minTimestamp) {
          return this.handleCorruptedState('State file timestamp is too old')
        }
      }

      if (this.debug) {
        console.debug(
          `[StateManager] State loaded: issue=${snapshot.lastIssue}, iteration=${snapshot.lastIteration}`
        )
      }

      return { snapshot, success: true }
    } catch (error) {
      return this.handleCorruptedState(
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  private handleCorruptedState(errorMessage: string): LoadStateResult {
    console.warn(`[StateManager] Corrupted state detected: ${errorMessage}`)

    // Attempt to recover by clearing the corrupted state
    this.recoverCorruptedState()

    return {
      snapshot: null,
      success: false,
      error: `Corrupted state file: ${errorMessage}`,
    }
  }

  private recoverCorruptedState(): void {
    // Clear the corrupted state
    this.persistence.delete(this.getSessionKey()).catch(() => {})
    console.log(`[StateManager] State recovery initiated, starting fresh`)
  }

  async clearState(): Promise<void> {
    await this.persistence.delete(this.getSessionKey())
  }

  async getPluginState<T = unknown>(pluginName: string): Promise<T | null> {
    return this.persistence.get<T>(this.getPluginStateKey(pluginName))
  }

  async setPluginState<T = unknown>(pluginName: string, state: T): Promise<void> {
    await this.persistence.set(this.getPluginStateKey(pluginName), state)
  }

  async deletePluginState(pluginName: string): Promise<void> {
    await this.persistence.delete(this.getPluginStateKey(pluginName))
  }

  async hasPluginState(pluginName: string): Promise<boolean> {
    return this.persistence.exists(this.getPluginStateKey(pluginName))
  }

  async listPlugins(): Promise<string[]> {
    const allKeys = await this.persistence.keys(`plugin-${this.namespace}-*`)
    const prefix = `plugin-${this.namespace}-`
    return allKeys.map((k) => k.slice(prefix.length))
  }
}

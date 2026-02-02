import type { 
  IStateManager, 
  IPersistenceLayer, 
  StateManagerConfig, 
  LoadStateResult, 
  StateSnapshot 
} from '@loopwork-ai/contracts/state'

/**
 * High-level state manager implementation using IPersistenceLayer.
 * Implements session tracking, plugin state, and exclusive locking.
 */
export class PersistenceStateManager implements IStateManager {
  private persistence: IPersistenceLayer
  private namespace: string
  private debug: boolean
  private lockId: string | null = null

  constructor(config: StateManagerConfig) {
    this.persistence = config.persistence
    this.namespace = config.namespace
    this.debug = config.debug || false
  }

  async initialize(): Promise<void> {
    if (this.persistence.initialize) {
      await this.persistence.initialize()
    }
  }

  async dispose(): Promise<void> {
    if (this.persistence.dispose) {
      await this.persistence.dispose()
    }
  }

  getNamespace(): string {
    return this.namespace
  }

  private getSessionKey(): string {
    return `session-${this.namespace}`
  }

  private getLockName(): string {
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
      maxRetries: 3
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
      startedAt: Date.now()
    }
    await this.persistence.set(this.getSessionKey(), snapshot)
  }

  async loadState(): Promise<LoadStateResult> {
    const snapshot = await this.persistence.get<StateSnapshot>(this.getSessionKey())
    return {
      snapshot,
      success: true
    }
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
    return allKeys.map(k => k.slice(prefix.length))
  }
}

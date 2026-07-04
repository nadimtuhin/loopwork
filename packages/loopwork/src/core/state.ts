import path from 'path'
import type { IStateManager, LoadStateResult } from '@loopwork-ai/contracts/state'
import type { Config } from './config'
import { logger } from './utils'
import { LoopworkState } from './loopwork-state'
import { PersistenceStateManager, FilePersistenceLayer } from '@loopwork-ai/state'

export class StateManager implements IStateManager {
  private namespace: string
  private loopworkState: LoopworkState
  private persistenceManager: IStateManager
  private stateFile: string
  private lockFile: string

  constructor(
    private config: Config,
    stateManager?: IStateManager
  ) {
    this.namespace = config.namespace || 'default'
    this.loopworkState = new LoopworkState({
      projectRoot: config.projectRoot,
      namespace: this.namespace,
    })

    if (stateManager) {
      this.persistenceManager = stateManager
    } else {
      const persistence = new FilePersistenceLayer({
        baseDir: this.loopworkState.dir,
      })

      this.persistenceManager = new PersistenceStateManager({
        persistence,
        namespace: this.namespace,
        debug: config.debug || false,
      })
    }

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

  async acquireLock(retryCount = 0): Promise<boolean> {
    return this.persistenceManager.acquireLock(retryCount)
  }

  async releaseLock(): Promise<void> {
    return this.persistenceManager.releaseLock()
  }

  async isLocked(): Promise<boolean> {
    if (this.persistenceManager.isLocked) {
      return this.persistenceManager.isLocked()
    }
    return false
  }

  async getPluginState<T = unknown>(pluginName: string): Promise<T | null> {
    return this.persistenceManager.getPluginState<T>(pluginName)
  }

  async setPluginState<T = unknown>(pluginName: string, state: T): Promise<void> {
    return this.persistenceManager.setPluginState(pluginName, state)
  }

  async deletePluginState(pluginName: string): Promise<void> {
    if (this.persistenceManager.deletePluginState) {
      return this.persistenceManager.deletePluginState(pluginName)
    }
  }

  async hasPluginState(pluginName: string): Promise<boolean> {
    if (this.persistenceManager.hasPluginState) {
      return this.persistenceManager.hasPluginState(pluginName)
    }
    return false
  }

  async listPlugins(): Promise<string[]> {
    if (this.persistenceManager.listPlugins) {
      return this.persistenceManager.listPlugins()
    }
    return []
  }

  async saveState(currentIssue: number, iteration: number): Promise<void> {
    await this.persistenceManager.saveState(currentIssue, iteration)
  }

  async loadState(): Promise<LoadStateResult> {
    return this.persistenceManager.loadState()
  }

  async clearState(): Promise<void> {
    return this.persistenceManager.clearState()
  }
}

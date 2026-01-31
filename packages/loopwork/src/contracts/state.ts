export interface StateSnapshot {
  lastIssue: number
  lastIteration: number
  lastOutputDir: string
  startedAt?: number
}

export interface IStateManager {
  acquireLock(retryCount?: number): boolean
  releaseLock(): void
  saveState(currentIssue: number, iteration: number): void
  loadState(): StateSnapshot | null
  clearState(): void
  getNamespace(): string
  getPluginState<T = unknown>(pluginName: string): T | null
  setPluginState<T = unknown>(pluginName: string, state: T): void
}

export interface IStateManagerConstructor {
  new (config: unknown): IStateManager
}

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
}

export interface IStateManagerConstructor {
  new (config: unknown): IStateManager
}

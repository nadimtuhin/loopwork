import type { IPersistenceLayer, LockInfo, LockOptions } from '@loopwork-ai/contracts'

export interface IPersistence {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  acquireLock(lockName: string, options?: LockOptions): Promise<LockInfo | null>
  releaseLock(lockId: string): Promise<void>
}

export class PersistenceAdapter implements IPersistence {
  constructor(private layer: IPersistenceLayer) {}

  async get<T>(key: string): Promise<T | null> {
    return this.layer.get<T>(key)
  }

  async set<T>(key: string, value: T): Promise<void> {
    return this.layer.set<T>(key, value)
  }

  async acquireLock(lockName: string, options?: LockOptions): Promise<LockInfo | null> {
    if (!this.layer.acquireLock) {
      throw new Error(`Persistence layer ${this.layer.name} does not support locking`)
    }
    return this.layer.acquireLock(lockName, options)
  }

  async releaseLock(lockId: string): Promise<void> {
    if (!this.layer.releaseLock) {
      throw new Error(`Persistence layer ${this.layer.name} does not support locking`)
    }
    await this.layer.releaseLock(lockId)
  }
}

export * from './memory'
export * from './file'

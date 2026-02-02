import type { LockInfo, LockOptions } from '@loopwork-ai/contracts'
import type { IPersistence } from './index'

export class MemoryPersistence implements IPersistence {
  private storage: Map<string, any> = new Map()
  private locks: Map<string, LockInfo> = new Map()

  async get<T>(key: string): Promise<T | null> {
    return this.storage.get(key) || null
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.storage.set(key, value)
  }

  async acquireLock(lockName: string, options?: LockOptions): Promise<LockInfo | null> {
    if (this.locks.has(lockName)) {
      return null
    }

    const lockInfo: LockInfo = {
      lockId: Math.random().toString(36).substring(7),
      acquiredAt: new Date(),
      pid: process.pid
    }

    this.locks.set(lockName, lockInfo)
    return lockInfo
  }

  async releaseLock(lockId: string): Promise<void> {
    for (const [name, info] of this.locks.entries()) {
      if (info.lockId === lockId) {
        this.locks.delete(name)
        break
      }
    }
  }
}

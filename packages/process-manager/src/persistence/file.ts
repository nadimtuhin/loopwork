import { promises as fs, existsSync, mkdirSync } from 'fs'
import path from 'path'
import type { LockInfo, LockOptions } from '@loopwork-ai/contracts'
import type { IPersistence } from './index'

export interface FilePersistenceOptions {
  storageDir: string
}

export class FilePersistence implements IPersistence {
  private storageDir: string

  constructor(options: FilePersistenceOptions) {
    this.storageDir = options.storageDir
    if (!existsSync(this.storageDir)) {
      mkdirSync(this.storageDir, { recursive: true })
    }
  }

  private getFilePath(key: string): string {
    return path.join(this.storageDir, `${key}.json`)
  }

  private getLockPath(lockName: string): string {
    return path.join(this.storageDir, `${lockName}.lock`)
  }

  async get<T>(key: string): Promise<T | null> {
    const filePath = this.getFilePath(key)
    if (!existsSync(filePath)) {
      return null
    }

    try {
      const content = await fs.readFile(filePath, 'utf-8')
      return JSON.parse(content) as T
    } catch (error) {
      return null
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    const filePath = this.getFilePath(key)
    await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf-8')
  }

  async acquireLock(lockName: string, options?: LockOptions): Promise<LockInfo | null> {
    const lockPath = this.getLockPath(lockName)
    const maxRetries = options?.maxRetries ?? 50
    const retryDelayMs = options?.retryInterval ?? 100

    for (let i = 0; i < maxRetries; i++) {
      try {
        await fs.writeFile(lockPath, String(process.pid), { flag: 'wx' })
        return {
          lockId: lockPath,
          acquiredAt: new Date(),
          pid: process.pid
        }
      } catch (error: any) {
        if (error.code === 'EEXIST') {
          await new Promise(resolve => setTimeout(resolve, retryDelayMs))
          continue
        }
        throw error
      }
    }

    return null
  }

  async releaseLock(lockId: string): Promise<void> {
    await fs.unlink(lockId).catch(() => {})
  }
}

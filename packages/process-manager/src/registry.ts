import type { ProcessInfo, ProcessMetadata } from '@loopwork-ai/contracts/process'
import { isProcessAlive } from './index'
import type { IPersistence } from './persistence'

interface RegistryData {
  version: number
  parentPid: number
  processes: ProcessInfo[]
  lastUpdated: number
}

/**
 * ProcessRegistry - Thread-safe process tracking with pluggable persistence
 *
 * Tracks all spawned child processes in memory and persists via IPersistence.
 */
export class ProcessRegistry {
  private processes: Map<number, ProcessInfo> = new Map()
  private storageKey: string = 'processes'
  private lockName: string = 'processes-lock'

  constructor(private persistence: IPersistence) {}

  async add(pid: number, metadata: ProcessMetadata): Promise<void> {
    this.processes.set(pid, {
      pid,
      status: 'running',
      parentPid: process.pid,
      ...metadata
    })
    await this.persist()
  }

  async remove(pid: number): Promise<void> {
    this.processes.delete(pid)
    await this.persist()
  }

  async updateStatus(pid: number, status: ProcessInfo['status']): Promise<void> {
    const proc = this.processes.get(pid)
    if (proc) {
      proc.status = status
      this.processes.set(pid, proc)
      await this.persist()
    }
  }

  async clear(): Promise<void> {
    this.processes.clear()
    await this.persist()
  }

  get(pid: number): ProcessInfo | undefined {
    return this.processes.get(pid)
  }

  list(): ProcessInfo[] {
    return Array.from(this.processes.values())
  }

  listByNamespace(namespace: string): ProcessInfo[] {
    return this.list().filter(p => p.namespace === namespace)
  }

  async persist(): Promise<void> {
    const lock = await this.persistence.acquireLock(this.lockName)
    if (!lock) {
      throw new Error('Failed to acquire lock for persisting registry')
    }

    try {
      const data: RegistryData = {
        version: 1,
        parentPid: process.pid,
        processes: this.list(),
        lastUpdated: Date.now()
      }

      await this.persistence.set(this.storageKey, data)
    } finally {
      await this.persistence.releaseLock(lock.lockId)
    }
  }

  async load(): Promise<void> {
    const data = await this.persistence.get<RegistryData>(this.storageKey)
    
    if (data) {
      this.processes.clear()
      for (const proc of data.processes) {
        this.processes.set(proc.pid, proc)
      }
    } else {
      this.processes.clear()
    }
  }
}

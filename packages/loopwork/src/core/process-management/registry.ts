import { promises as fs } from 'fs'
import path from 'path'
import type { ProcessInfo, ProcessMetadata } from '../../contracts/process-manager'
import { logger } from '../utils'

interface RegistryData {
  version: number
  parentPid: number
  processes: ProcessInfo[]
  lastUpdated: number
}

/**
 * ProcessRegistry - Thread-safe process tracking with persistence
 *
 * Tracks all spawned child processes in memory and persists to disk for crash recovery.
 * Uses file locking pattern from JSON backend to prevent concurrent write conflicts.
 */
export class ProcessRegistry {
  private processes: Map<number, ProcessInfo> = new Map()
  private storagePath: string
  private lockPath: string

  constructor(storageDir: string = '.loopwork') {
    this.storagePath = path.join(storageDir, 'processes.json')
    this.lockPath = `${this.storagePath}.lock`
  }

  /**
   * Add a process to the registry
   */
  add(pid: number, metadata: ProcessMetadata): void {
    this.processes.set(pid, {
      pid,
      ...metadata,
      status: 'running',
      parentPid: process.pid
    })
    // Auto-persist after adding
    this.persist().catch(err => {
      logger.error(`Failed to persist registry after add: ${err}`)
    })
  }

  /**
   * Remove a process from the registry
   */
  remove(pid: number): void {
    this.processes.delete(pid)
    // Auto-persist after removing
    this.persist().catch(err => {
      logger.error(`Failed to persist registry after remove: ${err}`)
    })
  }

  /**
   * Update process status
   */
  updateStatus(pid: number, status: ProcessInfo['status']): void {
    const process = this.processes.get(pid)
    if (process) {
      process.status = status
      this.processes.set(pid, process)
      // Auto-persist after status update
      this.persist().catch(err => {
        logger.error(`Failed to persist registry after status update: ${err}`)
      })
    }
  }

  /**
   * Clear all processes from registry
   */
  clear(): void {
    this.processes.clear()
    // Auto-persist after clearing
    this.persist().catch(err => {
      logger.error(`Failed to persist registry after clear: ${err}`)
    })
  }

  /**
   * Get process info by PID
   */
  get(pid: number): ProcessInfo | undefined {
    return this.processes.get(pid)
  }

  /**
   * List all tracked processes
   */
  list(): ProcessInfo[] {
    return Array.from(this.processes.values())
  }

  /**
   * List processes by namespace
   */
  listByNamespace(namespace: string): ProcessInfo[] {
    return this.list().filter(p => p.namespace === namespace)
  }

  /**
   * Persist registry to disk
   */
  async persist(): Promise<void> {
    await this.withLock(async () => {
      const data: RegistryData = {
        version: 1,
        parentPid: process.pid,
        processes: this.list(),
        lastUpdated: Date.now()
      }

      // Ensure directory exists
      await fs.mkdir(path.dirname(this.storagePath), { recursive: true })
      await fs.writeFile(this.storagePath, JSON.stringify(data, null, 2), 'utf-8')
    })
  }

  /**
   * Load registry from disk
   */
  async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.storagePath, 'utf-8')
      const data: RegistryData = JSON.parse(content)

      // Restore processes to map
      this.processes.clear()
      for (const proc of data.processes) {
        this.processes.set(proc.pid, proc)
      }
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist - start fresh
        this.processes.clear()
      } else {
        throw error
      }
    }
  }

  /**
   * File locking helper (similar to JSON backend)
   * Ensures thread-safe file operations with stale lock detection
   */
  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const maxRetries = 50
    const retryDelayMs = 100
    const staleLockTimeout = 30000 // 30 seconds

    // Ensure directory exists for lock file
    await fs.mkdir(path.dirname(this.lockPath), { recursive: true })

    for (let i = 0; i < maxRetries; i++) {
      try {
        // Try to create lock file exclusively
        await fs.writeFile(this.lockPath, String(process.pid), { flag: 'wx' })

        try {
          // Execute function with lock held
          return await fn()
        } finally {
          // Release lock
          await fs.unlink(this.lockPath).catch(() => {})
        }
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
          // Lock exists - check if stale
          try {
            const lockContent = await fs.readFile(this.lockPath, 'utf-8')
            const lockPid = parseInt(lockContent, 10)
            const lockStat = await fs.stat(this.lockPath)
            const lockAge = Date.now() - lockStat.mtimeMs

            // If lock is older than staleLockTimeout, consider it stale
            if (lockAge > staleLockTimeout) {
              await fs.unlink(this.lockPath).catch(() => {})
              continue
            }

            // Check if process is alive
            if (!isProcessAlive(lockPid)) {
              // Stale lock - remove it
              await fs.unlink(this.lockPath).catch(() => {})
              continue
            }
          } catch {
            // Can't read lock - try removing it
            await fs.unlink(this.lockPath).catch(() => {})
            continue
          }

          // Wait and retry
          await new Promise(resolve => setTimeout(resolve, retryDelayMs))
        } else {
          throw error
        }
      }
    }

    throw new Error('Failed to acquire lock after max retries')
  }
}

/**
 * Check if a process is alive
 * Uses signal 0 to check existence without actually killing
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0) // Signal 0 checks existence without killing
    return true
  } catch {
    return false
  }
}

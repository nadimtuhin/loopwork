import fs from 'fs'
import path from 'path'
import type { IPersistenceLayer, LockInfo, LockOptions, StorageHealth } from '@loopwork-ai/contracts/state'

/**
 * File-based implementation of IPersistenceLayer.
 *
 * Stores each key as a separate JSON file in a flat directory structure.
 * Provides atomic file operations with locking support for concurrent access safety.
 *
 * @example
 * ```ts
 * const persistence = new FilePersistenceLayer({ baseDir: '.loopwork/state' })
 * await persistence.initialize()
 * await persistence.set('task-001', { status: 'completed' })
 * const data = await persistence.get('task-001')
 * ```
 */
export class FilePersistenceLayer implements IPersistenceLayer {
  /** Name identifier for this persistence layer */
  readonly name = 'file'
  private baseDir: string

  /**
   * Create a new FilePersistenceLayer instance.
   * @param options - Configuration options
   * @param options.baseDir - Base directory for storing state files
   */
  constructor(options: { baseDir: string }) {
    this.baseDir = options.baseDir
  }

  /**
   * Initialize the persistence layer.
   * Creates the base directory if it doesn't exist.
   */
  async initialize(): Promise<void> {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true })
    }
  }

  /**
   * Convert a storage key to a file path.
   * @param key - The storage key
   * @returns Full path to the JSON file
   */
  private getFilePath(key: string): string {
    const safeKey = key.replace(/[/\\?%*:|"<>]/g, '-')
    return path.join(this.baseDir, `${safeKey}.json`)
  }

  /**
   * Ensure the base directory exists.
   */
  private ensureBaseDir(): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true })
    }
  }

  /**
   * Check if a key exists in storage.
   * @param key - The storage key to check
   * @returns True if the key exists
   */
  async exists(key: string): Promise<boolean> {
    return fs.existsSync(this.getFilePath(key))
  }

  /**
   * Get a value from storage.
   * @template T - The type of the stored value
   * @param key - The storage key
   * @returns The stored value or null if not found
   */
  async get<T = unknown>(key: string): Promise<T | null> {
    const filePath = this.getFilePath(key)
    if (!fs.existsSync(filePath)) {
      return null
    }
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      return JSON.parse(content) as T
    } catch {
      return null
    }
  }

  /**
   * Set a value in storage.
   * @template T - The type of the value to store
   * @param key - The storage key
   * @param value - The value to store
   */
  async set<T = unknown>(key: string, value: T): Promise<void> {
    this.ensureBaseDir()
    const filePath = this.getFilePath(key)
    const tempPath = `${filePath}.tmp`
    fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), { mode: 0o600 })
    fs.renameSync(tempPath, filePath)
  }

  /**
   * Delete a value from storage.
   * @param key - The storage key to delete
   */
  async delete(key: string): Promise<void> {
    const filePath = this.getFilePath(key)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  }

  /**
   * List all keys in storage, optionally filtered by a pattern.
   * @param pattern - Optional glob-like pattern to filter keys
   * @returns Array of matching keys
   */
  async keys(pattern?: string): Promise<string[]> {
    if (!fs.existsSync(this.baseDir)) {
      return []
    }
    const files = fs.readdirSync(this.baseDir)
    const jsonFiles = files.filter(f => f.endsWith('.json')).map(f => f.slice(0, -5))
    
    if (pattern) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$')
      return jsonFiles.filter(k => regex.test(k))
    }
    
    return jsonFiles
  }

  /**
   * Acquire an exclusive lock for a named resource.
   * @param lockName - Name of the lock to acquire
   * @param options - Lock acquisition options
   * @returns Lock info if acquired, null otherwise
   */
  async acquireLock(lockName: string, options?: LockOptions): Promise<LockInfo | null> {
    this.ensureBaseDir()
    const lockDir = path.join(this.baseDir, `${lockName}.lock`)
    const timeout = options?.timeout ?? 0
    const retryInterval = options?.retryInterval ?? 100
    const maxRetries = options?.maxRetries ?? (timeout > 0 ? Math.floor(timeout / retryInterval) : 0)
    
    const tryAcquire = (): LockInfo | null => {
      try {
        fs.mkdirSync(lockDir)
        const pidFile = path.join(lockDir, 'pid')
        const lockId = Math.random().toString(36).substring(7)
        fs.writeFileSync(pidFile, JSON.stringify({ pid: process.pid, lockId }), { mode: 0o600 })
        return {
          lockId,
          acquiredAt: new Date(),
          pid: process.pid
        }
      } catch {
        try {
          const pidFile = path.join(lockDir, 'pid')
          if (fs.existsSync(pidFile)) {
            const data = JSON.parse(fs.readFileSync(pidFile, 'utf-8'))
            try {
              process.kill(data.pid, 0)
              return null 
            } catch {
              fs.rmSync(lockDir, { recursive: true, force: true })
              return tryAcquire()
            }
          }
        } catch {
          return null
        }
        return null
      }
    }

    let result = tryAcquire()
    let retries = 0
    
    while (!result && retries < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, retryInterval))
      result = tryAcquire()
      retries++
    }
    
    return result
  }

  /**
   * Release a previously acquired lock.
   * @param lockId - The lock ID to release
   */
  async releaseLock(lockId: string): Promise<void> {
    if (!fs.existsSync(this.baseDir)) {
      return
    }
    // releaseLock only provides lockId, so we scan .lock directories to find the matching one.
    const files = fs.readdirSync(this.baseDir)
    const lockDirs = files.filter(f => f.endsWith('.lock'))
    
    for (const dirName of lockDirs) {
      const lockDir = path.join(this.baseDir, dirName)
      const pidFile = path.join(lockDir, 'pid')
      if (fs.existsSync(pidFile)) {
        try {
          const data = JSON.parse(fs.readFileSync(pidFile, 'utf-8'))
          if (data.lockId === lockId) {
            fs.rmSync(lockDir, { recursive: true, force: true })
            return
          }
        } catch {
          // Fall through
        }
      }
    }
  }

  /**
   * Check if a lock is currently held for a named resource.
   * @param lockName - Name of the lock to check
   * @returns True if the lock is held by a running process
   */
  async isLocked(lockName: string): Promise<boolean> {
    const lockDir = path.join(this.baseDir, `${lockName}.lock`)
    if (!fs.existsSync(lockDir)) {
      return false
    }
    const pidFile = path.join(lockDir, 'pid')
    if (fs.existsSync(pidFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(pidFile, 'utf-8'))
        process.kill(data.pid, 0)
        return true
      } catch {
        return false
      }
    }
    return false
  }

  /**
   * Atomically update a value using a functional update.
   * @template T - The type of the stored value
   * @param key - The storage key
   * @param operation - Function that receives current value and returns new value
   */
  async atomicUpdate<T = unknown>(key: string, operation: (current: T | null) => T): Promise<void> {
    const lockName = `${key}-atomic`
    const lock = await this.acquireLock(lockName, { timeout: 5000, maxRetries: 50 })
    if (!lock) {
      throw new Error(`Failed to acquire lock for atomic update: ${key}`)
    }
    try {
      const current = await this.get<T>(key)
      const updated = operation(current)
      await this.set(key, updated)
    } finally {
      await this.releaseLock(lock.lockId)
    }
  }

  /**
   * Check the health of the persistence layer.
   * @returns Health status with latency measurement
   */
  async healthCheck(): Promise<StorageHealth> {
    try {
      const testKey = '__health_check__'
      const start = Date.now()
      await this.set(testKey, { ok: true })
      await this.get(testKey)
      await this.delete(testKey)
      const latencyMs = Date.now() - start
      return { healthy: true, latencyMs }
    } catch (error) {
      return { healthy: false, error: String(error) }
    }
  }
}

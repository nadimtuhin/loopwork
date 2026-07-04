import fs from 'fs'
import path from 'path'

/**
 * Default lock acquisition timeout in milliseconds
 */
export const DEFAULT_LOCK_TIMEOUT_MS = 5000

/**
 * Time after which a lock is considered stale (no longer valid)
 */
export const LOCK_STALE_TIMEOUT_MS = 30000

/**
 * Delay between lock acquisition retry attempts in milliseconds
 */
export const LOCK_RETRY_DELAY_MS = 100

/**
 * Error code for lock conflicts
 */
export const ERR_LOCK_CONFLICT = 'ERR_LOCK_CONFLICT'

/**
 * Type guard for Node.js file system errors
 */
interface NodeJSError extends Error {
  code?: string
}

/**
 * Check if an error is a Node.js filesystem error
 */
function isNodeJSError(error: unknown): error is NodeJSError {
  return error instanceof Error && 'code' in error
}

/**
 * Get error message from unknown error
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Configuration options for FileLock
 */
export interface FileLockConfig {
  /** Path to the file that needs locking */
  filePath: string
  /** Custom lock file path (defaults to filePath.lock) */
  lockFile?: string
  /** Lock acquisition timeout in milliseconds (default: 5000) */
  timeout?: number
  /** Delay between retry attempts in milliseconds (default: 100) */
  retryDelay?: number
  /** Time after which lock is considered stale in milliseconds (default: 30000) */
  staleTimeout?: number
}

/**
 * Result of a lock operation
 */
export interface LockResult {
  /** Whether the lock was successfully acquired */
  acquired: boolean
  /** The lock file path */
  lockFile: string
}

/**
 * FileLock - A reusable filesystem locking utility
 *
 * Provides exclusive file-based locking to prevent concurrent access
 * to shared resources. Handles stale lock detection and cleanup.
 *
 * Features:
 * - Exclusive file locking using PID-based lock files
 * - Stale lock detection and automatic cleanup
 * - Process liveness checking for lock validation
 * - Configurable timeouts and retry behavior
 *
 * @example
 * ```typescript
 * const lock = new FileLock({ filePath: 'data.json' })
 *
 * const result = await lock.acquire()
 * if (result.acquired) {
 *   try {
 *     // Critical section - exclusive access to the file
 *     await writeFile('data.json', newData)
 *   } finally {
 *     lock.release()
 *   }
 * }
 * ```
 */
export class FileLock {
  private filePath: string
  private lockFile: string
  private timeout: number
  private retryDelay: number
  private staleTimeout: number

  /**
   * Create a new FileLock instance
   * @param config - Configuration options
   */
  constructor(config: FileLockConfig) {
    this.filePath = config.filePath
    this.lockFile = config.lockFile || `${config.filePath}.lock`
    this.timeout = config.timeout ?? DEFAULT_LOCK_TIMEOUT_MS
    this.retryDelay = config.retryDelay ?? LOCK_RETRY_DELAY_MS
    this.staleTimeout = config.staleTimeout ?? LOCK_STALE_TIMEOUT_MS
  }

  /**
   * Get the lock file path
   */
  get lockFilePath(): string {
    return this.lockFile
  }

  /**
   * Get the target file path being locked
   */
  get targetFilePath(): string {
    return this.filePath
  }

  /**
   * Check if we currently hold the lock
   */
  isLockOwner(): boolean {
    try {
      if (!fs.existsSync(this.lockFile)) {
        return false
      }
      const content = fs.readFileSync(this.lockFile, 'utf-8')
      return parseInt(content, 10) === process.pid
    } catch {
      return false
    }
  }

  /**
   * Try to acquire the file lock
   * @returns LockResult indicating success/failure and lock file path
   */
  async acquire(): Promise<LockResult> {
    const startTime = Date.now()

    while (Date.now() - startTime < this.timeout) {
      try {
        // Try to create lock file exclusively
        fs.writeFileSync(this.lockFile, String(process.pid), { flag: 'wx' })
        return { acquired: true, lockFile: this.lockFile }
      } catch (e: unknown) {
        if (isNodeJSError(e) && e.code === 'EEXIST') {
          // Check if we already own this lock (reentrant acquire)
          if (this.isLockOwner()) {
            return { acquired: true, lockFile: this.lockFile }
          }

          // Lock exists but not owned by us, check if stale
          const staleCheck = await this.checkAndCleanupStaleLock()
          if (!staleCheck) {
            // Lock is still valid, wait and retry
            await new Promise((r) => setTimeout(r, this.retryDelay))
          }
          // If staleCheck is true, the lock was cleaned up, so we continue the loop
        } else {
          // Other error (e.g., directory doesn't exist, read-only filesystem)
          return { acquired: false, lockFile: this.lockFile }
        }
      }
    }

    return { acquired: false, lockFile: this.lockFile }
  }

  /**
   * Check if the current lock is stale and clean it up if so
   * @returns true if lock was cleaned up (was stale), false otherwise
   */
  private async checkAndCleanupStaleLock(): Promise<boolean> {
    try {
      const lockContent = fs.readFileSync(this.lockFile, 'utf-8')
      const lockPid = parseInt(lockContent, 10)
      const lockStat = fs.statSync(this.lockFile)
      const lockAge = Date.now() - lockStat.mtimeMs

      // If lock is older than staleTimeout, consider it stale
      if (lockAge > this.staleTimeout) {
        fs.unlinkSync(this.lockFile)
        return true
      }

      // Check if process is still alive (only works for same-machine processes)
      try {
        process.kill(lockPid, 0)
      } catch {
        // Process doesn't exist, remove stale lock
        fs.unlinkSync(this.lockFile)
        return true
      }
    } catch (e: unknown) {
      // Error reading lock, try to remove it
      try {
        fs.unlinkSync(this.lockFile)
        return true
      } catch (unlinkError: unknown) {
        // Failed to remove, log warning
        console.warn(
          `[FileLock] Failed to remove stale lock file: ${getErrorMessage(unlinkError)}`
        )
      }
    }

    return false
  }

  /**
   * Release the file lock
   * Only releases if we own the lock (PID check)
   */
  release(): void {
    try {
      // Only remove if we own the lock
      if (!fs.existsSync(this.lockFile)) {
        return
      }
      const content = fs.readFileSync(this.lockFile, 'utf-8')
      if (parseInt(content, 10) === process.pid) {
        fs.unlinkSync(this.lockFile)
      }
    } catch (e: unknown) {
      // Log but don't throw during cleanup - lock may have been removed by another process
      console.warn(`[FileLock] Failed to release lock file: ${getErrorMessage(e)}`)
    }
  }

  /**
   * Force release the lock file (use with caution)
   * Removes the lock file regardless of ownership
   */
  forceRelease(): void {
    try {
      if (fs.existsSync(this.lockFile)) {
        fs.unlinkSync(this.lockFile)
      }
    } catch (e: unknown) {
      console.warn(`[FileLock] Failed to force release lock: ${getErrorMessage(e)}`)
    }
  }

  /**
   * Execute a function with file lock protection
   * Automatically acquires and releases the lock
   *
   * @param fn - The function to execute under the lock
   * @throws Error if lock cannot be acquired
   * @returns The result of the function execution
   */
  async withLock<T>(fn: () => T): Promise<T> {
    const result = await this.acquire()
    if (!result.acquired) {
      throw new Error(
        `[FileLock] Failed to acquire lock on ${this.filePath}. ` +
          'Another process may be accessing the file. ' +
          `Check for stale lock: ${this.lockFile}`
      )
    }

    try {
      return fn()
    } finally {
      this.release()
    }
  }

  /**
   * Execute an async function with file lock protection
   * Automatically acquires and releases the lock
   *
   * @param fn - The async function to execute under the lock
   * @throws Error if lock cannot be acquired
   * @returns Promise resolving to the function result
   */
  async withLockAsync<T>(fn: () => Promise<T>): Promise<T> {
    const result = await this.acquire()
    if (!result.acquired) {
      throw new Error(
        `[FileLock] Failed to acquire lock on ${this.filePath}. ` +
          'Another process may be accessing the file. ' +
          `Check for stale lock: ${this.lockFile}`
      )
    }

    try {
      return await fn()
    } finally {
      this.release()
    }
  }

  /**
   * Static helper to quickly lock a file and execute a function
   *
   * @param filePath - Path to the file to lock
   * @param fn - Function to execute under the lock
   * @param config - Optional additional configuration
   * @throws Error if lock cannot be acquired
   * @returns The result of the function execution
   */
  static async withLock<T>(
    filePath: string,
    fn: () => T,
    config?: Partial<FileLockConfig>
  ): Promise<T> {
    const lock = new FileLock({ filePath, ...config })
    return lock.withLock(fn)
  }

  /**
   * Static helper to quickly lock a file and execute an async function
   *
   * @param filePath - Path to the file to lock
   * @param fn - Async function to execute under the lock
   * @param config - Optional additional configuration
   * @throws Error if lock cannot be acquired
   * @returns Promise resolving to the function result
   */
  static async withLockAsync<T>(
    filePath: string,
    fn: () => Promise<T>,
    config?: Partial<FileLockConfig>
  ): Promise<T> {
    const lock = new FileLock({ filePath, ...config })
    return lock.withLockAsync(fn)
  }
}

/**
 * Convenience function for acquiring a file lock
 *
 * @param filePath - Path to the file to lock
 * @param options - Optional lock configuration
 * @returns Promise resolving to LockResult
 */
export async function acquireFileLock(
  filePath: string,
  options?: {
    lockFile?: string
    timeout?: number
    retryDelay?: number
    staleTimeout?: number
  }
): Promise<LockResult> {
  const lock = new FileLock({ filePath, ...options })
  return lock.acquire()
}

/**
 * Convenience function for releasing a file lock
 *
 * @param lockFile - Path to the lock file
 * @param force - Force release regardless of ownership
 */
export function releaseFileLock(lockFile: string, force = false): void {
  try {
    if (fs.existsSync(lockFile)) {
      if (force) {
        fs.unlinkSync(lockFile)
      } else {
        const content = fs.readFileSync(lockFile, 'utf-8')
        if (parseInt(content, 10) === process.pid) {
          fs.unlinkSync(lockFile)
        }
      }
    }
  } catch (e: unknown) {
    console.warn(`[releaseFileLock] Failed: ${getErrorMessage(e)}`)
  }
}

/**
 * Execute a function with file locking
 *
 * @param filePath - Path to the file to lock
 * @param fn - Function to execute under the lock
 * @param options - Optional lock configuration
 * @throws Error if lock cannot be acquired
 * @returns The result of the function execution
 */
export async function withFileLock<T>(
  filePath: string,
  fn: () => T,
  options?: {
    lockFile?: string
    timeout?: number
    retryDelay?: number
    staleTimeout?: number
  }
): Promise<T> {
  return FileLock.withLock(filePath, fn, options)
}

/**
 * Execute an async function with file locking
 *
 * @param filePath - Path to the file to lock
 * @param fn - Async function to execute under the lock
 * @param options - Optional lock configuration
 * @throws Error if lock cannot be acquired
 * @returns Promise resolving to the function result
 */
export async function withFileLockAsync<T>(
  filePath: string,
  fn: () => Promise<T>,
  options?: {
    lockFile?: string
    timeout?: number
    retryDelay?: number
    staleTimeout?: number
  }
): Promise<T> {
  return FileLock.withLockAsync(filePath, fn, options)
}

/**
 * @loopwork-ai/utils-fs
 *
 * Filesystem utilities for Loopwork - file locking and related helpers
 *
 * ## Features
 *
 * - **FileLock**: A reusable filesystem locking utility that provides exclusive
 *   file-based locking to prevent concurrent access to shared resources
 * - **Stale lock detection**: Automatically detects and cleans up stale locks
 *   from crashed processes
 * - **Process validation**: Checks if the process holding the lock is still alive
 * - **Convenience functions**: Simple `withFileLock` function for common use cases
 *
 * ## Quick Start
 *
 * ```typescript
 * import { FileLock, withFileLock } from '@loopwork-ai/utils-fs'
 *
 * // Using the class directly
 * const lock = new FileLock({ filePath: 'data.json' })
 * await lock.withLock(() => {
 *   // Critical section
 * })
 *
 * // Using the convenience function
 * await withFileLock('data.json', () => {
 *   // Critical section
 * })
 * ```
 */

// Constants
export {
  DEFAULT_LOCK_TIMEOUT_MS,
  LOCK_STALE_TIMEOUT_MS,
  LOCK_RETRY_DELAY_MS,
  ERR_LOCK_CONFLICT,
} from './lock'

// Types
export type { FileLockConfig, LockResult } from './lock'

// Main class
export { FileLock } from './lock'

// Convenience functions
export {
  acquireFileLock,
  releaseFileLock,
  withFileLock,
  withFileLockAsync,
} from './lock'

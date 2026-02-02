/**
 * Process Manager for Loopwork
 *
 * Provides process spawning, orphan detection, and cleanup utilities
 * for managing AI CLI processes and their child processes.
 */

export * from './manager'
export * from './registry'
export * from './orphan-detector'
export * from './persistence'
export * from './spawner'

/**
 * Check if a process is alive
 */
export function isProcessAlive(pid: number): boolean {
  try {
    // On Unix, signal 0 checks if process exists without sending signal
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

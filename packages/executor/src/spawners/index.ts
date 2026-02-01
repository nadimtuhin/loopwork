/**
 * Process Spawner Factory
 *
 * Provides factory functions for creating process spawners with
 * automatic PTY preference and fallback handling.
 */

import type { ISpawner } from '@loopwork-ai/contracts/process'
import { StandardSpawner } from './standard-spawner'
import { PtySpawner, isPtyAvailable } from './pty-spawner'
import { BunSpawner } from './bun-spawner'

// Re-export spawner implementations
export { StandardSpawner } from './standard-spawner'
export { PtySpawner, isPtyAvailable } from './pty-spawner'
export { BunSpawner } from './bun-spawner'

// Singleton instance for default spawner
let _defaultSpawner: ISpawner | null = null

// Cache for PTY functional check
let _ptyFunctionalChecked = false
let _ptyFunctional = false

/**
 * Check if PTY spawning actually works (not just module availability)
 *
 * Some environments (sandboxed, restricted) allow loading node-pty
 * but fail at posix_spawnp. This function tests actual spawning.
 */
export function isPtyFunctional(): boolean {
  if (_ptyFunctionalChecked) {
    return _ptyFunctional
  }

  _ptyFunctionalChecked = true

  if (!isPtyAvailable()) {
    _ptyFunctional = false
    return false
  }

  try {
    // Attempt a quick spawn to test actual spawning
    const pty = new PtySpawner()
    const proc = pty.spawn('true', [])

    // If we got here without throwing, PTY works
    // Kill the process immediately
    proc.kill()
    _ptyFunctional = true
  } catch {
    // posix_spawnp or other errors - PTY doesn't work
    _ptyFunctional = false
  }

  return _ptyFunctional
}

/**
 * Create a process spawner
 *
 * @param preferPty - If true (default), prefer PTY spawning when available AND functional.
 *                    Falls back to bun or standard spawning if PTY is unavailable or fails.
 *                    If false, always use standard spawning.
 * @returns A ProcessSpawner instance
 *
 * @example
 * ```typescript
 * // Prefer PTY (default)
 * const spawner = createSpawner()
 *
 * // Force standard spawning
 * const standardSpawner = createSpawner(false)
 * ```
 */
export function createSpawner(preferPty: boolean = true): ISpawner {
  if (preferPty && isPtyFunctional()) {
    return new PtySpawner()
  }
  // Check if Bun is available
  if (typeof Bun !== 'undefined') {
    return new BunSpawner()
  }
  return new StandardSpawner()
}

/**
 * Get the default spawner singleton
 *
 * Returns a shared spawner instance that prefers PTY when available.
 * Useful for cases where you want to reuse a single spawner.
 *
 * @returns The default ProcessSpawner instance
 *
 * @example
 * ```typescript
 * const spawner = getDefaultSpawner()
 * const proc = spawner.spawn('echo', ['hello'])
 * ```
 */
export function getDefaultSpawner(): ISpawner {
  if (!_defaultSpawner) {
    _defaultSpawner = createSpawner(true)
  }
  return _defaultSpawner
}

/**
 * Reset the default spawner singleton (mainly for testing)
 */
export function resetDefaultSpawner(): void {
  _defaultSpawner = null
}

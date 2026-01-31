/**
 * Process Spawner Contracts
 *
 * Abstraction for process spawning that enables:
 * - PTY-based spawning for real-time streaming
 * - Standard child_process.spawn as fallback
 * - Dependency injection for testing
 */

import type { Readable, Writable } from 'stream'

/**
 * Represents a spawned process, providing a unified interface
 * for both standard spawn and PTY-based processes.
 */
export interface SpawnedProcess {
  /**
   * Process ID (undefined if process failed to start)
   */
  readonly pid?: number

  /**
   * Standard output stream
   * - For standard spawn: separate stdout stream
   * - For PTY: contains merged stdout+stderr (PTY behavior)
   */
  readonly stdout: Readable | null

  /**
   * Standard error stream
   * - For standard spawn: separate stderr stream
   * - For PTY: null (merged with stdout)
   */
  readonly stderr: Readable | null

  /**
   * Standard input stream
   */
  readonly stdin: Writable | null

  /**
   * Kill the process
   * @param signal - Signal to send (default: SIGTERM)
   * @returns true if signal was sent successfully
   */
  kill(signal?: NodeJS.Signals): boolean

  /**
   * Register event handlers
   */
  on(event: 'close', listener: (code: number | null) => void): this
  on(event: 'error', listener: (err: Error) => void): this
  on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this
}

/**
 * Options for spawning a process
 */
export interface SpawnOptions {
  /**
   * Environment variables for the process
   */
  env?: NodeJS.ProcessEnv

  /**
   * Working directory for the process
   */
  cwd?: string

  /**
   * Terminal columns (PTY only)
   */
  cols?: number

  /**
   * Terminal rows (PTY only)
   */
  rows?: number

  /**
   * Process niceness (priority)
   * Positive values = lower priority (background)
   * Negative values = higher priority (requires root usually)
   * Range: -20 to 19
   */
  nice?: number
}

/**
 * Process spawner interface
 *
 * Implementations:
 * - StandardSpawner: Uses child_process.spawn (always available)
 * - PtySpawner: Uses node-pty for PTY-based spawning (optional)
 */
export interface ProcessSpawner {
  /**
   * Spawn a new process
   *
   * @param command - Command to execute
   * @param args - Command arguments
   * @param options - Spawn options
   * @returns Spawned process handle
   */
  spawn(command: string, args: string[], options?: SpawnOptions): SpawnedProcess

  /**
   * Check if this spawner is available
   *
   * - StandardSpawner: Always returns true
   * - PtySpawner: Returns true only if node-pty is available
   */
  isAvailable(): boolean

  /**
   * Human-readable name of this spawner
   */
  readonly name: string
}

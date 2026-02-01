import type { Readable, Writable } from 'stream'
import type {
  ProcessInfo,
  SpawnOptions,
  KillOptions,
  CleanupResult,
  ProcessMetadata
} from './types'

export * from './types'

/**
 * Abstract interface for a spawned process.
 * Decouples from specific runtimes (Node.js, Bun) and spawner types (Standard, PTY).
 */
export interface ISpawnedProcess {
  /** Process ID (undefined if process failed to start) */
  readonly pid?: number

  /** 
   * Standard output stream.
   * May contain merged stdout and stderr for PTY-based spawners.
   */
  readonly stdout: Readable | null

  /** 
   * Standard error stream.
   * Usually null for PTY-based spawners as it is merged with stdout.
   */
  readonly stderr: Readable | null

  /** Standard input stream */
  readonly stdin: Writable | null
  
  /**
   * Send a signal to the process.
   * @returns true if signal was sent successfully
   */
  kill(signal?: string | number): boolean
  
  /** Register event handlers */
  on(event: 'close', listener: (code: number | null) => void): this
  on(event: 'error', listener: (err: Error) => void): this
  on(event: 'exit', listener: (code: number | null, signal: string | null) => void): this
}

/**
 * Interface for a component capable of spawning processes.
 */
export interface ISpawner {
  /** Unique name of the spawner (e.g., 'standard', 'pty', 'bun') */
  readonly name: string
  
  /**
   * Spawn a new process.
   * @param command Command to execute
   * @param args Arguments for the command
   * @param options Spawn configuration
   */
  spawn(command: string, args: string[], options?: SpawnOptions): ISpawnedProcess
  
  /**
   * Check if this spawner is available in the current environment.
   */
  isAvailable(): boolean
}

/**
 * Core interface for process management.
 * Handles lifecycle tracking, orchestration, and cleanup of spawned processes.
 */
export interface IProcessManager {
  /**
   * Spawn a new process and track it.
   */
  spawn(command: string, args: string[], options?: SpawnOptions): ISpawnedProcess

  /**
   * Terminate a tracked process.
   * @param pid Process ID to kill
   * @param options Signal and force-kill options
   */
  kill(pid: number, options?: KillOptions): boolean

  /**
   * Register an existing process for tracking by the manager.
   */
  track(pid: number, metadata: ProcessMetadata): void

  /**
   * Remove a process from tracking.
   */
  untrack(pid: number): void

  /**
   * Return a list of all currently tracked processes.
   */
  listChildren(): ProcessInfo[]

  /**
   * Filter tracked processes by namespace.
   */
  listByNamespace(namespace: string): ProcessInfo[]

  /**
   * Perform cleanup of orphaned, stale, or untracked processes.
   */
  cleanup(): Promise<CleanupResult>

  /**
   * Save the current process registry to persistent storage.
   */
  persist(): Promise<void>

  /**
   * Load the process registry from persistent storage.
   */
  load(): Promise<void>
}

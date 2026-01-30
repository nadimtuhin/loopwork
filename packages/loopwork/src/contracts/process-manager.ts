import type { ChildProcess, SpawnOptions } from 'child_process'

/**
 * Process metadata for tracking
 */
export interface ProcessMetadata {
  command: string
  args: string[]
  namespace: string
  taskId?: string
  startTime: number
}

/**
 * Process information including status
 */
export interface ProcessInfo extends ProcessMetadata {
  pid: number
  status: 'running' | 'stopped' | 'orphaned' | 'stale'
  parentPid?: number
}

/**
 * Orphan detection result
 */
export interface OrphanInfo {
  pid: number
  reason: 'parent-dead' | 'untracked' | 'stale'
  process: ProcessInfo
}

/**
 * Cleanup operation result
 */
export interface CleanupResult {
  cleaned: number[]
  failed: number[]
  errors: Array<{ pid: number; error: string }>
}

/**
 * Process manager interface for dependency inversion
 * Manages child process lifecycle, tracking, and cleanup
 */
export interface IProcessManager {
  /**
   * Spawn a child process and track it
   */
  spawn(command: string, args: string[], options?: SpawnOptions): ChildProcess

  /**
   * Kill a tracked process
   */
  kill(pid: number, signal?: NodeJS.Signals): boolean

  /**
   * Track an existing process
   */
  track(pid: number, metadata: ProcessMetadata): void

  /**
   * Untrack a process (when it exits normally)
   */
  untrack(pid: number): void

  /**
   * List all tracked child processes
   */
  listChildren(): ProcessInfo[]

  /**
   * List processes in a specific namespace
   */
  listByNamespace(namespace: string): ProcessInfo[]

  /**
   * Detect and clean orphan processes
   */
  cleanup(): Promise<CleanupResult>

  /**
   * Persist registry to disk
   */
  persist(): Promise<void>

  /**
   * Load registry from disk
   */
  load(): Promise<void>
}


import type { ChildProcess } from 'child_process'

/**
 * Process metadata for tracking
 */
export interface ProcessMetadata {
  command: string
  args: string[]
  namespace: string
  taskId?: string
  startTime: number
  parentPid?: number
  /**
   * Worker pool assignment
   */
  pool?: string
  /**
   * Resource limits for process
   */
  resourceLimits?: {
    memoryMB?: number
    cpuUsage?: number
  }
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
  errors: Array<{ pid: number; error: string }>
  alreadyGone: number[]
}

/**
 * Options for spawning a process
 */
export interface ISpawnOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  /**
   * Process niceness (priority)
   * Positive values = lower priority (background)
   * Range: -20 to 19
   */
  nice?: number
  /**
   * Resource limits for the spawned process
   */
  resourceLimits?: {
    memoryMB?: number
    cpuUsage?: number
  }
}

/**
 * Process manager interface for dependency inversion
 * Manages child process lifecycle, tracking, and cleanup
 */
export interface IProcessManager {
  /**
   * Spawn a child process and track it
   */
  spawn(command: string, args: string[], options?: ISpawnOptions): ChildProcess

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


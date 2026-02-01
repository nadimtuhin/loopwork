/**
 * Status of a managed process
 */
export type ProcessStatus = 'running' | 'stopped' | 'orphaned' | 'stale'

/**
 * Metadata associated with a process for tracking and management
 */
export interface ProcessMetadata {
  /** The command that was executed */
  command: string
  /** Arguments passed to the command */
  args: string[]
  /** Isolation namespace for the process */
  namespace: string
  /** Optional task ID associated with the process */
  taskId?: string
  /** Timestamp when the process was started */
  startTime: number
  /** Optional worker pool assignment */
  pool?: string
  /** Resource limits enforced on the process */
  resourceLimits?: {
    memoryMB?: number
    cpuUsage?: number
  }
}

/**
 * Detailed information about a managed process
 */
export interface ProcessInfo extends ProcessMetadata {
  /** Process ID */
  pid: number
  /** Current status of the process */
  status: ProcessStatus
  /** Parent Process ID, if known */
  parentPid?: number
}

/**
 * Options for spawning a new process
 */
export interface SpawnOptions {
  /** Working directory for the process */
  cwd?: string
  /** Environment variables for the process */
  env?: Record<string, string | undefined>
  /** 
   * Process priority (niceness). Range: -20 to 19.
   * Higher values mean lower priority (more "nice" to other processes).
   */
  nice?: number
  /** Terminal columns (for PTY-based spawners) */
  cols?: number
  /** Terminal rows (for PTY-based spawners) */
  rows?: number
}

/**
 * Options for killing a process
 */
export interface KillOptions {
  /** Signal to send (e.g., 'SIGTERM', 'SIGKILL', or 9) */
  signal?: string | number
  /** Whether to force kill (equivalent to SIGKILL) */
  force?: boolean
}

/**
 * Result of a process cleanup operation
 */
export interface CleanupResult {
  /** PIDs of successfully cleaned processes */
  cleaned: number[]
  /** Details of cleanup failures */
  failed: Array<{ pid: number; error: string }>
  /** PIDs that were already gone */
  alreadyGone: number[]
}

/**
 * Information about an orphaned process
 */
export interface OrphanInfo {
  /** Process ID of the orphan */
  pid: number
  /** Reason why the process is considered an orphan */
  reason: 'parent-dead' | 'untracked' | 'stale'
  /** Captured information about the process */
  process: ProcessInfo
}

/**
 * Robust Orphan Detection API - Type Definitions
 * 
 * This module provides comprehensive type definitions for detecting and managing
 * orphan processes across sessions, even when the parent process has crashed
 * or the tracking registry has been lost.
 */

import type { ProcessInfo } from '../../contracts/process-manager'

/**
 * Unique fingerprint for identifying a process across sessions
 * Combines PID with system-level identifiers to prevent PID reuse issues
 */
export interface ProcessFingerprint {
  /** Process ID */
  pid: number
  /** System boot ID (from /proc/sys/kernel/random/boot_id or equivalent) */
  bootId: string
  /** Process start time (from /proc/[pid]/stat) */
  startTime: number
  /** Process executable path or command signature */
  commandHash: string
}

/**
 * Session identifier for grouping related processes
 * Used for environment variable tagging (like GitHub Actions RUNNER_TRACKING_ID)
 */
export interface SessionId {
  /** Unique session identifier (UUID or timestamp-based) */
  id: string
  /** Session start timestamp */
  startedAt: number
  /** Parent process PID that started the session */
  parentPid: number
  /** Hostname where session was started */
  hostname: string
}

/**
 * Classification of how certain we are that a process is an orphan
 */
export type OrphanCertainty = 'confirmed' | 'high' | 'medium' | 'low' | 'suspected'

/**
 * Reason why a process is considered an orphan
 */
export type OrphanReason =
  | 'parent-dead'           // Parent PID no longer exists
  | 'stale'                 // Process exceeded max age
  | 'session-ended'         // Session ID not in active sessions
  | 'registry-orphan'       // In registry but parent doesn't track it
  | 'env-tagged'            // Tagged with orphaned session ID
  | 'process-group-orphan'  // Process group leader died
  | 'untracked'             // Matches pattern but not in any registry

/**
 * Enhanced orphan process information
 */
export interface RobustOrphanProcess {
  /** Process fingerprint for reliable identification */
  fingerprint: ProcessFingerprint
  /** Current process info */
  process: ProcessInfo
  /** Classification certainty */
  certainty: OrphanCertainty
  /** Why this process is considered an orphan */
  reason: OrphanReason
  /** Human-readable explanation */
  explanation: string
  /** Detection method(s) that found this orphan */
  detectionMethods: DetectionMethod[]
  /** Process age in milliseconds */
  age: number
  /** Memory usage in bytes */
  memory: number
  /** Working directory if detectable */
  cwd?: string
  /** Session ID if tagged */
  sessionId?: string
  /** Process group ID */
  processGroupId?: number
}

/**
 * Methods used to detect orphans
 */
export type DetectionMethod =
  | 'registry-dead-parent'
  | 'registry-stale'
  | 'env-session-tag'
  | 'process-group-check'
  | 'pattern-match'
  | 'boot-id-mismatch'
  | 'start-time-validation'

/**
 * Configuration for robust orphan detection
 */
export interface RobustOrphanDetectorConfig {
  /** Project root directory */
  projectRoot: string
  /** Storage directory for persistence (default: .loopwork) */
  storageDir?: string
  /** Patterns to match orphan processes */
  patterns?: string[]
  /** Max age in ms before process is considered stale (default: 30 min) */
  maxAge?: number
  /** Enable environment variable tagging (default: true) */
  enableEnvTagging?: boolean
  /** Enable process group tracking (default: true) */
  enableProcessGroups?: boolean
  /** Enable boot_id validation to prevent PID reuse false positives (default: true) */
  enableBootIdValidation?: boolean
  /** Enable start time validation (default: true) */
  enableStartTimeValidation?: boolean
  /** Session ID for tagging spawned processes */
  sessionId?: string
  /** Kill suspected orphans (default: false - only kill confirmed/high) */
  killSuspected?: boolean
  /** Dry run mode - detect but don't kill */
  dryRun?: boolean
}

/**
 * Result of orphan detection operation
 */
export interface OrphanDetectionResult {
  /** All detected orphans */
  orphans: RobustOrphanProcess[]
  /** Orphans by certainty level */
  byCertainty: {
    confirmed: RobustOrphanProcess[]
    high: RobustOrphanProcess[]
    medium: RobustOrphanProcess[]
    low: RobustOrphanProcess[]
    suspected: RobustOrphanProcess[]
  }
  /** Orphans by detection method */
  byMethod: Record<DetectionMethod, RobustOrphanProcess[]>
  /** Total count */
  total: number
  /** Detection timestamp */
  timestamp: string
  /** Session ID used for detection */
  sessionId?: string
}

/**
 * Result of orphan cleanup operation
 */
export interface OrphanCleanupResult {
  /** PIDs successfully killed */
  killed: number[]
  /** PIDs skipped (suspected without force) */
  skipped: number[]
  /** PIDs that failed to kill */
  failed: { pid: number; error: string }[]
  /** Processes that were already gone */
  alreadyGone: number[]
  /** Detailed orphan info for killed processes */
  killedOrphans: RobustOrphanProcess[]
  /** Duration of cleanup in milliseconds */
  duration: number
}

/**
 * Historical process record for cross-session tracking
 */
export interface HistoricalProcessRecord {
  /** Unique fingerprint */
  fingerprint: ProcessFingerprint
  /** Session that spawned this process */
  session: SessionId
  /** When the process was spawned */
  spawnedAt: string
  /** Expected command pattern */
  commandPattern: string
  /** Process metadata */
  metadata: {
    namespace?: string
    taskId?: string
    command?: string
  }
  /** Status in registry */
  status: 'active' | 'completed' | 'failed' | 'orphaned'
}

/**
 * Historical registry for tracking processes across sessions
 */
export interface HistoricalRegistry {
  version: number
  /** All historical process records */
  processes: HistoricalProcessRecord[]
  /** Active sessions */
  activeSessions: SessionId[]
  /** Completed/ended sessions */
  endedSessions: SessionId[]
  /** Last updated timestamp */
  lastUpdated: number
  /** System boot ID when registry was created */
  bootId: string
}

/**
 * Process group information for group-level tracking
 */
export interface ProcessGroupInfo {
  /** Process group ID */
  pgid: number
  /** Session leader PID */
  sessionLeader: number
  /** All processes in the group */
  processes: number[]
  /** Whether the group leader is still alive */
  leaderAlive: boolean
}

/**
 * Environment variable tagging configuration
 */
export interface EnvTaggingConfig {
  /** Environment variable name (default: LOOPWORK_SESSION_ID) */
  varName: string
  /** Session ID value */
  sessionId: string
  /** Additional tags to set */
  additionalTags?: Record<string, string>
}

/**
 * Options for killing orphan processes
 */
export interface OrphanKillOptions {
  /** Timeout for graceful shutdown (SIGTERM) in ms */
  gracefulTimeout?: number
  /** Force kill suspected orphans (not just confirmed) */
  force?: boolean
  /** Dry run - don't actually kill */
  dryRun?: boolean
  /** Log verbose output */
  verbose?: boolean
}

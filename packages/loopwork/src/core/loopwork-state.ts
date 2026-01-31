/**
 * Centralized State Management for Loopwork
 *
 * This module provides a single source of truth for all state file paths
 * and operations. Use this instead of constructing paths manually.
 *
 * State File Inventory:
 * - session state: .loopwork/state[-{namespace}].json - Resume capability
 * - monitor state: .loopwork/monitor-state.json - Background process tracking
 * - ai-monitor state: .loopwork/ai-monitor-state.json - AI Monitor circuit breaker
 * - processes: .loopwork/processes.json - Process registry
 * - spawned-pids: .loopwork/spawned-pids.json - Orphan detection
 * - parallel state: .loopwork/parallel-state[-{namespace}].json - Parallel runner
 * - pause state: .loopwork/pause-state.json - Loop pause state
 */

import fs from 'fs'
import path from 'path'

/**
 * Base directory for all loopwork state files
 */
export const LOOPWORK_DIR = '.loopwork'

/**
 * All state file names in one place
 */
export const STATE_FILES = {
  /** Session state for resume capability */
  SESSION: 'state',
  /** Session lock file */
  SESSION_LOCK: 'state',
  /** LoopworkMonitor background process tracking */
  MONITOR: 'monitor-state.json',
  /** AIMonitor circuit breaker and recovery state */
  AI_MONITOR: 'ai-monitor-state.json',
  /** ProcessRegistry tracking */
  PROCESSES: 'processes.json',
  /** Orphan detection tracking */
  SPAWNED_PIDS: 'spawned-pids.json',
  /** Parallel runner state */
  PARALLEL: 'parallel-state',
  /** Loop pause state */
  PAUSE: 'pause-state.json',
  /** Orphan events log */
  ORPHAN_EVENTS: 'orphan-events.log',
  /** Inter-agent messages queue */
  MESSAGES: 'messages',
  /** Global retry budget state */
  RETRY_BUDGET: 'retry-budget.json',
  /** Offline operations queue */
  OFFLINE_QUEUE: 'offline-queue',
  /** Plugin state storage */
  PLUGIN_STATE: 'plugin-state',
} as const

/**
 * Subdirectories within .loopwork
 */
export const STATE_DIRS = {
  /** Run logs directory */
  RUNS: 'runs',
  /** AI Monitor data directory */
  AI_MONITOR: 'ai-monitor',
  /** LLM cache within AI Monitor */
  LLM_CACHE: 'ai-monitor/llm-cache.json',
  /** Checkpoints directory */
  CHECKPOINTS: 'checkpoints',
} as const

/**
 * Session metadata for tracking unified session state
 * Used by both foreground (up) and daemon (up -d) modes
 */
export interface SessionMetadata {
  /** Session ID (timestamp-based, e.g., "2026-01-31T10-30-00") */
  id: string
  /** Namespace for this session */
  namespace: string
  /** Execution mode: foreground (attached) or daemon (detached) */
  mode: 'foreground' | 'daemon'
  /** Process ID */
  pid: number
  /** ISO timestamp when session started */
  startedAt: string
  /** Current session status */
  status: 'running' | 'completed' | 'failed' | 'stopped'
  /** CLI arguments used to start the session */
  args?: string[]
  /** Last updated timestamp */
  updatedAt?: string
}

/**
 * Glob patterns for watching state files (used by dashboard)
 */
export const STATE_WATCH_PATTERNS = [
  `${LOOPWORK_DIR}/${STATE_FILES.SESSION}*.json`,
  `${LOOPWORK_DIR}/${STATE_FILES.MONITOR}`,
  `${LOOPWORK_DIR}/${STATE_FILES.AI_MONITOR}`,
  `${LOOPWORK_DIR}/${STATE_FILES.PROCESSES}`,
  `${LOOPWORK_DIR}/${STATE_FILES.PARALLEL}*.json`,
]

/**
 * Centralized state path and file management for Loopwork
 *
 * Usage:
 * ```typescript
 * const state = new LoopworkState()
 * const sessionPath = state.paths.session()
 * const monitorPath = state.paths.monitor()
 *
 * // With namespace
 * const state = new LoopworkState({ namespace: 'my-loop' })
 * const sessionPath = state.paths.session() // .loopwork/state-my-loop.json
 * ```
 */
export class LoopworkState {
  private projectRoot: string
  private namespace: string

  constructor(options: { projectRoot?: string; namespace?: string } = {}) {
    // Handle process.cwd() failures in test environments
    let defaultRoot: string
    try {
      defaultRoot = process.cwd()
    } catch {
      defaultRoot = '.'
    }
    this.projectRoot = options.projectRoot || defaultRoot
    this.namespace = options.namespace || 'default'
  }

  /**
   * Get the .loopwork directory path
   */
  get dir(): string {
    return path.join(this.projectRoot, LOOPWORK_DIR)
  }

  /**
   * Ensure the .loopwork directory exists
   */
  ensureDir(): void {
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true })
    }
  }

  /**
   * Get namespace suffix for namespaced files
   */
  private get namespaceSuffix(): string {
    return this.namespace === 'default' ? '' : `-${this.namespace}`
  }

  /**
   * Path accessors for all state files
   */
  paths = {
    /**
     * Session state file path
     * .loopwork/state.json or .loopwork/state-{namespace}.json
     */
    session: (): string => {
      return path.join(this.dir, `${STATE_FILES.SESSION}${this.namespaceSuffix}.json`)
    },

    /**
     * Session lock directory path
     * .loopwork/state.lock or .loopwork/state-{namespace}.lock
     */
    sessionLock: (): string => {
      return path.join(this.dir, `${STATE_FILES.SESSION_LOCK}${this.namespaceSuffix}.lock`)
    },

    /**
     * LoopworkMonitor state file path
     * .loopwork/monitor-state.json (shared across namespaces)
     */
    monitor: (): string => {
      return path.join(this.dir, STATE_FILES.MONITOR)
    },

    /**
     * AIMonitor state file path
     * .loopwork/ai-monitor-state.json (shared across namespaces)
     */
    aiMonitor: (): string => {
      return path.join(this.dir, STATE_FILES.AI_MONITOR)
    },

    /**
     * Process registry file path
     * .loopwork/processes.json (shared across namespaces)
     */
    processes: (): string => {
      return path.join(this.dir, STATE_FILES.PROCESSES)
    },

    /**
     * Spawned PIDs file path for orphan detection
     * .loopwork/spawned-pids.json (shared across namespaces)
     */
    spawnedPids: (): string => {
      return path.join(this.dir, STATE_FILES.SPAWNED_PIDS)
    },

    /**
     * Parallel runner state file path
     * .loopwork/parallel-state.json or .loopwork/parallel-state-{namespace}.json
     */
    parallel: (): string => {
      return path.join(this.dir, `${STATE_FILES.PARALLEL}${this.namespaceSuffix}.json`)
    },

    /**
     * Pause state file path
     * .loopwork/pause-state.json (shared across namespaces)
     */
    pause: (): string => {
      return path.join(this.dir, STATE_FILES.PAUSE)
    },

    /**
     * Orphan events log file path
     * .loopwork/orphan-events.log
     */
    orphanEvents: (): string => {
      return path.join(this.dir, STATE_FILES.ORPHAN_EVENTS)
    },

    /**
     * Runs directory path
     * .loopwork/runs/{namespace}
     */
    runs: (namespace?: string): string => {
      return path.join(this.dir, STATE_DIRS.RUNS, namespace || this.namespace)
    },

    /**
     * Monitor logs directory within runs
     * .loopwork/runs/{namespace}/monitor-logs
     */
    monitorLogs: (namespace?: string): string => {
      return path.join(this.paths.runs(namespace), 'monitor-logs')
    },

    /**
     * Session directory path
     * .loopwork/runs/{namespace}/{session-id}
     */
    sessionDir: (sessionId: string, namespace?: string): string => {
      return path.join(this.paths.runs(namespace), sessionId)
    },

    /**
     * Session metadata file path
     * .loopwork/runs/{namespace}/{session-id}/session.json
     */
    sessionFile: (sessionId: string, namespace?: string): string => {
      return path.join(this.paths.sessionDir(sessionId, namespace), 'session.json')
    },

    /**
     * AI Monitor directory
     * .loopwork/ai-monitor
     */
    aiMonitorDir: (): string => {
      return path.join(this.dir, STATE_DIRS.AI_MONITOR)
    },

    /**
     * Checkpoints directory
     * .loopwork/checkpoints
     */
    checkpoints: (): string => {
      return path.join(this.dir, STATE_DIRS.CHECKPOINTS)
    },

    /**
     * LLM cache file path
     * .loopwork/ai-monitor/llm-cache.json
     */
    llmCache: (): string => {
      return path.join(this.dir, STATE_DIRS.LLM_CACHE)
    },

    /**
     * Messages queue file path
     * .loopwork/messages.json or .loopwork/messages-{namespace}.json
     */
    messages: (namespace?: string): string => {
      const ns = namespace || this.namespace
      const suffix = ns === 'default' ? '' : `-${ns}`
      return path.join(this.dir, `${STATE_FILES.MESSAGES}${suffix}.json`)
    },

    /**
     * Offline operations queue file path
     * .loopwork/offline-queue.json or .loopwork/offline-queue-{namespace}.json
     */
    offlineQueue: (): string => {
      return path.join(this.dir, `${STATE_FILES.OFFLINE_QUEUE}${this.namespaceSuffix}.json`)
    },

    /**
     * Retry budget state file path
     * .loopwork/retry-budget.json (shared across namespaces)
     */
    retryBudget: (): string => {
      return path.join(this.dir, STATE_FILES.RETRY_BUDGET)
    },

    /**
     * Plugin state file path
     * .loopwork/plugin-state.json or .loopwork/plugin-state-{namespace}.json
     */
    pluginState: (): string => {
      return path.join(this.dir, `${STATE_FILES.PLUGIN_STATE}${this.namespaceSuffix}.json`)
    },
  }

  /**
   * Read JSON state file with error handling
   */
  readJson<T>(filePath: string): T | null {
    try {
      if (!fs.existsSync(filePath)) {
        return null
      }
      const content = fs.readFileSync(filePath, 'utf-8')
      return JSON.parse(content) as T
    } catch {
      return null
    }
  }

  /**
   * Write JSON state file atomically
   */
  writeJson<T>(filePath: string, data: T): void {
    this.ensureDir()
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    // Write to temp file first, then rename for atomicity
    const tempPath = `${filePath}.tmp`
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), { mode: 0o600 })
    fs.renameSync(tempPath, filePath)
  }

  /**
   * Delete a state file if it exists
   */
  deleteFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    } catch {
      // Ignore errors
    }
  }

  /**
   * Check if a state file exists
   */
  exists(filePath: string): boolean {
    return fs.existsSync(filePath)
  }

  /**
   * Get all available namespaces by scanning state files
   */
  getNamespaces(): string[] {
    const namespaces = new Set<string>(['default'])

    if (!fs.existsSync(this.dir)) {
      return Array.from(namespaces)
    }

    // Scan for state-{namespace}.json files
    const files = fs.readdirSync(this.dir)
    for (const file of files) {
      const match = file.match(/^state-(.+)\.json$/)
      if (match) {
        namespaces.add(match[1])
      }
    }

    // Scan runs directory for namespace folders
    const runsDir = path.join(this.dir, STATE_DIRS.RUNS)
    if (fs.existsSync(runsDir)) {
      const entries = fs.readdirSync(runsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          namespaces.add(entry.name)
        }
      }
    }

    return Array.from(namespaces).sort()
  }

  /**
   * Create a new instance with a different namespace
   */
  withNamespace(namespace: string): LoopworkState {
    return new LoopworkState({
      projectRoot: this.projectRoot,
      namespace,
    })
  }

  /**
   * Generate a new session ID based on current timestamp
   */
  generateSessionId(): string {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  }

  /**
   * Create a new session and write its metadata
   */
  createSession(metadata: Omit<SessionMetadata, 'id' | 'startedAt' | 'updatedAt'>): SessionMetadata {
    const sessionId = this.generateSessionId()
    const now = new Date().toISOString()

    const session: SessionMetadata = {
      ...metadata,
      id: sessionId,
      startedAt: now,
      updatedAt: now,
    }

    const sessionDir = this.paths.sessionDir(sessionId, metadata.namespace)
    const logsDir = path.join(sessionDir, 'logs')

    // Create session directories
    fs.mkdirSync(logsDir, { recursive: true })

    // Write session metadata
    this.writeJson(this.paths.sessionFile(sessionId, metadata.namespace), session)

    return session
  }

  /**
   * Update an existing session's metadata
   */
  updateSession(sessionId: string, namespace: string, updates: Partial<SessionMetadata>): SessionMetadata | null {
    const sessionFile = this.paths.sessionFile(sessionId, namespace)
    const existing = this.readJson<SessionMetadata>(sessionFile)

    if (!existing) {
      return null
    }

    const updated: SessionMetadata = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    }

    this.writeJson(sessionFile, updated)
    return updated
  }

  /**
   * Get session metadata
   */
  getSession(sessionId: string, namespace?: string): SessionMetadata | null {
    const ns = namespace || this.namespace
    return this.readJson<SessionMetadata>(this.paths.sessionFile(sessionId, ns))
  }

  /**
   * List all sessions for a namespace, sorted by most recent first
   */
  listSessions(namespace?: string): SessionMetadata[] {
    const ns = namespace || this.namespace
    const runsDir = this.paths.runs(ns)

    if (!fs.existsSync(runsDir)) {
      return []
    }

    const sessions: SessionMetadata[] = []

    try {
      const entries = fs.readdirSync(runsDir, { withFileTypes: true })

      for (const entry of entries) {
        // Skip monitor-logs directory
        if (!entry.isDirectory() || entry.name === 'monitor-logs') {
          continue
        }

        const sessionFile = this.paths.sessionFile(entry.name, ns)
        const session = this.readJson<SessionMetadata>(sessionFile)

        if (session) {
          sessions.push(session)
        }
      }
    } catch {
      // Ignore errors
    }

    // Sort by startedAt descending (most recent first)
    return sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  }

  /**
   * Get the most recent session for a namespace
   */
  getLatestSession(namespace?: string): SessionMetadata | null {
    const sessions = this.listSessions(namespace)
    return sessions[0] || null
  }

  /**
   * Get all running sessions across all namespaces
   */
  getActiveSessions(): SessionMetadata[] {
    const activeSessions: SessionMetadata[] = []
    const namespaces = this.getNamespaces()

    for (const ns of namespaces) {
      const sessions = this.listSessions(ns)
      for (const session of sessions) {
        if (session.status === 'running') {
          activeSessions.push(session)
        }
      }
    }

    return activeSessions
  }
}

/**
 * Default singleton instance for convenience
 * Use `new LoopworkState(options)` for custom configuration
 */
export const loopworkState = new LoopworkState()

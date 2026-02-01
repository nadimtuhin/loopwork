/**
 * Process Manager for Loopwork
 *
 * Provides process spawning, orphan detection, and cleanup utilities
 * for managing AI CLI processes and their child processes.
 */

import { EventEmitter } from 'events'

export interface ProcessInfo {
  pid: number
  command: string
  args: string[]
  startTime: Date
  namespace?: string
}

export interface ProcessManagerOptions {
  /** Interval in ms for checking orphan processes */
  orphanCheckInterval?: number
  /** Maximum age in ms before a process is considered orphan */
  maxProcessAge?: number
  /** Namespace for process grouping */
  namespace?: string
}

export interface ProcessStats {
  totalSpawned: number
  totalTerminated: number
  currentActive: number
  orphansDetected: number
}

/**
 * Process Manager for tracking and managing spawned processes
 */
export class ProcessManager extends EventEmitter {
  private spawnedPids: Map<number, ProcessInfo> = new Map()
  private orphanCheckInterval?: ReturnType<typeof setInterval>
  private options: Required<ProcessManagerOptions>

  constructor(options: ProcessManagerOptions = {}) {
    super()
    this.options = {
      orphanCheckInterval: options.orphanCheckInterval ?? 5000,
      maxProcessAge: options.maxProcessAge ?? 60000,
      namespace: options.namespace ?? 'default',
    }
  }

  /**
   * Register a spawned process
   */
  registerProcess(pid: number, command: string, args: string[] = []): void {
    const processInfo: ProcessInfo = {
      pid,
      command,
      args,
      startTime: new Date(),
      namespace: this.options.namespace,
    }

    this.spawnedPids.set(pid, processInfo)
    this.emit('spawn', processInfo)
  }

  /**
   * Unregister a terminated process
   */
  unregisterProcess(pid: number, reason: string = 'terminated'): void {
    const processInfo = this.spawnedPids.get(pid)
    if (processInfo) {
      this.spawnedPids.delete(pid)
      this.emit('terminate', { ...processInfo, reason })
    }
  }

  /**
   * Check if a process is being tracked
   */
  isTracking(pid: number): boolean {
    return this.spawnedPids.has(pid)
  }

  /**
   * Get process info by PID
   */
  getProcess(pid: number): ProcessInfo | undefined {
    return this.spawnedPids.get(pid)
  }

  /**
   * Get all tracked processes
   */
  getAllProcesses(): ProcessInfo[] {
    return Array.from(this.spawnedPids.values())
  }

  /**
   * Get current process statistics
   */
  getStats(): ProcessStats {
    return {
      totalSpawned: this.spawnedPids.size,
      totalTerminated: 0, // Would need additional tracking
      currentActive: this.spawnedPids.size,
      orphansDetected: 0, // Would need additional tracking
    }
  }

  /**
   * Start orphan detection
   */
  startOrphanDetection(): void {
    if (this.orphanCheckInterval) {
      return // Already running
    }

    this.orphanCheckInterval = setInterval(() => {
      this.checkOrphans()
    }, this.options.orphanCheckInterval)
  }

  /**
   * Stop orphan detection
   */
  stopOrphanDetection(): void {
    if (this.orphanCheckInterval) {
      clearInterval(this.orphanCheckInterval)
      this.orphanCheckInterval = undefined
    }
  }

  /**
   * Check for orphan processes
   */
  private checkOrphans(): void {
    const now = Date.now()
    const maxAge = this.options.maxProcessAge

    for (const [pid, processInfo] of this.spawnedPids) {
      const age = now - processInfo.startTime.getTime()
      if (age > maxAge) {
        this.emit('orphan', processInfo)
      }
    }
  }

  /**
   * Cleanup all tracked processes
   */
  cleanup(): void {
    this.stopOrphanDetection()
    const processes = this.getAllProcesses()
    this.spawnedPids.clear()

    for (const processInfo of processes) {
      this.emit('cleanup', processInfo)
    }
  }

  /**
   * Destroy the process manager
   */
  destroy(): void {
    this.cleanup()
    this.removeAllListeners()
  }
}

/**
 * Check if a process is alive
 */
export async function isProcessAlive(pid: number): Promise<boolean> {
  try {
    // On Unix, signal 0 checks if process exists without sending signal
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Get process info (platform-specific)
 */
export async function getProcessInfo(pid: number): Promise<ProcessInfo | null> {
  const alive = await isProcessAlive(pid)
  if (!alive) {
    return null
  }

  return {
    pid,
    command: 'unknown',
    args: [],
    startTime: new Date(),
  }
}

/**
 * Worker Pool Manager
 *
 * Manages worker pools for isolated execution with resource limits.
 */

/**
 * Configuration for an individual worker pool
 */
export interface PoolConfig {
  /** Maximum number of concurrent workers in this pool */
  size: number
  /** Process priority (niceness) for workers in this pool */
  nice: number
  /** Memory limit for each worker in MB */
  memoryLimitMB: number
}

/**
 * Configuration for the worker pool manager
 */
export interface WorkerPoolConfig {
  /** Map of pool names to their configurations */
  pools: Record<string, PoolConfig>
  /** Name of the pool to use when none is specified */
  defaultPool: string
}

/**
 * Statistics for a worker pool
 */
export interface PoolStats {
  /** Name of the pool */
  name: string
  /** Number of currently active workers */
  active: number
  /** Number of idle slots (not used in current implementation) */
  idle: number
  /** Maximum worker capacity */
  limit: number
  /** Number of queued tasks (not used in current implementation) */
  queued: number
}

/**
 * Information tracked for an active process
 */
export interface ProcessTrackingInfo {
  /** Process ID */
  pid: number
  /** Name of the pool this process belongs to */
  poolName: string
  /** Task ID associated with this process */
  taskId?: string
  /** Worker ID for logging purposes */
  workerId?: number
  /** Timestamp when the process was acquired */
  acquiredAt: number
}

/**
 * Callback function to terminate a process
 */
export interface TerminateCallback {
  /**
   * @param pid - Process ID to terminate
   * @param reason - Reason for termination
   */
  (pid: number, reason: string): Promise<void>
}

/**
 * WorkerPoolManager manages pools of worker processes with resource isolation.
 * 
 * It provides mechanisms for acquiring and releasing worker slots,
 * tracking process resource usage, and enforcing pool capacities.
 */
export class WorkerPoolManager {
  private config: WorkerPoolConfig
  private trackedProcesses: Map<number, ProcessTrackingInfo> = new Map()
  private terminateCallback: TerminateCallback

  /**
   * Creates a new WorkerPoolManager instance
   * 
   * @param config - Pool configuration
   * @param terminateCallback - Optional callback for process termination
   */
  constructor(config: WorkerPoolConfig, terminateCallback?: TerminateCallback) {
    this.config = config
    this.terminateCallback = terminateCallback || (async () => {})
  }

  /**
   * Acquire a slot in a specific pool
   * 
   * @param poolName - Name of the pool (defaults to defaultPool)
   * @returns Pseudo-PID for tracking the acquired slot
   * @throws Error if pool is at capacity or unknown
   */
  async acquire(poolName?: string): Promise<number> {
    const pool = poolName || this.config.defaultPool
    const poolConfig = this.config.pools[pool]

    if (!poolConfig) {
      throw new Error(`Unknown pool: ${pool}`)
    }

    // Check current active count for this pool
    const activeCount = Array.from(this.trackedProcesses.values())
      .filter(p => p.poolName === pool).length

    if (activeCount >= poolConfig.size) {
      throw new Error(`Pool ${pool} is at capacity (${activeCount}/${poolConfig.size})`)
    }

    // Generate a pseudo-PID for tracking
    const pid = this.generatePid()
    this.trackedProcesses.set(pid, {
      pid,
      poolName: pool,
      acquiredAt: Date.now(),
    })

    return pid
  }

  /**
   * Release a previously acquired slot
   * 
   * @param pid - Pseudo-PID of the slot to release
   */
  async release(pid: number): Promise<void> {
    this.trackedProcesses.delete(pid)
  }

  /**
   * Get current statistics for all pools
   * 
   * @returns Map of pool names to stats
   */
  getStats(): Record<string, PoolStats> {
    const stats: Record<string, PoolStats> = {}

    for (const poolName of Object.keys(this.config.pools)) {
      const poolConfig = this.config.pools[poolName]
      const activeProcesses = Array.from(this.trackedProcesses.values())
        .filter(p => p.poolName === poolName)

      stats[poolName] = {
        name: poolName,
        active: activeProcesses.length,
        idle: 0,
        limit: poolConfig.size,
        queued: 0,
      }
    }

    return stats
  }

  /**
   * Get configuration for a specific pool
   * 
   * @param poolName - Name of the pool
   * @returns Pool configuration
   */
  getPoolConfig(poolName?: string): PoolConfig {
    const pool = poolName || this.config.defaultPool
    return this.config.pools[pool]
  }

  /**
   * Explicitly track a real process in a pool
   * 
   * @param pid - Actual process PID
   * @param poolName - Pool name
   * @param taskId - Optional task ID
   * @param workerId - Optional worker ID
   */
  trackProcess(pid: number, poolName: string, taskId?: string, workerId?: number): void {
    this.trackedProcesses.set(pid, {
      pid,
      poolName,
      taskId,
      workerId,
      acquiredAt: Date.now(),
    })
  }

  /**
   * Stop tracking a process
   * 
   * @param pid - Process PID
   */
  untrackProcess(pid: number): void {
    this.trackedProcesses.delete(pid)
  }

  /**
   * Shut down the manager and clear all tracked processes
   */
  async shutdown(): Promise<void> {
    // Clear all tracked processes
    this.trackedProcesses.clear()
  }

  private generatePid(): number {
    // Generate a pseudo-PID in a range that won't conflict with real PIDs
    return 100000 + Math.floor(Math.random() * 900000)
  }
}

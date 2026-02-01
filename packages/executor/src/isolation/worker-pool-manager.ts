/**
 * Worker Pool Manager
 *
 * Manages worker pools for isolated execution with resource limits.
 */

export interface PoolConfig {
  size: number
  nice: number
  memoryLimitMB: number
}

export interface WorkerPoolConfig {
  pools: Record<string, PoolConfig>
  defaultPool: string
}

export interface PoolStats {
  name: string
  active: number
  idle: number
  limit: number
  queued: number
}

export interface ProcessTrackingInfo {
  pid: number
  poolName: string
  taskId?: string
  workerId?: number
  acquiredAt: number
}

export interface TerminateCallback {
  (pid: number, reason: string): Promise<void>
}

/**
 * WorkerPoolManager manages pools of worker processes with resource isolation.
 */
export class WorkerPoolManager {
  private config: WorkerPoolConfig
  private trackedProcesses: Map<number, ProcessTrackingInfo> = new Map()
  private terminateCallback: TerminateCallback

  constructor(config: WorkerPoolConfig, terminateCallback?: TerminateCallback) {
    this.config = config
    this.terminateCallback = terminateCallback || (async () => {})
  }

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

  async release(pid: number): Promise<void> {
    this.trackedProcesses.delete(pid)
  }

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

  getPoolConfig(poolName?: string): PoolConfig {
    const pool = poolName || this.config.defaultPool
    return this.config.pools[pool]
  }

  trackProcess(pid: number, poolName: string, taskId?: string, workerId?: number): void {
    this.trackedProcesses.set(pid, {
      pid,
      poolName,
      taskId,
      workerId,
      acquiredAt: Date.now(),
    })
  }

  untrackProcess(pid: number): void {
    this.trackedProcesses.delete(pid)
  }

  async shutdown(): Promise<void> {
    // Clear all tracked processes
    this.trackedProcesses.clear()
  }

  private generatePid(): number {
    // Generate a pseudo-PID in a range that won't conflict with real PIDs
    return 100000 + Math.floor(Math.random() * 900000)
  }
}

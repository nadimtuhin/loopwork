import { execSync } from 'child_process'
import type { ProcessInfo, OrphanInfo } from '../../contracts/process-manager'
import type { ProcessRegistry } from './registry'
import { logger } from '../utils'

/**
 * OrphanDetector - Detects orphaned processes using three detection methods:
 * 1. Registry-Parent Check: Process in registry but parent PID dead
 * 2. Pattern Scan: Running processes matching loopwork patterns not in registry
 * 3. Stale Timeout: Process running > 2x configured timeout without activity
 */
export class OrphanDetector {
  constructor(
    private registry: ProcessRegistry,
    private patterns: string[],
    private staleTimeoutMs: number
  ) {}

  /**
   * Scan for orphan processes using all three detection methods
   */
  async scan(): Promise<OrphanInfo[]> {
    const orphans: OrphanInfo[] = []

    // Method 1: Registry-Parent Check
    const registryOrphans = this.detectDeadParents()
    orphans.push(...registryOrphans)

    // Method 2: Pattern Scan
    const untrackedOrphans = await this.detectUntrackedProcesses()
    orphans.push(...untrackedOrphans)

    // Method 3: Stale Timeout
    const staleOrphans = this.detectStaleProcesses()
    orphans.push(...staleOrphans)

    // Deduplicate by PID
    const seen = new Set<number>()
    return orphans.filter(o => {
      if (seen.has(o.pid)) return false
      seen.add(o.pid)
      return true
    })
  }

  /**
   * Method 1: Check if tracked processes have dead parent PIDs
   */
  private detectDeadParents(): OrphanInfo[] {
    const orphans: OrphanInfo[] = []
    const tracked = this.registry.list()

    for (const process of tracked) {
      if (process.parentPid && !this.isProcessAlive(process.parentPid)) {
        orphans.push({
          pid: process.pid,
          reason: 'parent-dead',
          process
        })
      }
    }

    return orphans
  }

  /**
   * Method 2: Scan running processes for untracked matches
   */
  private async detectUntrackedProcesses(): Promise<OrphanInfo[]> {
    const orphans: OrphanInfo[] = []
    const running = this.scanRunningProcesses()
    const tracked = new Set(this.registry.list().map(p => p.pid))

    for (const proc of running) {
      if (!tracked.has(proc.pid)) {
        orphans.push({
          pid: proc.pid,
          reason: 'untracked',
          process: proc
        })
      }
    }

    return orphans
  }

  /**
   * Method 3: Check for processes running too long
   */
  private detectStaleProcesses(): OrphanInfo[] {
    const orphans: OrphanInfo[] = []
    const tracked = this.registry.list()
    const now = Date.now()
    const staleThreshold = this.staleTimeoutMs * 2

    for (const process of tracked) {
      const runningTime = now - process.startTime
      if (runningTime > staleThreshold) {
        orphans.push({
          pid: process.pid,
          reason: 'stale',
          process
        })
      }
    }

    return orphans
  }

  /**
   * Scan running processes matching patterns
   */
  private scanRunningProcesses(): ProcessInfo[] {
    const processes: ProcessInfo[] = []

    try {
      // Platform-specific process listing
      const platform = process.platform
      let psOutput: string

      if (platform === 'win32') {
        // Windows: Use tasklist
        psOutput = execSync('tasklist /FO CSV /NH', { encoding: 'utf-8' })
        processes.push(...this.parseWindowsProcesses(psOutput))
      } else {
        // Unix: Use ps
        psOutput = execSync('ps -eo pid,ppid,command', { encoding: 'utf-8' })
        processes.push(...this.parseUnixProcesses(psOutput))
      }
    } catch (error) {
      // If ps/tasklist fails, return empty (don't crash)
      logger.warn(`Failed to scan running processes: ${error}`)
    }

    // Filter by patterns
    return processes.filter(p => {
      return this.patterns.some(pattern => p.command.includes(pattern))
    })
  }

  /**
   * Parse Unix ps output
   */
  private parseUnixProcesses(output: string): ProcessInfo[] {
    const lines = output.trim().split('\n').slice(1) // Skip header
    const processes: ProcessInfo[] = []

    for (const line of lines) {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/)
      if (!match) continue

      const [, pid, ppid, command] = match
      processes.push({
        pid: parseInt(pid, 10),
        parentPid: parseInt(ppid, 10),
        command,
        args: [],
        namespace: 'unknown',
        startTime: 0,
        status: 'running'
      })
    }

    return processes
  }

  /**
   * Parse Windows tasklist output
   */
  private parseWindowsProcesses(output: string): ProcessInfo[] {
    const lines = output.trim().split('\n')
    const processes: ProcessInfo[] = []

    for (const line of lines) {
      // CSV format: "ImageName","PID","SessionName","SessionNum","MemUsage"
      const match = line.match(/"([^"]+)","(\d+)"/)
      if (!match) continue

      const [, command, pid] = match
      processes.push({
        pid: parseInt(pid, 10),
        command,
        args: [],
        namespace: 'unknown',
        startTime: 0,
        status: 'running'
      })
    }

    return processes
  }

  /**
   * Check if a process is alive
   */
  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0) // Signal 0 checks existence
      return true
    } catch {
      return false
    }
  }
}

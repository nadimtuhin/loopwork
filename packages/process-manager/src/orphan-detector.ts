import { execSync } from 'child_process'
import type { OrphanInfo, ProcessInfo } from '@loopwork-ai/contracts/process'
import type { ProcessRegistry } from './registry'
import { isProcessAlive } from './index'

export class OrphanDetector {
  constructor(
    private registry: ProcessRegistry,
    private patterns: string[],
    private staleTimeoutMs: number
  ) {}

  async scan(): Promise<OrphanInfo[]> {
    const orphans: OrphanInfo[] = []

    const registryOrphans = this.detectDeadParents()
    orphans.push(...registryOrphans)

    const staleOrphans = this.detectStaleProcesses()
    orphans.push(...staleOrphans)

    const untrackedOrphans = this.detectUntrackedProcesses()
    orphans.push(...untrackedOrphans)

    const seen = new Set<number>()
    return orphans.filter(o => {
      if (seen.has(o.pid)) return false
      seen.add(o.pid)
      return true
    })
  }

  private detectDeadParents(): OrphanInfo[] {
    const orphans: OrphanInfo[] = []
    const tracked = this.registry.list()

    for (const process of tracked) {
      if (process.parentPid && !isProcessAliveSync(process.parentPid)) {
        orphans.push({
          pid: process.pid,
          reason: 'parent-dead',
          process
        })
      }
    }

    return orphans
  }

  private detectStaleProcesses(): OrphanInfo[] {
    const orphans: OrphanInfo[] = []
    const tracked = this.registry.list()
    const now = Date.now()
    const staleThreshold = this.staleTimeoutMs

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

  private detectUntrackedProcesses(): OrphanInfo[] {
    const orphans: OrphanInfo[] = []
    const running = this.scanRunningProcesses()
    const trackedPids = new Set(this.registry.list().map(p => p.pid))

    for (const process of running) {
      if (!trackedPids.has(process.pid)) {
        orphans.push({
          pid: process.pid,
          reason: 'untracked',
          process
        })
      }
    }

    return orphans
  }

  private scanRunningProcesses(): ProcessInfo[] {
    const processes: ProcessInfo[] = []

    try {
      const platform = process.platform
      let psOutput: string

      if (platform === 'win32') {
        psOutput = execSync('tasklist /FO CSV /NH', { encoding: 'utf-8' })
        processes.push(...this.parseWindowsProcesses(psOutput))
      } else {
        psOutput = execSync('ps -eo pid,ppid,command', { encoding: 'utf-8' })
        processes.push(...this.parseUnixProcesses(psOutput))
      }
    } catch (error) {
    }

    return processes.filter(p => {
      return this.patterns.some(pattern => p.command.includes(pattern))
    })
  }

  private parseUnixProcesses(output: string): ProcessInfo[] {
    const lines = output.trim().split('\n').slice(1)
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

  private parseWindowsProcesses(output: string): ProcessInfo[] {
    const lines = output.trim().split('\n')
    const processes: ProcessInfo[] = []

    for (const line of lines) {
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
}

function isProcessAliveSync(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

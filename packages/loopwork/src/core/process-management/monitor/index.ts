import { execSync } from 'child_process'
import type { ProcessInfo, OrphanInfo } from '../../contracts/process-manager'
import type { ProcessRegistry } from './registry'
import type { ISpawner } from '@loopwork-ai/contracts'
import { logger } from '../utils'

export interface ResourceLimits {
  cpuLimit?: number
  memoryLimitMB?: number
  checkIntervalMs?: number
  gracePeriodMs?: number
  enabled?: boolean
}

export interface ProcessResourceUsage {
  pid: number
  cpu: number
  memory: number
  runningTime: number
}

export class ProcessResourceMonitor {
  private intervalId: NodeJS.Timeout | null = null
  private registry: ProcessRegistry
  private spawner: ISpawner
  private limits: Required<ResourceLimits>
  private checkCount: number = 0

  constructor(
    registry: ProcessRegistry,
    spawner: ISpawner,
    limits: ResourceLimits = {}
  ) {
    this.registry = registry
    this.spawner = spawner

    this.limits = {
      cpuLimit: 100,
      memoryLimitMB: 2048,
      checkIntervalMs: 10000,
      gracePeriodMs: 5000,
      enabled: true,
      ...limits
    }
  }

  start(): void {
    if (!this.limits.enabled) {
      logger.debug('ProcessResourceMonitor: Monitoring disabled')
      return
    }

    if (this.intervalId) {
      logger.warn('ProcessResourceMonitor: Already running')
      return
    }

    logger.debug('ProcessResourceMonitor: Starting monitoring')
    this.checkCount = 0

    this.check()

    this.intervalId = setInterval(() => {
      this.check()
    }, this.limits.checkIntervalMs)
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
      logger.debug('ProcessResourceMonitor: Stopped monitoring')
    }
  }

  async check(): Promise<void> {
    if (!this.limits.enabled) {
      return
    }

    this.checkCount++
    const processes = this.registry.list()

    if (processes.length === 0) {
      return
    }

    logger.debug(
      `ProcessResourceMonitor: Checking ${processes.length} processes (check #${this.checkCount})`
    )

    const violations: Array<{
      pid: number
      usage: ProcessResourceUsage
      limitExceeded: boolean
    }> = []

    for (const process of processes) {
      try {
        const usage = this.getProcessResourceUsage(process.pid)
        const exceeded = this.isLimitExceeded(process.pid, usage)
        violations.push({ pid: process.pid, usage, limitExceeded: exceeded })
      } catch (error) {
        logger.debug(`ProcessResourceMonitor: Failed to get usage for PID ${process.pid}`)
      }
    }

    const exceededCount = violations.filter((v) => v.limitExceeded).length
    if (exceededCount > 0) {
      logger.warn(
        `ProcessResourceMonitor: ${exceededCount} processes exceeded limits`
      )
    }

    for (const violation of violations) {
      if (violation.limitExceeded) {
        this.handleLimitExceeded(violation)
      }
    }
  }

  private getProcessResourceUsage(pid: number): ProcessResourceUsage {
    const platform = process.platform
    const cpu = this.getCPUUsage(pid, platform)
    const memory = this.getMemoryUsage(pid, platform)

    const processInfo = this.registry.get(pid)
    const runningTime = processInfo ? Date.now() - processInfo.startTime : 0

    return { pid, cpu, memory, runningTime }
  }

  private getCPUUsage(pid: number, platform: string): number {
    if (platform === 'win32') {
      logger.debug('ProcessResourceMonitor: CPU usage not supported on Windows')
      return 0
    }

    try {
      const command = this.getCPUCommand(pid)
      const output = execSync(command, { encoding: 'utf-8' })

      const lines = output.trim().split('\n')
      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        if (parts[0] === pid.toString()) {
          const cpu = parseFloat(parts[1])
          return isNaN(cpu) ? 0 : cpu
        }
      }

      return 0
    } catch (error) {
      return 0
    }
  }

  private getCPUCommand(pid: number): string {
    const platform = process.platform

    if (platform === 'darwin') {
      return `ps -p ${pid} -o %cpu=`
    } else {
      return `ps -p ${pid} -o %cpu=`
    }
  }

  private getMemoryUsage(pid: number, platform: string): number {
    try {
      let output: string

      if (platform === 'win32') {
        output = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, {
          encoding: 'utf-8',
        })
        const match = output.match(/"([^"]+)","(\d+)","[^"]*","[^"]*","(\d+)(\w)"/)
        if (match) {
          const memKb = parseInt(match[3], 10)
          return memKb / 1024
        }
      } else {
        output = execSync(`ps -p ${pid} -o rss=`, { encoding: 'utf-8' })
        const rssKb = parseInt(output.trim(), 10)
        return rssKb / 1024
      }

      return 0
    } catch (error) {
      return 0
    }
  }

  private isLimitExceeded(pid: number, usage: ProcessResourceUsage): boolean {
    let exceeded = false

    if (this.limits.cpuLimit && usage.cpu > this.limits.cpuLimit) {
      exceeded = true
      logger.warn(
        `ProcessResourceMonitor: PID ${pid} exceeded CPU limit: ${usage.cpu}% (limit: ${this.limits.cpuLimit}%)`
      )
    }

    if (this.limits.memoryLimitMB && usage.memory > this.limits.memoryLimitMB) {
      exceeded = true
      logger.warn(
        `ProcessResourceMonitor: PID ${pid} exceeded memory limit: ${usage.memory.toFixed(1)}MB (limit: ${this.limits.memoryLimitMB}MB)`
      )
    }

    return exceeded
  }

  private handleLimitExceeded(violation: {
    pid: number
    usage: ProcessResourceUsage
    limitExceeded: boolean
  }): void {
    const { pid } = violation

    try {
      process.kill(pid, 0)
    } catch {
      this.registry.remove(pid)
      return
    }

    const processInfo = this.registry.get(pid)
    if (!processInfo) {
      return
    }

    const runningTime = Date.now() - processInfo.startTime
    if (runningTime < this.limits.gracePeriodMs) {
      logger.debug(
        `ProcessResourceMonitor: PID ${pid} exceeded limits, waiting grace period (${runningTime}ms / ${this.limits.gracePeriodMs}ms)`
      )
      return
    }

    logger.warn(
      `ProcessResourceMonitor: Terminating PID ${pid} due to resource limit violations`
    )

    try {
      this.terminateProcess(pid)
      this.registry.remove(pid)
    } catch (error: any) {
      logger.error(`ProcessResourceMonitor: Failed to terminate PID ${pid}: ${error}`)
    }
  }

  private terminateProcess(pid: number): void {
    const platform = process.platform

    try {
      process.kill(pid, 'SIGTERM')

      logger.debug(`ProcessResourceMonitor: Sent SIGTERM to PID ${pid}`)

      if (platform !== 'win32') {
        setTimeout(() => {
          try {
            process.kill(pid, 'SIGKILL')
            logger.debug(`ProcessResourceMonitor: Sent SIGKILL to PID ${pid}`)
          } catch (error: any) {
            logger.debug(`ProcessResourceMonitor: PID ${pid} already terminated`)
          }
        }, this.limits.gracePeriodMs)
      }
    } catch (error: any) {
      if (error.code === 'ESRCH' || error.errno === 3) {
        logger.debug(`ProcessResourceMonitor: PID ${pid} already terminated`)
      } else {
        throw error
      }
    }
  }

  getResourceLimits(): ResourceLimits {
    return {
      cpuLimit: this.limits.cpuLimit,
      memoryLimitMB: this.limits.memoryLimitMB,
      checkIntervalMs: this.limits.checkIntervalMs,
      gracePeriodMs: this.limits.gracePeriodMs,
      enabled: this.limits.enabled,
    }
  }

  setResourceLimits(limits: Partial<ResourceLimits>): void {
    this.limits = {
      ...this.limits,
      ...limits,
    }

    this.limits.checkIntervalMs = this.limits.checkIntervalMs ?? 10000
    this.limits.gracePeriodMs = this.limits.gracePeriodMs ?? 5000
    this.limits.enabled = this.limits.enabled ?? true

    logger.debug('ProcessResourceMonitor: Updated limits', this.limits)
  }

  isEnabled(): boolean {
    return this.limits.enabled
  }

  isRunning(): boolean {
    return this.intervalId !== null
  }

  getStats() {
    return {
      checkCount: this.checkCount,
      enabled: this.limits.enabled,
      running: this.isRunning(),
      limits: { ...this.limits },
    }
  }
}

export function createProcessResourceMonitor(
  registry: ProcessRegistry,
  spawner: ISpawner,
  options?: Partial<ResourceLimits>
): ProcessResourceMonitor {
  return new ProcessResourceMonitor(registry, spawner, options)
}

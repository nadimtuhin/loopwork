import { execSync } from 'child_process'
import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import type { ProcessFingerprint, SessionId } from './types'

export class SessionFingerprint {
  private cachedBootId: string | null = null

  getBootId(): string {
    if (this.cachedBootId) return this.cachedBootId

    try {
      this.cachedBootId = readFileSync('/proc/sys/kernel/random/boot_id', 'utf-8').trim()
    } catch {
      this.cachedBootId = execSync('sysctl -n kern.boottime 2>/dev/null || date +%s', { encoding: 'utf-8' }).trim()
    }
    return this.cachedBootId
  }

  getProcessStartTime(pid: number): number {
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf-8')
      const match = stat.match(/\((.*)\)\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+(\d+)/)
      return match ? parseInt(match[2], 10) : 0
    } catch {
      return 0
    }
  }

  getProcessCommandHash(pid: number): string {
    try {
      const cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf-8')
      return createHash('sha256').update(cmdline).digest('hex').slice(0, 16)
    } catch {
      return ''
    }
  }

  createFingerprint(pid: number): ProcessFingerprint {
    return {
      pid,
      bootId: this.getBootId(),
      startTime: this.getProcessStartTime(pid),
      commandHash: this.getProcessCommandHash(pid)
    }
  }

  generateSessionId(): SessionId {
    return {
      id: crypto.randomUUID(),
      startedAt: Date.now(),
      parentPid: process.pid,
      hostname: require('os').hostname()
    }
  }

  validateFingerprint(fingerprint: ProcessFingerprint, currentPid: number): boolean {
    if (fingerprint.bootId !== this.getBootId()) return false
    const currentStartTime = this.getProcessStartTime(currentPid)
    return currentStartTime === fingerprint.startTime
  }
}
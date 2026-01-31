import type { OrphanInfo, CleanupResult } from '../../contracts/process-manager'
import { ProcessRegistry } from './registry'
import { logger } from '../utils'
import { isProcessAlive } from '../../commands/shared/process-utils'
import { LoopworkError } from '../errors'

export class ProcessCleaner {
  private registry: ProcessRegistry

  constructor(registry: ProcessRegistry) {
    this.registry = registry
  }

  async cleanup(orphans: OrphanInfo[]): Promise<CleanupResult> {
    const result: CleanupResult = {
      cleaned: [],
      failed: [],
      alreadyGone: []
    }

    if (orphans.length === 0) {
      return result
    }

    for (const orphan of orphans) {
      try {
        const success = await this.gracefulKill(orphan.pid)
        if (success) {
          result.cleaned.push(orphan.pid)
          this.registry.remove(orphan.pid)
        } else {
          result.failed.push({
            pid: orphan.pid,
            error: 'Failed to terminate process'
          })
        }
      } catch (error: unknown) {
        result.failed.push({
          pid: orphan.pid,
          error: (error as Error).message || 'Unknown error'
        })
      }
    }

    return result
  }

  async gracefulKill(pid: number): Promise<boolean> {
    if (!isProcessAlive(pid)) {
      return true
    }

    try {
      process.kill(pid, 'SIGTERM')
      await sleep(5000)

      if (!isProcessAlive(pid)) {
        return true
      }

      return this.forceKill(pid)
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
        return true
      }
      if ((error as NodeJS.ErrnoException).code === 'EPERM') {
        throw new LoopworkError(
          'ERR_PROCESS_KILL',
          `Permission denied to kill process ${pid}`,
          [
            'Process may be owned by another user',
            'Try running with elevated privileges (sudo)',
          ]
        )
      }
      throw error
    }
  }

  forceKill(pid: number): boolean {
    try {
      process.kill(pid, 'SIGKILL')
      return !isProcessAlive(pid)
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
        return false
      }
      if ((error as NodeJS.ErrnoException).code === 'EPERM') {
        throw new LoopworkError(
          'ERR_PROCESS_KILL',
          `Permission denied to kill process ${pid}`,
          [
            'Process may be owned by another user',
            'Try running with elevated privileges (sudo)',
          ]
        )
      }
      throw error
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export default ProcessCleaner

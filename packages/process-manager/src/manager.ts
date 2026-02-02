import { EventEmitter } from 'events'
import type { 
  IProcessManager, 
  ISpawnedProcess, 
  ISpawner, 
  SpawnOptions, 
  KillOptions, 
  ProcessMetadata, 
  ProcessInfo, 
  CleanupResult 
} from '@loopwork-ai/contracts/process'
import type { ProcessRegistry } from './registry'
import type { OrphanDetector } from './orphan-detector'

export class ProcessManager extends EventEmitter implements IProcessManager {
  constructor(
    private registry: ProcessRegistry,
    private spawner: ISpawner,
    private detector: OrphanDetector
  ) {
    super()
  }

  spawn(command: string, args: string[], options?: SpawnOptions): ISpawnedProcess {
    const process = this.spawner.spawn(command, args, options)
    
    if (process.pid) {
      const metadata: ProcessMetadata = {
        command,
        args,
        startTime: Date.now(),
        namespace: 'default'
      }
      
      this.registry.add(process.pid, metadata).catch(err => {
        this.emit('error', new Error(`Failed to track process ${process.pid}: ${err.message}`))
      })

      process.on('exit', (code, signal) => {
        this.registry.remove(process.pid!).catch(() => {})
        this.emit('exit', { pid: process.pid, code, signal })
      })
    }

    return process
  }

  kill(pid: number, options?: KillOptions): boolean {
    try {
      const signal = options?.signal || 'SIGTERM'
      process.kill(pid, signal)
      
      if (options?.force) {
        setTimeout(() => {
          try {
            process.kill(pid, 'SIGKILL')
          } catch {
          }
        }, 1000)
      }
      
      return true
    } catch (error) {
      return false
    }
  }

  track(pid: number, metadata: ProcessMetadata): void {
    this.registry.add(pid, metadata).catch(err => {
      this.emit('error', new Error(`Failed to track process ${pid}: ${err.message}`))
    })
  }

  untrack(pid: number): void {
    this.registry.remove(pid).catch(() => {})
  }

  listChildren(): ProcessInfo[] {
    return this.registry.list()
  }

  listByNamespace(namespace: string): ProcessInfo[] {
    return this.registry.listByNamespace(namespace)
  }

  async cleanup(): Promise<CleanupResult> {
    const orphans = await this.detector.scan()
    const cleaned: number[] = []
    const failed: Array<{ pid: number; error: string }> = []
    const alreadyGone: number[] = []

    for (const orphan of orphans) {
      try {
        const success = this.kill(orphan.pid, { force: true, signal: 'SIGKILL' })
        if (success) {
          cleaned.push(orphan.pid)
          await this.registry.remove(orphan.pid)
        } else {
          failed.push({ pid: orphan.pid, error: 'Failed to send kill signal' })
        }
      } catch (err: any) {
        if (err.code === 'ESRCH') {
          alreadyGone.push(orphan.pid)
          await this.registry.remove(orphan.pid)
        } else {
          failed.push({ pid: orphan.pid, error: err.message })
        }
      }
    }

    return {
      cleaned,
      failed,
      alreadyGone
    }
  }

  async persist(): Promise<void> {
    await this.registry.persist()
  }

  async load(): Promise<void> {
    await this.registry.load()
  }
}

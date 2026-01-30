/**
 * Standard Process Spawner
 *
 * Uses Node.js child_process.spawn for process spawning.
 * This is the fallback spawner that is always available.
 */

import { spawn, type ChildProcess } from 'child_process'
import type { Readable, Writable } from 'stream'
import type { ProcessSpawner, SpawnedProcess, SpawnOptions } from '../../contracts/spawner'

/**
 * Wraps a ChildProcess to implement SpawnedProcess interface
 */
class StandardSpawnedProcess implements SpawnedProcess {
  constructor(private readonly child: ChildProcess) {}

  get pid(): number | undefined {
    return this.child.pid
  }

  get stdout(): Readable | null {
    return this.child.stdout
  }

  get stderr(): Readable | null {
    return this.child.stderr
  }

  get stdin(): Writable | null {
    return this.child.stdin
  }

  kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    return this.child.kill(signal)
  }

  on(event: 'close', listener: (code: number | null) => void): this
  on(event: 'error', listener: (err: Error) => void): this
  on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this
  on(event: string, listener: (...args: unknown[]) => void): this
  on(
    event: string,
    listener: ((code: number | null) => void) | ((err: Error) => void) | ((code: number | null, signal: NodeJS.Signals | null) => void) | ((...args: unknown[]) => void)
  ): this {
    this.child.on(event, listener as (...args: unknown[]) => void)
    return this
  }
}

/**
 * Standard spawner using child_process.spawn
 *
 * Always available as it uses built-in Node.js APIs.
 * Provides separate stdout and stderr streams.
 */
export class StandardSpawner implements ProcessSpawner {
  readonly name = 'standard'

  isAvailable(): boolean {
    return true
  }

  spawn(command: string, args: string[], options?: SpawnOptions): SpawnedProcess {
    const child = spawn(command, args, {
      env: options?.env,
      cwd: options?.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    return new StandardSpawnedProcess(child)
  }
}

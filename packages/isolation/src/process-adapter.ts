import { type ChildProcess } from 'child_process'
import type { Readable, Writable } from 'stream'
import type { ISpawnedProcess } from '@loopwork-ai/contracts'

/**
 * Wraps a Node.js ChildProcess to implement ISpawnedProcess interface
 */
export class ChildProcessAdapter implements ISpawnedProcess {
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

  kill(signal: string | number = 'SIGTERM'): boolean {
    return this.child.kill(signal as any)
  }

  on(event: 'close', listener: (code: number | null) => void): this
  on(event: 'error', listener: (err: Error) => void): this
  on(event: 'exit', listener: (code: number | null, signal: string | null) => void): this
  on(event: string, listener: (...args: any[]) => void): this
  on(
    event: string,
    listener: ((code: number | null) => void) | ((err: Error) => void) | ((code: number | null, signal: string | null) => void) | ((...args: any[]) => void)
  ): this {
    this.child.on(event, listener)
    return this
  }
}

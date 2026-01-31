/**
 * Bun Process Spawner
 *
 * Uses Bun.spawn for high-performance process spawning.
 * Available only when running in the Bun runtime.
 */

import { Readable, Writable, PassThrough } from 'stream'
import type { ProcessSpawner, SpawnedProcess, SpawnOptions } from '../../contracts/spawner'

/**
 * Wraps a Bun subprocess to implement SpawnedProcess interface
 */
class BunSpawnedProcess implements SpawnedProcess {
  private readonly _stdout: PassThrough
  private readonly _stderr: PassThrough
  private readonly _stdin: PassThrough
  private readonly eventHandlers: Map<string, ((...args: unknown[]) => void)[]> = new Map()

  constructor(private readonly proc: any) {
    this._stdout = new PassThrough()
    this._stderr = new PassThrough()
    this._stdin = new PassThrough()

    // Pipe Bun stdout to PassThrough for Node stream compatibility
    this.streamToPassThrough(proc.stdout, this._stdout)
    this.streamToPassThrough(proc.stderr, this._stderr)

    // Pipe PassThrough to Bun stdin
    this.handleStdin(proc.stdin, this._stdin)

    // Handle process completion
    proc.exited.then((code: number) => {
      this._stdout.end()
      this._stderr.end()
      this.emit('exit', code, null)
      this.emit('close', code)
    }).catch((err: Error) => {
      this.emit('error', err)
    })
  }

  private async streamToPassThrough(readable: any, passThrough: PassThrough) {
    if (!readable) {
      passThrough.end()
      return
    }

    try {
      const reader = readable.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) passThrough.write(value)
      }
    } catch (err) {
      this.emit('error', err as Error)
    } finally {
      passThrough.end()
    }
  }

  private async handleStdin(writer: any, passThrough: PassThrough) {
    if (!writer) return

    passThrough.on('data', (chunk) => {
      writer.write(chunk)
    })

    passThrough.on('finish', () => {
      writer.end()
    })
  }

  get pid(): number | undefined {
    return this.proc.pid
  }

  get stdout(): Readable | null {
    return this._stdout
  }

  get stderr(): Readable | null {
    return this._stderr
  }

  get stdin(): Writable | null {
    return this._stdin
  }

  kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    this.proc.kill(signal)
    return true
  }

  on(event: 'close', listener: (code: number | null) => void): this
  on(event: 'error', listener: (err: Error) => void): this
  on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this
  on(event: string, listener: (...args: unknown[]) => void): this
  on(
    event: string,
    listener: ((code: number | null) => void) | ((err: Error) => void) | ((code: number | null, signal: NodeJS.Signals | null) => void) | ((...args: unknown[]) => void)
  ): this {
    const handlers = this.eventHandlers.get(event) || []
    handlers.push(listener as (...args: unknown[]) => void)
    this.eventHandlers.set(event, handlers)
    return this
  }

  private emit(event: string, ...args: unknown[]) {
    const handlers = this.eventHandlers.get(event) || []
    for (const handler of handlers) {
      handler(...args)
    }
  }
}

export class BunSpawner implements ProcessSpawner {
  readonly name = 'bun'

  isAvailable(): boolean {
    return typeof Bun !== 'undefined'
  }

  spawn(command: string, args: string[], options?: SpawnOptions): SpawnedProcess {
    let finalCommand = command
    let finalArgs = args

    if (options?.nice !== undefined && process.platform !== 'win32') {
      finalCommand = 'nice'
      finalArgs = ['-n', options.nice.toString(), command, ...args]
    }

    // @ts-ignore - Bun is global in this environment
    const proc = Bun.spawn([finalCommand, ...finalArgs], {
      env: options?.env as any,
      cwd: options?.cwd,
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    })

    return new BunSpawnedProcess(proc)
  }
}

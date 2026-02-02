/**
 * PTY Process Spawner
 *
 * Uses node-pty for pseudo-terminal based process spawning.
 * This enables real-time streaming output from CLIs that buffer
 * when stdout is not a TTY.
 */

import { Readable, Writable, PassThrough } from 'stream'
import type { ISpawnedProcess, ISpawner, SpawnOptions } from '@loopwork-ai/contracts/process'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IPty = any

/**
 * Minimal interface for node-pty module
 * Defined locally to avoid compile-time dependency on node-pty types
 */
interface NodePtyModule {
  spawn(
    file: string,
    args: string[],
    options: {
      name?: string
      cols?: number
      rows?: number
      cwd?: string
      env?: Record<string, string>
    }
  ): IPty
}

// Cached availability check
let _ptyModule: NodePtyModule | null = null
let _ptyAvailabilityChecked = false
let _ptyAvailable = false

/**
 * Check if node-pty is available
 */
export function isPtyAvailable(): boolean {
  if (_ptyAvailabilityChecked) {
    return _ptyAvailable
  }

  _ptyAvailabilityChecked = true

  try {
    // Try to require node-pty
    _ptyModule = require('node-pty')
    _ptyAvailable = true
  } catch {
    _ptyAvailable = false
  }

  return _ptyAvailable
}

/**
 * Get the node-pty module (throws if not available)
 */
function getPtyModule(): NodePtyModule {
  if (!isPtyAvailable() || !_ptyModule) {
    throw new Error(
      'node-pty is not available. Install it with: npm install node-pty\n' +
      'Note: node-pty requires native module compilation. If installation fails,\n' +
      'the system will automatically fall back to standard process spawning.'
    )
  }
  return _ptyModule
}

/**
 * Wraps a PTY process to implement SpawnedProcess interface
 */
class PtySpawnedProcess implements ISpawnedProcess {
  private readonly _stdout: PassThrough
  private readonly _stdin: PassThrough
  private _closed = false
  private readonly eventHandlers: Map<string, ((...args: unknown[]) => void)[]> = new Map()

  constructor(private readonly pty: IPty) {
    // Create streams that wrap PTY I/O
    this._stdout = new PassThrough()
    this._stdin = new PassThrough()

    // Forward PTY data to stdout stream
    this.pty.onData((data: string) => {
      if (!this._closed) {
        this._stdout.write(data)
      }
    })

    // Forward stdin writes to PTY
    this._stdin.on('data', (data: Buffer) => {
      if (!this._closed) {
        this.pty.write(data.toString())
      }
    })

    // When stdin ends, send EOF character to PTY
    // This is critical because calling .end() on the PassThrough doesn't
    // automatically send EOF to the PTY like it does with standard spawn
    this._stdin.on('finish', () => {
      if (!this._closed) {
        this.pty.write('\x04') // Send EOF (Ctrl+D)
      }
    })

    // Handle PTY exit
    this.pty.onExit(({ exitCode, signal }: { exitCode: number; signal?: number }) => {
      this._closed = true
      this._stdout.end()

      // Emit exit event
      const exitHandlers = this.eventHandlers.get('exit') || []
      for (const handler of exitHandlers) {
        handler(exitCode, signal ? `SIG${signal}` : null)
      }

      // Emit close event
      const closeHandlers = this.eventHandlers.get('close') || []
      for (const handler of closeHandlers) {
        handler(exitCode)
      }
    })
  }

  get pid(): number | undefined {
    return this.pty.pid
  }

  get stdout(): Readable | null {
    return this._stdout
  }

  get stderr(): Readable | null {
    // PTY merges stderr into stdout
    return null
  }

  get stdin(): Writable | null {
    return this._stdin
  }

  kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    try {
      // node-pty uses numeric signals
      const signalNum = signalToNumber(signal)
      this.pty.kill(signalNum)
      return true
    } catch {
      return false
    }
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
}

/**
 * Convert signal name to number
 */
function signalToNumber(signal: NodeJS.Signals): number {
  const signals: Record<string, number> = {
    SIGHUP: 1,
    SIGINT: 2,
    SIGQUIT: 3,
    SIGKILL: 9,
    SIGTERM: 15,
    SIGCONT: 18,
    SIGSTOP: 19,
  }
  return signals[signal] || 15 // Default to SIGTERM
}

/**
 * Options for PtySpawner constructor
 */
export interface PtySpawnerOptions {
  /**
   * If true, throw an error if node-pty is not available.
   * If false (default), isAvailable() will return false but no error is thrown.
   */
  forceRequired?: boolean
}

/**
 * PTY spawner using node-pty
 *
 * Provides a pseudo-terminal for processes, enabling:
 * - Real-time streaming output (no buffering)
 * - Proper terminal escape sequence handling
 * - Interactive process support
 *
 * Note: stderr is merged into stdout (PTY behavior)
 */
export class PtySpawner implements ISpawner {
  readonly name = 'pty'

  constructor(options?: PtySpawnerOptions) {
    if (options?.forceRequired && !isPtyAvailable()) {
      throw new Error(
        'node-pty is required but not available. Install it with: npm install node-pty'
      )
    }
  }

  isAvailable(): boolean {
    return isPtyAvailable()
  }

  spawn(command: string, args: string[], options?: SpawnOptions): ISpawnedProcess {
    let finalCommand = command
    let finalArgs = args

    // Apply nice priority if requested and not on Windows
    if (options?.nice !== undefined && process.platform !== 'win32') {
      finalCommand = 'nice'
      finalArgs = ['-n', options.nice.toString(), command, ...args]
    }

    const pty = getPtyModule()

    const ptyProcess = pty.spawn(finalCommand, finalArgs, {
      name: 'xterm-256color',
      cols: options?.cols ?? 120,
      rows: options?.rows ?? 30,
      cwd: options?.cwd,
      env: options?.env as Record<string, string> | undefined,
    })

    return new PtySpawnedProcess(ptyProcess)
  }
}

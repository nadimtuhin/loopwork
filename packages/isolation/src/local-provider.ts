import { spawn, type SpawnOptions as NodeSpawnOptions } from 'child_process'
import type { ISpawnedProcess, SpawnOptions } from '@loopwork-ai/contracts'
import { ChildProcessAdapter } from './process-adapter'
import type { SandboxProvider, SandboxConfig, SandboxHandle } from './index'

/**
 * LocalIsolationProvider provides no-isolation execution (direct process spawning)
 *
 * This is a "no-op" provider that executes commands directly on the host system.
 * No sandboxing or resource limits are applied beyond what the OS provides.
 */
export class LocalIsolationProvider implements SandboxProvider {
  readonly name = 'local'

  /**
   * Local provider is always available
   */
  async isAvailable(): Promise<boolean> {
    return true
  }

  /**
   * Acquire a local process handle
   *
   * @param config - Sandbox configuration (unused for local provider)
   * @returns LocalProcessHandle instance
   */
  async acquire(config: SandboxConfig): Promise<SandboxHandle> {
    return new LocalProcessHandle(config)
  }

  /**
   * Release a local process handle (no-op)
   *
   * @param _handle - Handle to release (unused)
   */
  async release(_handle: SandboxHandle): Promise<void> {
    // No-op for local processes
  }
}

/**
 * LocalProcessHandle represents a direct process execution on the host system
 */
class LocalProcessHandle implements SandboxHandle {
  readonly id: string
  readonly provider = 'local'
  pid?: number
  private _isTerminated = false

  constructor(private config: SandboxConfig) {
    this.id = `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Check if the process is still active
   */
  isActive(): boolean {
    return !this._isTerminated
  }

  /**
   * Spawn a process directly on the host
   */
  async spawn(command: string, args: string[], options?: SpawnOptions): Promise<ISpawnedProcess> {
    const spawnOptions: NodeSpawnOptions = {
      cwd: options?.cwd || this.config.workingDirectory,
      env: { ...process.env, ...this.config.env, ...options?.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    }

    const child = spawn(command, args, spawnOptions)
    this.pid = child.pid
    
    // When process exits, we consider it terminated
    child.on('exit', () => {
      this._isTerminated = true
    })

    return new ChildProcessAdapter(child)
  }

  /**
   * Terminate the process (mark as terminated)
   *
   * @param _signal - Signal to send (unused for local provider)
   */
  async terminate(_signal = 'SIGTERM'): Promise<void> {
    this._isTerminated = true
    this.pid = undefined
  }

  /**
   * Cleanup resources (no-op for local provider)
   */
  async cleanup(): Promise<void> {
    // Local processes don't need special cleanup
  }
}

export interface SandboxProvider {
  /** Unique provider identifier */
  readonly name: string

  /** Check if provider is available in the current environment */
  isAvailable(): boolean | Promise<boolean>

  /** Acquire a sandbox slot with configuration */
  acquire(config: SandboxConfig): Promise<SandboxHandle>

  /** Release a sandbox slot */
  release(handle: SandboxHandle): Promise<void>
}

export interface SandboxConfig {
  /** Maximum memory limit in MB */
  memoryLimitMB?: number

  /** CPU priority (nice level for OS scheduling) */
  niceness?: number

  /** Working directory for execution */
  workingDirectory?: string

  /** Environment variables to set */
  env?: Record<string, string>

  /** Additional options */
  options?: Record<string, unknown>
}

export interface SandboxHandle {
  /** Unique handle identifier */
  readonly id: string

  /** Provider name that created this handle */
  readonly provider: string

  /** Process ID (if applicable) */
  readonly pid?: number

  /** Check if handle is still active */
  isActive(): boolean | Promise<boolean>

  /** Terminate the sandbox process */
  terminate(signal?: string): Promise<void>

  /** Cleanup resources */
  cleanup(): Promise<void>
}

export class LocalProcessProvider implements SandboxProvider {
  readonly name = 'local'

  async isAvailable(): Promise<boolean> {
    return true
  }

  async acquire(config: SandboxConfig): Promise<SandboxHandle> {
    return new LocalProcessHandle(config)
  }

  async release(_handle: SandboxHandle): Promise<void> {
    // No-op for local processes
  }
}

class LocalProcessHandle implements SandboxHandle {
  readonly id: string
  readonly provider = 'local'
  pid?: number
  private _isTerminated = false

  constructor(private config: SandboxConfig) {
    this.id = `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  isActive(): boolean {
    return !this._isTerminated
  }

  async terminate(signal = 'SIGTERM'): Promise<void> {
    this._isTerminated = true
    this.pid = undefined
  }

  async cleanup(): Promise<void> {
    // Local processes don't need special cleanup
  }
}

export const defaultProvider = new LocalProcessProvider()

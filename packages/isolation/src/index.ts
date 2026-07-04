import type { ISpawnedProcess, SpawnOptions } from '@loopwork-ai/contracts'

/**
 * Core isolation provider interfaces
 */

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

  /**
   * Spawn a process within the sandbox
   * @param command Command to execute
   * @param args Arguments for the command
   * @param options Spawn options
   */
  spawn(command: string, args: string[], options?: SpawnOptions): Promise<ISpawnedProcess>

  /** Terminate the sandbox process */
  terminate(signal?: string): Promise<void>

  /** Cleanup resources */
  cleanup(): Promise<void>
}

/**
 * Re-export provider implementations
 */
export { LocalIsolationProvider } from './local-provider'
export { DockerIsolationProvider } from './docker-provider'

/**
 * Default provider instance for backward compatibility
 */
import { LocalIsolationProvider } from './local-provider'
export const defaultProvider = new LocalIsolationProvider()

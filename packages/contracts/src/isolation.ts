/**
 * Isolation provider interface for process sandboxing
 *
 * Provides mechanisms for executing processes with resource isolation
 * and environment management.
 */

import type { ISpawnedProcess, SpawnOptions } from './process'
import type { SandboxConfig } from '@loopwork-ai/isolation'

/**
 * Isolation provider interface
 *
 * Implementations provide process isolation capabilities including:
 * - Resource limits (memory, CPU priority)
 * - Environment variable management
 * - Process spawning within isolated contexts
 */
export interface IIsolationProvider {
  /** Unique provider identifier */
  readonly name: string

  /** Check if provider is available in the current environment */
  isAvailable(): boolean | Promise<boolean>

  /** Acquire a sandbox slot with configuration */
  acquire(config: SandboxConfig): Promise<SandboxHandle>

  /** Release a sandbox slot */
  release(handle: SandboxHandle): Promise<void>
}

/**
 * Sandbox handle for an isolated process
 *
 * Represents an active sandboxed execution environment.
 */
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

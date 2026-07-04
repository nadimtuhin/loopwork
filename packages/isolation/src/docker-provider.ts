import { spawn, type ChildProcess } from 'child_process'
import { promisify } from 'util'
import { exec as execCallback } from 'child_process'
import type { ISpawnedProcess, SpawnOptions } from '@loopwork-ai/contracts'
import { ChildProcessAdapter } from './process-adapter'

import type { SandboxProvider, SandboxConfig, SandboxHandle } from './index'

const exec = promisify(execCallback)

/**
 * DockerIsolationProvider provides Docker container-based isolation
 *
 * Executes commands in isolated Docker containers with resource limits.
 * Requires Docker daemon to be running and accessible.
 */
export class DockerIsolationProvider implements SandboxProvider {
  readonly name = 'docker'

  /**
   * Check if Docker is available and the daemon is running
   */
  async isAvailable(): Promise<boolean> {
    try {
      await exec('docker --version')
      return true
    } catch {
      return false
    }
  }

  /**
   * Acquire a Docker container for isolated execution
   *
   * @param config - Sandbox configuration including resource limits
   * @returns DockerContainerHandle instance
   * @throws Error if Docker is not available or container creation fails
   */
  async acquire(config: SandboxConfig): Promise<SandboxHandle> {
    const isDockerAvailable = await this.isAvailable()
    if (!isDockerAvailable) {
      throw new Error('Docker daemon is not running or not available')
    }

    return new DockerContainerHandle(config)
  }

  /**
   * Release a Docker container (stop and remove)
   *
   * @param handle - Handle to release
   */
  async release(handle: SandboxHandle): Promise<void> {
    if (handle.provider !== 'docker') {
      throw new Error('Invalid handle provider')
    }

    await handle.cleanup()
  }
}

/**
 * DockerContainerHandle represents a Docker container used for isolated execution
 */
class DockerContainerHandle implements SandboxHandle {
  readonly id: string
  readonly provider = 'docker'
  private containerId?: string
  private containerProcess?: ChildProcess
  private _isTerminated = false

  constructor(private config: SandboxConfig) {
    this.id = `docker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Check if the container is still running
   */
  isActive(): boolean {
    if (this._isTerminated) {
      return false
    }

    const containerRunning = this.containerProcess?.pid &&
      this.containerProcess.exitCode === null

    return containerRunning === true
  }

  /**
   * Spawn a process inside a Docker container
   */
  async spawn(command: string, args: string[], options?: SpawnOptions): Promise<ISpawnedProcess> {
    const containerName = `${this.id}-${Math.random().toString(36).substr(2, 5)}`
    this.containerId = containerName

    const dockerArgs = [
      'run', 
      '--rm',
      '-i',
      '--name', containerName,
      ...(this.config.memoryLimitMB ? [`--memory=${this.config.memoryLimitMB}m`] : []),
      ...(this.config.niceness ? [`--cpu-shares=${1024 - this.config.niceness}`] : []),
      ...(this.config.workingDirectory ? ['-w', this.config.workingDirectory] : []),
      ...(this.config.env ? Object.entries(this.config.env).flatMap(([k, v]) => ['-e', `${k}=${v}`]) : []),
    ]

    if (options?.env) {
      Object.entries(options.env).forEach(([k, v]) => {
        dockerArgs.push('-e', `${k}=${v}`)
      })
    }

    const image = (this.config.options?.image as string) || 'node:lts-alpine'
    dockerArgs.push(image)
    
    dockerArgs.push(command, ...args)

    const child = spawn('docker', dockerArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this.containerProcess = child
    
    return new ChildProcessAdapter(child)
  }

  /**
   * Terminate the Docker container
   *
   * @param signal - Signal to send (SIGTERM or SIGKILL)
   */
  async terminate(signal = 'SIGTERM'): Promise<void> {
    this._isTerminated = true

    if (this.containerProcess?.pid) {
      this.containerProcess.kill(signal as NodeJS.Signals)
    }

    if (this.containerId) {
      try {
        const killSignal = signal === 'SIGKILL' ? '--kill' : '--stop'
        await exec(`docker ${killSignal} ${this.containerId}`)
      } catch (error) {
        // Container may already be stopped - ignore error
      }
    }
  }

  /**
   * Cleanup resources - stop and remove the container
   */
  async cleanup(): Promise<void> {
    if (this.containerId) {
      try {
        await exec(`docker rm -f ${this.containerId}`)
      } catch (error) {
        // Container may already be removed - ignore error
      }
    }

    this.containerId = undefined
    this.containerProcess = undefined
  }
}

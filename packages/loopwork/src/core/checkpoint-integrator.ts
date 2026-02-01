import path from 'path'
import { createCheckpointManager, type ICheckpointManager } from '@loopwork-ai/checkpoint'

/**
 * Checkpoint Integrator
 *
 * Integrates checkpoint functionality into parallel execution
 */

export interface CheckpointConfig {
  enabled?: boolean
  interval?: number
  skipOnTaskComplete?: boolean
  skipOnCliExecution?: boolean
  cliCheckpointIntervalSecs?: number
}

export class CheckpointIntegrator {
  private iteration: number = 0
  private config: CheckpointConfig
  private projectRoot: string
  private manager: ICheckpointManager

  constructor(config: CheckpointConfig = {}, projectRoot: string = process.cwd()) {
    this.config = config
    this.projectRoot = projectRoot
    this.manager = createCheckpointManager({
      basePath: path.join(projectRoot, '.loopwork/checkpoints')
    })
  }

  shouldCheckpoint(iteration: number): boolean {
    if (!this.config.enabled) return false
    const interval = this.config.interval ?? 5
    return iteration > 0 && iteration % interval === 0
  }

  async checkpoint(data: unknown): Promise<void> {
    if (!this.config.enabled) return

    const agentId = 'loopwork-core'
    await this.manager.checkpoint(agentId, {
      taskId: data.taskId,
      iteration: data.iteration ?? this.iteration,
      phase: (data as { status?: string }).status ?? 'executing',
      state: {
        context: data.context,
        memory: data.memory,
        timestamp: new Date().toISOString()
      }
    })
  }

  incrementIteration(): void {
    this.iteration++
  }

  getIteration(): number {
    return this.iteration
  }

  async restore(): Promise<unknown> {
    const context = await this.manager.restore('loopwork-core')
    return context?.checkpoint.state
  }
}

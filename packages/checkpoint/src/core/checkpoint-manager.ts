import type {
  ICheckpointStorage,
  ICheckpointManager,
  AgentCheckpoint,
  CheckpointEvent,
  RestoredContext,
} from '../contracts'

export class CheckpointManager implements ICheckpointManager {
  private lastCheckpoints = new Map<string, Partial<AgentCheckpoint>>()

  constructor(private readonly storage: ICheckpointStorage) {}

  async checkpoint(agentId: string, state: Partial<AgentCheckpoint>): Promise<void> {
    // Merge with previous state to preserve fields
    const previous = this.lastCheckpoints.get(agentId) ?? {}
    const merged = { ...previous, ...state }
    this.lastCheckpoints.set(agentId, merged)

    const checkpoint: AgentCheckpoint = {
      agentId,
      taskId: merged.taskId ?? '',
      agentName: merged.agentName ?? '',
      iteration: merged.iteration ?? 0,
      timestamp: new Date(),
      phase: merged.phase ?? 'executing',
      lastToolCall: merged.lastToolCall,
      state: merged.state,
    }
    await this.storage.save(checkpoint)
  }

  async restore(agentId: string): Promise<RestoredContext | null> {
    const checkpoint = await this.storage.load(agentId)
    if (!checkpoint) return null
    const partialOutput = await this.storage.getOutput(agentId)
    return { checkpoint, partialOutput }
  }

  async onEvent(agentId: string, event: CheckpointEvent): Promise<void> {
    switch (event.type) {
      case 'execution_start':
        await this.checkpoint(agentId, {
          taskId: event.taskId,
          agentName: event.agentName,
          phase: 'started',
          iteration: 0,
        })
        break
      case 'tool_call':
        await this.checkpoint(agentId, { lastToolCall: event.toolName, phase: 'executing' })
        break
      case 'iteration':
        await this.checkpoint(agentId, { iteration: event.iteration, phase: 'executing' })
        break
      case 'execution_end':
        await this.checkpoint(agentId, { phase: event.success ? 'completed' : 'failed' })
        break
      case 'interrupt':
        await this.checkpoint(agentId, { phase: 'interrupted' })
        break
    }
  }

  async clear(agentId: string): Promise<void> {
    this.lastCheckpoints.delete(agentId)
    await this.storage.delete(agentId)
  }
}

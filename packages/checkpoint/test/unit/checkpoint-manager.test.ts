import { describe, test, expect, beforeEach } from 'bun:test'
import { CheckpointManager } from '../../src/core/checkpoint-manager'
import type { ICheckpointStorage, AgentCheckpoint, CheckpointEvent } from '../../src/contracts'

class MockStorage implements ICheckpointStorage {
  private checkpoints = new Map<string, AgentCheckpoint>()
  private outputs = new Map<string, string>()

  async save(checkpoint: AgentCheckpoint): Promise<void> {
    this.checkpoints.set(checkpoint.agentId, checkpoint)
  }

  async load(agentId: string): Promise<AgentCheckpoint | null> {
    return this.checkpoints.get(agentId) ?? null
  }

  async appendOutput(agentId: string, output: string): Promise<void> {
    const existing = this.outputs.get(agentId) ?? ''
    this.outputs.set(agentId, existing + output)
  }

  async getOutput(agentId: string): Promise<string> {
    return this.outputs.get(agentId) ?? ''
  }

  async delete(agentId: string): Promise<void> {
    this.checkpoints.delete(agentId)
    this.outputs.delete(agentId)
  }

  async list(): Promise<string[]> {
    return Array.from(this.checkpoints.keys())
  }

  async cleanup(maxAgeDays: number): Promise<number> {
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000
    const now = Date.now()
    let deleted = 0

    for (const [id, cp] of this.checkpoints.entries()) {
      if (now - cp.timestamp.getTime() > maxAgeMs) {
        this.checkpoints.delete(id)
        this.outputs.delete(id)
        deleted++
      }
    }
    return deleted
  }
}

describe('CheckpointManager', () => {
  let storage: MockStorage
  let manager: CheckpointManager

  beforeEach(() => {
    storage = new MockStorage()
    manager = new CheckpointManager(storage)
  })

  test('checkpoint() saves state with defaults', async () => {
    await manager.checkpoint('agent-1', {
      taskId: 'task-1',
      agentName: 'executor',
      iteration: 3,
      phase: 'executing',
    })

    const restored = await manager.restore('agent-1')
    expect(restored).not.toBeNull()
    expect(restored?.checkpoint.agentId).toBe('agent-1')
    expect(restored?.checkpoint.taskId).toBe('task-1')
    expect(restored?.checkpoint.agentName).toBe('executor')
    expect(restored?.checkpoint.iteration).toBe(3)
    expect(restored?.checkpoint.phase).toBe('executing')
    expect(restored?.checkpoint.timestamp).toBeInstanceOf(Date)
  })

  test('restore() returns null for non-existent agent', async () => {
    const result = await manager.restore('non-existent')
    expect(result).toBeNull()
  })

  test('restore() includes partial output', async () => {
    await manager.checkpoint('agent-2', {
      taskId: 'task-2',
      agentName: 'writer',
      phase: 'executing',
    })
    await storage.appendOutput('agent-2', 'partial output data')

    const restored = await manager.restore('agent-2')
    expect(restored?.partialOutput).toBe('partial output data')
  })

  test('onEvent() handles execution_start', async () => {
    const event: CheckpointEvent = {
      type: 'execution_start',
      taskId: 'task-3',
      agentName: 'architect',
    }

    await manager.onEvent('agent-3', event)

    const restored = await manager.restore('agent-3')
    expect(restored?.checkpoint.taskId).toBe('task-3')
    expect(restored?.checkpoint.agentName).toBe('architect')
    expect(restored?.checkpoint.phase).toBe('started')
    expect(restored?.checkpoint.iteration).toBe(0)
  })

  test('onEvent() handles tool_call', async () => {
    // First start execution
    await manager.onEvent('agent-4', {
      type: 'execution_start',
      taskId: 'task-4',
      agentName: 'executor',
    })

    // Then record tool call
    await manager.onEvent('agent-4', {
      type: 'tool_call',
      toolName: 'Bash',
    })

    const restored = await manager.restore('agent-4')
    expect(restored?.checkpoint.lastToolCall).toBe('Bash')
    expect(restored?.checkpoint.phase).toBe('executing')
  })

  test('onEvent() handles iteration', async () => {
    await manager.onEvent('agent-5', {
      type: 'execution_start',
      taskId: 'task-5',
      agentName: 'executor',
    })

    await manager.onEvent('agent-5', {
      type: 'iteration',
      iteration: 10,
    })

    const restored = await manager.restore('agent-5')
    expect(restored?.checkpoint.iteration).toBe(10)
  })

  test('onEvent() handles execution_end success', async () => {
    await manager.onEvent('agent-6', {
      type: 'execution_start',
      taskId: 'task-6',
      agentName: 'executor',
    })

    await manager.onEvent('agent-6', {
      type: 'execution_end',
      success: true,
    })

    const restored = await manager.restore('agent-6')
    expect(restored?.checkpoint.phase).toBe('completed')
  })

  test('onEvent() handles execution_end failure', async () => {
    await manager.onEvent('agent-7', {
      type: 'execution_start',
      taskId: 'task-7',
      agentName: 'executor',
    })

    await manager.onEvent('agent-7', {
      type: 'execution_end',
      success: false,
    })

    const restored = await manager.restore('agent-7')
    expect(restored?.checkpoint.phase).toBe('failed')
  })

  test('onEvent() handles interrupt', async () => {
    await manager.onEvent('agent-8', {
      type: 'execution_start',
      taskId: 'task-8',
      agentName: 'executor',
    })

    await manager.onEvent('agent-8', {
      type: 'interrupt',
      reason: 'user cancelled',
    })

    const restored = await manager.restore('agent-8')
    expect(restored?.checkpoint.phase).toBe('interrupted')
  })

  test('clear() removes checkpoint', async () => {
    await manager.checkpoint('agent-9', {
      taskId: 'task-9',
      agentName: 'executor',
      phase: 'executing',
    })

    await manager.clear('agent-9')

    const restored = await manager.restore('agent-9')
    expect(restored).toBeNull()
  })
})

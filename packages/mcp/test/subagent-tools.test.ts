/**
 * Tests for MCP subagent tools
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { spawnSubagent } from '../src/tools/spawn-subagent'
import { resumeAgent } from '../src/tools/resume-agent'
import type {
  IAgentRegistry,
  IAgentExecutor,
  AgentDefinition,
} from '@loopwork-ai/agents'
import type { ICheckpointManager, AgentCheckpoint } from '@loopwork-ai/checkpoint'

// Mock implementations
class MockAgentRegistry implements IAgentRegistry {
  private agents = new Map<string, AgentDefinition>()

  register(agent: AgentDefinition): void {
    this.agents.set(agent.name, agent)
  }

  get(name: string): AgentDefinition | undefined {
    return this.agents.get(name)
  }

  list(): AgentDefinition[] {
    return Array.from(this.agents.values())
  }

  has(name: string): boolean {
    return this.agents.has(name)
  }
}

class MockAgentExecutor implements IAgentExecutor {
  async execute(): Promise<any> {
    return {
      agentId: 'mock-agent-id',
      agentName: 'mock-agent',
      taskId: 'mock-task',
      exitCode: 0,
      output: 'mock output',
      durationMs: 1000,
      timedOut: false,
    }
  }
}

class MockCheckpointManager implements ICheckpointManager {
  private checkpoints = new Map<string, AgentCheckpoint>()

  async checkpoint(agentId: string, state: Partial<AgentCheckpoint>): Promise<void> {
    const existing = this.checkpoints.get(agentId)
    const checkpoint: AgentCheckpoint = {
      agentId,
      taskId: state.taskId || existing?.taskId || '',
      agentName: state.agentName || existing?.agentName || '',
      iteration: state.iteration ?? existing?.iteration ?? 0,
      timestamp: state.timestamp || existing?.timestamp || new Date(),
      phase: state.phase || existing?.phase || 'started',
      lastToolCall: state.lastToolCall || existing?.lastToolCall,
      state: state.state || existing?.state,
    }
    this.checkpoints.set(agentId, checkpoint)
  }

  async restore(agentId: string): Promise<{ checkpoint: AgentCheckpoint; partialOutput: string } | null> {
    const checkpoint = this.checkpoints.get(agentId)
    if (!checkpoint) return null
    return { checkpoint, partialOutput: '' }
  }

  async onEvent(): Promise<void> {
    // No-op for tests
  }

  async clear(agentId: string): Promise<void> {
    this.checkpoints.delete(agentId)
  }
}

describe('spawn-subagent tool', () => {
  let mockRegistry: MockAgentRegistry
  let mockExecutor: MockAgentExecutor
  let mockCheckpointManager: MockCheckpointManager

  beforeEach(() => {
    mockRegistry = new MockAgentRegistry()
    mockExecutor = new MockAgentExecutor()
    mockCheckpointManager = new MockCheckpointManager()

    // Register a test agent
    mockRegistry.register({
      name: 'test-agent',
      role: 'executor',
      model: 'sonnet',
      instructions: 'Test instructions',
    })
  })

  test('spawns agent and creates checkpoint', async () => {
    const result = await spawnSubagent(
      {
        agentName: 'test-agent',
        taskId: 'TASK-001',
        taskTitle: 'Test Task',
        taskDescription: 'Test task description',
      },
      {
        registry: mockRegistry,
        executor: mockExecutor,
        checkpointManager: mockCheckpointManager,
      }
    )

    expect(result.status).toBe('spawned')
    expect(result.agentId).toContain('test-agent')
    expect(result.agentId).toContain('TASK-001')
    expect(result.message).toContain('spawned')
  })

  test('returns agentId with correct format', async () => {
    const result = await spawnSubagent(
      {
        agentName: 'test-agent',
        taskId: 'TASK-002',
        taskTitle: 'Another Task',
        taskDescription: 'Another description',
      },
      {
        registry: mockRegistry,
        executor: mockExecutor,
        checkpointManager: mockCheckpointManager,
      }
    )

    expect(result.agentId).toMatch(/^test-agent-TASK-002-\d+$/)
  })

  test('returns error for non-existent agent', async () => {
    const result = await spawnSubagent(
      {
        agentName: 'nonexistent-agent',
        taskId: 'TASK-003',
        taskTitle: 'Task',
        taskDescription: 'Description',
      },
      {
        registry: mockRegistry,
        executor: mockExecutor,
        checkpointManager: mockCheckpointManager,
      }
    )

    expect(result.status).toBe('error')
    expect(result.agentId).toBe('')
    expect(result.message).toContain('not found')
  })

  test('validates input schema', async () => {
    const result = await spawnSubagent(
      {
        agentName: '',
        taskId: '',
        taskTitle: '',
        taskDescription: '',
      },
      {
        registry: mockRegistry,
        executor: mockExecutor,
        checkpointManager: mockCheckpointManager,
      }
    )

    expect(result.status).toBe('error')
  })

  test('checkpoint is created with correct initial state', async () => {
    const result = await spawnSubagent(
      {
        agentName: 'test-agent',
        taskId: 'TASK-004',
        taskTitle: 'Checkpoint Test',
        taskDescription: 'Test checkpoint creation',
      },
      {
        registry: mockRegistry,
        executor: mockExecutor,
        checkpointManager: mockCheckpointManager,
      }
    )

    // Verify checkpoint was created
    const restored = await mockCheckpointManager.restore(result.agentId)
    expect(restored).not.toBeNull()
    expect(restored?.checkpoint.agentName).toBe('test-agent')
    expect(restored?.checkpoint.taskId).toBe('TASK-004')
    expect(restored?.checkpoint.phase).toBe('started')
    expect(restored?.checkpoint.iteration).toBe(0)
  })
})

describe('resume-agent tool', () => {
  let mockCheckpointManager: MockCheckpointManager

  beforeEach(() => {
    mockCheckpointManager = new MockCheckpointManager()
  })

  test('finds existing checkpoint', async () => {
    const agentId = 'test-agent-TASK-001-123456'

    // Create a checkpoint
    await mockCheckpointManager.checkpoint(agentId, {
      agentId,
      taskId: 'TASK-001',
      agentName: 'test-agent',
      iteration: 5,
      timestamp: new Date(),
      phase: 'executing',
    })

    const result = await resumeAgent(
      { agentId },
      { checkpointManager: mockCheckpointManager }
    )

    expect(result.status).toBe('resumed')
    expect(result.checkpoint).toBeDefined()
    expect(result.checkpoint?.agentName).toBe('test-agent')
    expect(result.checkpoint?.iteration).toBe(5)
    expect(result.message).toContain('Restored')
  })

  test('returns not_found for missing checkpoint', async () => {
    const result = await resumeAgent(
      { agentId: 'nonexistent-agent-id' },
      { checkpointManager: mockCheckpointManager }
    )

    expect(result.status).toBe('not_found')
    expect(result.checkpoint).toBeUndefined()
    expect(result.message).toContain('No checkpoint found')
  })

  test('detects completed agents', async () => {
    const agentId = 'completed-agent-TASK-002-789'

    // Create a completed checkpoint
    await mockCheckpointManager.checkpoint(agentId, {
      agentId,
      taskId: 'TASK-002',
      agentName: 'test-agent',
      iteration: 10,
      timestamp: new Date(),
      phase: 'completed',
    })

    const result = await resumeAgent(
      { agentId },
      { checkpointManager: mockCheckpointManager }
    )

    expect(result.status).toBe('completed')
    expect(result.checkpoint?.phase).toBe('completed')
    expect(result.message).toContain('already completed')
  })

  test('validates input schema', async () => {
    const result = await resumeAgent(
      { agentId: '' },
      { checkpointManager: mockCheckpointManager }
    )

    expect(result.status).toBe('not_found')
    expect(result.message).toBeDefined()
  })

  test('returns checkpoint data with all fields', async () => {
    const agentId = 'full-checkpoint-test'

    await mockCheckpointManager.checkpoint(agentId, {
      agentId,
      taskId: 'TASK-003',
      agentName: 'architect',
      iteration: 3,
      timestamp: new Date(),
      phase: 'interrupted',
      lastToolCall: 'Read',
      state: { filesRead: 5, linesAnalyzed: 1000 },
    })

    const result = await resumeAgent(
      { agentId },
      { checkpointManager: mockCheckpointManager }
    )

    expect(result.status).toBe('resumed')
    expect(result.checkpoint?.lastToolCall).toBe('Read')
    expect(result.checkpoint?.state).toEqual({ filesRead: 5, linesAnalyzed: 1000 })
  })
})

describe('integration between spawn and resume', () => {
  let mockRegistry: MockAgentRegistry
  let mockExecutor: MockAgentExecutor
  let mockCheckpointManager: MockCheckpointManager

  beforeEach(() => {
    mockRegistry = new MockAgentRegistry()
    mockExecutor = new MockAgentExecutor()
    mockCheckpointManager = new MockCheckpointManager()

    mockRegistry.register({
      name: 'integration-agent',
      role: 'executor',
      model: 'sonnet',
      instructions: 'Integration test',
    })
  })

  test('spawned agent can be resumed', async () => {
    // Spawn
    const spawnResult = await spawnSubagent(
      {
        agentName: 'integration-agent',
        taskId: 'TASK-INTEGRATION',
        taskTitle: 'Integration Test',
        taskDescription: 'Test spawn and resume',
      },
      {
        registry: mockRegistry,
        executor: mockExecutor,
        checkpointManager: mockCheckpointManager,
      }
    )

    expect(spawnResult.status).toBe('spawned')

    // Resume
    const resumeResult = await resumeAgent(
      { agentId: spawnResult.agentId },
      { checkpointManager: mockCheckpointManager }
    )

    expect(resumeResult.status).toBe('resumed')
    expect(resumeResult.checkpoint?.agentId).toBe(spawnResult.agentId)
    expect(resumeResult.checkpoint?.taskId).toBe('TASK-INTEGRATION')
  })
})

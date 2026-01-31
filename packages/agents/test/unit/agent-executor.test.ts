import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { AgentExecutor } from '../../src/core/agent-executor'
import type { AgentDefinition } from '../../src/contracts/agent'
import type {
  ExecutionContext,
  ICliRunner,
  IIdGenerator,
  IPromptBuilder,
} from '../../src/contracts/executor'
import type { Task } from '@loopwork-ai/loopwork/contracts'

describe('AgentExecutor', () => {
  const createTask = (overrides: Partial<Task> = {}): Task => ({
    id: 'TASK-001',
    title: 'Test Task',
    description: 'Test description',
    status: 'pending',
    priority: 'medium',
    ...overrides,
  })

  const createAgent = (overrides: Partial<AgentDefinition> = {}): AgentDefinition => ({
    name: 'test-agent',
    description: 'Test agent',
    prompt: 'You are a test agent',
    ...overrides,
  })

  let mockCliRunner: ICliRunner
  let mockPromptBuilder: IPromptBuilder
  let mockIdGenerator: IIdGenerator
  let executor: AgentExecutor

  beforeEach(() => {
    mockCliRunner = {
      run: mock(() =>
        Promise.resolve({
          exitCode: 0,
          output: 'Success',
          durationMs: 1000,
          timedOut: false,
        })
      ),
    }

    mockPromptBuilder = {
      build: mock((task: Task, agent?: AgentDefinition) =>
        `Task: ${task.title}${agent ? ` | Agent: ${agent.name}` : ''}`
      ),
    }

    mockIdGenerator = {
      generate: mock(() => 'test-id-123'),
    }

    executor = new AgentExecutor(mockPromptBuilder, mockIdGenerator)
  })

  describe('execute()', () => {
    test('executes agent with task and returns result', async () => {
      const agent = createAgent()
      const task = createTask()
      const context: ExecutionContext = {
        cliRunner: mockCliRunner,
        workDir: '/test/dir',
      }

      const result = await executor.execute(agent, task, context)

      expect(result.agentId).toBe('test-id-123')
      expect(result.agentName).toBe('test-agent')
      expect(result.taskId).toBe('TASK-001')
      expect(result.exitCode).toBe(0)
      expect(result.output).toBe('Success')
    })

    test('passes model from agent to CLI runner', async () => {
      const agent = createAgent({ model: 'opus' })
      const task = createTask()
      const context: ExecutionContext = {
        cliRunner: mockCliRunner,
        workDir: '/test/dir',
      }

      await executor.execute(agent, task, context)

      expect(mockCliRunner.run).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'opus' })
      )
    })

    test('merges agent env with context env', async () => {
      const agent = createAgent({ env: { AGENT_VAR: 'agent-value' } })
      const task = createTask()
      const context: ExecutionContext = {
        cliRunner: mockCliRunner,
        workDir: '/test/dir',
        env: { CONTEXT_VAR: 'context-value' },
      }

      await executor.execute(agent, task, context)

      expect(mockCliRunner.run).toHaveBeenCalledWith(
        expect.objectContaining({
          env: expect.objectContaining({
            AGENT_VAR: 'agent-value',
            CONTEXT_VAR: 'context-value',
          }),
        })
      )
    })

    test('agent env overrides context env', async () => {
      const agent = createAgent({ env: { SHARED_VAR: 'agent-wins' } })
      const task = createTask()
      const context: ExecutionContext = {
        cliRunner: mockCliRunner,
        workDir: '/test/dir',
        env: { SHARED_VAR: 'context-loses' },
      }

      await executor.execute(agent, task, context)

      expect(mockCliRunner.run).toHaveBeenCalledWith(
        expect.objectContaining({
          env: expect.objectContaining({ SHARED_VAR: 'agent-wins' }),
        })
      )
    })

    test('uses agent timeout over context timeout', async () => {
      const agent = createAgent({ timeout: 30000 })
      const task = createTask()
      const context: ExecutionContext = {
        cliRunner: mockCliRunner,
        workDir: '/test/dir',
        timeout: 60000,
      }

      await executor.execute(agent, task, context)

      expect(mockCliRunner.run).toHaveBeenCalledWith(
        expect.objectContaining({ timeout: 30000 })
      )
    })

    test('falls back to context timeout when agent has none', async () => {
      const agent = createAgent()
      const task = createTask()
      const context: ExecutionContext = {
        cliRunner: mockCliRunner,
        workDir: '/test/dir',
        timeout: 45000,
      }

      await executor.execute(agent, task, context)

      expect(mockCliRunner.run).toHaveBeenCalledWith(
        expect.objectContaining({ timeout: 45000 })
      )
    })

    test('uses prompt builder to construct prompt', async () => {
      const agent = createAgent()
      const task = createTask({ title: 'Build Feature' })
      const context: ExecutionContext = {
        cliRunner: mockCliRunner,
        workDir: '/test/dir',
      }

      await executor.execute(agent, task, context)

      expect(mockPromptBuilder.build).toHaveBeenCalledWith(task, agent, undefined)
      expect(mockCliRunner.run).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'Task: Build Feature | Agent: test-agent',
        })
      )
    })

    test('returns timedOut status from CLI runner', async () => {
      mockCliRunner.run = mock(() =>
        Promise.resolve({
          exitCode: 1,
          output: 'Timed out',
          durationMs: 60000,
          timedOut: true,
        })
      )

      const agent = createAgent()
      const task = createTask()
      const context: ExecutionContext = {
        cliRunner: mockCliRunner,
        workDir: '/test/dir',
      }

      const result = await executor.execute(agent, task, context)

      expect(result.timedOut).toBe(true)
      expect(result.exitCode).toBe(1)
    })

    test('uses workDir from context', async () => {
      const agent = createAgent()
      const task = createTask()
      const context: ExecutionContext = {
        cliRunner: mockCliRunner,
        workDir: '/custom/work/dir',
      }

      await executor.execute(agent, task, context)

      expect(mockCliRunner.run).toHaveBeenCalledWith(
        expect.objectContaining({ workDir: '/custom/work/dir' })
      )
    })
  })
})

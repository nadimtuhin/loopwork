import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { AgentFactory } from '../../src/core/agent-factory'
import { AgentRegistry } from '../../src/core/agent-registry'
import { AgentExecutor } from '../../src/core/agent-executor'
import { AgentPromptBuilder } from '../../src/core/prompt-builder'
import type { ExecutionContext, ICliRunner } from '../../src/contracts/executor'
import type { Task } from '@loopwork-ai/loopwork/contracts'

describe('Agent Execution Integration', () => {
  let factory: AgentFactory
  let registry: AgentRegistry
  let executor: AgentExecutor
  let mockCliRunner: ICliRunner

  beforeEach(() => {
    factory = new AgentFactory()
    registry = new AgentRegistry()
    executor = new AgentExecutor(new AgentPromptBuilder())

    mockCliRunner = {
      run: mock(() =>
        Promise.resolve({
          exitCode: 0,
          output: 'Task completed successfully',
          durationMs: 5000,
          timedOut: false,
        })
      ),
    }
  })

  const createTask = (overrides: Partial<Task> = {}): Task => ({
    id: 'INT-001',
    title: 'Integration Test Task',
    description: 'Test the integration',
    status: 'pending',
    priority: 'high',
    ...overrides,
  })

  test('full flow: create agent -> register -> execute', async () => {
    // Create an agent
    const agent = factory.create({
      name: 'integration-agent',
      description: 'An agent for integration testing',
      prompt: 'You help with integration tests',
      model: 'sonnet',
    })

    // Validate it
    const validation = factory.validate(agent)
    expect(validation.valid).toBe(true)

    // Register it
    registry.register(agent)
    registry.setDefault('integration-agent')

    // Get it back
    const defaultAgent = registry.getDefault()
    expect(defaultAgent).toBeDefined()
    expect(defaultAgent?.name).toBe('integration-agent')

    // Execute it
    const task = createTask()
    const context: ExecutionContext = {
      cliRunner: mockCliRunner,
      workDir: '/integration/test',
    }

    const result = await executor.execute(defaultAgent!, task, context)

    expect(result.agentName).toBe('integration-agent')
    expect(result.taskId).toBe('INT-001')
    expect(result.exitCode).toBe(0)
  })

  test('registry retrieval flows into executor correctly', async () => {
    // Create multiple agents
    const codeAgent = factory.create({
      name: 'coder',
      description: 'Writes code',
      prompt: 'You write clean code',
      model: 'opus',
      timeout: 120000,
    })

    const reviewAgent = factory.create({
      name: 'reviewer',
      description: 'Reviews code',
      prompt: 'You review code thoroughly',
      model: 'sonnet',
      timeout: 60000,
    })

    registry.register(codeAgent)
    registry.register(reviewAgent)

    // Execute with specific agent from registry
    const agent = registry.get('coder')
    expect(agent).toBeDefined()

    const task = createTask({ id: 'CODE-001', title: 'Write feature' })
    const context: ExecutionContext = {
      cliRunner: mockCliRunner,
      workDir: '/project',
    }

    const result = await executor.execute(agent!, task, context)

    expect(result.agentName).toBe('coder')
    expect(mockCliRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'opus',
        timeout: 120000,
      })
    )
  })

  test('handles agent execution failure gracefully', async () => {
    mockCliRunner.run = mock(() =>
      Promise.resolve({
        exitCode: 1,
        output: 'Error: Task failed',
        durationMs: 2000,
        timedOut: false,
      })
    )

    const agent = factory.create({
      name: 'failing-agent',
      description: 'Will fail',
      prompt: 'This will fail',
    })

    registry.register(agent)

    const task = createTask({ id: 'FAIL-001' })
    const context: ExecutionContext = {
      cliRunner: mockCliRunner,
      workDir: '/project',
    }

    const result = await executor.execute(agent, task, context)

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('Error')
    expect(result.timedOut).toBe(false)
  })
})

import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { AgentFactory, AgentRegistry, AgentExecutor, AgentPromptBuilder, createRegistry, createExecutor,  } from '../../src/index'
import type { ExecutionContext, ICliRunner } from '../../src/contracts/executor'
import type { Task } from '@loopwork-ai/loopwork/contracts'

describe('Agent Workflow E2E', () => {
  let mockCliRunner: ICliRunner

  beforeEach(() => {
    mockCliRunner = {
      run: mock(() =>
        Promise.resolve({
          exitCode: 0,
          output: 'Workflow completed',
          durationMs: 10000,
          timedOut: false,
        })
      ),
    }
  })

  const createTask = (overrides: Partial<Task> = {}): Task => ({
    id: 'E2E-001',
    title: 'E2E Test Task',
    description: 'Full workflow test',
    status: 'pending',
    priority: 'medium',
    ...overrides,
  })

  test('complete workflow using factory functions', async () => {
    // Use factory functions for setup
    const registry = createRegistry()
    const executor = createExecutor()
    const factory = new AgentFactory()

    // Define agents for different task types
    const agents = [
      factory.create({
        name: 'planner',
        description: 'Plans tasks',
        prompt: 'You create detailed plans',
        model: 'opus',
      }),
      factory.create({
        name: 'executor',
        description: 'Executes tasks',
        prompt: 'You implement features',
        model: 'sonnet',
      }),
      factory.create({
        name: 'reviewer',
        description: 'Reviews work',
        prompt: 'You review and validate',
        model: 'haiku',
      }),
    ]

    // Register all agents
    agents.forEach((agent) => registry.register(agent))

    // Set default for general tasks
    registry.setDefault('executor')

    // Verify all registered
    expect(registry.list()).toHaveLength(3)

    // Execute a workflow: plan -> execute -> review
    const context: ExecutionContext = {
      cliRunner: mockCliRunner,
      workDir: '/e2e/project',
      env: { NODE_ENV: 'test' },
    }

    const planTask = createTask({ id: 'PLAN-001', title: 'Plan the feature' })
    const execTask = createTask({ id: 'EXEC-001', title: 'Implement the feature' })
    const reviewTask = createTask({ id: 'REV-001', title: 'Review the feature' })

    const planner = registry.get('planner')!
    const executorAgent = registry.get('executor')!
    const reviewer = registry.get('reviewer')!

    const planResult = await executor.execute(planner, planTask, context)
    expect(planResult.exitCode).toBe(0)
    expect(planResult.agentName).toBe('planner')

    const execResult = await executor.execute(executorAgent, execTask, context)
    expect(execResult.exitCode).toBe(0)
    expect(execResult.agentName).toBe('executor')

    const reviewResult = await executor.execute(reviewer, reviewTask, context)
    expect(reviewResult.exitCode).toBe(0)
    expect(reviewResult.agentName).toBe('reviewer')

    // Verify all calls made with correct models
    const calls = (mockCliRunner.run as ReturnType<typeof mock>).mock.calls
    expect(calls[0][0].model).toBe('opus')
    expect(calls[1][0].model).toBe('sonnet')
    expect(calls[2][0].model).toBe('haiku')
  })

  test('workflow with environment and timeout configuration', async () => {
    const registry = createRegistry()
    const executor = createExecutor()
    const factory = new AgentFactory()

    // Agent with specific config
    const agent = factory.create({
      name: 'configured-agent',
      description: 'Has custom config',
      prompt: 'Custom configured agent',
      model: 'sonnet',
      timeout: 30000,
      env: {
        AGENT_MODE: 'production',
        API_KEY: 'secret-key',
      },
    })

    registry.register(agent)

    const context: ExecutionContext = {
      cliRunner: mockCliRunner,
      workDir: '/configured/project',
      env: {
        BASE_URL: 'https://api.example.com',
        AGENT_MODE: 'development', // Should be overridden by agent
      },
      timeout: 60000, // Should be overridden by agent
    }

    const task = createTask()
    const result = await executor.execute(agent, task, context)

    expect(result.exitCode).toBe(0)

    const call = (mockCliRunner.run as ReturnType<typeof mock>).mock.calls[0][0]
    expect(call.timeout).toBe(30000) // Agent timeout wins
    expect(call.env.AGENT_MODE).toBe('production') // Agent env wins
    expect(call.env.BASE_URL).toBe('https://api.example.com') // Context env preserved
    expect(call.env.API_KEY).toBe('secret-key') // Agent env included
  })
})

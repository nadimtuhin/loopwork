import { describe, test, expect, beforeEach, mock } from 'bun:test'
import {
  AgentFactory,
  AgentRegistry,
  AgentExecutor,
  createRegistry,
  createExecutor,
} from '../../src/index'
import type { ExecutionContext, ICliRunner, Agent } from '../../src/contracts'
import type { Task } from '@loopwork-ai/contracts'

/**
 * Multi-Agent Orchestration E2E Tests
 * 
 * Tests complex multi-agent workflows where agents collaborate
 * to complete tasks.
 */

describe('Multi-Agent Orchestration E2E', () => {
  let mockCliRunner: ICliRunner
  let context: ExecutionContext

  beforeEach(() => {
    mockCliRunner = {
      run: mock(() =>
        Promise.resolve({
          exitCode: 0,
          output: 'Workflow completed successfully',
          durationMs: 5000,
          timedOut: false,
        })
      ),
    }

    context = {
      cliRunner: mockCliRunner,
      workDir: '/test/project',
      env: { NODE_ENV: 'test' },
    }
  })

  const createTask = (overrides: Partial<Task> = {}): Task => ({
    id: 'E2E-001',
    title: 'E2E Test Task',
    description: 'Full workflow test',
    status: 'pending',
    priority: 'medium',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  })

  describe('Sequential Agent Workflow', () => {
    test('planner -> executor -> reviewer workflow', async () => {
      const factory = new AgentFactory()
      const registry = createRegistry()
      const executor = createExecutor()

      // Create specialized agents
      const planner = factory.create({
        name: 'planner',
        description: 'Creates detailed implementation plans',
        prompt: 'You are a software architect. Create detailed implementation plans.',
        model: 'opus',
        capabilities: ['planning', 'architecture'],
      })

      const implementer = factory.create({
        name: 'implementer',
        description: 'Implements features based on plans',
        prompt: 'You are a senior developer. Implement features according to the plan.',
        model: 'sonnet',
        capabilities: ['implementation', 'coding'],
      })

      const reviewer = factory.create({
        name: 'reviewer',
        description: 'Reviews code for quality and correctness',
        prompt: 'You are a code reviewer. Review code for quality, bugs, and best practices.',
        model: 'haiku',
        capabilities: ['review', 'quality-assurance'],
      })

      // Register all agents
      registry.register(planner)
      registry.register(implementer)
      registry.register(reviewer)

      // Execute workflow
      const planTask = createTask({
        id: 'PLAN-001',
        title: 'Create implementation plan',
        description: 'Plan the feature implementation',
      })

      const implTask = createTask({
        id: 'IMPL-001',
        title: 'Implement feature',
        description: 'Implement according to plan',
      })

      const reviewTask = createTask({
        id: 'REV-001',
        title: 'Review implementation',
        description: 'Review the implemented feature',
      })

      // Step 1: Planning
      const planResult = await executor.execute(planner, planTask, context)
      expect(planResult.exitCode).toBe(0)
      expect(planResult.agentName).toBe('planner')

      // Step 2: Implementation
      const implResult = await executor.execute(implementer, implTask, context)
      expect(implResult.exitCode).toBe(0)
      expect(implResult.agentName).toBe('implementer')

      // Step 3: Review
      const reviewResult = await executor.execute(reviewer, reviewTask, context)
      expect(reviewResult.exitCode).toBe(0)
      expect(reviewResult.agentName).toBe('reviewer')

      // Verify correct models were used
      const calls = (mockCliRunner.run as ReturnType<typeof mock>).mock.calls
      expect(calls[0][0].model).toBe('opus')
      expect(calls[1][0].model).toBe('sonnet')
      expect(calls[2][0].model).toBe('haiku')
    })
  })

  describe('Agent Selection by Capability', () => {
    test('selects appropriate agent based on task requirements', () => {
      const factory = new AgentFactory()
      const registry = createRegistry()

      // Create agents with different capabilities
      const codeAgent = factory.create({
        name: 'code-specialist',
        description: 'Specializes in code tasks',
        prompt: 'You write code',
        capabilities: ['coding', 'implementation'],
      })

      const docAgent = factory.create({
        name: 'doc-specialist',
        description: 'Specializes in documentation',
        prompt: 'You write documentation',
        capabilities: ['documentation', 'writing'],
      })

      registry.register(codeAgent)
      registry.register(docAgent)

      // Query by capability
      const codingAgents = registry.findByCapability('coding')
      expect(codingAgents).toHaveLength(1)
      expect(codingAgents[0].name).toBe('code-specialist')

      const docAgents = registry.findByCapability('documentation')
      expect(docAgents).toHaveLength(1)
      expect(docAgents[0].name).toBe('doc-specialist')
    })

    test('handles tasks with multiple capability requirements', () => {
      const factory = new AgentFactory()
      const registry = createRegistry()

      const fullStackAgent = factory.create({
        name: 'fullstack',
        description: 'Full stack developer',
        prompt: 'You do full stack development',
        capabilities: ['frontend', 'backend', 'database', 'coding'],
      })

      const frontendAgent = factory.create({
        name: 'frontend',
        description: 'Frontend specialist',
        prompt: 'You do frontend development',
        capabilities: ['frontend', 'ui', 'ux'],
      })

      registry.register(fullStackAgent)
      registry.register(frontendAgent)

      // Task requiring multiple capabilities
      const requiredCapabilities = ['frontend', 'backend']
      const matchingAgents = registry.findByCapabilities(requiredCapabilities)

      expect(matchingAgents).toContain(fullStackAgent)
      expect(matchingAgents).not.toContain(frontendAgent)
    })
  })

  describe('Fallback Agent Strategy', () => {
    test('uses fallback agent when primary fails', async () => {
      const factory = new AgentFactory()
      const registry = createRegistry()
      const executor = createExecutor()

      // Primary agent (expensive, powerful)
      const primaryAgent = factory.create({
        name: 'primary',
        description: 'Primary agent',
        prompt: 'You are the primary agent',
        model: 'opus',
      })

      // Fallback agent (cheaper, faster)
      const fallbackAgent = factory.create({
        name: 'fallback',
        description: 'Fallback agent',
        prompt: 'You are the fallback agent',
        model: 'haiku',
      })

      registry.register(primaryAgent)
      registry.register(fallbackAgent)
      registry.setDefault('primary')

      const task = createTask({ id: 'FALLBACK-001', title: 'Fallback test' })

      // Mock primary to fail
      const failingRunner: ICliRunner = {
        run: mock(() =>
          Promise.resolve({
            exitCode: 1,
            output: 'Primary agent failed',
            durationMs: 1000,
            timedOut: false,
          })
        ),
      }

      const failingContext: ExecutionContext = {
        ...context,
        cliRunner: failingRunner,
      }

      // Try with primary (fails)
      const primaryResult = await executor.execute(primaryAgent, task, failingContext)
      expect(primaryResult.exitCode).toBe(1)

      // Fallback should succeed
      const fallbackResult = await executor.execute(fallbackAgent, task, context)
      expect(fallbackResult.exitCode).toBe(0)
    })
  })

  describe('Agent Context Sharing', () => {
    test('shares context between sequential agent executions', async () => {
      const factory = new AgentFactory()
      const executor = createExecutor()

      const agent1 = factory.create({
        name: 'context-writer',
        description: 'Writes context',
        prompt: 'Write context information',
      })

      const agent2 = factory.create({
        name: 'context-reader',
        description: 'Reads context',
        prompt: 'Read and use context information',
      })

      const task1 = createTask({ id: 'CTX-001', title: 'Write context' })
      const task2 = createTask({ id: 'CTX-002', title: 'Read context' })

      // Execute first agent
      const result1 = await executor.execute(agent1, task1, context)
      expect(result1.exitCode).toBe(0)

      // Execute second agent (should have access to shared context)
      const sharedContext: ExecutionContext = {
        ...context,
        previousResult: result1.output,
      }

      const result2 = await executor.execute(agent2, task2, sharedContext)
      expect(result2.exitCode).toBe(0)
    })
  })

  describe('Error Handling and Recovery', () => {
    test('handles agent execution timeout', async () => {
      const factory = new AgentFactory()
      const executor = createExecutor()

      const slowAgent = factory.create({
        name: 'slow-agent',
        description: 'Slow agent',
        prompt: 'You are slow',
      })

      const timeoutRunner: ICliRunner = {
        run: mock(() =>
          Promise.resolve({
            exitCode: 0,
            output: 'Completed but timed out',
            durationMs: 60000,
            timedOut: true,
          })
        ),
      }

      const timeoutContext: ExecutionContext = {
        ...context,
        cliRunner: timeoutRunner,
      }

      const task = createTask({ id: 'TIMEOUT-001', title: 'Timeout test' })
      const result = await executor.execute(slowAgent, task, timeoutContext)

      expect(result.timedOut).toBe(true)
    })

    test('retries failed executions', async () => {
      const factory = new AgentFactory()
      const executor = createExecutor({ maxRetries: 3 })

      const agent = factory.create({
        name: 'retry-agent',
        description: 'Retry agent',
        prompt: 'You might fail',
      })

      let callCount = 0
      const flakyRunner: ICliRunner = {
        run: mock(() => {
          callCount++
          if (callCount < 3) {
            return Promise.resolve({
              exitCode: 1,
              output: 'Temporary failure',
              durationMs: 1000,
              timedOut: false,
            })
          }
          return Promise.resolve({
            exitCode: 0,
            output: 'Success on retry',
            durationMs: 1000,
            timedOut: false,
          })
        }),
      }

      const flakyContext: ExecutionContext = {
        ...context,
        cliRunner: flakyRunner,
      }

      const task = createTask({ id: 'RETRY-001', title: 'Retry test' })
      const result = await executor.execute(agent, task, flakyContext)

      expect(result.exitCode).toBe(0)
      expect(callCount).toBe(3)
    })
  })
})

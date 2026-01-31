import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { AgentExecutor } from '../../src/core/agent-executor'
import { CliInvokerRegistry } from '../../src/invokers/registry'
import type { AgentDefinition } from '../../src/contracts/agent'
import type { ExecutionContext, ICliRunner } from '../../src/contracts/executor'
import type { ICliInvoker, CliInvokeOptions, CliInvokeResult } from '../../src/contracts/invoker'
import type { Task } from '@loopwork-ai/loopwork/contracts'

describe('Invoker Registry Integration', () => {
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

  const createMockInvoker = (name: string, models: string[]): ICliInvoker => {
    const invokeResult: CliInvokeResult = {
      exitCode: 0,
      output: `Output from ${name}`,
      durationMs: 500,
      timedOut: false,
    }

    return {
      name,
      description: `Mock ${name} invoker`,
      isAvailable: mock(() => Promise.resolve(true)),
      getSupportedModels: () => models,
      invoke: mock(() => Promise.resolve(invokeResult)),
      buildArgs: (opts: CliInvokeOptions) => [opts.prompt],
    }
  }

  describe('model-based invoker routing', () => {
    test('routes to correct invoker based on model', async () => {
      const claudeInvoker = createMockInvoker('claude', ['sonnet', 'opus', 'haiku'])
      const openCodeInvoker = createMockInvoker('opencode', ['gemini-flash', 'gpt-4'])

      const registry = new CliInvokerRegistry()
      registry.register(claudeInvoker)
      registry.register(openCodeInvoker)
      registry.setDefault('claude')

      const executor = new AgentExecutor(undefined, undefined, registry)

      const mockCliRunner: ICliRunner = {
        run: mock(() => Promise.resolve({ exitCode: 0, output: '', durationMs: 0, timedOut: false })),
      }

      // Test with sonnet model - should use claude
      const agent1 = createAgent({ model: 'sonnet' })
      const context: ExecutionContext = { cliRunner: mockCliRunner, workDir: '/test' }

      await executor.execute(agent1, createTask(), context)
      expect(claudeInvoker.invoke).toHaveBeenCalled()
      expect(openCodeInvoker.invoke).not.toHaveBeenCalled()

      // Reset mocks
      ;(claudeInvoker.invoke as any).mockClear()
      ;(openCodeInvoker.invoke as any).mockClear()

      // Test with gemini-flash model - should use opencode
      const agent2 = createAgent({ model: 'gemini-flash' })
      await executor.execute(agent2, createTask(), context)
      expect(openCodeInvoker.invoke).toHaveBeenCalled()
      expect(claudeInvoker.invoke).not.toHaveBeenCalled()
    })

    test('falls back to default invoker for unknown models', async () => {
      const claudeInvoker = createMockInvoker('claude', ['sonnet'])
      const registry = new CliInvokerRegistry()
      registry.register(claudeInvoker)
      registry.setDefault('claude')

      const executor = new AgentExecutor(undefined, undefined, registry)

      const mockCliRunner: ICliRunner = {
        run: mock(() => Promise.resolve({ exitCode: 0, output: '', durationMs: 0, timedOut: false })),
      }

      const agent = createAgent({ model: 'unknown-model' })
      const context: ExecutionContext = { cliRunner: mockCliRunner, workDir: '/test' }

      await executor.execute(agent, createTask(), context)
      expect(claudeInvoker.invoke).toHaveBeenCalled()
    })

    test('uses default invoker when no model specified', async () => {
      const claudeInvoker = createMockInvoker('claude', ['sonnet'])
      const registry = new CliInvokerRegistry()
      registry.register(claudeInvoker)
      registry.setDefault('claude')

      const executor = new AgentExecutor(undefined, undefined, registry)

      const mockCliRunner: ICliRunner = {
        run: mock(() => Promise.resolve({ exitCode: 0, output: '', durationMs: 0, timedOut: false })),
      }

      const agent = createAgent() // No model
      const context: ExecutionContext = { cliRunner: mockCliRunner, workDir: '/test' }

      await executor.execute(agent, createTask(), context)
      expect(claudeInvoker.invoke).toHaveBeenCalled()
    })
  })

  describe('invoker receives correct options', () => {
    test('passes all options to invoker', async () => {
      const invoker = createMockInvoker('claude', ['sonnet'])
      const registry = new CliInvokerRegistry()
      registry.register(invoker)
      registry.setDefault('claude')

      const executor = new AgentExecutor(undefined, undefined, registry)

      const mockCliRunner: ICliRunner = {
        run: mock(() => Promise.resolve({ exitCode: 0, output: '', durationMs: 0, timedOut: false })),
      }

      const agent = createAgent({
        model: 'sonnet',
        timeout: 300,
        env: { AGENT_VAR: 'value' },
        tools: ['Read', 'Write'],
      })

      const context: ExecutionContext = {
        cliRunner: mockCliRunner,
        workDir: '/test/work',
        env: { CONTEXT_VAR: 'context-value' },
        timeout: 600,
      }

      await executor.execute(agent, createTask(), context)

      expect(invoker.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          workDir: '/test/work',
          model: 'sonnet',
          timeout: 300, // Agent timeout takes precedence
          tools: ['Read', 'Write'],
          env: expect.objectContaining({
            CONTEXT_VAR: 'context-value',
            AGENT_VAR: 'value',
          }),
        })
      )
    })
  })

  describe('execution result', () => {
    test('returns correct result from invoker', async () => {
      const invoker = createMockInvoker('claude', ['sonnet'])
      ;(invoker.invoke as any).mockImplementation(() =>
        Promise.resolve({
          exitCode: 42,
          output: 'Custom output',
          durationMs: 1234,
          timedOut: true,
        })
      )

      const registry = new CliInvokerRegistry()
      registry.register(invoker)
      registry.setDefault('claude')

      const executor = new AgentExecutor(undefined, undefined, registry)

      const mockCliRunner: ICliRunner = {
        run: mock(() => Promise.resolve({ exitCode: 0, output: '', durationMs: 0, timedOut: false })),
      }

      const context: ExecutionContext = { cliRunner: mockCliRunner, workDir: '/test' }
      const result = await executor.execute(createAgent(), createTask(), context)

      expect(result.exitCode).toBe(42)
      expect(result.output).toBe('Custom output')
      expect(result.durationMs).toBe(1234)
      expect(result.timedOut).toBe(true)
    })
  })

  describe('fallback to CLI runner', () => {
    test('falls back to CLI runner when no invoker available', async () => {
      const registry = new CliInvokerRegistry()
      // No invokers registered

      const executor = new AgentExecutor(undefined, undefined, registry)

      const mockCliRunner: ICliRunner = {
        run: mock(() =>
          Promise.resolve({
            exitCode: 0,
            output: 'CLI runner output',
            durationMs: 100,
            timedOut: false,
          })
        ),
      }

      const context: ExecutionContext = { cliRunner: mockCliRunner, workDir: '/test' }
      const result = await executor.execute(createAgent(), createTask(), context)

      expect(mockCliRunner.run).toHaveBeenCalled()
      expect(result.output).toBe('CLI runner output')
    })
  })

  describe('findAvailable integration', () => {
    test('finds first available invoker when default unavailable', async () => {
      const unavailableInvoker = createMockInvoker('unavailable', ['model1'])
      ;(unavailableInvoker.isAvailable as any).mockImplementation(() => Promise.resolve(false))

      const availableInvoker = createMockInvoker('available', ['model2'])
      ;(availableInvoker.isAvailable as any).mockImplementation(() => Promise.resolve(true))

      const registry = new CliInvokerRegistry()
      registry.register(unavailableInvoker)
      registry.register(availableInvoker)
      // No default set

      const found = await registry.findAvailable()
      expect(found?.name).toBe('available')
    })
  })
})

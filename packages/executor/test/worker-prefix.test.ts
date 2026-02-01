import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { CliExecutor } from '../src/cli-executor'
import type { 
  CliExecutorConfig, 
  IProcessManager, 
  IPluginRegistry, 
  ILogger,
  ExecutionOptions
} from '@loopwork-ai/contracts'

describe('CliExecutor Worker Prefixing', () => {
  let mockConfig: CliExecutorConfig
  let mockProcessManager: any
  let mockPluginRegistry: any
  let mockLogger: any

  beforeEach(() => {
    mockConfig = {
      models: [{ name: 'test-model', cli: 'claude', model: 'sonnet' }],
      cliPaths: { claude: '/usr/bin/claude' }
    }
    
    mockProcessManager = {
      spawn: mock(() => ({
        stdout: { on: mock(() => {}) },
        stderr: { on: mock(() => {}) },
        on: mock((event: string, cb: Function) => {
          if (event === 'close') cb(0)
        }),
        kill: mock(() => {})
      })),
      cleanup: mock(async () => {})
    }

    mockPluginRegistry = {
      runHook: mock(async () => {}),
      getCapabilityRegistry: () => ({ getPromptInjection: () => '' })
    }

    mockLogger = {
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
      debug: mock(() => {}),
      startSpinner: mock(() => {}),
      stopSpinner: mock(() => {})
    }
  })

  test('should prepend worker ID to display name when provided', async () => {
    const executor = new CliExecutor(
      mockConfig,
      mockProcessManager as any,
      mockPluginRegistry as any,
      mockLogger as any
    )

    // Using a path that exists to avoid early exit, or just mock detectClis
    // @ts-ignore - accessing private to setup test state
    executor.cliPaths.set('claude', '/usr/bin/claude')
    
    const options: ExecutionOptions = {
      workerId: 5,
      taskId: 'TASK-1'
    }

    try {
      await executor.execute('test prompt', '/tmp/output.txt', 30, options)
    } catch (e) {
    }

    const hooks = mockPluginRegistry.runHook.mock.calls
    const modelSelectedHook = hooks.find((call: any) => call[0] === 'onStep' && call[1].stepId === 'model_selected')
    
    expect(modelSelectedHook).toBeDefined()
    expect(modelSelectedHook[1].context.model).toBe('[Worker 5] test-model')
  })

  test('should not prepend worker ID when undefined', async () => {
    const executor = new CliExecutor(
      mockConfig,
      mockProcessManager as any,
      mockPluginRegistry as any,
      mockLogger as any
    )

    // @ts-ignore
    executor.cliPaths.set('claude', '/usr/bin/claude')
    
    const options: ExecutionOptions = {
      taskId: 'TASK-2'
    }

    try {
      await executor.execute('test prompt', '/tmp/output.txt', 30, options)
    } catch (e) {}

    const hooks = mockPluginRegistry.runHook.mock.calls
    const modelSelectedHook = hooks.find((call: any) => call[0] === 'onStep' && call[1].stepId === 'model_selected')
    
    expect(modelSelectedHook).toBeDefined()
    expect(modelSelectedHook[1].context.model).toBe('test-model')
  })

  test('should handle non-claude CLI display names correctly', async () => {
    mockConfig.models = [{ name: 'gpt4', cli: 'opencode', model: 'gpt-4o' }]
    const executor = new CliExecutor(
      mockConfig,
      mockProcessManager as any,
      mockPluginRegistry as any,
      mockLogger as any
    )

    // @ts-ignore
    executor.cliPaths.set('opencode', '/usr/bin/opencode')
    
    const options: ExecutionOptions = {
      workerId: 1,
      taskId: 'TASK-3'
    }

    try {
      await executor.execute('test prompt', '/tmp/output.txt', 30, options)
    } catch (e) {}

    const hooks = mockPluginRegistry.runHook.mock.calls
    const modelSelectedHook = hooks.find((call: any) => call[0] === 'onStep' && call[1].stepId === 'model_selected')
    
    expect(modelSelectedHook).toBeDefined()
    expect(modelSelectedHook[1].context.model).toBe('[Worker 1] opencode/gpt4')
  })
})

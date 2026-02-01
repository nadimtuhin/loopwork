import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { ParallelRunner, type ParallelRunnerOptions } from '../src/core/parallel-runner'
import type { Task } from '../src/contracts/task'
import type { TaskBackend } from '../src/contracts/backend'
import type { ICliExecutor } from '../src/contracts/executor'
import type { IPluginRegistry } from '@loopwork-ai/contracts'
import type { IRetryBudget, ICheckpointIntegrator, IFailureState } from '../src/contracts/services'
import { ServiceContainer } from '../src/core/di/container'

describe('ParallelRunner E2E with Dependency Injection', () => {
  let mockBackend: any
  let mockExecutor: any
  let mockPlugins: any
  let mockRetryBudget: any
  let mockCheckpoint: any
  let mockFailureState: any
  let container: ServiceContainer
  let tasks: Task[]

  const createOptions = (overrides: any = {}): ParallelRunnerOptions => {
    const config = {
      parallel: 2,
      projectRoot: '/tmp',
      outputDir: '/tmp/output',
      sessionId: 'test-session',
      maxIterations: 10,
      timeout: 30,
      cli: 'claude',
      taskDelay: 0,
      ...(overrides.config || {}),
    }

    return {
      config: config as any,
      backend: mockBackend,
      cliExecutor: mockExecutor,
      pluginRegistry: mockPlugins,
      retryBudget: mockRetryBudget,
      checkpointIntegrator: mockCheckpoint,
      failureState: mockFailureState,
      buildPrompt: (t: Task) => `Prompt for ${t.id}`,
      ...overrides,
    }
  }

  beforeEach(() => {
    container = new ServiceContainer()

    tasks = [
      { id: 'T1', title: 'Task 1', status: 'pending', description: '', priority: 'medium' },
      { id: 'T2', title: 'Task 2', status: 'pending', description: '', priority: 'medium' },
      { id: 'T3', title: 'Task 3', status: 'pending', description: '', priority: 'medium' },
    ]

    mockBackend = {
      countPending: mock(async () => tasks.filter(t => t.status === 'pending').length),
      claimTask: mock(async () => {
        const t = tasks.find(t => t.status === 'pending')
        if (t) {
          t.status = 'in-progress'
          return t
        }
        return null
      }),
      markCompleted: mock(async (id: string) => {
        const t = tasks.find(t => t.id === id)
        if (t) t.status = 'completed'
        return { success: true }
      }),
      resetToPending: mock(async (id: string) => {
        const t = tasks.find(t => t.id === id)
        if (t) t.status = 'pending'
        return { success: true }
      })
    }

    mockExecutor = {
      executeTask: mock(async () => 0), 
      cleanup: mock(async () => {}),
    }

    mockPlugins = {
      runHook: mock(async () => {}),
      isDegraded: mock(() => false),
    }

    mockRetryBudget = {
      hasBudget: mock(() => true),
      consume: mock(() => {}),
      getConfig: mock(() => ({ maxRetries: 10, windowMs: 1000 })),
      getUsage: mock(() => 0),
    }

    mockCheckpoint = {
      shouldCheckpoint: mock(() => false),
      checkpoint: mock(async () => {}),
    }

    mockFailureState = {
      setFailureState: mock(() => {}),
      clearFailure: mock(() => {}),
      getFailureCount: mock(() => 0),
    }
  })

  test('should execute multiple tasks in parallel using worker pool', async () => {
    const runner = new ParallelRunner(createOptions())
    const stats = await runner.run()

    expect(stats.completed).toBe(3)
    expect(mockExecutor.executeTask).toHaveBeenCalledTimes(3)
    expect(mockBackend.markCompleted).toHaveBeenCalledTimes(3)
  })

  test('should respect maxIterations', async () => {
    const options = createOptions({
      config: { maxIterations: 2, parallel: 1 }
    })
    const runner = new ParallelRunner(options)

    const stats = await runner.run()
    expect(stats.completed).toBe(2)
  })

  test('should handle task failures and not block other workers', async () => {
    mockExecutor.executeTask.mockImplementation(async (task: Task) => {
      if (task.id === 'T1') return 1 
      return 0 
    })

    const runner = new ParallelRunner(createOptions())
    const stats = await runner.run()

    expect(stats.completed).toBe(2)
    expect(stats.failed).toBe(1)
    expect(mockBackend.markCompleted).toHaveBeenCalledTimes(2)
  })

  test('should use injected failure state service', async () => {
    mockBackend.claimTask.mockImplementation(async () => {
      const t = tasks.find(t => t.id === 'T1')
      if (t) {
        t.status = 'in-progress'
        t.failureCount = 1
        return t
      }
      return null
    })
    
    const runner = new ParallelRunner(createOptions())
    await runner.run()

    expect(mockFailureState.setFailureState).toHaveBeenCalled()
  })

  test('should use injected checkpoint service', async () => {
    mockCheckpoint.shouldCheckpoint.mockImplementation(() => true)
    
    const runner = new ParallelRunner(createOptions())
    await runner.run()

    expect(mockCheckpoint.checkpoint).toHaveBeenCalled()
  })
})

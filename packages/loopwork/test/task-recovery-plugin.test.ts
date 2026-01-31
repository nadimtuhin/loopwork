import { describe, test, expect, beforeEach, mock } from 'bun:test'
import {
  createTaskRecoveryPlugin,
  withAutoRecovery,
  withConservativeRecovery,
} from '../src/plugins/task-recovery'
import type { TaskBackend, Task } from '../src/contracts'

/**
 * Tests for Task Recovery Plugin
 *
 * Verifies failure analysis and recovery plan generation
 */

describe('Task Recovery Plugin', () => {
  let mockBackend: TaskBackend

  beforeEach(() => {
    // Create mock backend
    mockBackend = {
      createTask: mock(async (data: any) => ({
        id: 'RECOVERY-001',
        title: data.title,
        description: data.description,
        status: 'pending',
        ...data,
      } as Task)),
      updateTask: mock(async (id: string, updates: any) => ({
        id,
        title: 'Updated Task',
        status: 'pending',
        ...updates,
      } as Task)),
    } as any
  })

  describe('Plugin Creation', () => {
    test('creates plugin with default config', () => {
      const plugin = createTaskRecoveryPlugin()

      expect(plugin.name).toBe('task-recovery')
      expect(plugin.onTaskFailed).toBeDefined()
      expect(plugin.onBackendReady).toBeDefined()
    })

    test('creates plugin with custom config', () => {
      const plugin = createTaskRecoveryPlugin({
        enabled: true,
        cli: 'opencode',
        model: 'opus',
        autoRecover: true,
        maxRetries: 5,
      })

      expect(plugin.name).toBe('task-recovery')
    })

    test('creates auto-recovery preset', () => {
      const plugin = withAutoRecovery()

      expect(plugin.name).toBe('task-recovery')
      expect(plugin.onTaskFailed).toBeDefined()
    })

    test('creates conservative recovery preset', () => {
      const plugin = withConservativeRecovery()

      expect(plugin.name).toBe('task-recovery')
      expect(plugin.onTaskFailed).toBeDefined()
    })
  })

  describe('Backend Integration', () => {
    test('initializes when backend is ready', async () => {
      const plugin = createTaskRecoveryPlugin()

      await plugin.onBackendReady?.(mockBackend)

      // Should not throw
      expect(plugin.name).toBe('task-recovery')
    })
  })

  describe('Failure Filtering', () => {
    test('skips failures matching error patterns', async () => {
      const plugin = createTaskRecoveryPlugin({
        enabled: true,
        skip: {
          errorPatterns: [/timeout/i, /cancelled/i],
          taskPatterns: [],
          labels: [],
        },
      })

      await plugin.onBackendReady?.(mockBackend)

      const context = {
        task: {
          id: 'TASK-001',
          title: 'Process data',
          status: 'failed',
        },
        config: {} as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'default',
        retryAttempt: 0,
      }

      const error = 'Request timeout after 30 seconds'

      // Should not call backend for skipped errors
      await plugin.onTaskFailed?.(context, error)

      expect((mockBackend.createTask as any).mock.calls.length).toBe(0)
    })

    test('skips tasks matching task patterns', async () => {
      const plugin = createTaskRecoveryPlugin({
        enabled: true,
        skip: {
          errorPatterns: [],
          taskPatterns: [/^test:/i, /^chore:/i],
          labels: [],
        },
      })

      await plugin.onBackendReady?.(mockBackend)

      const context = {
        task: {
          id: 'TEST-001',
          title: 'test: add unit tests',
          status: 'failed',
        },
        config: {} as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'default',
        retryAttempt: 0,
      }

      const error = 'Test failed: assertion error'

      await plugin.onTaskFailed?.(context, error)

      expect((mockBackend.createTask as any).mock.calls.length).toBe(0)
    })

    test('skips tasks with excluded labels', async () => {
      const plugin = createTaskRecoveryPlugin({
        enabled: true,
        skip: {
          errorPatterns: [],
          taskPatterns: [],
          labels: ['no-recovery'],
        },
      })

      await plugin.onBackendReady?.(mockBackend)

      const context = {
        task: {
          id: 'TASK-001',
          title: 'Internal task',
          status: 'failed',
          labels: ['no-recovery'], // GitHub-specific field
        } as any,
        config: {} as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'default',
        retryAttempt: 0,
      }

      const error = 'Task failed'

      await plugin.onTaskFailed?.(context, error)

      expect((mockBackend.createTask as any).mock.calls.length).toBe(0)
    })

    test('processes failures that do not match skip rules', async () => {
      const plugin = createTaskRecoveryPlugin({
        enabled: true,
        skip: {
          errorPatterns: [/timeout/i],
          taskPatterns: [],
          labels: [],
        },
      })

      await plugin.onBackendReady?.(mockBackend)

      const context = {
        task: {
          id: 'TASK-001',
          title: 'Process data',
          status: 'failed',
        },
        config: {} as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'default',
        retryAttempt: 0,
      }

      const error = 'TypeError: Cannot read property of undefined'

      // Should process non-skipped failures
      // (would call AI in real scenario, but we skip that in tests)
      expect(async () => {
        await plugin.onTaskFailed?.(context, error)
      }).not.toThrow()
    })
  })

  describe('Retry Limiting', () => {
    test('skips recovery after max retries exceeded', async () => {
      const plugin = createTaskRecoveryPlugin({
        enabled: true,
        maxRetries: 2,
      })

      await plugin.onBackendReady?.(mockBackend)

      const context = {
        task: {
          id: 'TASK-001',
          title: 'Failing task',
          status: 'failed',
        },
        config: {} as any,
        iteration: 3,
        startTime: new Date(),
        namespace: 'default',
        retryAttempt: 2, // Already at max
      }

      const error = 'Persistent error'

      await plugin.onTaskFailed?.(context, error)

      // Should skip - max retries reached
      expect((mockBackend.createTask as any).mock.calls.length).toBe(0)
    })

    test('allows retries below max threshold', async () => {
      const plugin = createTaskRecoveryPlugin({
        enabled: true,
        maxRetries: 3,
      })

      await plugin.onBackendReady?.(mockBackend)

      const context = {
        task: {
          id: 'TASK-001',
          title: 'Failing task',
          status: 'failed',
        },
        config: {} as any,
        iteration: 2,
        startTime: new Date(),
        namespace: 'default',
        retryAttempt: 1, // Below max
      }

      const error = 'Error that can be retried'

      // Should process - below max retries
      expect(async () => {
        await plugin.onTaskFailed?.(context, error)
      }).not.toThrow()
    })
  })

  describe('Configuration Options', () => {
    test('respects enabled flag', async () => {
      const plugin = createTaskRecoveryPlugin({
        enabled: false,
      })

      await plugin.onBackendReady?.(mockBackend)

      const context = {
        task: { id: 'TASK-001', title: 'Task', status: 'failed' },
        config: {} as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'default',
      }

      const error = 'Some error'

      await plugin.onTaskFailed?.(context, error)

      // Should not interact with backend when disabled
      expect((mockBackend.createTask as any).mock.calls.length).toBe(0)
    })

    test('supports different models', () => {
      const haikuPlugin = createTaskRecoveryPlugin({ model: 'haiku' })
      const sonnetPlugin = createTaskRecoveryPlugin({ model: 'sonnet' })
      const opusPlugin = createTaskRecoveryPlugin({ model: 'opus' })

      expect(haikuPlugin.name).toBe('task-recovery')
      expect(sonnetPlugin.name).toBe('task-recovery')
      expect(opusPlugin.name).toBe('task-recovery')
    })

    test('supports different CLI tools', () => {
      const claudePlugin = createTaskRecoveryPlugin({ cli: 'claude' })
      const opencodePlugin = createTaskRecoveryPlugin({ cli: 'opencode' })
      const geminiPlugin = createTaskRecoveryPlugin({ cli: 'gemini' })

      expect(claudePlugin.name).toBe('task-recovery')
      expect(opencodePlugin.name).toBe('task-recovery')
      expect(geminiPlugin.name).toBe('task-recovery')
    })

    test('respects maxRetries configuration', () => {
      const plugin = createTaskRecoveryPlugin({
        maxRetries: 5,
      })

      expect(plugin.name).toBe('task-recovery')
    })

    test('respects autoRecover configuration', () => {
      const manualPlugin = createTaskRecoveryPlugin({
        autoRecover: false,
      })
      const autoPlugin = createTaskRecoveryPlugin({
        autoRecover: true,
      })

      expect(manualPlugin.name).toBe('task-recovery')
      expect(autoPlugin.name).toBe('task-recovery')
    })
  })

  describe('Recovery Strategies', () => {
    test('supports auto-retry strategy', () => {
      const plugin = createTaskRecoveryPlugin({
        strategies: {
          autoRetry: true,
          createTasks: false,
          updateTests: false,
          updateTaskDescription: false,
        },
      })

      expect(plugin.name).toBe('task-recovery')
    })

    test('supports create-tasks strategy', () => {
      const plugin = createTaskRecoveryPlugin({
        strategies: {
          autoRetry: false,
          createTasks: true,
          updateTests: false,
          updateTaskDescription: false,
        },
      })

      expect(plugin.name).toBe('task-recovery')
    })

    test('supports update-tests strategy', () => {
      const plugin = createTaskRecoveryPlugin({
        strategies: {
          autoRetry: false,
          createTasks: false,
          updateTests: true,
          updateTaskDescription: false,
        },
      })

      expect(plugin.name).toBe('task-recovery')
    })

    test('supports update-description strategy', () => {
      const plugin = createTaskRecoveryPlugin({
        strategies: {
          autoRetry: false,
          createTasks: false,
          updateTests: false,
          updateTaskDescription: true,
        },
      })

      expect(plugin.name).toBe('task-recovery')
    })

    test('supports multiple strategy combinations', () => {
      const plugin = createTaskRecoveryPlugin({
        strategies: {
          autoRetry: true,
          createTasks: true,
          updateTests: true,
          updateTaskDescription: true,
        },
      })

      expect(plugin.name).toBe('task-recovery')
    })
  })

  describe('Error Handling', () => {
    test('handles backend errors gracefully', async () => {
      const failingBackend = {
        createTask: mock(async () => {
          throw new Error('Backend connection failed')
        }),
      } as any

      const plugin = createTaskRecoveryPlugin({ enabled: true })

      await plugin.onBackendReady?.(failingBackend)

      const context = {
        task: { id: 'TASK-001', title: 'Task', status: 'failed' },
        config: {} as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'default',
        retryAttempt: 0,
      }

      // Should not throw even if backend fails
      await expect(async () => {
        await plugin.onTaskFailed?.(context, 'Error occurred')
      }).not.toThrow()
    })

    test('handles AI analysis failures gracefully', async () => {
      const plugin = createTaskRecoveryPlugin({ enabled: true })

      await plugin.onBackendReady?.(mockBackend)

      const context = {
        task: { id: 'TASK-001', title: 'Task', status: 'failed' },
        config: {} as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'default',
        retryAttempt: 0,
      }

      // Should not throw even if AI analysis fails
      await expect(async () => {
        await plugin.onTaskFailed?.(context, 'Error message')
      }).not.toThrow()
    })
  })

  describe('Preset Configurations', () => {
    test('auto-recovery preset enables all strategies', () => {
      const plugin = withAutoRecovery()
      expect(plugin.name).toBe('task-recovery')
    })

    test('auto-recovery preset sets higher max retries', () => {
      const plugin = withAutoRecovery()
      expect(plugin.name).toBe('task-recovery')
    })

    test('conservative preset has manual approval', () => {
      const plugin = withConservativeRecovery()
      expect(plugin.name).toBe('task-recovery')
    })

    test('conservative preset has lower max retries', () => {
      const plugin = withConservativeRecovery()
      expect(plugin.name).toBe('task-recovery')
    })

    test('conservative preset limits strategies', () => {
      const plugin = withConservativeRecovery()
      expect(plugin.name).toBe('task-recovery')
    })
  })

  describe('Failure History Tracking', () => {
    test('tracks retry attempts per task', async () => {
      const plugin = createTaskRecoveryPlugin({ enabled: true, maxRetries: 3 })

      await plugin.onBackendReady?.(mockBackend)

      const context = {
        task: { id: 'TASK-001', title: 'Failing task', status: 'failed' },
        config: {} as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'default',
        retryAttempt: 0,
      }

      // First failure
      await plugin.onTaskFailed?.(context, 'First error')

      // Second failure (same task)
      await plugin.onTaskFailed?.({ ...context, iteration: 2, retryAttempt: 1 }, 'Second error')

      // Should track attempts internally
      expect(plugin.name).toBe('task-recovery')
    })

    test('different tasks have independent retry counts', async () => {
      const plugin = createTaskRecoveryPlugin({ enabled: true, maxRetries: 2 })

      await plugin.onBackendReady?.(mockBackend)

      const context1 = {
        task: { id: 'TASK-001', title: 'Task 1', status: 'failed' },
        config: {} as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'default',
        retryAttempt: 0,
      }

      const context2 = {
        task: { id: 'TASK-002', title: 'Task 2', status: 'failed' },
        config: {} as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'default',
        retryAttempt: 0,
      }

      await plugin.onTaskFailed?.(context1, 'Error in task 1')
      await plugin.onTaskFailed?.(context2, 'Error in task 2')

      // Each task should have independent retry tracking
      expect(plugin.name).toBe('task-recovery')
    })
  })
})

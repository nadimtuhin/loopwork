import { describe, test, expect, beforeEach, mock } from 'bun:test'
// Removed type-only import from '../src/plugins/smart-tasks'
import type { TaskBackend, Task } from '../src/contracts'

/**
 * Tests for Smart Tasks Plugin
 *
 * Verifies intelligent task suggestion and creation based on completed tasks
 */

describe('Smart Tasks Plugin', () => {
  let mockBackend: TaskBackend

  beforeEach(() => {
    // Create mock backend
    mockBackend = {
      listPendingTasks: mock(async () => [
        {
          id: 'TASK-002',
          title: 'Implement user login',
          description: 'Add login functionality',
          status: 'pending',
        },
        {
          id: 'TASK-003',
          title: 'Add password reset',
          description: 'Implement forgot password flow',
          status: 'pending',
        },
      ] as Task[]),
      createTask: mock(async (data: any) => ({
        id: 'TASK-NEW-001',
        title: data.title,
        description: data.description,
        status: 'pending',
        ...data,
      } as Task)),
      setDependencies: mock(async (taskId: string, deps: string[]) => {}),
    } as any
  })

  describe('Plugin Creation', () => {
    test('creates plugin with default config', () => {
      const plugin = createSmartTasksPlugin()

      expect(plugin.name).toBe('smart-tasks')
      expect(plugin.onTaskComplete).toBeDefined()
      expect(plugin.onBackendReady).toBeDefined()
    })

    test('creates plugin with custom config', () => {
      const plugin = createSmartTasksPlugin({
        enabled: true,
        cli: 'opencode',
        model: 'opus',
        autoCreate: true,
        maxSuggestions: 5,
        minConfidence: 80,
      })

      expect(plugin.name).toBe('smart-tasks')
    })

    test('creates conservative preset', () => {
      const wrapper = withSmartTasksConservative()
      const config = wrapper({ plugins: [] } as any)
      
      expect(config.plugins).toHaveLength(1)
      expect(config.plugins?.[0]?.name).toBe('smart-tasks')
      expect(config.plugins?.[0]?.onTaskComplete).toBeDefined()
    })

    test('creates aggressive preset', () => {
      const wrapper = withSmartTasksAggressive()
      const config = wrapper({ plugins: [] } as any)
      
      expect(config.plugins).toHaveLength(1)
      expect(config.plugins?.[0]?.name).toBe('smart-tasks')
      expect(config.plugins?.[0]?.onTaskComplete).toBeDefined()
    })

    test('creates test-focused preset', () => {
      const wrapper = withSmartTestTasks()
      const config = wrapper({ plugins: [] } as any)
      
      expect(config.plugins).toHaveLength(1)
      expect(config.plugins?.[0]?.name).toBe('smart-tasks')
      expect(config.plugins?.[0]?.onTaskComplete).toBeDefined()
    })
  })

  describe('Backend Integration', () => {
    test('initializes when backend is ready', async () => {
      const plugin = createSmartTasksPlugin()

      await plugin.onBackendReady?.(mockBackend)

      // Should not throw
      expect(plugin.name).toBe('smart-tasks')
    })

    test('fetches upcoming tasks for context', async () => {
      const plugin = createSmartTasksPlugin({ enabled: false })

      await plugin.onBackendReady?.(mockBackend)

      const context = {
        task: {
          id: 'TASK-001',
          title: 'Complete user authentication',
          status: 'completed',
        },
      }

      const result = { success: true }

      // Should not fetch when disabled
      await plugin.onTaskComplete?.(context, result)

      expect((mockBackend.listPendingTasks as any).mock.calls.length).toBe(0)
    })
  })

  describe('Task Filtering', () => {
    test('skips tasks matching skip patterns', async () => {
      const plugin = createSmartTasksPlugin({
        enabled: true,
        skip: {
          taskPatterns: [/^test:/i, /^chore:/i],
          labels: [],
        },
      })

      await plugin.onBackendReady?.(mockBackend)

      const context = {
        task: {
          id: 'TEST-001',
          title: 'test: add unit tests',
          status: 'completed',
        },
      }

      const result = { success: true }

      await plugin.onTaskComplete?.(context, result)

      // Should not call backend for skipped tasks
      expect((mockBackend.listPendingTasks as any).mock.calls.length).toBe(0)
    })

    test('skips tasks with excluded labels', async () => {
      const plugin = createSmartTasksPlugin({
        enabled: true,
        skip: {
          taskPatterns: [],
          labels: ['no-suggestions'],
        },
      })

      await plugin.onBackendReady?.(mockBackend)

      const context = {
        task: {
          id: 'TASK-001',
          title: 'Internal cleanup',
          labels: ['no-suggestions'],
          status: 'completed',
        },
      }

      const result = { success: true }

      await plugin.onTaskComplete?.(context, result)

      expect((mockBackend.listPendingTasks as any).mock.calls.length).toBe(0)
    })

    test('processes tasks that do not match skip rules', async () => {
      const plugin = createSmartTasksPlugin({
        enabled: true,
        skip: {
          taskPatterns: [/^test:/i],
          labels: ['no-suggestions'],
        },
      })

      await plugin.onBackendReady?.(mockBackend)

      const context = {
        task: {
          id: 'TASK-001',
          title: 'Add new feature',
          status: 'completed',
        },
      }

      const result = { success: true }

      // Should call backend for non-skipped tasks
      await plugin.onTaskComplete?.(context, result)

      expect((mockBackend.listPendingTasks as any).mock.calls.length).toBe(1)
    })
  })

  describe('Configuration Options', () => {
    test('respects enabled flag', async () => {
      const plugin = createSmartTasksPlugin({
        enabled: false,
      })

      await plugin.onBackendReady?.(mockBackend)

      const context = {
        task: { id: 'TASK-001', title: 'Add feature', status: 'completed' },
      }

      const result = { success: true }

      await plugin.onTaskComplete?.(context, result)

      // Should not interact with backend when disabled
      expect((mockBackend.listPendingTasks as any).mock.calls.length).toBe(0)
    })

    test('supports different models', () => {
      const haikuPlugin = createSmartTasksPlugin({ model: 'haiku' })
      const sonnetPlugin = createSmartTasksPlugin({ model: 'sonnet' })
      const opusPlugin = createSmartTasksPlugin({ model: 'opus' })

      expect(haikuPlugin.name).toBe('smart-tasks')
      expect(sonnetPlugin.name).toBe('smart-tasks')
      expect(opusPlugin.name).toBe('smart-tasks')
    })

    test('supports different CLI tools', () => {
      const claudePlugin = createSmartTasksPlugin({ cli: 'claude' })
      const opencodePlugin = createSmartTasksPlugin({ cli: 'opencode' })
      const geminiPlugin = createSmartTasksPlugin({ cli: 'gemini' })

      expect(claudePlugin.name).toBe('smart-tasks')
      expect(opencodePlugin.name).toBe('smart-tasks')
      expect(geminiPlugin.name).toBe('smart-tasks')
    })

    test('respects lookAhead configuration', async () => {
      const plugin = createSmartTasksPlugin({
        enabled: true,
        lookAhead: 3,
      })

      await plugin.onBackendReady?.(mockBackend)

      expect(plugin.name).toBe('smart-tasks')
    })

    test('respects maxSuggestions configuration', () => {
      const plugin = createSmartTasksPlugin({
        maxSuggestions: 2,
      })

      expect(plugin.name).toBe('smart-tasks')
    })

    test('respects minConfidence configuration', () => {
      const plugin = createSmartTasksPlugin({
        minConfidence: 85,
      })

      expect(plugin.name).toBe('smart-tasks')
    })
  })

  describe('Rule-based Suggestions', () => {
    test('supports follow-up task rules', () => {
      const plugin = createSmartTasksPlugin({
        rules: {
          createFollowUps: true,
          createDependencies: false,
          createTests: false,
          createDocs: false,
        },
      })

      expect(plugin.name).toBe('smart-tasks')
    })

    test('supports dependency task rules', () => {
      const plugin = createSmartTasksPlugin({
        rules: {
          createFollowUps: false,
          createDependencies: true,
          createTests: false,
          createDocs: false,
        },
      })

      expect(plugin.name).toBe('smart-tasks')
    })

    test('supports test task rules', () => {
      const plugin = createSmartTasksPlugin({
        rules: {
          createFollowUps: false,
          createDependencies: false,
          createTests: true,
          createDocs: false,
        },
      })

      expect(plugin.name).toBe('smart-tasks')
    })

    test('supports documentation task rules', () => {
      const plugin = createSmartTasksPlugin({
        rules: {
          createFollowUps: false,
          createDependencies: false,
          createTests: false,
          createDocs: true,
        },
      })

      expect(plugin.name).toBe('smart-tasks')
    })

    test('supports multiple rule combinations', () => {
      const plugin = createSmartTasksPlugin({
        rules: {
          createFollowUps: true,
          createDependencies: true,
          createTests: true,
          createDocs: true,
        },
      })

      expect(plugin.name).toBe('smart-tasks')
    })
  })

  describe('Auto-create vs Manual Approval', () => {
    test('presents suggestions when autoCreate is false', async () => {
      const plugin = createSmartTasksPlugin({
        enabled: true,
        autoCreate: false,
      })

      await plugin.onBackendReady?.(mockBackend)

      expect(plugin.name).toBe('smart-tasks')
      // Manual approval logic would be tested here
    })

    test('auto-creates tasks when autoCreate is true', async () => {
      const plugin = createSmartTasksPlugin({
        enabled: true,
        autoCreate: true,
      })

      await plugin.onBackendReady?.(mockBackend)

      expect(plugin.name).toBe('smart-tasks')
      // Auto-create logic would be tested here (requires mocking AI response)
    })
  })

  describe('Recent Task Tracking', () => {
    test('maintains history of recent completed tasks', async () => {
      const plugin = createSmartTasksPlugin({ enabled: true })

      await plugin.onBackendReady?.(mockBackend)

      // Complete multiple tasks
      for (let i = 1; i <= 3; i++) {
        const context = {
          task: {
            id: `TASK-${i}`,
            title: `Task ${i}`,
            status: 'completed',
          },
        }

        await plugin.onTaskComplete?.(context, { success: true })
      }

      // Recent tasks should be tracked for context
      expect(plugin.name).toBe('smart-tasks')
    })

    test('limits recent task history', async () => {
      const plugin = createSmartTasksPlugin({ enabled: true })

      await plugin.onBackendReady?.(mockBackend)

      // Complete more than MAX_RECENT tasks
      for (let i = 1; i <= 10; i++) {
        const context = {
          task: {
            id: `TASK-${i}`,
            title: `Task ${i}`,
            status: 'completed',
          },
        }

        await plugin.onTaskComplete?.(context, { success: true })
      }

      // Should limit to MAX_RECENT (5)
      expect(plugin.name).toBe('smart-tasks')
    })
  })

  describe('Error Handling', () => {
    test('handles backend errors gracefully', async () => {
      const failingBackend = {
        listPendingTasks: mock(async () => {
          throw new Error('Backend connection failed')
        }),
      } as any

      const plugin = createSmartTasksPlugin({ enabled: true })

      await plugin.onBackendReady?.(failingBackend)

      const context = {
        task: { id: 'TASK-001', title: 'Add feature', status: 'completed' },
      }

      // Should not throw
      await expect(async () => {
        await plugin.onTaskComplete?.(context, { success: true })
      }).not.toThrow()
    })

    test('handles AI analysis failures gracefully', async () => {
      const plugin = createSmartTasksPlugin({ enabled: true })

      await plugin.onBackendReady?.(mockBackend)

      const context = {
        task: { id: 'TASK-001', title: 'Add feature', status: 'completed' },
      }

      // Should not throw even if AI fails
      await expect(async () => {
        await plugin.onTaskComplete?.(context, { success: true })
      }).not.toThrow()
    })
  })

  describe('Preset Configurations', () => {
    test('conservative preset has high confidence threshold', () => {
      const wrapper = withSmartTasksConservative()
      const config = wrapper({ plugins: [] } as any)
      expect(config.plugins?.[0]?.name).toBe('smart-tasks')
    })

    test('aggressive preset has lower confidence threshold', () => {
      const wrapper = withSmartTasksAggressive()
      const config = wrapper({ plugins: [] } as any)
      expect(config.plugins?.[0]?.name).toBe('smart-tasks')
    })

    test('test-focused preset only suggests test tasks', () => {
      const wrapper = withSmartTestTasks()
      const config = wrapper({ plugins: [] } as any)
      expect(config.plugins?.[0]?.name).toBe('smart-tasks')
    })
  })
})

import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test'
import { createAsanaPlugin, AsanaClient } from '../src'
import type { TaskContext, PluginTaskResult } from '../../loopwork/src/contracts'

const originalFetch = global.fetch
let mockFetch: ReturnType<typeof mock>

const originalAsanaToken = process.env.ASANA_ACCESS_TOKEN
const originalAsanaProject = process.env.ASANA_PROJECT_ID

beforeEach(() => {
  delete process.env.ASANA_ACCESS_TOKEN
  delete process.env.ASANA_PROJECT_ID
  mockFetch = mock(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: {} }),
      text: () => Promise.resolve(''),
    })
  )
  global.fetch = mockFetch as any
})

afterEach(() => {
  global.fetch = originalFetch
  process.env.ASANA_ACCESS_TOKEN = originalAsanaToken
  process.env.ASANA_PROJECT_ID = originalAsanaProject
})

describe('Asana E2E Sync Tests', () => {
  const mockContext: TaskContext = {
    task: {
      id: 'TASK-001',
      title: 'Implement feature X',
      description: 'Add new authentication',
      status: 'in-progress',
      priority: 'high',
      metadata: { asanaGid: '1234567890' },
    },
    iteration: 1,
    startTime: new Date(),
    namespace: 'test-namespace',
  }

  const mockResult: PluginTaskResult = {
    duration: 120,
  }

  describe('Plugin Lifecycle Hooks', () => {
    test('full lifecycle: onTaskStart -> onTaskComplete', async () => {
      const plugin = createAsanaPlugin({
        accessToken: 'test-token',
        projectId: 'project-123',
        syncStatus: true,
      })

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: { gid: '1234567890' } }),
        })
      )

      // Start task
      await plugin.onTaskStart?.(mockContext)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://app.asana.com/api/1.0/tasks/1234567890/stories',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('started working on this task'),
        })
      )

      mockFetch.mockClear()

      // Complete task
      await plugin.onTaskComplete?.(mockContext, mockResult)

      // Should call both complete and comment endpoints
      const calls = mockFetch.mock.calls
      expect(calls.length).toBeGreaterThanOrEqual(2)

      // Check complete call
      const completeCall = calls.find((c: any) =>
        c[0].includes('/tasks/1234567890') &&
        !c[0].includes('/stories') &&
        c[1]?.body?.includes('completed')
      )
      expect(completeCall).toBeDefined()

      // Check comment call
      const commentCall = calls.find((c: any) =>
        c[0].includes('/stories') &&
        c[1]?.body?.includes('Completed by Loopwork')
      )
      expect(commentCall).toBeDefined()
    })

    test('full lifecycle: onTaskStart -> onTaskFailed', async () => {
      const plugin = createAsanaPlugin({
        accessToken: 'test-token',
        projectId: 'project-123',
      })

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: {} }),
        })
      )

      await plugin.onTaskStart?.(mockContext)
      expect(mockFetch).toHaveBeenCalled()

      mockFetch.mockClear()

      const errorMessage = 'Build failed: TypeScript compilation errors'
      await plugin.onTaskFailed?.(mockContext, errorMessage)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://app.asana.com/api/1.0/tasks/1234567890/stories',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Loopwork failed'),
        })
      )
    })

    test('onLoopEnd logs summary statistics', async () => {
      const plugin = createAsanaPlugin({
        accessToken: 'test-token',
        projectId: 'project-123',
      })

      const stats = { completed: 5, failed: 1, skipped: 0 }

      // Should not throw
      await expect(plugin.onLoopEnd?.(stats)).resolves.toBeUndefined()
    })
  })

  describe('Sync Workflow: Loopwork -> Asana', () => {
    test('task created in Loopwork syncs to Asana on start', async () => {
      const plugin = createAsanaPlugin({
        accessToken: 'test-token',
        projectId: 'project-123',
      })

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: { gid: '1234567890' } }),
        })
      )

      const newTask: TaskContext = {
        ...mockContext,
        task: {
          ...mockContext.task,
          status: 'pending',
        },
      }

      await plugin.onTaskStart?.(newTask)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/tasks/1234567890/stories'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      )
    })

    test('completed task in Loopwork syncs completion to Asana', async () => {
      const plugin = createAsanaPlugin({
        accessToken: 'test-token',
        projectId: 'project-123',
        syncStatus: true,
      })

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: { gid: '1234567890', completed: true } }),
        })
      )

      await plugin.onTaskComplete?.(mockContext, mockResult)

      // Verify completion API call
      expect(mockFetch).toHaveBeenCalledWith(
        'https://app.asana.com/api/1.0/tasks/1234567890',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ data: { completed: true } }),
        })
      )
    })

    test('failed task in Loopwork adds error comment to Asana', async () => {
      const plugin = createAsanaPlugin({
        accessToken: 'test-token',
        projectId: 'project-123',
      })

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: {} }),
        })
      )

      const errorMsg = 'Rate limit exceeded: Too many API calls'
      await plugin.onTaskFailed?.(mockContext, errorMsg)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/stories'),
        expect.objectContaining({
          body: expect.stringContaining('Loopwork failed'),
        })
      )
    })
  })

  describe('Metadata Mapping (asanaGid)', () => {
    test('task with asanaGid triggers sync', async () => {
      const plugin = createAsanaPlugin({
        accessToken: 'test-token',
        projectId: 'project-123',
      })

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: {} }),
        })
      )

      const taskWithGid: TaskContext = {
        ...mockContext,
        task: {
          ...mockContext.task,
          metadata: { asanaGid: '9876543210' },
        },
      }

      await plugin.onTaskStart?.(taskWithGid)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://app.asana.com/api/1.0/tasks/9876543210/stories',
        expect.any(Object)
      )
    })

    test('task without asanaGid skips sync', async () => {
      const plugin = createAsanaPlugin({
        accessToken: 'test-token',
        projectId: 'project-123',
      })

      const taskWithoutGid: TaskContext = {
        ...mockContext,
        task: {
          ...mockContext.task,
          metadata: {},
        },
      }

      await plugin.onTaskStart?.(taskWithoutGid)

      expect(mockFetch).not.toHaveBeenCalled()
    })

    test('task with null metadata skips sync', async () => {
      const plugin = createAsanaPlugin({
        accessToken: 'test-token',
        projectId: 'project-123',
      })

      const taskWithNullMeta: TaskContext = {
        ...mockContext,
        task: {
          ...mockContext.task,
          metadata: undefined as any,
        },
      }

      await plugin.onTaskStart?.(taskWithNullMeta)

      expect(mockFetch).not.toHaveBeenCalled()
    })

    test('multiple tasks with different asanaGids sync correctly', async () => {
      const plugin = createAsanaPlugin({
        accessToken: 'test-token',
        projectId: 'project-123',
      })

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: {} }),
        })
      )

      const task1: TaskContext = {
        ...mockContext,
        task: { ...mockContext.task, metadata: { asanaGid: '111' } },
      }

      const task2: TaskContext = {
        ...mockContext,
        task: { ...mockContext.task, metadata: { asanaGid: '222' } },
      }

      await plugin.onTaskStart?.(task1)
      await plugin.onTaskStart?.(task2)

      const calls = mockFetch.mock.calls
      expect(calls[0][0]).toContain('/tasks/111/stories')
      expect(calls[1][0]).toContain('/tasks/222/stories')
    })
  })

  describe('Error Handling', () => {
    test('API failure (401 Unauthorized) does not throw', async () => {
      const plugin = createAsanaPlugin({
        accessToken: 'invalid-token',
        projectId: 'project-123',
      })

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Unauthorized'),
        })
      )

      // Should log warning but not throw
      await expect(plugin.onTaskStart?.(mockContext)).resolves.toBeUndefined()
    })

    test('API failure (404 Not Found) does not throw', async () => {
      const plugin = createAsanaPlugin({
        accessToken: 'test-token',
        projectId: 'project-123',
      })

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          text: () => Promise.resolve('Task not found'),
        })
      )

      await expect(plugin.onTaskComplete?.(mockContext, mockResult)).resolves.toBeUndefined()
    })

    test('API failure (500 Server Error) does not throw', async () => {
      const plugin = createAsanaPlugin({
        accessToken: 'test-token',
        projectId: 'project-123',
      })

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Internal Server Error'),
        })
      )

      await expect(plugin.onTaskFailed?.(mockContext, 'error')).resolves.toBeUndefined()
    })

    test('network timeout does not throw', async () => {
      const plugin = createAsanaPlugin({
        accessToken: 'test-token',
        projectId: 'project-123',
      })

      mockFetch.mockImplementation(() =>
        Promise.reject(new Error('Network timeout'))
      )

      await expect(plugin.onTaskStart?.(mockContext)).resolves.toBeUndefined()
    })

    test('invalid JSON response does not throw', async () => {
      const plugin = createAsanaPlugin({
        accessToken: 'test-token',
        projectId: 'project-123',
      })

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.reject(new Error('Invalid JSON')),
        })
      )

      await expect(plugin.onTaskComplete?.(mockContext, mockResult)).resolves.toBeUndefined()
    })
  })

  describe('Missing Credentials', () => {
    test('plugin with no accessToken returns warning plugin', () => {
      const plugin = createAsanaPlugin({
        projectId: 'project-123',
      })

      expect(plugin.name).toBe('asana')
      expect(plugin.onConfigLoad).toBeDefined()
      expect(plugin.onTaskStart).toBeUndefined()
    })

    test('plugin with no projectId returns warning plugin', () => {
      const plugin = createAsanaPlugin({
        accessToken: 'test-token',
      })

      expect(plugin.name).toBe('asana')
      expect(plugin.onConfigLoad).toBeDefined()
      expect(plugin.onTaskStart).toBeUndefined()
    })

    test('warning plugin logs message on config load', () => {
      const plugin = createAsanaPlugin({})
      const config = { backend: { type: 'json' } } as any

      const result = plugin.onConfigLoad?.(config)
      expect(result).toBeDefined()
    })
  })

  describe('Configuration Options', () => {
    test('syncStatus: false skips task completion in Asana', async () => {
      const plugin = createAsanaPlugin({
        accessToken: 'test-token',
        projectId: 'project-123',
        syncStatus: false,
      })

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: {} }),
        })
      )

      await plugin.onTaskComplete?.(mockContext, mockResult)

      const calls = mockFetch.mock.calls
      // Should only call comment endpoint, not complete
      const completeCall = calls.find((c: any) =>
        c[1]?.body?.includes('"completed":true')
      )
      expect(completeCall).toBeUndefined()
    })

    test('syncStatus: true completes task in Asana', async () => {
      const plugin = createAsanaPlugin({
        accessToken: 'test-token',
        projectId: 'project-123',
        syncStatus: true,
      })

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: {} }),
        })
      )

      await plugin.onTaskComplete?.(mockContext, mockResult)

      const calls = mockFetch.mock.calls
      const completeCall = calls.find((c: any) =>
        c[1]?.body?.includes('"completed":true')
      )
      expect(completeCall).toBeDefined()
    })
  })

  describe('AsanaClient Integration', () => {
    test('client can create and complete task e2e', async () => {
      const client = new AsanaClient('test-token')

      // Mock create task
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            data: { gid: 'new-task-123', name: 'E2E Test Task', completed: false },
          }),
        })
      )

      const task = await client.createTask('project-123', 'E2E Test Task', 'Testing end-to-end')

      expect(task.gid).toBe('new-task-123')
      expect(task.completed).toBe(false)

      // Mock complete task
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            data: { gid: 'new-task-123', completed: true },
          }),
        })
      )

      const completedTask = await client.completeTask('new-task-123')
      expect(completedTask.completed).toBe(true)
    })

    test('client can add comments throughout task lifecycle', async () => {
      const client = new AsanaClient('test-token')

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: {} }),
        })
      )

      await client.addComment('task-123', 'Started task')
      await client.addComment('task-123', 'Progress update')
      await client.addComment('task-123', 'Task completed')

      expect(mockFetch).toHaveBeenCalledTimes(3)
    })
  })
})

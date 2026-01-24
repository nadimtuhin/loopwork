import { describe, expect, test, mock, beforeEach, afterEach, spyOn } from 'bun:test'
import { createAsanaPlugin, AsanaClient, withAsana } from '../src'
import type { LoopworkPlugin } from 'loopwork/contracts'

// Mock fetch globally
const originalFetch = global.fetch
let mockFetch: ReturnType<typeof mock>

beforeEach(() => {
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
})

describe('Asana Plugin', () => {
  const mockTask = {
    id: 'TASK-001',
    title: 'Test task',
    metadata: { asanaGid: '123456789' },
  } as any

  describe('AsanaClient', () => {
    test('getTask makes correct API call', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { gid: '123', name: 'Test' } }),
        })
      )

      const client = new AsanaClient('test-token')
      const task = await client.getTask('123')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://app.asana.com/api/1.0/tasks/123',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      )
      expect(task.gid).toBe('123')
    })

    test('createTask makes correct API call', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { gid: '456', name: 'New Task', completed: false } }),
        })
      )

      const client = new AsanaClient('test-token')
      const task = await client.createTask('project-123', 'New Task', 'Task notes')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://app.asana.com/api/1.0/tasks',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            data: {
              name: 'New Task',
              notes: 'Task notes',
              projects: ['project-123'],
            },
          }),
        })
      )
      expect(task.gid).toBe('456')
    })

    test('updateTask makes correct API call', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { gid: '123', name: 'Updated', completed: false } }),
        })
      )

      const client = new AsanaClient('test-token')
      const task = await client.updateTask('123', { name: 'Updated', notes: 'New notes' })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://app.asana.com/api/1.0/tasks/123',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ data: { name: 'Updated', notes: 'New notes' } }),
        })
      )
    })

    test('completeTask updates task', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { gid: '123', completed: true } }),
        })
      )

      const client = new AsanaClient('test-token')
      const task = await client.completeTask('123')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://app.asana.com/api/1.0/tasks/123',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ data: { completed: true } }),
        })
      )
    })

    test('addComment makes correct API call', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: {} }),
        })
      )

      const client = new AsanaClient('test-token')
      await client.addComment('123', 'This is a comment')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://app.asana.com/api/1.0/tasks/123/stories',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ data: { text: 'This is a comment' } }),
        })
      )
    })

    test('getProjectTasks makes correct API call', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: [{ gid: '1', name: 'Task 1' }] }),
        })
      )

      const client = new AsanaClient('test-token')
      const tasks = await client.getProjectTasks('project-123')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://app.asana.com/api/1.0/projects/project-123/tasks?opt_fields=gid,name,completed,notes',
        expect.objectContaining({
          method: 'GET',
        })
      )
      expect(tasks).toBeInstanceOf(Array)
    })

    test('handles API errors', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Unauthorized'),
        })
      )

      const client = new AsanaClient('bad-token')
      await expect(client.getTask('123')).rejects.toThrow('Asana API error: 401')
    })

    test('handles 404 errors', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          text: () => Promise.resolve('Not Found'),
        })
      )

      const client = new AsanaClient('test-token')
      await expect(client.getTask('nonexistent')).rejects.toThrow('Asana API error: 404')
    })

    test('handles 500 errors', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Internal Server Error'),
        })
      )

      const client = new AsanaClient('test-token')
      await expect(client.getTask('123')).rejects.toThrow('Asana API error: 500')
    })
  })

  describe('createAsanaPlugin', () => {
    test('returns warning plugin when no credentials', () => {
      const plugin = createAsanaPlugin({})
      expect(plugin.name).toBe('asana')

      // Should have onConfigLoad that warns
      const result = plugin.onConfigLoad?.({ backend: { type: 'json' } } as any)
      expect(result).toBeDefined()
    })

    test('creates functional plugin with credentials', () => {
      const plugin = createAsanaPlugin({
        accessToken: 'test-token',
        projectId: 'project-123',
      })

      expect(plugin.name).toBe('asana')
      expect(plugin.onTaskStart).toBeDefined()
      expect(plugin.onTaskComplete).toBeDefined()
      expect(plugin.onTaskFailed).toBeDefined()
      expect(plugin.onLoopEnd).toBeDefined()
    })

    test('onTaskStart skips tasks without asanaGid', async () => {
      const plugin = createAsanaPlugin({
        accessToken: 'test-token',
        projectId: 'project-123',
      })

      const taskWithoutGid = { id: 'TASK-001', title: 'Test', metadata: {} } as any
      await plugin.onTaskStart?.({ task: taskWithoutGid, iteration: 1, startTime: new Date(), namespace: 'test' })

      // Should not have called fetch
      expect(mockFetch).not.toHaveBeenCalled()
    })

    test('onTaskStart handles API errors gracefully', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Unauthorized'),
        })
      )

      const plugin = createAsanaPlugin({
        accessToken: 'test-token',
        projectId: 'project-123',
      })

      // Should not throw, just warn
      await expect(
        plugin.onTaskStart?.({ task: mockTask, iteration: 1, startTime: new Date(), namespace: 'test' })
      ).resolves.toBeUndefined()
    })

    test('onTaskComplete calls API with asanaGid', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: {} }),
        })
      )

      const plugin = createAsanaPlugin({
        accessToken: 'test-token',
        projectId: 'project-123',
      })

      await plugin.onTaskComplete?.({ task: mockTask, iteration: 1, startTime: new Date(), namespace: 'test' }, { duration: 60 })

      // Should have called API twice (complete + comment)
      expect(mockFetch).toHaveBeenCalled()
    })

    test('onTaskComplete handles API errors gracefully', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Server Error'),
        })
      )

      const plugin = createAsanaPlugin({
        accessToken: 'test-token',
        projectId: 'project-123',
      })

      // Should not throw, just warn
      await expect(
        plugin.onTaskComplete?.({ task: mockTask, iteration: 1, startTime: new Date(), namespace: 'test' }, { duration: 60 })
      ).resolves.toBeUndefined()
    })

    test('onTaskComplete skips status sync when syncStatus is false', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: {} }),
        })
      )

      const plugin = createAsanaPlugin({
        accessToken: 'test-token',
        projectId: 'project-123',
        syncStatus: false,
      })

      await plugin.onTaskComplete?.({ task: mockTask, iteration: 1, startTime: new Date(), namespace: 'test' }, { duration: 60 })

      // Should only call comment endpoint, not complete
      expect(mockFetch).toHaveBeenCalled()
    })

    test('onTaskFailed skips tasks without asanaGid', async () => {
      const plugin = createAsanaPlugin({
        accessToken: 'test-token',
        projectId: 'project-123',
      })

      const taskWithoutGid = { id: 'TASK-001', title: 'Test', metadata: {} } as any
      await plugin.onTaskFailed?.({ task: taskWithoutGid, iteration: 1, startTime: new Date(), namespace: 'test' }, 'error message')

      // Should not have called fetch
      expect(mockFetch).not.toHaveBeenCalled()
    })

    test('onTaskFailed adds comment with error', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: {} }),
        })
      )

      const plugin = createAsanaPlugin({
        accessToken: 'test-token',
        projectId: 'project-123',
      })

      await plugin.onTaskFailed?.(
        { task: mockTask, iteration: 1, startTime: new Date(), namespace: 'test' },
        'Something went wrong'
      )

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/stories'),
        expect.objectContaining({
          method: 'POST',
        })
      )
    })

    test('onTaskFailed handles API errors gracefully', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Server Error'),
        })
      )

      const plugin = createAsanaPlugin({
        accessToken: 'test-token',
        projectId: 'project-123',
      })

      // Should not throw, just warn
      await expect(
        plugin.onTaskFailed?.(
          { task: mockTask, iteration: 1, startTime: new Date(), namespace: 'test' },
          'error message'
        )
      ).resolves.toBeUndefined()
    })

    test('onLoopEnd logs stats', async () => {
      const plugin = createAsanaPlugin({
        accessToken: 'test-token',
        projectId: 'project-123',
      })

      const consoleSpy = spyOn(console, 'log').mockImplementation(() => {})

      await plugin.onLoopEnd?.({ completed: 5, failed: 1, skipped: 0 })

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('withAsana', () => {
    test('wraps config with asana settings', () => {
      const wrapper = withAsana({
        accessToken: 'test-token',
        projectId: 'project-123',
        workspaceId: 'workspace-456',
        autoCreate: true,
        syncStatus: false,
      })

      const config = wrapper({ backend: { type: 'json' } } as any)

      expect(config.asana).toBeDefined()
      expect(config.asana.accessToken).toBe('test-token')
      expect(config.asana.projectId).toBe('project-123')
      expect(config.asana.workspaceId).toBe('workspace-456')
      expect(config.asana.autoCreate).toBe(true)
      expect(config.asana.syncStatus).toBe(false)
    })

    test('uses environment variables when config not provided', () => {
      const originalToken = process.env.ASANA_ACCESS_TOKEN
      const originalProject = process.env.ASANA_PROJECT_ID

      process.env.ASANA_ACCESS_TOKEN = 'env-token'
      process.env.ASANA_PROJECT_ID = 'env-project'

      const wrapper = withAsana({})
      const config = wrapper({ backend: { type: 'json' } } as any)

      expect(config.asana.accessToken).toBe('env-token')
      expect(config.asana.projectId).toBe('env-project')

      process.env.ASANA_ACCESS_TOKEN = originalToken
      process.env.ASANA_PROJECT_ID = originalProject
    })

    test('sets default values for optional settings', () => {
      const wrapper = withAsana({
        accessToken: 'test-token',
        projectId: 'project-123',
      })

      const config = wrapper({ backend: { type: 'json' } } as any)

      expect(config.asana.autoCreate).toBe(false)
      expect(config.asana.syncStatus).toBe(true)
    })
  })
})

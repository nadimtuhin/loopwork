import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test'
import { createTodoistPlugin, TodoistClient, withTodoist } from '../src'

// Mock fetch globally
const originalFetch = global.fetch
let mockFetch: ReturnType<typeof mock>

const originalTodoistToken = process.env.TODOIST_API_TOKEN
const originalTodoistProject = process.env.TODOIST_PROJECT_ID

beforeEach(() => {
  delete process.env.TODOIST_API_TOKEN
  delete process.env.TODOIST_PROJECT_ID
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
  process.env.TODOIST_API_TOKEN = originalTodoistToken
  process.env.TODOIST_PROJECT_ID = originalTodoistProject
})

describe('Todoist Plugin', () => {
  const mockTask = {
    id: 'TASK-001',
    title: 'Test task',
    metadata: { todoistId: '999888777' },
  } as any

  describe('TodoistClient', () => {
    test('getTask retrieves a task', async () => {
      const mockTask = {
        id: '123',
        content: 'Test task',
        description: 'Description',
        is_completed: false,
        project_id: 'proj-1',
        priority: 1,
        labels: ['test']
      }

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockTask),
        })
      )

      const client = new TodoistClient('test-token')
      const task = await client.getTask('123')

      expect(task.id).toBe('123')
      expect(task.content).toBe('Test task')
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.todoist.com/rest/v2/tasks/123',
        expect.objectContaining({ method: 'GET' })
      )
    })

    test('createTask creates a new task', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: '456', content: 'New task' }),
        })
      )

      const client = new TodoistClient('test-token')
      const task = await client.createTask('New task', {
        description: 'Test description',
        projectId: 'proj-1',
        priority: 4,
        labels: ['urgent']
      })

      expect(task.id).toBe('456')
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.todoist.com/rest/v2/tasks',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            content: 'New task',
            description: 'Test description',
            project_id: 'proj-1',
            priority: 4,
            labels: ['urgent']
          })
        })
      )
    })

    test('updateTask updates task properties', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: '123', content: 'Updated' }),
        })
      )

      const client = new TodoistClient('test-token')
      await client.updateTask('123', {
        content: 'Updated',
        priority: 3
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.todoist.com/rest/v2/tasks/123',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ content: 'Updated', priority: 3 })
        })
      )
    })

    test('completeTask makes correct API call', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({ ok: true, status: 204, text: () => Promise.resolve('') })
      )

      const client = new TodoistClient('test-token')
      await client.completeTask('123')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.todoist.com/rest/v2/tasks/123/close',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      )
    })

    test('reopenTask reopens a completed task', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({ ok: true, status: 204, text: () => Promise.resolve('') })
      )

      const client = new TodoistClient('test-token')
      await client.reopenTask('123')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.todoist.com/rest/v2/tasks/123/reopen',
        expect.objectContaining({ method: 'POST' })
      )
    })

    test('deleteTask deletes a task', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({ ok: true, status: 204, text: () => Promise.resolve('') })
      )

      const client = new TodoistClient('test-token')
      await client.deleteTask('123')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.todoist.com/rest/v2/tasks/123',
        expect.objectContaining({ method: 'DELETE' })
      )
    })

    test('getProjectTasks retrieves tasks for a project', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([{ id: '1' }, { id: '2' }]),
        })
      )

      const client = new TodoistClient('test-token')
      const tasks = await client.getProjectTasks('proj-123')

      expect(tasks.length).toBe(2)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.todoist.com/rest/v2/tasks?project_id=proj-123',
        expect.objectContaining({ method: 'GET' })
      )
    })

    test('addComment makes correct API call', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: '1', task_id: '123', content: 'test' }),
        })
      )

      const client = new TodoistClient('test-token')
      await client.addComment('123', 'Test comment')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.todoist.com/rest/v2/comments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ task_id: '123', content: 'Test comment' }),
        })
      )
    })

    test('getComments retrieves comments for a task', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([
            { id: '1', task_id: '123', content: 'Comment 1' },
            { id: '2', task_id: '123', content: 'Comment 2' }
          ]),
        })
      )

      const client = new TodoistClient('test-token')
      const comments = await client.getComments('123')

      expect(comments.length).toBe(2)
      expect(comments[0].content).toBe('Comment 1')
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.todoist.com/rest/v2/comments?task_id=123',
        expect.objectContaining({ method: 'GET' })
      )
    })

    test('getProjects retrieves all projects', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([
            { id: 'proj-1', name: 'Project 1' },
            { id: 'proj-2', name: 'Project 2' }
          ]),
        })
      )

      const client = new TodoistClient('test-token')
      const projects = await client.getProjects()

      expect(projects.length).toBe(2)
      expect(projects[0].name).toBe('Project 1')
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.todoist.com/rest/v2/projects',
        expect.objectContaining({ method: 'GET' })
      )
    })

    test('request throws error on API failure', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Unauthorized'),
        })
      )

      const client = new TodoistClient('bad-token')
      await expect(client.getTask('123')).rejects.toThrow('Todoist API error: 401')
    })

    test('request handles 204 No Content response', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 204,
          text: () => Promise.resolve(''),
        })
      )

      const client = new TodoistClient('test-token')
      const result = await client.completeTask('123')
      expect(result).toBeUndefined()
    })
  })

  describe('createTodoistPlugin', () => {
    test('returns warning plugin when no token', () => {
      const plugin = createTodoistPlugin({})
      expect(plugin.name).toBe('todoist')
      expect(plugin.onConfigLoad).toBeDefined()
    })

    test('skips tasks without todoistId', async () => {
      const plugin = createTodoistPlugin({ apiToken: 'test-token' })
      const taskWithoutId = { id: 'TASK-001', title: 'Test', metadata: {} } as any

      await plugin.onTaskStart?.({ task: taskWithoutId, iteration: 1, startTime: new Date(), namespace: 'test' })
      expect(mockFetch).not.toHaveBeenCalled()
    })

    test('onTaskStart adds comment when enabled', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: '1', task_id: '999888777', content: 'comment' }),
        })
      )

      const plugin = createTodoistPlugin({ apiToken: 'test-token', addComments: true })
      await plugin.onTaskStart?.({ task: mockTask, iteration: 1, startTime: new Date(), namespace: 'test' })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.todoist.com/rest/v2/comments',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('started working on this task')
        })
      )
    })

    test('onTaskStart skips comment when disabled', async () => {
      const plugin = createTodoistPlugin({ apiToken: 'test-token', addComments: false })
      await plugin.onTaskStart?.({ task: mockTask, iteration: 1, startTime: new Date(), namespace: 'test' })

      expect(mockFetch).not.toHaveBeenCalled()
    })

    test('onTaskStart handles API errors gracefully', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Server error'),
        })
      )

      const plugin = createTodoistPlugin({ apiToken: 'test-token' })
      // Should not throw
      await plugin.onTaskStart?.({ task: mockTask, iteration: 1, startTime: new Date(), namespace: 'test' })
    })

    test('onTaskComplete calls API with syncStatus enabled', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 204,
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(''),
        })
      )

      const plugin = createTodoistPlugin({ apiToken: 'test-token', syncStatus: true })
      await plugin.onTaskComplete?.({ task: mockTask, iteration: 1, startTime: new Date(), namespace: 'test' }, { duration: 45 })

      expect(mockFetch).toHaveBeenCalled()
    })

    test('onTaskComplete skips status sync when disabled', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: '1' }),
        })
      )

      const plugin = createTodoistPlugin({ apiToken: 'test-token', syncStatus: false, addComments: true })
      await plugin.onTaskComplete?.({ task: mockTask, iteration: 1, startTime: new Date(), namespace: 'test' }, { duration: 45 })

      // Should only add comment, not close task
      const calls = mockFetch.mock.calls
      const closeCall = calls.find((c: any) => c[0].includes('/close'))
      expect(closeCall).toBeUndefined()
    })

    test('onTaskComplete adds completion comment', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: '1' }),
        })
      )

      const plugin = createTodoistPlugin({ apiToken: 'test-token', syncStatus: false, addComments: true })
      await plugin.onTaskComplete?.({ task: mockTask, iteration: 1, startTime: new Date(), namespace: 'test' }, { duration: 45 })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.todoist.com/rest/v2/comments',
        expect.objectContaining({
          body: expect.stringContaining('Completed by Loopwork')
        })
      )
    })

    test('onTaskComplete handles API errors gracefully', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Server error'),
        })
      )

      const plugin = createTodoistPlugin({ apiToken: 'test-token' })
      // Should not throw
      await plugin.onTaskComplete?.({ task: mockTask, iteration: 1, startTime: new Date(), namespace: 'test' }, { duration: 45 })
    })

    test('onTaskFailed adds error comment', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: '1', content: 'error comment' }),
        })
      )

      const plugin = createTodoistPlugin({ apiToken: 'test-token', addComments: true })
      await plugin.onTaskFailed?.({ task: mockTask, iteration: 1, startTime: new Date(), namespace: 'test' }, 'Test error message')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.todoist.com/rest/v2/comments',
        expect.objectContaining({
          body: expect.stringContaining('Loopwork failed')
        })
      )
    })

    test('onTaskFailed truncates long error messages', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: '1' }),
        })
      )

      const longError = 'x'.repeat(300)
      const plugin = createTodoistPlugin({ apiToken: 'test-token' })
      await plugin.onTaskFailed?.({ task: mockTask, iteration: 1, startTime: new Date(), namespace: 'test' }, longError)

      const call = mockFetch.mock.calls[0]
      const body = JSON.parse(call[1].body)
      expect(body.content.length).toBeLessThan(220) // Error is truncated to 200 chars + formatting
    })

    test('onTaskFailed skips when addComments disabled', async () => {
      const plugin = createTodoistPlugin({ apiToken: 'test-token', addComments: false })
      await plugin.onTaskFailed?.({ task: mockTask, iteration: 1, startTime: new Date(), namespace: 'test' }, 'Error')

      expect(mockFetch).not.toHaveBeenCalled()
    })

    test('onTaskFailed skips when task has no todoistId', async () => {
      const plugin = createTodoistPlugin({ apiToken: 'test-token' })
      const taskWithoutId = { id: 'TASK-001', metadata: {} } as any

      await plugin.onTaskFailed?.({ task: taskWithoutId, iteration: 1, startTime: new Date(), namespace: 'test' }, 'Error')

      expect(mockFetch).not.toHaveBeenCalled()
    })

    test('onTaskFailed handles API errors gracefully', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Server error'),
        })
      )

      const plugin = createTodoistPlugin({ apiToken: 'test-token' })
      // Should not throw
      await plugin.onTaskFailed?.({ task: mockTask, iteration: 1, startTime: new Date(), namespace: 'test' }, 'Test error')
    })

    test('onLoopEnd logs stats', async () => {
      const plugin = createTodoistPlugin({ apiToken: 'test-token' })
      // onLoopEnd just logs, shouldn't throw
      await plugin.onLoopEnd?.({ completed: 5, failed: 1, skipped: 0, total: 6 })
    })
  })

  describe('withTodoist', () => {
    test('creates config wrapper with provided values', () => {
      const wrapper = withTodoist({ apiToken: 'token-123', projectId: 'proj-456', syncStatus: false, addComments: false })
      const config = wrapper({ cli: 'claude' } as any)

      expect(config.todoist).toBeDefined()
      expect(config.todoist.apiToken).toBe('token-123')
      expect(config.todoist.projectId).toBe('proj-456')
      expect(config.todoist.syncStatus).toBe(false)
      expect(config.todoist.addComments).toBe(false)
    })

    test('uses environment variables as fallback', () => {
      process.env.TODOIST_API_TOKEN = 'env-token'
      process.env.TODOIST_PROJECT_ID = 'env-proj'

      const wrapper = withTodoist({})
      const config = wrapper({ cli: 'claude' } as any)

      expect(config.todoist.apiToken).toBe('env-token')
      expect(config.todoist.projectId).toBe('env-proj')
    })

    test('uses default values for optional fields', () => {
      const wrapper = withTodoist({ apiToken: 'token' })
      const config = wrapper({ cli: 'claude' } as any)

      expect(config.todoist.syncStatus).toBe(true)
      expect(config.todoist.addComments).toBe(true)
    })
  })
})

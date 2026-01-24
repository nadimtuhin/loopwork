import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test'
import { createTodoistPlugin, TodoistClient } from '../src'

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
  })

  describe('createTodoistPlugin', () => {
    test('returns warning plugin when no token', () => {
      const plugin = createTodoistPlugin({})
      expect(plugin.name).toBe('todoist')
      expect(plugin.onConfigLoad).toBeDefined()
    })

    test('skips tasks without todoistId', async () => {
      const plugin = createTodoistPlugin({ apiToken: 'test-token' })
      const taskWithoutId = { id: 'TASK-001', title: 'Test' } as any

      await plugin.onTaskStart?.(taskWithoutId)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    test('onTaskComplete calls API', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 204,
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(''),
        })
      )

      const plugin = createTodoistPlugin({ apiToken: 'test-token' })
      await plugin.onTaskComplete?.(mockTask, { duration: 45 })

      expect(mockFetch).toHaveBeenCalled()
    })
  })
})

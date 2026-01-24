import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test'
import { createAsanaPlugin, AsanaClient } from '../src'
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

      const taskWithoutGid = { id: 'TASK-001', title: 'Test' } as any
      await plugin.onTaskStart?.(taskWithoutGid)

      // Should not have called fetch
      expect(mockFetch).not.toHaveBeenCalled()
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

      await plugin.onTaskComplete?.(mockTask, { duration: 60 })

      // Should have called API twice (complete + comment)
      expect(mockFetch).toHaveBeenCalled()
    })
  })
})

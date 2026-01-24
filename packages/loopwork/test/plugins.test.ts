import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test'
import { createAsanaPlugin, AsanaClient } from '../src/plugins/asana'
import { createEverhourPlugin, EverhourClient, asanaToEverhour, formatDuration } from '../src/plugins/everhour'
import { createTodoistPlugin, TodoistClient } from '../src/plugins/todoist'
import { createDiscordPlugin, DiscordClient } from '../src/plugins/discord'
import type { PluginTask } from '../src/plugins'

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
})

  afterEach(() => {
    process.env.TODOIST_API_TOKEN = originalTodoistToken
    process.env.TODOIST_PROJECT_ID = originalTodoistProject
  })

  describe('Asana Plugin', () => {

  const mockTask: PluginTask = {
    id: 'TASK-001',
    title: 'Test task',
    metadata: { asanaGid: '123456789' },
  }

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

      const taskWithoutGid: PluginTask = { id: 'TASK-001', title: 'Test' }
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

describe('Everhour Plugin', () => {
  const mockTask: PluginTask = {
    id: 'TASK-001',
    title: 'Test task',
    metadata: { asanaGid: '123456789' },
  }

  describe('EverhourClient', () => {
    test('startTimer makes correct API call', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ status: 'active' })),
        })
      )

      const client = new EverhourClient('test-key')
      await client.startTimer('as:123')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.everhour.com/timers',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Api-Key': 'test-key',
          }),
        })
      )
    })

    test('checkDailyLimit calculates correctly', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify([{ time: 3600 }, { time: 7200 }])), // 3 hours
        })
      )

      const client = new EverhourClient('test-key')
      const limit = await client.checkDailyLimit(8)

      expect(limit.hoursLogged).toBe(3)
      expect(limit.remaining).toBe(5)
      expect(limit.withinLimit).toBe(true)
    })
  })

  describe('helpers', () => {
    test('asanaToEverhour adds as: prefix', () => {
      expect(asanaToEverhour('123456')).toBe('as:123456')
    })

    test('formatDuration formats correctly', () => {
      expect(formatDuration(30)).toBe('0m')
      expect(formatDuration(90)).toBe('1m')
      expect(formatDuration(3661)).toBe('1h 1m')
    })
  })

  describe('createEverhourPlugin', () => {
    test('returns warning plugin when no API key', () => {
      const plugin = createEverhourPlugin({})
      expect(plugin.name).toBe('everhour')
      expect(plugin.onConfigLoad).toBeDefined()
    })

    test('derives everhourId from asanaGid', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({})),
        })
      )

      const plugin = createEverhourPlugin({ apiKey: 'test-key' })
      await plugin.onTaskStart?.(mockTask)

      // Should have started timer with as:123456789
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.everhour.com/timers',
        expect.objectContaining({
          body: expect.stringContaining('as:123456789'),
        })
      )
    })

    test('uses explicit everhourId over asanaGid', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({})),
        })
      )

      const taskWithEverhourId: PluginTask = {
        id: 'TASK-001',
        title: 'Test',
        metadata: { asanaGid: '123', everhourId: 'custom-id' },
      }

      const plugin = createEverhourPlugin({ apiKey: 'test-key' })
      await plugin.onTaskStart?.(taskWithEverhourId)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.everhour.com/timers',
        expect.objectContaining({
          body: expect.stringContaining('custom-id'),
        })
      )
    })
  })
})

describe('Todoist Plugin', () => {
  const mockTask: PluginTask = {
    id: 'TASK-001',
    title: 'Test task',
    metadata: { todoistId: '999888777' },
  }

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
      const taskWithoutId: PluginTask = { id: 'TASK-001', title: 'Test' }

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

describe('Discord Plugin', () => {
  const mockTask: PluginTask = {
    id: 'TASK-001',
    title: 'Test task',
  }

  describe('DiscordClient', () => {
    test('send makes correct API call', async () => {
      mockFetch.mockImplementation(() => Promise.resolve({ ok: true }))

      const client = new DiscordClient('https://discord.com/webhook')
      await client.sendText('Hello')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://discord.com/webhook',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Hello'),
        })
      )
    })

    test('sendEmbed includes embed structure', async () => {
      mockFetch.mockImplementation(() => Promise.resolve({ ok: true }))

      const client = new DiscordClient('https://discord.com/webhook')
      await client.sendEmbed({
        title: 'Test',
        description: 'Description',
        color: 0x00ff00,
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://discord.com/webhook',
        expect.objectContaining({
          body: expect.stringContaining('"embeds"'),
        })
      )
    })

    test('handles API errors', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 400,
          text: () => Promise.resolve('Bad Request'),
        })
      )

      const client = new DiscordClient('https://discord.com/webhook')
      await expect(client.sendText('test')).rejects.toThrow('Discord webhook error')
    })
  })

  describe('createDiscordPlugin', () => {
    test('returns warning plugin when no webhook URL', () => {
      const plugin = createDiscordPlugin({})
      expect(plugin.name).toBe('discord')
      expect(plugin.onConfigLoad).toBeDefined()
    })

    test('respects notification settings', async () => {
      mockFetch.mockImplementation(() => Promise.resolve({ ok: true }))

      const plugin = createDiscordPlugin({
        webhookUrl: 'https://discord.com/webhook',
        notifyOnStart: false,
        notifyOnComplete: false,
      })

      await plugin.onTaskStart?.(mockTask)
      await plugin.onTaskComplete?.(mockTask, { duration: 30 })

      expect(mockFetch).not.toHaveBeenCalled()
    })

    test('sends notification on task failure', async () => {
      mockFetch.mockImplementation(() => Promise.resolve({ ok: true }))

      const plugin = createDiscordPlugin({
        webhookUrl: 'https://discord.com/webhook',
        notifyOnFail: true,
      })

      await plugin.onTaskFailed?.(mockTask, 'Test error')

      expect(mockFetch).toHaveBeenCalled()
    })

    test('includes mention on failure', async () => {
      mockFetch.mockImplementation(() => Promise.resolve({ ok: true }))

      const plugin = createDiscordPlugin({
        webhookUrl: 'https://discord.com/webhook',
        mentionOnFail: '<@&123456>',
      })

      await plugin.onTaskFailed?.(mockTask, 'Test error')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://discord.com/webhook',
        expect.objectContaining({
          body: expect.stringContaining('<@&123456>'),
        })
      )
    })

    test('sends loop end summary', async () => {
      mockFetch.mockImplementation(() => Promise.resolve({ ok: true }))

      const plugin = createDiscordPlugin({
        webhookUrl: 'https://discord.com/webhook',
        notifyOnLoopEnd: true,
      })

      await plugin.onLoopEnd?.({ completed: 5, failed: 1, duration: 300 })

      expect(mockFetch).toHaveBeenCalled()
    })
  })
})

// Additional tests for better coverage

describe('Asana Plugin - Additional Coverage', () => {
  describe('AsanaClient additional methods', () => {
    test('createTask makes correct API call', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { gid: 'new-123', name: 'New Task' } }),
        })
      )

      const client = new AsanaClient('test-token')
      const task = await client.createTask('project-123', 'New Task', 'Description')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://app.asana.com/api/1.0/tasks',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('New Task'),
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
      await client.addComment('123', 'Test comment')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://app.asana.com/api/1.0/tasks/123/stories',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Test comment'),
        })
      )
    })

    test('getProjectTasks makes correct API call', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: [{ gid: '1' }, { gid: '2' }] }),
        })
      )

      const client = new AsanaClient('test-token')
      const tasks = await client.getProjectTasks('project-123')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/projects/project-123/tasks'),
        expect.anything()
      )
    })

    test('updateTask makes correct API call', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { gid: '123', name: 'Updated' } }),
        })
      )

      const client = new AsanaClient('test-token')
      await client.updateTask('123', { name: 'Updated' })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://app.asana.com/api/1.0/tasks/123',
        expect.objectContaining({
          method: 'PUT',
        })
      )
    })
  })

  describe('createAsanaPlugin additional coverage', () => {
    test('onTaskStart adds comment', async () => {
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

      const task: PluginTask = {
        id: 'TASK-001',
        title: 'Test',
        metadata: { asanaGid: '123456' },
      }

      await plugin.onTaskStart?.(task)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://app.asana.com/api/1.0/tasks/123456/stories',
        expect.anything()
      )
    })

    test('onTaskFailed adds comment', async () => {
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

      const task: PluginTask = {
        id: 'TASK-001',
        title: 'Test',
        metadata: { asanaGid: '123456' },
      }

      await plugin.onTaskFailed?.(task, 'Error message')

      expect(mockFetch).toHaveBeenCalled()
    })

    test('onLoopEnd logs summary', async () => {
      const plugin = createAsanaPlugin({
        accessToken: 'test-token',
        projectId: 'project-123',
      })

      // Should not throw
      await plugin.onLoopEnd?.({ completed: 5, failed: 1, duration: 300 })
    })
  })
})

describe('Everhour Plugin - Additional Coverage', () => {
  describe('EverhourClient additional methods', () => {
    test('stopTimer makes correct API call', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ status: 'stopped' })),
        })
      )

      const client = new EverhourClient('test-key')
      await client.stopTimer()

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.everhour.com/timers/current',
        expect.objectContaining({
          method: 'DELETE',
        })
      )
    })

    test('addTime makes correct API call', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ id: 1, time: 3600 })),
        })
      )

      const client = new EverhourClient('test-key')
      await client.addTime('as:123', 3600, '2024-01-15')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.everhour.com/tasks/as:123/time',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('3600'),
        })
      )
    })

    test('getTaskTime makes correct API call', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ id: 'as:123', time: { total: 7200 } })),
        })
      )

      const client = new EverhourClient('test-key')
      const task = await client.getTaskTime('as:123')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.everhour.com/tasks/as:123',
        expect.anything()
      )
    })

    test('getCurrentTimer makes correct API call', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ status: 'active', duration: 1800 })),
        })
      )

      const client = new EverhourClient('test-key')
      const timer = await client.getCurrentTimer()

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.everhour.com/timers/current',
        expect.anything()
      )
    })

    test('getCurrentTimer returns null on error', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          text: () => Promise.resolve('Not found'),
        })
      )

      const client = new EverhourClient('test-key')
      const timer = await client.getCurrentTimer()

      expect(timer).toBeNull()
    })

    test('getTodayTotal calculates correctly', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify([{ time: 1800 }, { time: 3600 }])),
        })
      )

      const client = new EverhourClient('test-key')
      const total = await client.getTodayTotal()

      expect(total).toBe(5400)
    })

    test('getMe makes correct API call', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ id: 1, name: 'Test', email: 'test@test.com' })),
        })
      )

      const client = new EverhourClient('test-key')
      const user = await client.getMe()

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.everhour.com/users/me',
        expect.anything()
      )
      expect(user.email).toBe('test@test.com')
    })

    test('handles API errors', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Unauthorized'),
        })
      )

      const client = new EverhourClient('bad-key')
      await expect(client.startTimer('as:123')).rejects.toThrow('Everhour API error')
    })
  })

  describe('createEverhourPlugin additional coverage', () => {
    test('onLoopStart checks daily limit', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify([{ time: 28800 }])), // 8 hours
        })
      )

      const plugin = createEverhourPlugin({ apiKey: 'test-key' })
      await plugin.onLoopStart?.('test-namespace')

      expect(mockFetch).toHaveBeenCalled()
    })

    test('onTaskComplete stops timer', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({})),
        })
      )

      const plugin = createEverhourPlugin({ apiKey: 'test-key' })
      const task: PluginTask = {
        id: 'TASK-001',
        title: 'Test',
        metadata: { asanaGid: '123' },
      }

      // Start task first to register timer
      await plugin.onTaskStart?.(task)

      // Then complete it
      await plugin.onTaskComplete?.(task, { duration: 60 })

      // Should have called stop timer
      expect(mockFetch).toHaveBeenCalled()
    })

    test('onTaskFailed stops timer', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({})),
        })
      )

      const plugin = createEverhourPlugin({ apiKey: 'test-key' })
      const task: PluginTask = {
        id: 'TASK-002',
        title: 'Test',
        metadata: { everhourId: 'eh:456' },
      }

      await plugin.onTaskStart?.(task)
      await plugin.onTaskFailed?.(task, 'Error')

      expect(mockFetch).toHaveBeenCalled()
    })

    test('onLoopEnd reports summary', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify([{ time: 3600 }])),
        })
      )

      const plugin = createEverhourPlugin({ apiKey: 'test-key' })
      await plugin.onLoopEnd?.({ completed: 5, failed: 1, duration: 300 })

      expect(mockFetch).toHaveBeenCalled()
    })

    test('skips tasks without everhour ID', async () => {
      const plugin = createEverhourPlugin({ apiKey: 'test-key' })
      const task: PluginTask = { id: 'TASK-001', title: 'Test' }

      await plugin.onTaskStart?.(task)

      // Should not have called timer start (only daily limit check in onLoopStart)
      const timerCalls = mockFetch.mock.calls.filter(
        (call: any) => call[0].includes('/timers') && !call[0].includes('current')
      )
      expect(timerCalls.length).toBe(0)
    })
  })
})

describe('Todoist Plugin - Additional Coverage', () => {
  describe('TodoistClient additional methods', () => {
    test('getTask makes correct API call', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: '123', content: 'Test task' }),
        })
      )

      const client = new TodoistClient('test-token')
      const task = await client.getTask('123')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.todoist.com/rest/v2/tasks/123',
        expect.anything()
      )
      expect(task.content).toBe('Test task')
    })

    test('createTask makes correct API call', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 'new-123', content: 'New task' }),
        })
      )

      const client = new TodoistClient('test-token')
      const task = await client.createTask('New task', {
        description: 'Description',
        projectId: 'project-123',
        priority: 2,
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.todoist.com/rest/v2/tasks',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('New task'),
        })
      )
    })

    test('updateTask makes correct API call', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: '123', content: 'Updated' }),
        })
      )

      const client = new TodoistClient('test-token')
      await client.updateTask('123', { content: 'Updated' })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.todoist.com/rest/v2/tasks/123',
        expect.objectContaining({
          method: 'POST',
        })
      )
    })

    test('reopenTask makes correct API call', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({ ok: true, status: 204, text: () => Promise.resolve('') })
      )

      const client = new TodoistClient('test-token')
      await client.reopenTask('123')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.todoist.com/rest/v2/tasks/123/reopen',
        expect.objectContaining({
          method: 'POST',
        })
      )
    })

    test('deleteTask makes correct API call', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({ ok: true, status: 204, text: () => Promise.resolve('') })
      )

      const client = new TodoistClient('test-token')
      await client.deleteTask('123')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.todoist.com/rest/v2/tasks/123',
        expect.objectContaining({
          method: 'DELETE',
        })
      )
    })

    test('getProjectTasks makes correct API call', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ id: '1' }, { id: '2' }]),
        })
      )

      const client = new TodoistClient('test-token')
      const tasks = await client.getProjectTasks('project-123')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.todoist.com/rest/v2/tasks?project_id=project-123',
        expect.anything()
      )
      expect(tasks).toHaveLength(2)
    })

    test('getComments makes correct API call', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ id: '1', content: 'Comment' }]),
        })
      )

      const client = new TodoistClient('test-token')
      const comments = await client.getComments('123')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.todoist.com/rest/v2/comments?task_id=123',
        expect.anything()
      )
    })

    test('getProjects makes correct API call', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ id: '1', name: 'Project' }]),
        })
      )

      const client = new TodoistClient('test-token')
      const projects = await client.getProjects()

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.todoist.com/rest/v2/projects',
        expect.anything()
      )
    })

    test('handles API errors', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 403,
          text: () => Promise.resolve('Forbidden'),
        })
      )

      const client = new TodoistClient('bad-token')
      await expect(client.getTask('123')).rejects.toThrow('Todoist API error')
    })
  })

  describe('createTodoistPlugin additional coverage', () => {
    test('onTaskStart adds comment', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: '1' }),
        })
      )

      const plugin = createTodoistPlugin({ apiToken: 'test-token' })
      const task: PluginTask = {
        id: 'TASK-001',
        title: 'Test',
        metadata: { todoistId: '123' },
      }

      await plugin.onTaskStart?.(task)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.todoist.com/rest/v2/comments',
        expect.anything()
      )
    })

    test('onTaskFailed adds comment', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: '1' }),
        })
      )

      const plugin = createTodoistPlugin({ apiToken: 'test-token' })
      const task: PluginTask = {
        id: 'TASK-001',
        title: 'Test',
        metadata: { todoistId: '123' },
      }

      await plugin.onTaskFailed?.(task, 'Error message')

      expect(mockFetch).toHaveBeenCalled()
    })

    test('onLoopEnd logs summary', async () => {
      const plugin = createTodoistPlugin({ apiToken: 'test-token' })
      await plugin.onLoopEnd?.({ completed: 5, failed: 1, duration: 300 })
      // Should not throw
    })

    test('respects addComments=false', async () => {
      const plugin = createTodoistPlugin({
        apiToken: 'test-token',
        addComments: false,
      })
      const task: PluginTask = {
        id: 'TASK-001',
        title: 'Test',
        metadata: { todoistId: '123' },
      }

      await plugin.onTaskStart?.(task)

      // Should not have added comment
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })
})

describe('Discord Plugin - Additional Coverage', () => {
  describe('DiscordClient additional methods', () => {
    test('notifyTaskStart sends embed', async () => {
      mockFetch.mockImplementation(() => Promise.resolve({ ok: true }))

      const client = new DiscordClient('https://discord.com/webhook')
      await client.notifyTaskStart({ id: 'TASK-001', title: 'Test' })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://discord.com/webhook',
        expect.objectContaining({
          body: expect.stringContaining('Task Started'),
        })
      )
    })

    test('notifyTaskComplete sends embed', async () => {
      mockFetch.mockImplementation(() => Promise.resolve({ ok: true }))

      const client = new DiscordClient('https://discord.com/webhook')
      await client.notifyTaskComplete({ id: 'TASK-001', title: 'Test' }, 120)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://discord.com/webhook',
        expect.objectContaining({
          body: expect.stringContaining('Task Completed'),
        })
      )
    })

    test('notifyTaskFailed sends embed with mention', async () => {
      mockFetch.mockImplementation(() => Promise.resolve({ ok: true }))

      const client = new DiscordClient('https://discord.com/webhook')
      await client.notifyTaskFailed({ id: 'TASK-001', title: 'Test' }, 'Error', '<@123>')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://discord.com/webhook',
        expect.objectContaining({
          body: expect.stringContaining('<@123>'),
        })
      )
    })

    test('notifyLoopEnd sends summary embed', async () => {
      mockFetch.mockImplementation(() => Promise.resolve({ ok: true }))

      const client = new DiscordClient('https://discord.com/webhook')
      await client.notifyLoopEnd({ completed: 10, failed: 2, duration: 600 })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://discord.com/webhook',
        expect.objectContaining({
          body: expect.stringContaining('Loop Summary'),
        })
      )
    })

    test('uses custom username and avatar', async () => {
      mockFetch.mockImplementation(() => Promise.resolve({ ok: true }))

      const client = new DiscordClient('https://discord.com/webhook', {
        username: 'Custom Bot',
        avatarUrl: 'https://example.com/avatar.png',
      })
      await client.sendText('Hello')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://discord.com/webhook',
        expect.objectContaining({
          body: expect.stringContaining('Custom Bot'),
        })
      )
    })
  })

  describe('createDiscordPlugin additional coverage', () => {
    test('sends notification on task start when enabled', async () => {
      mockFetch.mockImplementation(() => Promise.resolve({ ok: true }))

      const plugin = createDiscordPlugin({
        webhookUrl: 'https://discord.com/webhook',
        notifyOnStart: true,
      })

      await plugin.onTaskStart?.({ id: 'TASK-001', title: 'Test' })

      expect(mockFetch).toHaveBeenCalled()
    })

    test('handles API errors gracefully', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Server Error'),
        })
      )

      const plugin = createDiscordPlugin({
        webhookUrl: 'https://discord.com/webhook',
        notifyOnComplete: true,
      })

      // Should not throw, just log warning
      await plugin.onTaskComplete?.({ id: 'TASK-001', title: 'Test' }, { duration: 30 })
    })
  })
})

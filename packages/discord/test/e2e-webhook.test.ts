import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test'
import { createDiscordPlugin, DiscordClient } from '../src'
import type { TaskContext, PluginTaskResult } from '../../loopwork/src/contracts'

/**
 * E2E Test Suite for Discord Webhook Plugin
 *
 * Tests full lifecycle integration of Discord notifications:
 * - Task lifecycle hooks (start, complete, failed)
 * - Loop lifecycle hooks (start, end)
 * - Notification configuration (notifyOnStart, notifyOnComplete, etc.)
 * - Discord embed formatting
 * - Mention functionality on failures
 * - API error handling
 */

// Mock fetch globally
const originalFetch = global.fetch
let mockFetch: ReturnType<typeof mock>

beforeEach(() => {
  mockFetch = mock(() => Promise.resolve({
    ok: true,
    text: () => Promise.resolve(''),
  }))
  global.fetch = mockFetch as any
})

afterEach(() => {
  global.fetch = originalFetch
})

describe('Discord E2E - Webhook Integration', () => {
  const WEBHOOK_URL = 'https://discord.com/api/webhooks/123456789/test-webhook'

  const createMockTask = (id = 'TASK-001', title = 'Test task'): any => ({
    id,
    title,
    status: 'pending',
    metadata: {},
  })

  const createMockContext = (taskId = 'TASK-001'): TaskContext => ({
    task: createMockTask(taskId),
    iteration: 1,
    startTime: new Date(),
    namespace: 'test',
  })

  const createMockResult = (duration = 30): PluginTaskResult => ({
    duration,
    output: 'Task completed successfully',
  })

  describe('Plugin Lifecycle - Full Flow', () => {
    test('E2E: Complete task workflow with all notifications enabled', async () => {
      mockFetch.mockImplementation(() => Promise.resolve({
        ok: true,
        text: () => Promise.resolve(''),
      }))

      const plugin = createDiscordPlugin({
        webhookUrl: WEBHOOK_URL,
        notifyOnStart: true,
        notifyOnComplete: true,
        notifyOnFail: true,
        notifyOnLoopEnd: true,
        username: 'TestBot',
      })

      const context = createMockContext('TASK-001')

      // Task starts
      await plugin.onTaskStart?.(context)
      expect(mockFetch).toHaveBeenCalledWith(
        WEBHOOK_URL,
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Task Started'),
        })
      )

      mockFetch.mockClear()

      // Task completes
      const result = createMockResult(45)
      await plugin.onTaskComplete?.(context, result)
      expect(mockFetch).toHaveBeenCalledWith(
        WEBHOOK_URL,
        expect.objectContaining({
          body: expect.stringContaining('Task Completed'),
        })
      )

      mockFetch.mockClear()

      // Loop ends
      await plugin.onLoopEnd?.({ completed: 3, failed: 0, duration: 150 })
      expect(mockFetch).toHaveBeenCalledWith(
        WEBHOOK_URL,
        expect.objectContaining({
          body: expect.stringContaining('Loop Summary'),
        })
      )
    })

    test('E2E: Task failure workflow with mention', async () => {
      mockFetch.mockImplementation(() => Promise.resolve({
        ok: true,
        text: () => Promise.resolve(''),
      }))

      const plugin = createDiscordPlugin({
        webhookUrl: WEBHOOK_URL,
        notifyOnStart: true,
        notifyOnFail: true,
        mentionOnFail: '<@&987654321>',
      })

      const context = createMockContext('TASK-FAIL')

      // Task starts
      await plugin.onTaskStart?.(context)
      expect(mockFetch).toHaveBeenCalled()

      mockFetch.mockClear()

      // Task fails
      await plugin.onTaskFailed?.(context, 'Test error: API timeout')

      const lastCall = mockFetch.mock.calls[0]
      const body = JSON.parse(lastCall![1].body)

      expect(body.content).toContain('<@&987654321>')
      expect(body.embeds[0].title).toContain('Task Failed')
      expect(body.embeds[0].fields[0].value).toContain('Test error')
    })
  })

  describe('Notification Configuration', () => {
    test('notifyOnStart: false prevents start notifications', async () => {
      const plugin = createDiscordPlugin({
        webhookUrl: WEBHOOK_URL,
        notifyOnStart: false,
      })

      await plugin.onTaskStart?.(createMockContext())
      expect(mockFetch).not.toHaveBeenCalled()
    })

    test('notifyOnComplete: false prevents completion notifications', async () => {
      const plugin = createDiscordPlugin({
        webhookUrl: WEBHOOK_URL,
        notifyOnComplete: false,
      })

      await plugin.onTaskComplete?.(createMockContext(), createMockResult())
      expect(mockFetch).not.toHaveBeenCalled()
    })

    test('notifyOnFail: false prevents failure notifications', async () => {
      const plugin = createDiscordPlugin({
        webhookUrl: WEBHOOK_URL,
        notifyOnFail: false,
      })

      await plugin.onTaskFailed?.(createMockContext(), 'Error')
      expect(mockFetch).not.toHaveBeenCalled()
    })

    test('notifyOnLoopEnd: false prevents loop end notifications', async () => {
      const plugin = createDiscordPlugin({
        webhookUrl: WEBHOOK_URL,
        notifyOnLoopEnd: false,
      })

      await plugin.onLoopEnd?.({ completed: 5, failed: 1, duration: 300 })
      expect(mockFetch).not.toHaveBeenCalled()
    })

    test('default configuration enables completion, failure, and loop end', async () => {
      mockFetch.mockImplementation(() => Promise.resolve({
        ok: true,
        text: () => Promise.resolve(''),
      }))

      const plugin = createDiscordPlugin({ webhookUrl: WEBHOOK_URL })

      // Start should be disabled by default
      await plugin.onTaskStart?.(createMockContext())
      expect(mockFetch).not.toHaveBeenCalled()

      mockFetch.mockClear()

      // Complete should be enabled
      await plugin.onTaskComplete?.(createMockContext(), createMockResult())
      expect(mockFetch).toHaveBeenCalled()

      mockFetch.mockClear()

      // Fail should be enabled
      await plugin.onTaskFailed?.(createMockContext(), 'Error')
      expect(mockFetch).toHaveBeenCalled()

      mockFetch.mockClear()

      // Loop end should be enabled
      await plugin.onLoopEnd?.({ completed: 1, failed: 0, duration: 30 })
      expect(mockFetch).toHaveBeenCalled()
    })
  })

  describe('Discord Embed Formatting', () => {
    test('task start embed has correct structure', async () => {
      mockFetch.mockImplementation(() => Promise.resolve({
        ok: true,
        text: () => Promise.resolve(''),
      }))

      const client = new DiscordClient(WEBHOOK_URL)
      await client.notifyTaskStart(createMockTask('TASK-123', 'Build feature'))

      const lastCall = mockFetch.mock.calls[0]
      const body = JSON.parse(lastCall![1].body)

      expect(body.embeds).toHaveLength(1)
      expect(body.embeds[0]).toMatchObject({
        title: expect.stringContaining('Task Started'),
        description: expect.stringContaining('TASK-123'),
        color: 0x3498db, // Blue
        timestamp: expect.any(String),
      })
    })

    test('task complete embed includes duration', async () => {
      mockFetch.mockImplementation(() => Promise.resolve({
        ok: true,
        text: () => Promise.resolve(''),
      }))

      const client = new DiscordClient(WEBHOOK_URL)
      await client.notifyTaskComplete(createMockTask('TASK-123'), 125)

      const lastCall = mockFetch.mock.calls[0]
      const body = JSON.parse(lastCall![1].body)

      expect(body.embeds[0]).toMatchObject({
        title: expect.stringContaining('Task Completed'),
        color: 0x2ecc71, // Green
        fields: expect.arrayContaining([
          expect.objectContaining({
            name: 'Duration',
            value: expect.stringContaining('m'), // Should format as minutes
          }),
        ]),
      })
    })

    test('task failed embed includes error message', async () => {
      mockFetch.mockImplementation(() => Promise.resolve({
        ok: true,
        text: () => Promise.resolve(''),
      }))

      const client = new DiscordClient(WEBHOOK_URL)
      await client.notifyTaskFailed(
        createMockTask('TASK-ERR'),
        'Network timeout after 30s',
      )

      const lastCall = mockFetch.mock.calls[0]
      const body = JSON.parse(lastCall![1].body)

      expect(body.embeds[0]).toMatchObject({
        title: expect.stringContaining('Task Failed'),
        color: 0xe74c3c, // Red
        fields: expect.arrayContaining([
          expect.objectContaining({
            name: 'Error',
            value: expect.stringContaining('Network timeout'),
          }),
        ]),
      })
    })

    test('loop end summary shows stats correctly', async () => {
      mockFetch.mockImplementation(() => Promise.resolve({
        ok: true,
        text: () => Promise.resolve(''),
      }))

      const client = new DiscordClient(WEBHOOK_URL)
      await client.notifyLoopEnd({ completed: 8, failed: 2, duration: 450 })

      const lastCall = mockFetch.mock.calls[0]
      const body = JSON.parse(lastCall![1].body)

      expect(body.embeds[0]).toMatchObject({
        title: expect.stringContaining('Loop Summary'),
        color: 0xf1c40f, // Yellow (has failures)
        fields: expect.arrayContaining([
          expect.objectContaining({ name: 'Completed', value: '8' }),
          expect.objectContaining({ name: 'Failed', value: '2' }),
          expect.objectContaining({ name: 'Duration' }),
        ]),
      })
    })

    test('loop end with no failures shows green color', async () => {
      mockFetch.mockImplementation(() => Promise.resolve({
        ok: true,
        text: () => Promise.resolve(''),
      }))

      const client = new DiscordClient(WEBHOOK_URL)
      await client.notifyLoopEnd({ completed: 5, failed: 0, duration: 200 })

      const lastCall = mockFetch.mock.calls[0]
      const body = JSON.parse(lastCall![1].body)

      expect(body.embeds[0].color).toBe(0x2ecc71) // Green
    })

    test('error message truncation for long errors', async () => {
      mockFetch.mockImplementation(() => Promise.resolve({
        ok: true,
        text: () => Promise.resolve(''),
      }))

      const longError = 'Error: '.repeat(300) // Very long error
      const client = new DiscordClient(WEBHOOK_URL)
      await client.notifyTaskFailed(createMockTask(), longError)

      const lastCall = mockFetch.mock.calls[0]
      const body = JSON.parse(lastCall![1].body)

      // Error should be truncated to 1000 chars
      expect(body.embeds[0].fields[0].value.length).toBeLessThanOrEqual(1000)
    })
  })

  describe('Mention on Fail Functionality', () => {
    test('mentionOnFail adds content field with role mention', async () => {
      mockFetch.mockImplementation(() => Promise.resolve({
        ok: true,
        text: () => Promise.resolve(''),
      }))

      const client = new DiscordClient(WEBHOOK_URL)
      await client.notifyTaskFailed(
        createMockTask(),
        'Critical error',
        '<@&123456789>',
      )

      const lastCall = mockFetch.mock.calls[0]
      const body = JSON.parse(lastCall![1].body)

      expect(body.content).toBe('<@&123456789> Task failed!')
    })

    test('mentionOnFail supports user mention', async () => {
      mockFetch.mockImplementation(() => Promise.resolve({
        ok: true,
        text: () => Promise.resolve(''),
      }))

      const plugin = createDiscordPlugin({
        webhookUrl: WEBHOOK_URL,
        mentionOnFail: '<@987654321>', // User ID
      })

      await plugin.onTaskFailed?.(createMockContext(), 'Error')

      const lastCall = mockFetch.mock.calls[0]
      const body = JSON.parse(lastCall![1].body)

      expect(body.content).toContain('<@987654321>')
    })

    test('no mention when mentionOnFail not configured', async () => {
      mockFetch.mockImplementation(() => Promise.resolve({
        ok: true,
        text: () => Promise.resolve(''),
      }))

      const client = new DiscordClient(WEBHOOK_URL)
      await client.notifyTaskFailed(createMockTask(), 'Error')

      const lastCall = mockFetch.mock.calls[0]
      const body = JSON.parse(lastCall![1].body)

      expect(body.content).toBeUndefined()
    })
  })

  describe('Custom Bot Configuration', () => {
    test('custom username and avatar are applied', async () => {
      mockFetch.mockImplementation(() => Promise.resolve({
        ok: true,
        text: () => Promise.resolve(''),
      }))

      const client = new DiscordClient(WEBHOOK_URL, {
        username: 'Loopwork Bot',
        avatarUrl: 'https://example.com/avatar.png',
      })

      await client.sendText('Hello')

      const lastCall = mockFetch.mock.calls[0]
      const body = JSON.parse(lastCall![1].body)

      expect(body.username).toBe('Loopwork Bot')
      expect(body.avatar_url).toBe('https://example.com/avatar.png')
    })

    test('plugin default username is Loopwork', async () => {
      mockFetch.mockImplementation(() => Promise.resolve({
        ok: true,
        text: () => Promise.resolve(''),
      }))

      const plugin = createDiscordPlugin({ webhookUrl: WEBHOOK_URL })
      await plugin.onTaskComplete?.(createMockContext(), createMockResult())

      const lastCall = mockFetch.mock.calls[0]
      const body = JSON.parse(lastCall![1].body)

      expect(body.username).toBe('Loopwork')
    })
  })

  describe('API Error Handling', () => {
    test('handles 400 Bad Request gracefully', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 400,
          text: () => Promise.resolve('Invalid payload'),
        })
      )

      const client = new DiscordClient(WEBHOOK_URL)

      // Should throw error
      await expect(client.sendText('test')).rejects.toThrow('Discord webhook error: 400')
    })

    test('handles 404 Not Found gracefully', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          text: () => Promise.resolve('Webhook not found'),
        })
      )

      const client = new DiscordClient(WEBHOOK_URL)
      await expect(client.sendText('test')).rejects.toThrow('404')
    })

    test('plugin catches and logs errors without crashing', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Internal Server Error'),
        })
      )

      const plugin = createDiscordPlugin({ webhookUrl: WEBHOOK_URL })

      // Should not throw, just log warning
      await expect(
        plugin.onTaskComplete?.(createMockContext(), createMockResult())
      ).resolves.toBeUndefined()
    })

    test('network errors are caught and logged', async () => {
      mockFetch.mockImplementation(() =>
        Promise.reject(new Error('Network timeout'))
      )

      const plugin = createDiscordPlugin({ webhookUrl: WEBHOOK_URL })

      // Should not throw
      await expect(
        plugin.onTaskFailed?.(createMockContext(), 'Test error')
      ).resolves.toBeUndefined()
    })
  })

  describe('Missing Configuration Handling', () => {
    test('returns warning plugin when no webhookUrl provided', () => {
      const plugin = createDiscordPlugin({})

      expect(plugin.name).toBe('discord')
      expect(plugin.onConfigLoad).toBeDefined()
      expect(plugin.onTaskStart).toBeUndefined()
      expect(plugin.onTaskComplete).toBeUndefined()
    })

    test('returns warning plugin when DISCORD_WEBHOOK_URL env not set', () => {
      const originalEnv = process.env.DISCORD_WEBHOOK_URL
      delete process.env.DISCORD_WEBHOOK_URL

      const plugin = createDiscordPlugin({})
      expect(plugin.onConfigLoad).toBeDefined()

      if (originalEnv) process.env.DISCORD_WEBHOOK_URL = originalEnv
    })
  })

  describe('Duration Formatting', () => {
    test('formats seconds correctly', async () => {
      mockFetch.mockImplementation(() => Promise.resolve({
        ok: true,
        text: () => Promise.resolve(''),
      }))

      const client = new DiscordClient(WEBHOOK_URL)
      await client.notifyTaskComplete(createMockTask(), 45)

      const lastCall = mockFetch.mock.calls[0]
      const body = JSON.parse(lastCall![1].body)

      expect(body.embeds[0].fields[0].value).toContain('45s')
    })

    test('formats minutes and seconds correctly', async () => {
      mockFetch.mockImplementation(() => Promise.resolve({
        ok: true,
        text: () => Promise.resolve(''),
      }))

      const client = new DiscordClient(WEBHOOK_URL)
      await client.notifyTaskComplete(createMockTask(), 125)

      const lastCall = mockFetch.mock.calls[0]
      const body = JSON.parse(lastCall![1].body)

      expect(body.embeds[0].fields[0].value).toMatch(/2m \d+s/)
    })

    test('formats hours and minutes correctly', async () => {
      mockFetch.mockImplementation(() => Promise.resolve({
        ok: true,
        text: () => Promise.resolve(''),
      }))

      const client = new DiscordClient(WEBHOOK_URL)
      await client.notifyTaskComplete(createMockTask(), 3725) // 1h 2m 5s

      const lastCall = mockFetch.mock.calls[0]
      const body = JSON.parse(lastCall![1].body)

      expect(body.embeds[0].fields[0].value).toMatch(/1h \d+m/)
    })
  })
})

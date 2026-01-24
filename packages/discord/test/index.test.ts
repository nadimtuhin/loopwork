import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test'
import { createDiscordPlugin, DiscordClient } from '../src'

// Mock fetch globally
const originalFetch = global.fetch
let mockFetch: ReturnType<typeof mock>

beforeEach(() => {
  mockFetch = mock(() => Promise.resolve({ ok: true }))
  global.fetch = mockFetch as any
})

afterEach(() => {
  global.fetch = originalFetch
})

describe('Discord Plugin', () => {
  const mockTask = {
    id: 'TASK-001',
    title: 'Test task',
    metadata: {},
  } as any

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

      await plugin.onTaskStart?.({ task: mockTask, iteration: 1, startTime: new Date(), namespace: 'test' })
      await plugin.onTaskComplete?.({ task: mockTask, iteration: 1, startTime: new Date(), namespace: 'test' }, { duration: 30 })

      expect(mockFetch).not.toHaveBeenCalled()
    })

    test('sends notification on task failure', async () => {
      mockFetch.mockImplementation(() => Promise.resolve({ ok: true }))

      const plugin = createDiscordPlugin({
        webhookUrl: 'https://discord.com/webhook',
        notifyOnFail: true,
      })

      await plugin.onTaskFailed?.({ task: mockTask, iteration: 1, startTime: new Date(), namespace: 'test' }, 'Test error')

      expect(mockFetch).toHaveBeenCalled()
    })

    test('includes mention on failure', async () => {
      mockFetch.mockImplementation(() => Promise.resolve({ ok: true }))

      const plugin = createDiscordPlugin({
        webhookUrl: 'https://discord.com/webhook',
        mentionOnFail: '<@&123456>',
      })

      await plugin.onTaskFailed?.({ task: mockTask, iteration: 1, startTime: new Date(), namespace: 'test' }, 'Test error')

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

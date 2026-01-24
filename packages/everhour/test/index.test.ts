import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test'
import { createEverhourPlugin, EverhourClient, asanaToEverhour, formatDuration } from '../src'

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

describe('Everhour Plugin', () => {
  const mockTask = {
    id: 'TASK-001',
    title: 'Test task',
    metadata: { asanaGid: '123456789' },
  } as any

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
      await plugin.onTaskStart?.({ task: mockTask, iteration: 1, startTime: new Date(), namespace: 'test' })

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

      const taskWithEverhourId = {
        id: 'TASK-001',
        title: 'Test',
        metadata: { asanaGid: '123', everhourId: 'custom-id' },
      } as any

      const plugin = createEverhourPlugin({ apiKey: 'test-key' })
      await plugin.onTaskStart?.({ task: taskWithEverhourId, iteration: 1, startTime: new Date(), namespace: 'test' })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.everhour.com/timers',
        expect.objectContaining({
          body: expect.stringContaining('custom-id'),
        })
      )
    })
  })
})

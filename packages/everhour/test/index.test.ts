import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test'
import { createEverhourPlugin, EverhourClient, asanaToEverhour, formatDuration, withEverhour } from '../src'

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

    test('getCurrentTimer returns null on error', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          text: () => Promise.resolve('No timer running'),
        })
      )

      const client = new EverhourClient('test-key')
      const result = await client.getCurrentTimer()

      expect(result).toBeNull()
    })

    test('getCurrentTimer returns timer data', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ status: 'active', duration: 120 })),
        })
      )

      const client = new EverhourClient('test-key')
      const result = await client.getCurrentTimer()

      expect(result).toEqual({ status: 'active', duration: 120 })
    })

    test('getTodayEntries fetches today entries', async () => {
      const today = new Date().toISOString().split('T')[0]
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify([{ time: 3600 }])),
        })
      )

      const client = new EverhourClient('test-key')
      const result = await client.getTodayEntries()

      expect(mockFetch).toHaveBeenCalledWith(
        `https://api.everhour.com/team/time?from=${today}&to=${today}`,
        expect.any(Object)
      )
      expect(result).toEqual([{ time: 3600 }])
    })

    test('getTodayTotal calculates sum of entries', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify([{ time: 3600 }, { time: 7200 }])),
        })
      )

      const client = new EverhourClient('test-key')
      const total = await client.getTodayTotal()

      expect(total).toBe(10800) // 3 hours
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

    test('checkDailyLimit warns when over limit', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify([{ time: 32400 }])), // 9 hours
        })
      )

      const client = new EverhourClient('test-key')
      const limit = await client.checkDailyLimit(8)

      expect(limit.hoursLogged).toBe(9)
      expect(limit.remaining).toBe(0)
      expect(limit.withinLimit).toBe(false)
    })

    test('addTime logs time entry', async () => {
      const today = new Date().toISOString().split('T')[0]
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ id: 1, time: 3600 })),
        })
      )

      const client = new EverhourClient('test-key')
      const result = await client.addTime('as:123', 3600)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.everhour.com/tasks/as:123/time',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ time: 3600, date: today }),
        })
      )
      expect(result).toEqual({ id: 1, time: 3600 })
    })

    test('addTime accepts custom date', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ id: 1 })),
        })
      )

      const client = new EverhourClient('test-key')
      await client.addTime('as:123', 3600, '2024-01-15')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ time: 3600, date: '2024-01-15' }),
        })
      )
    })

    test('getTaskTime fetches task data', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ id: 'as:123', name: 'Test', time: { total: 3600 } })),
        })
      )

      const client = new EverhourClient('test-key')
      const result = await client.getTaskTime('as:123')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.everhour.com/tasks/as:123',
        expect.any(Object)
      )
      expect(result.time.total).toBe(3600)
    })

    test('getMe fetches user info', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ id: 1, name: 'Test User', email: 'test@example.com' })),
        })
      )

      const client = new EverhourClient('test-key')
      const result = await client.getMe()

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.everhour.com/users/me',
        expect.any(Object)
      )
      expect(result.email).toBe('test@example.com')
    })

    test('request handles empty response', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(''),
        })
      )

      const client = new EverhourClient('test-key')
      const result = await client.stopTimer()

      expect(result).toEqual({})
    })

    test('request throws on API error', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 403,
          text: () => Promise.resolve('Unauthorized'),
        })
      )

      const client = new EverhourClient('test-key')

      expect(client.startTimer('as:123')).rejects.toThrow('Everhour API error: 403 - Unauthorized')
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

    test('onTaskStart skips timer for tasks without everhourId', async () => {
      const taskNoId = { id: 'TASK-001', title: 'Test', metadata: {} } as any
      const plugin = createEverhourPlugin({ apiKey: 'test-key' })

      await plugin.onTaskStart?.({ task: taskNoId, iteration: 1, startTime: new Date(), namespace: 'test' })

      // Should not call API
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

      const plugin = createEverhourPlugin({ apiKey: 'test-key' })

      // Should not throw
      await expect(plugin.onTaskStart?.({ task: mockTask, iteration: 1, startTime: new Date(), namespace: 'test' })).resolves.toBeUndefined()
    })

    test('onTaskComplete stops timer when autoStop enabled', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({})),
        })
      )

      const plugin = createEverhourPlugin({ apiKey: 'test-key', autoStopTimer: true })
      const context = { task: mockTask, iteration: 1, startTime: new Date(), namespace: 'test' }

      // Start task first
      await plugin.onTaskStart?.(context)

      // Complete task
      await plugin.onTaskComplete?.(context, { success: true, duration: 120 })

      // Should have called stopTimer
      const calls = mockFetch.mock.calls
      expect(calls.some((call: any) => call[0].includes('/timers/current') && call[1].method === 'DELETE')).toBe(true)
    })

    test('onTaskComplete logs time when autoStart disabled', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ id: 1 })),
        })
      )

      const plugin = createEverhourPlugin({ apiKey: 'test-key', autoStartTimer: false, autoStopTimer: false })
      const context = { task: mockTask, iteration: 1, startTime: new Date(), namespace: 'test' }

      // Start task (won't start timer)
      await plugin.onTaskStart?.(context)

      // Complete task (should log time manually)
      await plugin.onTaskComplete?.(context, { success: true, duration: 120 })

      // Should have called addTime
      const calls = mockFetch.mock.calls
      expect(calls.some((call: any) => call[0].includes('/tasks/') && call[0].includes('/time'))).toBe(true)
    })

    test('onTaskComplete handles missing timer info', async () => {
      const plugin = createEverhourPlugin({ apiKey: 'test-key' })
      const context = { task: mockTask, iteration: 1, startTime: new Date(), namespace: 'test' }

      // Complete task without starting (no timer info)
      await expect(plugin.onTaskComplete?.(context, { success: true, duration: 120 })).resolves.toBeUndefined()
    })

    test('onTaskComplete handles stop timer errors gracefully', async () => {
      let callCount = 0
      mockFetch.mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // startTimer succeeds
          return Promise.resolve({ ok: true, text: () => Promise.resolve(JSON.stringify({})) })
        } else {
          // stopTimer fails
          return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('No timer') })
        }
      })

      const plugin = createEverhourPlugin({ apiKey: 'test-key' })
      const context = { task: mockTask, iteration: 1, startTime: new Date(), namespace: 'test' }

      await plugin.onTaskStart?.(context)

      // Should not throw on stopTimer error
      await expect(plugin.onTaskComplete?.(context, { success: true, duration: 120 })).resolves.toBeUndefined()
    })

    test('onTaskFailed stops timer when autoStop enabled', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({})),
        })
      )

      const plugin = createEverhourPlugin({ apiKey: 'test-key', autoStopTimer: true })
      const context = { task: mockTask, iteration: 1, startTime: new Date(), namespace: 'test' }

      await plugin.onTaskStart?.(context)
      await plugin.onTaskFailed?.(context)

      // Should have called stopTimer
      const calls = mockFetch.mock.calls
      expect(calls.some((call: any) => call[0].includes('/timers/current') && call[1].method === 'DELETE')).toBe(true)
    })

    test('onTaskFailed handles errors gracefully', async () => {
      let callCount = 0
      mockFetch.mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({ ok: true, text: () => Promise.resolve(JSON.stringify({})) })
        }
        return Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('Error') })
      })

      const plugin = createEverhourPlugin({ apiKey: 'test-key' })
      const context = { task: mockTask, iteration: 1, startTime: new Date(), namespace: 'test' }

      await plugin.onTaskStart?.(context)

      // Should not throw
      await expect(plugin.onTaskFailed?.(context)).resolves.toBeUndefined()
    })

    test('onLoopStart checks daily limit', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify([{ time: 3600 }])), // 1 hour
        })
      )

      const plugin = createEverhourPlugin({ apiKey: 'test-key' })

      // Should not throw
      await expect(plugin.onLoopStart?.()).resolves.toBeUndefined()
    })

    test('onLoopStart warns when over daily limit', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify([{ time: 32400 }])), // 9 hours
        })
      )

      const plugin = createEverhourPlugin({ apiKey: 'test-key' })

      // Should not throw
      await expect(plugin.onLoopStart?.()).resolves.toBeUndefined()
    })

    test('onLoopStart handles API errors gracefully', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Error'),
        })
      )

      const plugin = createEverhourPlugin({ apiKey: 'test-key' })

      // Should not throw
      await expect(plugin.onLoopStart?.()).resolves.toBeUndefined()
    })

    test('onLoopEnd reports daily summary', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify([{ time: 7200 }])), // 2 hours
        })
      )

      const plugin = createEverhourPlugin({ apiKey: 'test-key' })
      const stats = { completed: 5, failed: 1, total: 6, duration: 300 }

      // Should not throw
      await expect(plugin.onLoopEnd?.(stats)).resolves.toBeUndefined()
    })

    test('onLoopEnd handles API errors gracefully', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Error'),
        })
      )

      const plugin = createEverhourPlugin({ apiKey: 'test-key' })
      const stats = { completed: 5, failed: 1, total: 6, duration: 300 }

      // Should not throw
      await expect(plugin.onLoopEnd?.(stats)).resolves.toBeUndefined()
    })
  })

  describe('withEverhour', () => {
    test('creates config wrapper with provided values', () => {
      const wrapper = withEverhour({
        apiKey: 'test-key',
        autoStartTimer: false,
        autoStopTimer: false,
        projectId: 'proj-123',
        dailyLimit: 6,
      })

      const config = wrapper({} as any)

      expect(config.everhour).toEqual({
        apiKey: 'test-key',
        autoStartTimer: false,
        autoStopTimer: false,
        projectId: 'proj-123',
        dailyLimit: 6,
      })
    })

    test('uses environment variables as fallback', () => {
      const originalEnv = process.env.EVERHOUR_API_KEY
      process.env.EVERHOUR_API_KEY = 'env-key'

      const wrapper = withEverhour({})
      const config = wrapper({} as any)

      expect(config.everhour.apiKey).toBe('env-key')

      // Restore
      if (originalEnv) {
        process.env.EVERHOUR_API_KEY = originalEnv
      } else {
        delete process.env.EVERHOUR_API_KEY
      }
    })

    test('uses default values for optional fields', () => {
      const wrapper = withEverhour({ apiKey: 'test-key' })
      const config = wrapper({} as any)

      expect(config.everhour.autoStartTimer).toBe(true)
      expect(config.everhour.autoStopTimer).toBe(true)
      expect(config.everhour.dailyLimit).toBe(8)
    })

    test('preserves base config properties', () => {
      const wrapper = withEverhour({ apiKey: 'test-key' })
      const baseConfig = { someProperty: 'value' }
      const config = wrapper(baseConfig as any)

      expect(config.someProperty).toBe('value')
      expect(config.everhour).toBeDefined()
    })
  })
})

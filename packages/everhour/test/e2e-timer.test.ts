import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test'
import { createEverhourPlugin, EverhourClient, asanaToEverhour } from '../src'
import type { TaskContext, PluginTaskResult } from '../../loopwork/src/contracts'

/**
 * E2E Test Suite for Everhour Timer Plugin
 *
 * Tests full lifecycle integration of time tracking:
 * - Plugin lifecycle hooks (onLoopStart, onTaskStart, onTaskComplete, onTaskFailed, onLoopEnd)
 * - Auto-start/auto-stop timer behavior
 * - Daily limit checking
 * - everhourId and asanaGid metadata handling
 * - API error handling and resilience
 */

// Mock fetch globally
const originalFetch = global.fetch
let mockFetch: ReturnType<typeof mock>

beforeEach(() => {
  mockFetch = mock(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  }))
  global.fetch = mockFetch as any
})

afterEach(() => {
  global.fetch = originalFetch
})

describe('Everhour E2E - Timer Integration', () => {
  const API_KEY = 'test-api-key-123'
  const BASE_URL = 'https://api.everhour.com'

  const createMockTask = (id = 'TASK-001', everhourId?: string, asanaGid?: string): any => ({
    id,
    title: 'Test task',
    status: 'pending',
    metadata: {
      ...(everhourId && { everhourId }),
      ...(asanaGid && { asanaGid }),
    },
  })

  const createMockContext = (task: any): TaskContext => ({
    task,
    iteration: 1,
    startTime: new Date(),
    namespace: 'test',
  })

  const createMockResult = (duration = 30, output = ''): PluginTaskResult => ({
    duration,
    output,
  })

  describe('Plugin Lifecycle - Full Timer Flow', () => {
    test('E2E: Complete task workflow with timer auto-start and auto-stop', async () => {
      let timerStarted = false
      let timerStopped = false

      mockFetch.mockImplementation((url: string, options: any) => {
        // Mock daily limit check
        if (url.includes('/team/time')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([
              { time: 7200, date: new Date().toISOString().split('T')[0] },
            ]),
            text: () => Promise.resolve(''),
          })
        }

        // Mock start timer
        if (url.includes('/timers') && options?.method === 'POST') {
          timerStarted = true
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              status: 'active',
              duration: 0,
              task: { id: 'ev:12345' },
              startedAt: new Date().toISOString(),
            }),
            text: () => Promise.resolve(''),
          })
        }

        // Mock stop timer
        if (url.includes('/timers/current') && options?.method === 'DELETE') {
          timerStopped = true
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              status: 'stopped',
              duration: 30,
            }),
            text: () => Promise.resolve(''),
          })
        }

        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(''),
        })
      })

      const plugin = createEverhourPlugin({
        apiKey: API_KEY,
        autoStartTimer: true,
        autoStopTimer: true,
      })

      // Loop starts - check daily limit
      await plugin.onLoopStart?.('test')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/team/time'),
        expect.any(Object),
      )

      mockFetch.mockClear()

      // Task starts - timer should start
      const task = createMockTask('TASK-001', 'ev:12345')
      const context = createMockContext(task)
      await plugin.onTaskStart?.(context)

      expect(timerStarted).toBe(true)

      mockFetch.mockClear()

      // Task completes - timer should stop
      const result = createMockResult(45)
      await plugin.onTaskComplete?.(context, result)

      expect(timerStopped).toBe(true)

      mockFetch.mockClear()

      // Loop ends - show summary
      await plugin.onLoopEnd?.({ completed: 3, failed: 0, duration: 150 })
      expect(mockFetch).toHaveBeenCalled()
    })

    test('E2E: Task failure stops timer without logging time', async () => {
      let timerStopped = false

      mockFetch.mockImplementation((url: string, options: any) => {
        // Mock timer stop
        if (url.includes('/timers/current') && options?.method === 'DELETE') {
          timerStopped = true
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'stopped' }),
            text: () => Promise.resolve(''),
          })
        }

        // Mock timer start
        if (url.includes('/timers') && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'active' }),
            text: () => Promise.resolve(''),
          })
        }

        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(''),
        })
      })

      const plugin = createEverhourPlugin({
        apiKey: API_KEY,
        autoStartTimer: true,
        autoStopTimer: true,
      })

      const task = createMockTask('TASK-FAIL', 'ev:99999')
      const context = createMockContext(task)

      // Start task
      await plugin.onTaskStart?.(context)

      mockFetch.mockClear()

      // Task fails - should stop timer but not log time
      await plugin.onTaskFailed?.(context, 'Test error')

      expect(timerStopped).toBe(true)
      // Verify no time entry was created
      expect(mockFetch.mock.calls.some((call: any) =>
        call[0].includes('/tasks/') && call[1]?.method === 'POST'
      )).toBe(false)
    })
  })

  describe('Everhour ID and Asana GID Handling', () => {
    test('uses everhourId when present', async () => {
      let usedTaskId = ''

      mockFetch.mockImplementation((url: string, options: any) => {
        if (url.includes('/timers') && options?.method === 'POST') {
          const body = JSON.parse(options.body)
          usedTaskId = body.task
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'active' }),
            text: () => Promise.resolve(''),
          })
        }

        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(''),
        })
      })

      const plugin = createEverhourPlugin({
        apiKey: API_KEY,
        autoStartTimer: true,
      })

      const task = createMockTask('TASK-001', 'ev:explicit-id')
      await plugin.onTaskStart?.(createMockContext(task))

      expect(usedTaskId).toBe('ev:explicit-id')
    })

    test('converts asanaGid to everhourId format when no everhourId', async () => {
      let usedTaskId = ''

      mockFetch.mockImplementation((url: string, options: any) => {
        if (url.includes('/timers') && options?.method === 'POST') {
          const body = JSON.parse(options.body)
          usedTaskId = body.task
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'active' }),
            text: () => Promise.resolve(''),
          })
        }

        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(''),
        })
      })

      const plugin = createEverhourPlugin({
        apiKey: API_KEY,
        autoStartTimer: true,
      })

      const task = createMockTask('TASK-002', undefined, '1234567890123456')
      await plugin.onTaskStart?.(createMockContext(task))

      expect(usedTaskId).toBe('as:1234567890123456')
    })

    test('prefers everhourId over asanaGid when both present', async () => {
      let usedTaskId = ''

      mockFetch.mockImplementation((url: string, options: any) => {
        if (url.includes('/timers') && options?.method === 'POST') {
          const body = JSON.parse(options.body)
          usedTaskId = body.task
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'active' }),
            text: () => Promise.resolve(''),
          })
        }

        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(''),
        })
      })

      const plugin = createEverhourPlugin({
        apiKey: API_KEY,
        autoStartTimer: true,
      })

      const task = createMockTask('TASK-003', 'ev:preferred', '9999999999999999')
      await plugin.onTaskStart?.(createMockContext(task))

      expect(usedTaskId).toBe('ev:preferred')
    })

    test('does not start timer when no everhourId or asanaGid', async () => {
      mockFetch.mockImplementation(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(''),
      }))

      const plugin = createEverhourPlugin({
        apiKey: API_KEY,
        autoStartTimer: true,
      })

      const task = createMockTask('TASK-004') // No IDs
      await plugin.onTaskStart?.(createMockContext(task))

      // Should not call timer API
      expect(mockFetch.mock.calls.some((call: any) =>
        call[0].includes('/timers')
      )).toBe(false)
    })

    test('asanaToEverhour helper converts correctly', () => {
      expect(asanaToEverhour('1234567890123456')).toBe('as:1234567890123456')
      expect(asanaToEverhour('9999999999999999')).toBe('as:9999999999999999')
    })
  })

  describe('Auto-start and Auto-stop Configuration', () => {
    test('autoStartTimer: false prevents timer from starting', async () => {
      mockFetch.mockImplementation(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(''),
      }))

      const plugin = createEverhourPlugin({
        apiKey: API_KEY,
        autoStartTimer: false,
      })

      const task = createMockTask('TASK-001', 'ev:12345')
      await plugin.onTaskStart?.(createMockContext(task))

      // Should not call timer API
      expect(mockFetch.mock.calls.some((call: any) =>
        call[0].includes('/timers') && call[1]?.method === 'POST'
      )).toBe(false)
    })

    test('autoStopTimer: false prevents timer from stopping', async () => {
      mockFetch.mockImplementation((url: string, options: any) => {
        if (url.includes('/timers') && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'active' }),
            text: () => Promise.resolve(''),
          })
        }

        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(''),
        })
      })

      const plugin = createEverhourPlugin({
        apiKey: API_KEY,
        autoStartTimer: true,
        autoStopTimer: false,
      })

      const task = createMockTask('TASK-001', 'ev:12345')
      const context = createMockContext(task)

      await plugin.onTaskStart?.(context)
      mockFetch.mockClear()

      await plugin.onTaskComplete?.(context, createMockResult())

      // Should not call DELETE timer API
      expect(mockFetch.mock.calls.some((call: any) =>
        call[0].includes('/timers/current') && call[1]?.method === 'DELETE'
      )).toBe(false)
    })

    test('manual time logging when autoStartTimer disabled', async () => {
      let timeLogged = false

      mockFetch.mockImplementation((url: string, options: any) => {
        if (url.includes('/tasks/') && url.includes('/time') && options?.method === 'POST') {
          timeLogged = true
          const body = JSON.parse(options.body)
          expect(body.time).toBe(45)
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ time: 45 }),
            text: () => Promise.resolve(''),
          })
        }

        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(''),
        })
      })

      const plugin = createEverhourPlugin({
        apiKey: API_KEY,
        autoStartTimer: false,
        autoStopTimer: false,
      })

      const task = createMockTask('TASK-001', 'ev:12345')
      const context = createMockContext(task)

      await plugin.onTaskStart?.(context)
      await plugin.onTaskComplete?.(context, createMockResult(45))

      expect(timeLogged).toBe(true)
    })
  })

  describe('Daily Limit Checking', () => {
    test('onLoopStart reports hours logged and remaining', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/team/time')) {
          const today = new Date().toISOString().split('T')[0]
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([
              { time: 14400, date: today }, // 4 hours
              { time: 3600, date: today },  // 1 hour
            ]),
            text: () => Promise.resolve(''),
          })
        }

        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(''),
        })
      })

      const plugin = createEverhourPlugin({ apiKey: API_KEY })
      await plugin.onLoopStart?.('test')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/team/time'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Api-Key': API_KEY,
          }),
        })
      )
    })

    test('warns when daily limit exceeded', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/team/time')) {
          const today = new Date().toISOString().split('T')[0]
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([
              { time: 28800, date: today }, // 8 hours
              { time: 1800, date: today },  // 0.5 hours (over limit)
            ]),
            text: () => Promise.resolve(''),
          })
        }

        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(''),
        })
      })

      const plugin = createEverhourPlugin({ apiKey: API_KEY, dailyLimit: 8 })
      await plugin.onLoopStart?.('test')

      // Should call API to check limit
      expect(mockFetch).toHaveBeenCalled()
    })

    test('onLoopEnd shows total time logged today', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/team/time')) {
          const today = new Date().toISOString().split('T')[0]
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([
              { time: 10800, date: today }, // 3 hours
            ]),
            text: () => Promise.resolve(''),
          })
        }

        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(''),
        })
      })

      const plugin = createEverhourPlugin({ apiKey: API_KEY })
      await plugin.onLoopEnd?.({ completed: 5, failed: 0, duration: 200 })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/team/time'),
        expect.any(Object),
      )
    })
  })

  describe('Everhour Client API Methods', () => {
    test('getCurrentTimer returns active timer', async () => {
      const timerData = {
        status: 'active',
        duration: 300,
        task: { id: 'ev:12345' },
        startedAt: '2025-01-30T10:00:00Z',
      }

      mockFetch.mockImplementation(() => Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(timerData)),
      }))

      const client = new EverhourClient(API_KEY)
      const timer = await client.getCurrentTimer()

      expect(timer).toMatchObject({
        status: 'active',
        duration: 300,
        task: { id: 'ev:12345' },
      })
    })

    test('startTimer sends correct request', async () => {
      let requestBody: any

      mockFetch.mockImplementation((url: string, options: any) => {
        requestBody = JSON.parse(options.body)
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'active' }),
          text: () => Promise.resolve(''),
        })
      })

      const client = new EverhourClient(API_KEY)
      await client.startTimer('ev:12345')

      expect(requestBody).toEqual({ task: 'ev:12345' })
      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE_URL}/timers`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Api-Key': API_KEY,
          }),
        })
      )
    })

    test('stopTimer calls DELETE on current timer', async () => {
      mockFetch.mockImplementation(() => Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ status: 'stopped', duration: 600 })),
      }))

      const client = new EverhourClient(API_KEY)
      const result = await client.stopTimer()

      expect(result.status).toBe('stopped')
      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE_URL}/timers/current`,
        expect.objectContaining({ method: 'DELETE' })
      )
    })

    test('addTime sends time entry with correct format', async () => {
      let requestBody: any

      mockFetch.mockImplementation((url: string, options: any) => {
        requestBody = JSON.parse(options.body)
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ time: 1800, date: '2025-01-30' }),
          text: () => Promise.resolve(''),
        })
      })

      const client = new EverhourClient(API_KEY)
      await client.addTime('ev:12345', 1800, '2025-01-30')

      expect(requestBody).toEqual({
        time: 1800,
        date: '2025-01-30',
      })
    })

    test('getTodayTotal calculates sum of entries', async () => {
      const today = new Date().toISOString().split('T')[0]

      mockFetch.mockImplementation(() => Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify([
          { time: 3600, date: today },
          { time: 1800, date: today },
          { time: 900, date: today },
        ])),
      }))

      const client = new EverhourClient(API_KEY)
      const total = await client.getTodayTotal()

      expect(total).toBe(6300) // 3600 + 1800 + 900
    })

    test('checkDailyLimit returns correct status', async () => {
      const today = new Date().toISOString().split('T')[0]

      mockFetch.mockImplementation(() => Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify([
          { time: 10800, date: today }, // 3 hours
        ])),
      }))

      const client = new EverhourClient(API_KEY)
      const limit = await client.checkDailyLimit(8)

      expect(limit).toMatchObject({
        withinLimit: true,
        hoursLogged: 3,
        remaining: 5,
      })
    })
  })

  describe('API Error Handling', () => {
    test('handles API errors gracefully without crashing plugin', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Internal Server Error'),
        })
      )

      const plugin = createEverhourPlugin({
        apiKey: API_KEY,
        autoStartTimer: true,
      })

      const task = createMockTask('TASK-001', 'ev:12345')

      // Should not throw
      await expect(
        plugin.onTaskStart?.(createMockContext(task))
      ).resolves.toBeUndefined()
    })

    test('handles network errors gracefully', async () => {
      mockFetch.mockImplementation(() =>
        Promise.reject(new Error('Network timeout'))
      )

      const plugin = createEverhourPlugin({ apiKey: API_KEY })

      // Should not throw
      await expect(
        plugin.onLoopStart?.('test')
      ).resolves.toBeUndefined()
    })

    test('timer stop failure on task complete does not crash', async () => {
      mockFetch.mockImplementation((url: string, options: any) => {
        if (url.includes('/timers') && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'active' }),
            text: () => Promise.resolve(''),
          })
        }

        if (url.includes('/timers/current') && options?.method === 'DELETE') {
          return Promise.resolve({
            ok: false,
            status: 404,
            text: () => Promise.resolve('Timer not found'),
          })
        }

        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(''),
        })
      })

      const plugin = createEverhourPlugin({
        apiKey: API_KEY,
        autoStartTimer: true,
        autoStopTimer: true,
      })

      const task = createMockTask('TASK-001', 'ev:12345')
      const context = createMockContext(task)

      await plugin.onTaskStart?.(context)

      // Should not throw even if stop fails
      await expect(
        plugin.onTaskComplete?.(context, createMockResult())
      ).resolves.toBeUndefined()
    })
  })

  describe('Missing Configuration Handling', () => {
    test('returns warning plugin when no API key provided', () => {
      const plugin = createEverhourPlugin({})

      expect(plugin.name).toBe('everhour')
      expect(plugin.onConfigLoad).toBeDefined()
      expect(plugin.onLoopStart).toBeUndefined()
    })

    test('returns warning plugin when EVERHOUR_API_KEY env not set', () => {
      const originalEnv = process.env.EVERHOUR_API_KEY
      delete process.env.EVERHOUR_API_KEY

      const plugin = createEverhourPlugin({})
      expect(plugin.onConfigLoad).toBeDefined()

      if (originalEnv) process.env.EVERHOUR_API_KEY = originalEnv
    })
  })
})

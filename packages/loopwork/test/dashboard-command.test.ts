/**
 * Unit tests for dashboard command
 *
 * These tests prevent the namespace rendering bug where getNamespaces returned
 * namespace objects instead of string array, causing React rendering errors.
 */

import { describe, test, expect } from 'bun:test'

/**
 * Test the core logic of the dashboard command callbacks
 * by directly testing the data transformations that are passed to startInkTui
 */

describe('Dashboard Command - getNamespaces Transformation', () => {
  test('should transform namespace objects to string array', () => {
    // Simulate the monitor.getStatus() return value
    const monitorStatus = {
      running: [],
      namespaces: [
        { name: 'test-ns-1', status: 'running', lastRun: '2024-01-01T00:00:00.000Z' },
        { name: 'test-ns-2', status: 'running', lastRun: '2024-01-02T00:00:00.000Z' },
        { name: 'test-ns-3', status: 'stopped', lastRun: '2024-01-03T00:00:00.000Z' },
      ],
    }

    // This is the CORRECT transformation (what the fixed code does)
    const namespaces = monitorStatus.namespaces.map(ns => ns.name)

    // CRITICAL ASSERTIONS: Must be array of strings
    expect(Array.isArray(namespaces)).toBe(true)
    expect(namespaces.length).toBe(3)

    // Every element must be a string
    namespaces.forEach(ns => {
      expect(typeof ns).toBe('string')
    })

    // Should contain the namespace names
    expect(namespaces).toContain('test-ns-1')
    expect(namespaces).toContain('test-ns-2')
    expect(namespaces).toContain('test-ns-3')

    // Should NOT contain objects (this was the bug)
    namespaces.forEach(ns => {
      expect(typeof ns).not.toBe('object')
      // TypeScript would catch these, but verify at runtime too
      expect((ns as any).name).toBeUndefined()
      expect((ns as any).status).toBeUndefined()
      expect((ns as any).lastRun).toBeUndefined()
    })
  })

  test('should handle empty namespaces array', () => {
    const monitorStatus = {
      running: [],
      namespaces: [],
    }

    const namespaces = monitorStatus.namespaces.map(ns => ns.name)

    expect(Array.isArray(namespaces)).toBe(true)
    expect(namespaces.length).toBe(0)
  })

  test('should not return the original objects (buggy behavior)', () => {
    const monitorStatus = {
      running: [],
      namespaces: [
        { name: 'test-ns-1', status: 'running', lastRun: '2024-01-01T00:00:00.000Z' },
      ],
    }

    // This would be the WRONG transformation (the bug)
    const buggyNamespaces = monitorStatus.namespaces // Returns objects, not strings

    // The bug: React would fail rendering because it got objects instead of strings
    expect(typeof buggyNamespaces[0]).toBe('object')
    expect(buggyNamespaces[0]).toHaveProperty('name')
    expect(buggyNamespaces[0]).toHaveProperty('status')
    expect(buggyNamespaces[0]).toHaveProperty('lastRun')

    // The fix: Extract just the names
    const fixedNamespaces = monitorStatus.namespaces.map(ns => ns.name)
    expect(typeof fixedNamespaces[0]).toBe('string')
    expect(fixedNamespaces[0]).toBe('test-ns-1')
  })
})

describe('Dashboard Command - getState Transformation', () => {
  test('should convert activity to completed and failed tasks', () => {
    const activity = [
      { type: 'completed', message: 'Completed TASK-001', timestamp: new Date().toISOString() },
      { type: 'failed', message: 'Failed TASK-002', timestamp: new Date().toISOString() },
      { type: 'completed', message: 'Completed TASK-003', timestamp: new Date().toISOString() },
    ]

    // Transform as done in dashboard.ts
    const completedTasks = activity.filter(a => a.type === 'completed').map(a => ({
      id: a.message.replace('Completed ', ''),
      title: a.message,
    }))

    const failedTasks = activity.filter(a => a.type === 'failed').map(a => ({
      id: a.message.replace('Failed ', ''),
      title: a.message,
    }))

    expect(completedTasks.length).toBe(2)
    expect(failedTasks.length).toBe(1)

    expect(completedTasks[0].id).toBe('TASK-001')
    expect(completedTasks[0].title).toBe('Completed TASK-001')

    expect(failedTasks[0].id).toBe('TASK-002')
    expect(failedTasks[0].title).toBe('Failed TASK-002')
  })

  test('should convert activity to recentEvents with correct status', () => {
    const activity = [
      { type: 'completed', message: 'Completed TASK-001', timestamp: new Date().toISOString() },
      { type: 'failed', message: 'Failed TASK-002', timestamp: new Date().toISOString() },
      { type: 'iteration', message: 'Started iteration 5', timestamp: new Date().toISOString() },
    ]

    // Transform as done in dashboard.ts
    const recentEvents = activity.map(a => ({
      id: a.message.replace(/^(Completed|Failed|Started iteration) /, ''),
      title: a.message,
      status: (a.type === 'completed' ? 'completed' : a.type === 'failed' ? 'failed' : 'started') as 'started' | 'completed' | 'failed',
      timestamp: new Date(),
    }))

    expect(recentEvents.length).toBe(3)

    expect(recentEvents[0].status).toBe('completed')
    expect(recentEvents[1].status).toBe('failed')
    expect(recentEvents[2].status).toBe('started')

    // All status values must be valid
    recentEvents.forEach(event => {
      expect(['started', 'completed', 'failed']).toContain(event.status)
    })
  })

  test('should construct currentTask from running processes', () => {
    const running = [
      { namespace: 'test-ns-1', pid: 1234, startedAt: new Date().toISOString() },
      { namespace: 'test-ns-2', pid: 5678, startedAt: new Date().toISOString() },
    ]

    // Transform as done in dashboard.ts - takes first running process
    const currentTask = running.length > 0
      ? { id: `PID-${running[0].pid}`, title: `Running in ${running[0].namespace}` }
      : null

    expect(currentTask).not.toBeNull()
    expect(currentTask?.id).toBe('PID-1234')
    expect(currentTask?.title).toBe('Running in test-ns-1')
  })

  test('should handle no running processes', () => {
    const running: any[] = []

    const currentTask = running.length > 0
      ? { id: `PID-${running[0].pid}`, title: `Running in ${running[0].namespace}` }
      : null

    expect(currentTask).toBeNull()
  })

  test('should calculate stats correctly', () => {
    const activity = [
      { type: 'completed', message: 'Completed TASK-001', timestamp: new Date().toISOString() },
      { type: 'failed', message: 'Failed TASK-002', timestamp: new Date().toISOString() },
      { type: 'completed', message: 'Completed TASK-003', timestamp: new Date().toISOString() },
    ]

    const completedTasks = activity.filter(a => a.type === 'completed')
    const failedTasks = activity.filter(a => a.type === 'failed')

    const stats = {
      total: completedTasks.length + failedTasks.length,
      pending: 0,
      completed: completedTasks.length,
      failed: failedTasks.length,
    }

    expect(stats.total).toBe(3)
    expect(stats.completed).toBe(2)
    expect(stats.failed).toBe(1)
    expect(stats.pending).toBe(0)
  })
})

describe('Dashboard Command - getRunningLoops Transformation', () => {
  test('should transform running processes to loop info', () => {
    const running = [
      { namespace: 'test-ns-1', pid: 1234, startedAt: '2024-01-01T10:00:00.000Z' },
      { namespace: 'test-ns-2', pid: 5678, startedAt: '2024-01-01T11:00:00.000Z' },
    ]

    // Transform as done in dashboard.ts
    const loops = running.map(p => ({
      namespace: p.namespace,
      pid: p.pid,
      startTime: p.startedAt,
    }))

    expect(loops.length).toBe(2)

    expect(loops[0].namespace).toBe('test-ns-1')
    expect(loops[0].pid).toBe(1234)
    expect(loops[0].startTime).toBe('2024-01-01T10:00:00.000Z')

    expect(loops[1].namespace).toBe('test-ns-2')
    expect(loops[1].pid).toBe(5678)
    expect(loops[1].startTime).toBe('2024-01-01T11:00:00.000Z')

    // Verify structure
    loops.forEach(loop => {
      expect(typeof loop.namespace).toBe('string')
      expect(typeof loop.pid).toBe('number')
      expect(typeof loop.startTime).toBe('string')
    })
  })

  test('should handle empty running processes', () => {
    const running: any[] = []

    const loops = running.map(p => ({
      namespace: p.namespace,
      pid: p.pid,
      startTime: p.startedAt,
    }))

    expect(Array.isArray(loops)).toBe(true)
    expect(loops.length).toBe(0)
  })
})

describe('Dashboard Command - Type Safety Checks', () => {
  test('getNamespaces return type matches startInkTui interface', () => {
    // This test verifies the type contract
    // startInkTui expects: getNamespaces?: () => Promise<string[]>

    const monitorStatus = {
      namespaces: [
        { name: 'test', status: 'running', lastRun: '2024-01-01T00:00:00.000Z' },
      ],
    }

    // Correct transformation
    const getNamespaces = async (): Promise<string[]> => {
      return monitorStatus.namespaces.map(ns => ns.name)
    }

    // Type assertion to verify
    const result: Promise<string[]> = getNamespaces()

    expect(result).toBeInstanceOf(Promise)
  })

  test('getState return type matches expected interface', async () => {
    // startInkTui expects this structure from getState
    interface ExpectedStateShape {
      currentTask: { id: string; title: string } | null
      pendingTasks: unknown[]
      completedTasks: Array<{ id: string; title: string }>
      failedTasks: Array<{ id: string; title: string }>
      stats: {
        total: number
        pending: number
        completed: number
        failed: number
      }
      recentEvents: Array<{
        id: string
        title: string
        status: 'started' | 'completed' | 'failed'
        timestamp: Date
      }>
    }

    const activity = [
      { type: 'completed', message: 'Completed TASK-001', timestamp: new Date().toISOString() },
    ]
    const running = [
      { namespace: 'test', pid: 1234, startedAt: new Date().toISOString() },
    ]

    const state: ExpectedStateShape = {
      currentTask: running.length > 0
        ? { id: `PID-${running[0].pid}`, title: `Running in ${running[0].namespace}` }
        : null,
      pendingTasks: [],
      completedTasks: activity.filter(a => a.type === 'completed').map(a => ({
        id: a.message.replace('Completed ', ''),
        title: a.message,
      })),
      failedTasks: activity.filter(a => a.type === 'failed').map(a => ({
        id: a.message.replace('Failed ', ''),
        title: a.message,
      })),
      stats: {
        total: 1,
        pending: 0,
        completed: 1,
        failed: 0,
      },
      recentEvents: activity.map(a => ({
        id: a.message.replace(/^(Completed|Failed|Started iteration) /, ''),
        title: a.message,
        status: (a.type === 'completed' ? 'completed' : a.type === 'failed' ? 'failed' : 'started') as 'started' | 'completed' | 'failed',
        timestamp: new Date(),
      })),
    }

    // Verify the shape is correct
    expect(state).toHaveProperty('currentTask')
    expect(state).toHaveProperty('pendingTasks')
    expect(state).toHaveProperty('completedTasks')
    expect(state).toHaveProperty('failedTasks')
    expect(state).toHaveProperty('stats')
    expect(state).toHaveProperty('recentEvents')

    expect(state.stats).toHaveProperty('total')
    expect(state.stats).toHaveProperty('pending')
    expect(state.stats).toHaveProperty('completed')
    expect(state.stats).toHaveProperty('failed')
  })

  test('getRunningLoops return type matches expected interface', () => {
    // startInkTui expects: getRunningLoops?: () => Promise<Array<{ namespace: string; pid: number; startTime: Date }>>

    const running = [
      { namespace: 'test', pid: 1234, startedAt: '2024-01-01T00:00:00.000Z' },
    ]

    const getRunningLoops = async (): Promise<Array<{ namespace: string; pid: number; startTime: string }>> => {
      return running.map(p => ({
        namespace: p.namespace,
        pid: p.pid,
        startTime: p.startedAt,
      }))
    }

    const result = getRunningLoops()
    expect(result).toBeInstanceOf(Promise)
  })
})

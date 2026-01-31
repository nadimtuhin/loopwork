import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import { InkRenderer } from '../../src/output/ink-renderer'
import { ConsoleRenderer } from '../../src/output/console-renderer'
import type { OutputConfig } from '../../src/output/contracts'
import { mockTTY, createMockEvents } from '../setup-ink'

describe('Event Emission System', () => {
  const events = createMockEvents()
  let renderer: InkRenderer

  beforeEach(() => {
    const config: OutputConfig = { mode: 'ink', logLevel: 'info', useTty: true }
    renderer = new InkRenderer(config)
  })

  afterEach(() => {
    renderer.dispose()
  })

  describe('subscriber management', () => {
    test('should allow multiple subscribers', () => {
      const sub1 = mock<(event: unknown) => void>()
      const sub2 = mock<(event: unknown) => void>()

      const unsub1 = renderer.subscribe(sub1 as any)
      const unsub2 = renderer.subscribe(sub2 as any)

      const event = events.log('info', 'Test message')
      renderer.renderEvent(event)

      expect(sub1).toHaveBeenCalled()
      expect(sub2).toHaveBeenCalled()

      unsub1()
      renderer.renderEvent(event)

      expect(sub1).toHaveBeenCalledTimes(1)
      expect(sub2).toHaveBeenCalledTimes(2)
    })

    test('should handle subscriber errors gracefully', () => {
      const badSubscriber = mock<(event: unknown) => void>(() => {
        throw new Error('Subscriber error')
      })
      const goodSubscriber = mock<(event: unknown) => void>()

      renderer.subscribe(badSubscriber as any)
      const unsub = renderer.subscribe(goodSubscriber as any)

      const event = events.log('info', 'Test')
      expect(() => renderer.renderEvent(event)).not.toThrow()

      expect(goodSubscriber).toHaveBeenCalled()

      unsub()
    })

    test('should return unsubscribe function', () => {
      const subscriber = mock<(event: unknown) => void>()
      const unsubscribe = renderer.subscribe(subscriber as any)

      expect(typeof unsubscribe).toBe('function')

      const event = events.log('info', 'Test')
      renderer.renderEvent(event)
      expect(subscriber).toHaveBeenCalled()

      unsubscribe()

      renderer.renderEvent(event)
      expect(subscriber).toHaveBeenCalledTimes(1)
    })
  })

  describe('event ordering', () => {
    test('should emit events in order received', () => {
      const received: unknown[] = []
      renderer.subscribe((event) => received.push(event))

      const events = [
        createMockEvents().log('info', 'First'),
        createMockEvents().log('warn', 'Second'),
        createMockEvents().log('error', 'Third'),
      ]

      events.forEach((event) => renderer.renderEvent(event))

      expect(received).toHaveLength(3)
      expect((received[0] as any).message).toBe('First')
      expect((received[1] as any).message).toBe('Second')
      expect((received[2] as any).message).toBe('Third')
    })

    test('should maintain event order across different event types', () => {
      const received: string[] = []
      renderer.subscribe((event) => received.push((event as any).type))

      const sequence = [
        events.taskStart('T1', 'Task 1'),
        events.log('info', 'Log'),
        events.taskComplete('T1', 'Task 1', 1000),
        events.loopStart('default', 1),
        events.loopEnd('default', 1, 0),
      ]

      sequence.forEach((event) => renderer.renderEvent(event))

      expect(received).toEqual([
        'task:start',
        'log',
        'task:complete',
        'loop:start',
        'loop:end',
      ])
    })
  })

  describe('subscriber isolation', () => {
    test('should isolate subscribers from each other', () => {
      const sub1Events: unknown[] = []
      const sub2Events: unknown[] = []

      renderer.subscribe((event) => sub1Events.push({ ...event }))
      renderer.subscribe((event) => sub2Events.push({ ...event }))

      renderer.renderEvent(events.log('info', 'Test'))

      expect(sub1Events).toHaveLength(1)
      expect(sub2Events).toHaveLength(1)
    })
  })
})

describe('ConsoleRenderer Event Emission', () => {
  mockTTY(true)

  test('should emit events through subscribers', () => {
    const events = createMockEvents()
    const config: OutputConfig = { mode: 'human', logLevel: 'info', useTty: true }
    const renderer = new ConsoleRenderer(config)
    const received: unknown[] = []

    renderer.subscribe((event) => received.push(event))

    renderer.renderEvent(events.log('info', 'Test'))
    renderer.renderEvent(events.log('warn', 'Warning'))

    expect(received).toHaveLength(2)

    renderer.dispose()
  })

  test('should not emit events when logLevel is silent', () => {
    const events = createMockEvents()
    const config: OutputConfig = { mode: 'silent', logLevel: 'silent', useTty: true }
    const renderer = new ConsoleRenderer(config)
    const received: unknown[] = []

    renderer.subscribe((event) => received.push(event))

    renderer.renderEvent(events.log('info', 'Test'))

    expect(received).toHaveLength(0)

    renderer.dispose()
  })

})

describe('Event Types Coverage', () => {
  test('should handle all event types from contracts', () => {
    const config: OutputConfig = { mode: 'ink', logLevel: 'info', useTty: true }
    const renderer = new InkRenderer(config)
    const received: string[] = []

    renderer.subscribe((event) => received.push((event as any).type))

    const allEvents = [
      { type: 'log', level: 'info', message: 'test', timestamp: Date.now() },
      { type: 'task:start', taskId: 'T1', title: 'Test', timestamp: Date.now(), iteration: 1, namespace: 'default' },
      { type: 'task:complete', taskId: 'T1', title: 'Test', duration: 100, success: true, timestamp: Date.now() },
      { type: 'task:failed', taskId: 'T1', title: 'Test', error: 'fail', duration: 100, timestamp: Date.now() },
      { type: 'loop:start', namespace: 'default', maxIterations: 10, taskCount: 10, timestamp: Date.now() },
      { type: 'loop:end', namespace: 'default', completed: 5, failed: 5, duration: 1000, timestamp: Date.now() },
      { type: 'loop:iteration', iteration: 1, maxIterations: 10, remainingTasks: 9, timestamp: Date.now() },
      { type: 'cli:start', taskId: 'T1', command: 'claude', model: 'sonnet', timeout: 300, timestamp: Date.now() },
      { type: 'cli:output', taskId: 'T1', chunk: 'output', timestamp: Date.now() },
      { type: 'cli:complete', taskId: 'T1', exitCode: 0, duration: 100, timestamp: Date.now() },
      { type: 'cli:error', taskId: 'T1', error: 'error', timestamp: Date.now() },
      { type: 'progress:start', message: 'Loading', timestamp: Date.now() },
      { type: 'progress:update', message: 'Processing', percent: 50, timestamp: Date.now() },
      { type: 'progress:stop', success: true, timestamp: Date.now() },
      { type: 'raw', content: 'raw', timestamp: Date.now() },
      { type: 'json', eventType: 'test', data: {}, timestamp: Date.now() },
    ]

    allEvents.forEach((event) => {
      expect(() => renderer.renderEvent(event as any)).not.toThrow()
    })

    expect(received).toHaveLength(16)

    renderer.dispose()
  })
})

describe('ConsoleRenderer Event Emission', () => {
  mockTTY(true)

  test('should emit events through subscribers', () => {
    const events = createMockEvents()
    const config: OutputConfig = { mode: 'human', logLevel: 'info', useTty: true }
    const renderer = new ConsoleRenderer(config)
    const received: unknown[] = []

    renderer.subscribe((event) => received.push(event))

    renderer.renderEvent(events.log('info', 'Test'))
    renderer.renderEvent(events.log('warn', 'Warning'))

    expect(received).toHaveLength(2)

    renderer.dispose()
  })

  test('should not emit in silent mode', () => {
    const events = createMockEvents()
    const config: OutputConfig = { mode: 'silent', logLevel: 'silent', useTty: true }
    const renderer = new ConsoleRenderer(config)
    const received: unknown[] = []

    renderer.subscribe((event) => received.push(event))

    renderer.renderEvent(events.log('info', 'Test'))

    expect(received).toHaveLength(0)

    renderer.dispose()
  })
})

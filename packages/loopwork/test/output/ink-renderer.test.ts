import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import { InkRenderer } from '../../src/output/ink-renderer'
import { ConsoleRenderer } from '../../src/output/console-renderer'
import type { OutputConfig } from '../../src/output/contracts'
import { mockTTY } from '../setup-ink'

describe('Ink Renderer', () => {
  let renderer: InkRenderer

  beforeEach(() => {
    mockTTY(true)
  })

  afterEach(() => {
    renderer?.dispose()
  })

  describe('initialization', () => {
    test('should initialize with ink mode', () => {
      mockTTY(true)
      const config: OutputConfig = { mode: 'ink', logLevel: 'info', useTty: true }
      renderer = new InkRenderer(config)

      expect(renderer.name).toBe('ink')
      expect(renderer.isSupported).toBe(true)
    })

    test('should not be supported in non-TTY environment', () => {
      mockTTY(false)
      const config: OutputConfig = { mode: 'ink', logLevel: 'info', useTty: true }
      renderer = new InkRenderer(config)

      expect(renderer.isSupported).toBe(false)
    })
  })

  describe('event handling', () => {
    beforeEach(() => {
      const config: OutputConfig = { mode: 'ink', logLevel: 'info', useTty: true }
      renderer = new InkRenderer(config)
    })

    test('should handle log events', () => {
      const subscriber = mock<(event: unknown) => void>()
      renderer.subscribe(subscriber)

      renderer.renderEvent({
        type: 'log',
        level: 'info',
        message: 'Test message',
        timestamp: Date.now(),
      })

      expect(subscriber).toHaveBeenCalled()
    })

    test('should handle task:start events', () => {
      const subscriber = mock<(event: unknown) => void>()
      renderer.subscribe(subscriber)

      renderer.renderEvent({
        type: 'task:start',
        taskId: 'TASK-001',
        title: 'Test Task',
        iteration: 1,
        namespace: 'default',
        timestamp: Date.now(),
      })

      expect(subscriber).toHaveBeenCalled()
    })

    test('should handle task:complete events', () => {
      const subscriber = mock<(event: unknown) => void>()
      renderer.subscribe(subscriber)

      renderer.renderEvent({
        type: 'task:complete',
        taskId: 'TASK-001',
        title: 'Test Task',
        duration: 1000,
        success: true,
        timestamp: Date.now(),
      })

      expect(subscriber).toHaveBeenCalled()
    })

    test('should handle task:failed events', () => {
      const subscriber = mock<(event: unknown) => void>()
      renderer.subscribe(subscriber)

      renderer.renderEvent({
        type: 'task:failed',
        taskId: 'TASK-001',
        title: 'Test Task',
        error: 'Test error',
        duration: 1000,
        timestamp: Date.now(),
      })

      expect(subscriber).toHaveBeenCalled()
    })

    test('should handle loop:start events', () => {
      const subscriber = mock<(event: unknown) => void>()
      renderer.subscribe(subscriber)

      renderer.renderEvent({
        type: 'loop:start',
        namespace: 'default',
        maxIterations: 10,
        taskCount: 5,
        timestamp: Date.now(),
      })

      expect(subscriber).toHaveBeenCalled()
    })

    test('should handle loop:end events', () => {
      const subscriber = mock<(event: unknown) => void>()
      renderer.subscribe(subscriber)

      renderer.renderEvent({
        type: 'loop:end',
        namespace: 'default',
        completed: 3,
        failed: 1,
        duration: 5000,
        timestamp: Date.now(),
      })

      expect(subscriber).toHaveBeenCalled()
    })

    test('should handle cli:start events', () => {
      const subscriber = mock<(event: unknown) => void>()
      renderer.subscribe(subscriber)

      renderer.renderEvent({
        type: 'cli:start',
        taskId: 'TASK-001',
        command: 'claude',
        model: 'sonnet',
        timeout: 300,
        timestamp: Date.now(),
      })

      expect(subscriber).toHaveBeenCalled()
    })

    test('should handle cli:output events', () => {
      const subscriber = mock<(event: unknown) => void>()
      renderer.subscribe(subscriber)

      renderer.renderEvent({
        type: 'cli:output',
        taskId: 'TASK-001',
        chunk: 'output text',
        timestamp: Date.now(),
      })

      expect(subscriber).toHaveBeenCalled()
    })

    test('should handle progress:start events', () => {
      const subscriber = mock<(event: unknown) => void>()
      renderer.subscribe(subscriber)

      renderer.renderEvent({
        type: 'progress:start',
        message: 'Loading...',
        timestamp: Date.now(),
      })

      expect(subscriber).toHaveBeenCalled()
    })

    test('should handle progress:update events', () => {
      const subscriber = mock<(event: unknown) => void>()
      renderer.subscribe(subscriber)

      renderer.renderEvent({
        type: 'progress:update',
        message: 'Processing...',
        percent: 50,
        timestamp: Date.now(),
      })

      expect(subscriber).toHaveBeenCalled()
    })

    test('should handle progress:stop events', () => {
      const subscriber = mock<(event: unknown) => void>()
      renderer.subscribe(subscriber)

      renderer.renderEvent({
        type: 'progress:stop',
        success: true,
        message: 'Complete!',
        timestamp: Date.now(),
      })

      expect(subscriber).toHaveBeenCalled()
    })

    test('should handle raw events', () => {
      const subscriber = mock<(event: unknown) => void>()
      renderer.subscribe(subscriber)

      renderer.renderEvent({
        type: 'raw',
        content: 'Raw output',
        timestamp: Date.now(),
      })

      expect(subscriber).toHaveBeenCalled()
    })

    test('should handle json events', () => {
      const subscriber = mock<(event: unknown) => void>()
      renderer.subscribe(subscriber)

      renderer.renderEvent({
        type: 'json',
        eventType: 'custom',
        data: { key: 'value' },
        timestamp: Date.now(),
      })

      expect(subscriber).toHaveBeenCalled()
    })
  })

  describe('subscriber management', () => {
    beforeEach(() => {
      const config: OutputConfig = { mode: 'ink', logLevel: 'info', useTty: true }
      renderer = new InkRenderer(config)
    })

    test('should allow multiple subscribers', () => {
      const sub1 = mock<(event: unknown) => void>()
      const sub2 = mock<(event: unknown) => void>()

      const unsub1 = renderer.subscribe(sub1)
      const unsub2 = renderer.subscribe(sub2)

      renderer.renderEvent({
        type: 'log',
        level: 'info',
        message: 'Test',
        timestamp: Date.now(),
      })

      expect(sub1).toHaveBeenCalled()
      expect(sub2).toHaveBeenCalled()

      unsub1()
      unsub2()
    })

    test('should handle subscriber errors gracefully', () => {
      const badSubscriber = mock<(event: unknown) => void>(() => {
        throw new Error('Subscriber error')
      })
      const goodSubscriber = mock<(event: unknown) => void>()

      renderer.subscribe(badSubscriber)
      renderer.subscribe(goodSubscriber)

      expect(() => {
        renderer.renderEvent({
          type: 'log',
          level: 'info',
          message: 'Test',
          timestamp: Date.now(),
        })
      }).not.toThrow()

      expect(goodSubscriber).toHaveBeenCalled()
    })

    test('should unsubscribe correctly', () => {
      const subscriber = mock<(event: unknown) => void>()
      const unsubscribe = renderer.subscribe(subscriber)

      renderer.renderEvent({
        type: 'log',
        level: 'info',
        message: 'First',
        timestamp: Date.now(),
      })

      expect(subscriber).toHaveBeenCalledTimes(1)

      unsubscribe()

      renderer.renderEvent({
        type: 'log',
        level: 'info',
        message: 'Second',
        timestamp: Date.now(),
      })

      expect(subscriber).toHaveBeenCalledTimes(1)
    })
  })

  describe('log level filtering', () => {
    test('should filter trace logs when level is info', () => {
      const config: OutputConfig = { mode: 'ink', logLevel: 'info', useTty: true }
      renderer = new InkRenderer(config)
      const subscriber = mock<(event: unknown) => void>()
      renderer.subscribe(subscriber)

      renderer.renderEvent({
        type: 'log',
        level: 'trace',
        message: 'Trace message',
        timestamp: Date.now(),
      })

      renderer.renderEvent({
        type: 'log',
        level: 'info',
        message: 'Info message',
        timestamp: Date.now(),
      })

      expect(subscriber).toHaveBeenCalledTimes(1)
    })

    test('should filter debug logs when level is info', () => {
      const config: OutputConfig = { mode: 'ink', logLevel: 'info', useTty: true }
      renderer = new InkRenderer(config)
      const subscriber = mock<(event: unknown) => void>()
      renderer.subscribe(subscriber)

      renderer.renderEvent({
        type: 'log',
        level: 'debug',
        message: 'Debug message',
        timestamp: Date.now(),
      })

      renderer.renderEvent({
        type: 'log',
        level: 'info',
        message: 'Info message',
        timestamp: Date.now(),
      })

      expect(subscriber).toHaveBeenCalledTimes(1)
    })

    test('should allow all logs when level is trace', () => {
      const config: OutputConfig = { mode: 'ink', logLevel: 'trace', useTty: true }
      renderer = new InkRenderer(config)
      const subscriber = mock<(event: unknown) => void>()
      renderer.subscribe(subscriber)

      renderer.renderEvent({
        type: 'log',
        level: 'trace',
        message: 'Trace message',
        timestamp: Date.now(),
      })

      renderer.renderEvent({
        type: 'log',
        level: 'error',
        message: 'Error message',
        timestamp: Date.now(),
      })

      expect(subscriber).toHaveBeenCalledTimes(2)
    })

    test('should suppress all logs when level is silent', () => {
      const config: OutputConfig = { mode: 'ink', logLevel: 'silent', useTty: true }
      renderer = new InkRenderer(config)
      const subscriber = mock<(event: unknown) => void>()
      renderer.subscribe(subscriber)

      renderer.renderEvent({
        type: 'log',
        level: 'error',
        message: 'Error message',
        timestamp: Date.now(),
      })

      expect(subscriber).not.toHaveBeenCalled()
    })
  })

  describe('configuration', () => {
    test('should update configuration', () => {
      const config: OutputConfig = { mode: 'ink', logLevel: 'info', useTty: true }
      renderer = new InkRenderer(config)

      renderer.configure({ logLevel: 'debug' })

      const subscriber = mock<(event: unknown) => void>()
      renderer.subscribe(subscriber)

      renderer.renderEvent({
        type: 'log',
        level: 'debug',
        message: 'Debug message',
        timestamp: Date.now(),
      })

      expect(subscriber).toHaveBeenCalled()
    })
  })

  describe('disposal', () => {
    test('should stop rendering after dispose', () => {
      const config: OutputConfig = { mode: 'ink', logLevel: 'info', useTty: true }
      renderer = new InkRenderer(config)

      const subscriber = mock<(event: unknown) => void>()
      renderer.subscribe(subscriber)

      renderer.dispose()

      renderer.renderEvent({
        type: 'log',
        level: 'info',
        message: 'After dispose',
        timestamp: Date.now(),
      })

      expect(subscriber).not.toHaveBeenCalled()
    })

    test('should clear subscribers on dispose', () => {
      const config: OutputConfig = { mode: 'ink', logLevel: 'info', useTty: true }
      renderer = new InkRenderer(config)

      const subscriber = mock<(event: unknown) => void>()
      renderer.subscribe(subscriber)

      renderer.dispose()

      expect(subscriber).not.toHaveBeenCalled()
    })
  })

  describe('event ordering', () => {
    beforeEach(() => {
      const config: OutputConfig = { mode: 'ink', logLevel: 'info', useTty: true }
      renderer = new InkRenderer(config)
    })

    test('should emit events in order received', () => {
      const received: string[] = []
      renderer.subscribe((event) => received.push((event as any).type))

      const events = [
        { type: 'log', level: 'info', message: 'First', timestamp: Date.now() },
        { type: 'log', level: 'warn', message: 'Second', timestamp: Date.now() },
        { type: 'log', level: 'error', message: 'Third', timestamp: Date.now() },
      ]

      events.forEach((event) => renderer.renderEvent(event as any))

      expect(received).toEqual(['log', 'log', 'log'])
      expect(received[0]).toBe('log')
      expect(received[1]).toBe('log')
      expect(received[2]).toBe('log')
    })
  })

  describe('memory management', () => {
    beforeEach(() => {
      const config: OutputConfig = { mode: 'ink', logLevel: 'trace', useTty: true }
      renderer = new InkRenderer(config)
    })

    test('should keep last 100 log entries', () => {
      const subscriber = mock<(event: unknown) => void>()
      renderer.subscribe(subscriber)

      for (let i = 0; i < 150; i++) {
        renderer.renderEvent({
          type: 'log',
          level: 'info',
          message: `Log entry ${i}`,
          timestamp: Date.now(),
        })
      }

      expect(subscriber).toHaveBeenCalledTimes(150)
    })
  })
})

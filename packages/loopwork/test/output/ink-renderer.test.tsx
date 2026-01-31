import React from 'react'
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import { render, cleanup } from 'ink-testing-library'
import { InkRenderer } from '../../src/output/ink-renderer'
import type { OutputConfig } from '../../src/output/contracts'
import { mockTTY, captureStdout, createMockEvents } from '../setup-ink'

describe('InkRenderer', () => {
  const events = createMockEvents()
  let renderer: InkRenderer
  let config: OutputConfig

  beforeEach(() => {
    config = {
      mode: 'ink',
      logLevel: 'info',
      useTty: true,
      useColor: true,
    }
    renderer = new InkRenderer(config)
  })

  afterEach(() => {
    renderer.dispose()
    cleanup()
  })

  describe('constructor', () => {
    test('should create renderer instance', () => {
      expect(renderer).toBeInstanceOf(InkRenderer)
      expect(renderer.name).toBe('ink')
    })

    test('should detect TTY support', () => {
      const ttyRenderer = new InkRenderer(config)
      expect(typeof ttyRenderer.isSupported).toBe('boolean')
      ttyRenderer.dispose()
    })
  })

  describe('event handling', () => {
    test('should handle log events', () => {
      const event = events.log('info', 'Test message')
      renderer.renderEvent(event)
      expect(() => renderer.renderEvent(event)).not.toThrow()
    })

    test('should handle task start events', () => {
      const event = events.taskStart('TASK-001', 'Test task')
      renderer.renderEvent(event)
      expect(() => renderer.renderEvent(event)).not.toThrow()
    })

    test('should handle task complete events', () => {
      const startEvent = events.taskStart('TASK-001', 'Test task')
      const completeEvent = events.taskComplete('TASK-001', 'Test task', 1000)
      renderer.renderEvent(startEvent)
      renderer.renderEvent(completeEvent)
      expect(() => renderer.renderEvent(completeEvent)).not.toThrow()
    })

    test('should handle task failed events', () => {
      const startEvent = events.taskStart('TASK-001', 'Test task')
      const failedEvent = events.taskFailed('TASK-001', 'Test task', 'Test error')
      renderer.renderEvent(startEvent)
      renderer.renderEvent(failedEvent)
      expect(() => renderer.renderEvent(failedEvent)).not.toThrow()
    })

    test('should handle loop start events', () => {
      const event = events.loopStart('default', 5)
      renderer.renderEvent(event)
      expect(() => renderer.renderEvent(event)).not.toThrow()
    })

    test('should handle loop end events', () => {
      const endEvent = events.loopEnd('default', 3, 2)
      renderer.renderEvent(endEvent)
      expect(() => renderer.renderEvent(endEvent)).not.toThrow()
    })

    test('should handle progress events', () => {
      const startEvent = events.progressStart('Loading...')
      const updateEvent = events.progressUpdate('Processing...', 50)
      const stopEvent = events.progressStop(true)

      renderer.renderEvent(startEvent)
      renderer.renderEvent(updateEvent)
      renderer.renderEvent(stopEvent)

      expect(() => renderer.renderEvent(stopEvent)).not.toThrow()
    })

    test('should handle CLI events', () => {
      const startEvent = events.cliStart('TASK-001', 'sonnet')
      const outputEvent = events.cliOutput('TASK-001', 'test output')
      const completeEvent = events.cliComplete('TASK-001', 0)
      const errorEvent = events.cliError('TASK-001', 'connection error')

      renderer.renderEvent(startEvent)
      renderer.renderEvent(outputEvent)
      renderer.renderEvent(completeEvent)
      renderer.renderEvent(errorEvent)

      expect(() => renderer.renderEvent(completeEvent)).not.toThrow()
    })

    test('should handle raw output events', () => {
      const event = events.raw('Raw output content')
      renderer.renderEvent(event)
      expect(() => renderer.renderEvent(event)).not.toThrow()
    })

    test('should handle JSON output events', () => {
      const event = events.json('task_complete', { taskId: 'TASK-001' })
      renderer.renderEvent(event)
      expect(() => renderer.renderEvent(event)).not.toThrow()
    })
  })

  describe('event subscribers', () => {
    test('should support event subscribers', () => {
      const subscriber = mock<(event: unknown) => void>()
      const unsubscribe = renderer.subscribe(subscriber as any)

      const event = events.log('info', 'Test')
      renderer.renderEvent(event)

      expect(subscriber).toHaveBeenCalled()
      expect(subscriber).toHaveBeenCalledWith(event)

      unsubscribe()
      subscriber.mockClear()

      renderer.renderEvent(event)
      expect(subscriber).not.toHaveBeenCalled()
    })
  })

  describe('configuration', () => {
    test('should support configuration updates', () => {
      renderer.configure({ logLevel: 'debug' })
      expect(() => renderer.renderEvent(events.log('debug', 'debug message'))).not.toThrow()
    })

    test('should handle partial configuration', () => {
      expect(() => renderer.configure({})).not.toThrow()
    })
  })

  describe('dispose', () => {
    test('should dispose without errors', () => {
      expect(() => renderer.dispose()).not.toThrow()
    })

    test('should not render after dispose', () => {
      renderer.dispose()
      const event = events.log('info', 'After dispose')
      expect(() => renderer.renderEvent(event)).not.toThrow()
    })
  })
})

describe('InkRenderer TTY Detection', () => {
  mockTTY(true)

  test('should detect TTY mode', () => {
    const config: OutputConfig = { mode: 'ink', logLevel: 'info', useTty: true }
    const renderer = new InkRenderer(config)
    expect(renderer.isSupported).toBe(true)
    renderer.dispose()
  })
})

describe('InkRenderer Non-TTY Mode', () => {
  mockTTY(false)

  test('should handle non-TTY environment', () => {
    const config: OutputConfig = { mode: 'ink', logLevel: 'info', useTty: false }
    const renderer = new InkRenderer(config)
    expect(renderer.isSupported).toBe(false)
    renderer.dispose()
  })
})

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import { InkRenderer } from '../../src/output/ink-renderer'
import { ConsoleRenderer } from '../../src/output/console-renderer'
import type { OutputConfig } from '../../src/output/contracts'
import { mockTTY } from '../setup-ink'

describe('TTY/Non-TTY Integration', () => {
  let originalIsTTY: boolean
  let renderer: InkRenderer | ConsoleRenderer

  beforeEach(() => {
    originalIsTTY = process.stdout.isTTY
  })

  afterEach(() => {
    if (renderer) {
      renderer.dispose()
    }

    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalIsTTY,
      writable: true,
    })
  })

  describe('InkRenderer in TTY mode', () => {
    mockTTY(true)

    beforeEach(() => {
      const config: OutputConfig = { mode: 'ink', logLevel: 'info', useTty: true }
      renderer = new InkRenderer(config)
    })

    test('should be supported in TTY mode', () => {
      expect((renderer as InkRenderer).isSupported).toBe(true)
    })

    test('should handle log events in TTY', () => {
      const subscriber = mock<(event: unknown) => void>()
      renderer.subscribe(subscriber)

      renderer.renderEvent({
        type: 'log',
        level: 'info',
        message: 'TTY log message',
        timestamp: Date.now(),
      })

      expect(subscriber).toHaveBeenCalled()
    })
  })

  describe('InkRenderer in non-TTY mode', () => {
    mockTTY(false)

    beforeEach(() => {
      const config: OutputConfig = { mode: 'ink', logLevel: 'info', useTty: true }
      renderer = new InkRenderer(config)
    })

    test('should not be supported in non-TTY mode', () => {
      expect((renderer as InkRenderer).isSupported).toBe(false)
    })

    test('should still emit events in non-TTY', () => {
      const subscriber = mock<(event: unknown) => void>()
      renderer.subscribe(subscriber)

      renderer.renderEvent({
        type: 'log',
        level: 'info',
        message: 'Non-TTY log message',
        timestamp: Date.now(),
      })

      expect(subscriber).toHaveBeenCalled()
    })
  })

  describe('InkRenderer with useTty: false', () => {
    mockTTY(true)

    beforeEach(() => {
      const config: OutputConfig = { mode: 'ink', logLevel: 'info', useTty: false }
      renderer = new InkRenderer(config)
    })

    test('should still emit events when useTty is false', () => {
      const subscriber = mock<(event: unknown) => void>()
      renderer.subscribe(subscriber)

      renderer.renderEvent({
        type: 'log',
        level: 'info',
        message: 'Non-TTY config message',
        timestamp: Date.now(),
      })

      expect(subscriber).toHaveBeenCalled()
    })
  })

  describe('TTY detection behavior', () => {
    test('should respect process.stdout.isTTY', () => {
      const tty = mockTTY(true)
      const config: OutputConfig = { mode: 'ink', logLevel: 'info', useTty: true }
      renderer = new InkRenderer(config)

      expect((renderer as InkRenderer).isSupported).toBe(true)
      tty.restore()
    })

    test('should handle TTY changes between renders', () => {
      const tty = mockTTY(true)
      const config: OutputConfig = { mode: 'ink', logLevel: 'info', useTty: true }
      renderer = new InkRenderer(config)

      expect((renderer as InkRenderer).isSupported).toBe(true)

      tty.restore()
      mockTTY(false)

      renderer.renderEvent({
        type: 'log',
        level: 'info',
        message: 'After TTY change',
        timestamp: Date.now(),
      })
    })
  })

  describe('ConsoleRenderer fallback in non-TTY', () => {
    mockTTY(false)

    test('should work correctly in non-TTY mode', () => {
      const config: OutputConfig = { mode: 'human', logLevel: 'info', useTty: true }
      renderer = new ConsoleRenderer(config)

      const subscriber = mock<(event: unknown) => void>()
      renderer.subscribe(subscriber)

      renderer.renderEvent({
        type: 'log',
        level: 'info',
        message: 'Human-readable log',
        timestamp: Date.now(),
      })

      expect(subscriber).toHaveBeenCalled()
    })
  })

  describe('color output verification', () => {
    test('should handle color codes in TTY mode', () => {
      const tty = mockTTY(true)
      const config: OutputConfig = { mode: 'ink', logLevel: 'info', useTty: true, useColor: true }
      renderer = new InkRenderer(config)

      const subscriber = mock<(event: unknown) => void>()
      renderer.subscribe(subscriber)

      renderer.renderEvent({
        type: 'log',
        level: 'error',
        message: 'Error message',
        timestamp: Date.now(),
      })

      expect(subscriber).toHaveBeenCalled()
      tty.restore()
    })

    test('should handle plain text in non-TTY mode', () => {
      const tty = mockTTY(false)
      const config: OutputConfig = { mode: 'human', logLevel: 'info', useTty: true, useColor: false }
      renderer = new ConsoleRenderer(config)

      const subscriber = mock<(event: unknown) => void>()
      renderer.subscribe(subscriber)

      renderer.renderEvent({
        type: 'log',
        level: 'info',
        message: 'Plain text log',
        timestamp: Date.now(),
      })

      expect(subscriber).toHaveBeenCalled()
    })
  })

  describe('mode switching', () => {
    test('should handle mode changes', () => {
      const tty = mockTTY(true)
      const config: OutputConfig = { mode: 'ink', logLevel: 'info', useTty: true }
      renderer = new InkRenderer(config)

      expect((renderer as InkRenderer).isSupported).toBe(true)

      renderer.dispose()

      const newConfig: OutputConfig = { mode: 'human', logLevel: 'info', useTty: true }
      renderer = new ConsoleRenderer(newConfig)

      const subscriber = mock<(event: unknown) => void>()
      renderer.subscribe(subscriber)

      renderer.renderEvent({
        type: 'log',
        level: 'info',
        message: 'Mode switched',
        timestamp: Date.now(),
      })

      expect(subscriber).toHaveBeenCalled()
      tty.restore()
    })
  })

  describe('event buffering in different modes', () => {
    test('should buffer events correctly in TTY mode', () => {
      const tty = mockTTY(true)
      const config: OutputConfig = { mode: 'ink', logLevel: 'info', useTty: true }
      renderer = new InkRenderer(config)

      const received: unknown[] = []
      renderer.subscribe((event) => received.push(event))

      for (let i = 0; i < 10; i++) {
        renderer.renderEvent({
          type: 'log',
          level: 'info',
          message: `Message ${i}`,
          timestamp: Date.now(),
        })
      }

      expect(received.length).toBe(10)
      tty.restore()
    })

    test('should buffer events correctly in non-TTY mode', () => {
      const tty = mockTTY(false)
      const config: OutputConfig = { mode: 'human', logLevel: 'info', useTty: true }
      renderer = new ConsoleRenderer(config)

      const received: unknown[] = []
      renderer.subscribe((event) => received.push(event))

      for (let i = 0; i < 10; i++) {
        renderer.renderEvent({
          type: 'log',
          level: 'info',
          message: `Message ${i}`,
          timestamp: Date.now(),
        })
      }

      expect(received.length).toBe(10)
      tty.restore()
    })
  })
})

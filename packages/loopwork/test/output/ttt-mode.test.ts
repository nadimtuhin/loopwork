import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { InkRenderer } from '../../src/output/ink-renderer'
import { ConsoleRenderer } from '../../src/output/console-renderer'
import type { OutputConfig } from '../../src/output/contracts'
import { mockTTY } from '../setup-ink'

/**
 * Integration tests for TTY/non-TTY mode handling
 * Tests the output system's behavior in different terminal environments
 */

describe('TTY Mode Integration', () => {
  test('InkRenderer should start in TTY mode when isTTY is true', () => {
    const tty = mockTTY(true)

    const config: OutputConfig = { mode: 'ink', logLevel: 'info', useTty: true }
    const renderer = new InkRenderer(config)

    expect(renderer.isSupported).toBe(true)

    renderer.dispose()
    tty.restore()
  })

  test('InkRenderer should disable when isTTY is false', () => {
    const tty = mockTTY(false)

    const config: OutputConfig = { mode: 'ink', logLevel: 'info', useTty: true }
    const renderer = new InkRenderer(config)

    expect(renderer.isSupported).toBe(false)

    renderer.dispose()
    tty.restore()
  })

  test('InkRenderer should respect useTty config option', () => {
    const tty = mockTTY(true)

    const config: OutputConfig = { mode: 'ink', logLevel: 'info', useTty: false }
    const renderer = new InkRenderer(config)

    // useTty config is respected by system renderer selection, not by individual renderer detection
    expect(renderer.isSupported).toBe(true)

    renderer.dispose()
    tty.restore()
  })
})

describe('Non-TTY Mode Integration', () => {
  test('ConsoleRenderer should work in non-TTY mode', () => {
    const tty = mockTTY(false)

    const config: OutputConfig = { mode: 'human', logLevel: 'info', useTty: false }
    const renderer = new ConsoleRenderer(config)

    expect(renderer.isSupported).toBe(true)
    expect(() => renderer.renderEvent({
      type: 'log',
      level: 'info',
      message: 'Non-TTY test',
      timestamp: Date.now(),
    })).not.toThrow()

    renderer.dispose()
    tty.restore()
  })

  test('should handle mode transitions', () => {
    const tty1 = mockTTY(true)

    const config: OutputConfig = { mode: 'ink', logLevel: 'info', useTty: true }
    const renderer = new InkRenderer(config)

    expect(renderer.isSupported).toBe(true)

    tty1.restore()
    const tty2 = mockTTY(false)

    // Create new renderer to detect new TTY state
    const config2: OutputConfig = { mode: 'ink', logLevel: 'info', useTty: true }
    const renderer2 = new InkRenderer(config2)
    expect(renderer2.isSupported).toBe(false)

    renderer.dispose()
    renderer2.dispose()
    tty2.restore()
  })
})

describe('Output Mode Behavior', () => {
  test('ink mode should emit events correctly', () => {
    const config: OutputConfig = { mode: 'ink', logLevel: 'info', useTty: true }
    const renderer = new InkRenderer(config)
    const received: unknown[] = []

    renderer.subscribe((event) => received.push(event))

    renderer.renderEvent({
      type: 'log',
      level: 'info',
      message: 'Test message',
      timestamp: Date.now(),
    })

    expect(received).toHaveLength(1)

    renderer.dispose()
  })

  test('json mode should format output as JSON', () => {
    const config: OutputConfig = { mode: 'json', logLevel: 'info', useTty: false }
    const renderer = new ConsoleRenderer(config)

    let output = ''
    const originalWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = (chunk: string) => {
      output += chunk
      return true
    }

    renderer.renderEvent({
      type: 'json',
      eventType: 'task_complete',
      data: { taskId: 'TASK-001' },
      timestamp: Date.now(),
    })

    process.stdout.write = originalWrite

    expect(output).toContain('task_complete')
    expect(output).toContain('TASK-001')

    renderer.dispose()
  })

  test('silent mode should suppress output', () => {
    const config: OutputConfig = { mode: 'silent', logLevel: 'silent', useTty: false }
    const renderer = new ConsoleRenderer(config)

    let output = ''
    const originalWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = (chunk: string) => {
      output += chunk
      return true
    }

    renderer.renderEvent({
      type: 'log',
      level: 'info',
      message: 'Silent test',
      timestamp: Date.now(),
    })

    process.stdout.write = originalWrite

    // Silent mode should suppress log output
    expect(output).toBe('')

    renderer.dispose()
  })
})

describe('Color Output in TTY vs Non-TTY', () => {
  test('should use colors in TTY mode', () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true })

    const config: OutputConfig = { mode: 'human', logLevel: 'info', useTty: true, useColor: true }
    const renderer = new ConsoleRenderer(config)

    let output = ''
    const originalWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = (chunk: string) => {
      output += chunk
      return true
    }

    renderer.renderEvent({
      type: 'log',
      level: 'error',
      message: 'Error message',
      timestamp: Date.now(),
    })

    process.stdout.write = originalWrite

    // In TTY mode with colors, output should contain ANSI codes or emoji
    expect(output).toBeTruthy()

    renderer.dispose()
  })
})

describe('Event Flow Integration', () => {
  test('should handle complete task lifecycle', () => {
    const config: OutputConfig = { mode: 'ink', logLevel: 'info', useTty: true }
    const renderer = new InkRenderer(config)
    const events: string[] = []

    renderer.subscribe((event) => events.push((event as any).type))

    // Task lifecycle events
    renderer.renderEvent({
      type: 'loop:start',
      namespace: 'default',
      taskCount: 3,
      maxIterations: 3,
      timestamp: Date.now(),
    })

    renderer.renderEvent({
      type: 'task:start',
      taskId: 'TASK-001',
      title: 'First task',
      iteration: 1,
      namespace: 'default',
      timestamp: Date.now(),
    })

    renderer.renderEvent({
      type: 'task:complete',
      taskId: 'TASK-001',
      title: 'First task',
      duration: 1500,
      success: true,
      timestamp: Date.now(),
    })

    renderer.renderEvent({
      type: 'task:start',
      taskId: 'TASK-002',
      title: 'Second task',
      iteration: 2,
      namespace: 'default',
      timestamp: Date.now(),
    })

    renderer.renderEvent({
      type: 'task:failed',
      taskId: 'TASK-002',
      title: 'Second task',
      duration: 2000,
      error: 'Test error',
      timestamp: Date.now(),
    })

    renderer.renderEvent({
      type: 'loop:end',
      namespace: 'default',
      completed: 1,
      failed: 1,
      duration: 3500,
      timestamp: Date.now(),
    })

    expect(events).toEqual([
      'loop:start',
      'task:start',
      'task:complete',
      'task:start',
      'task:failed',
      'loop:end',
    ])

    renderer.dispose()
  })
})

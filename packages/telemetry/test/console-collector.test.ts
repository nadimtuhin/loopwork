import { describe, expect, test, beforeEach } from 'bun:test'
import { ConsoleMetricsCollector, createConsoleMetricsCollector } from '../src/console-collector'

describe('ConsoleMetricsCollector', () => {
  let stdoutChunks: string[]
  let stderrChunks: string[]
  let mockStdout: NodeJS.WriteStream
  let mockStderr: NodeJS.WriteStream

  beforeEach(() => {
    stdoutChunks = []
    stderrChunks = []
    
    mockStdout = {
      write: (chunk: string | Buffer) => {
        stdoutChunks.push(chunk.toString())
        return true
      },
    } as NodeJS.WriteStream
    
    mockStderr = {
      write: (chunk: string | Buffer) => {
        stderrChunks.push(chunk.toString())
        return true
      },
    } as NodeJS.WriteStream
  })

  test('should write increment metrics to stdout', () => {
    const collector = new ConsoleMetricsCollector({
      outputStream: mockStdout,
      errorStream: mockStderr,
      includeTimestamp: false,
    })

    collector.increment('requests', 5)

    expect(stdoutChunks.length).toBe(1)
    expect(stdoutChunks[0]).toContain('[METRICS]')
    expect(stdoutChunks[0]).toContain('increment')
    expect(stdoutChunks[0]).toContain('requests')
    expect(stdoutChunks[0]).toContain('5')
  })

  test('should default increment value to 1', () => {
    const collector = new ConsoleMetricsCollector({
      outputStream: mockStdout,
      errorStream: mockStderr,
      includeTimestamp: false,
    })

    collector.increment('requests')

    expect(stdoutChunks[0]).toContain('1')
  })

  test('should write decrement metrics to stdout', () => {
    const collector = new ConsoleMetricsCollector({
      outputStream: mockStdout,
      errorStream: mockStderr,
      includeTimestamp: false,
    })

    collector.decrement('queue_size', 2)

    expect(stdoutChunks.length).toBe(1)
    expect(stdoutChunks[0]).toContain('decrement')
    expect(stdoutChunks[0]).toContain('queue_size')
    expect(stdoutChunks[0]).toContain('2')
  })

  test('should default decrement value to 1', () => {
    const collector = new ConsoleMetricsCollector({
      outputStream: mockStdout,
      errorStream: mockStderr,
      includeTimestamp: false,
    })

    collector.decrement('queue_size')

    expect(stdoutChunks[0]).toContain('1')
  })

  test('should write gauge metrics to stdout', () => {
    const collector = new ConsoleMetricsCollector({
      outputStream: mockStdout,
      errorStream: mockStderr,
      includeTimestamp: false,
    })

    collector.gauge('memory_usage', 1024)

    expect(stdoutChunks.length).toBe(1)
    expect(stdoutChunks[0]).toContain('gauge')
    expect(stdoutChunks[0]).toContain('memory_usage')
    expect(stdoutChunks[0]).toContain('1024')
  })

  test('should write timing metrics to stdout', () => {
    const collector = new ConsoleMetricsCollector({
      outputStream: mockStdout,
      errorStream: mockStderr,
      includeTimestamp: false,
    })

    collector.timing('request_duration', 250)

    expect(stdoutChunks.length).toBe(1)
    expect(stdoutChunks[0]).toContain('timing')
    expect(stdoutChunks[0]).toContain('request_duration')
    expect(stdoutChunks[0]).toContain('250')
  })

  test('should include tags when provided', () => {
    const collector = new ConsoleMetricsCollector({
      outputStream: mockStdout,
      errorStream: mockStderr,
      includeTimestamp: false,
    })

    collector.increment('requests', 1, { method: 'GET', status: '200' })

    expect(stdoutChunks[0]).toContain('{method=GET,status=200}')
  })

  test('should handle tags with special characters', () => {
    const collector = new ConsoleMetricsCollector({
      outputStream: mockStdout,
      errorStream: mockStderr,
      includeTimestamp: false,
    })

    collector.increment('requests', 1, { path: '/api/v1/users', status: '200 OK' })

    expect(stdoutChunks[0]).toContain('path=/api/v1/users')
    expect(stdoutChunks[0]).toContain('status="200 OK"')
  })

  test('should include timestamp when configured', () => {
    const collector = new ConsoleMetricsCollector({
      outputStream: mockStdout,
      errorStream: mockStderr,
      includeTimestamp: true,
      timestampFormat: 'iso',
    })

    collector.increment('requests')

    expect(stdoutChunks[0]).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  test('should use custom prefix when configured', () => {
    const collector = new ConsoleMetricsCollector({
      outputStream: mockStdout,
      errorStream: mockStderr,
      includeTimestamp: false,
      prefix: '[TELEMETRY]',
    })

    collector.increment('requests')

    expect(stdoutChunks[0]).toContain('[TELEMETRY]')
  })

  test('should use unix timestamp format when configured', () => {
    const collector = new ConsoleMetricsCollector({
      outputStream: mockStdout,
      errorStream: mockStderr,
      includeTimestamp: true,
      timestampFormat: 'unix',
    })

    collector.increment('requests')

    expect(stdoutChunks[0]).toMatch(/^\d{13}/)
  })

  test('factory function should create collector with default config', () => {
    const collector = createConsoleMetricsCollector()

    expect(collector).toBeInstanceOf(ConsoleMetricsCollector)
  })

  test('factory function should accept config', () => {
    const collector = createConsoleMetricsCollector({
      includeTimestamp: false,
      prefix: '[CUSTOM]',
    })

    expect(collector).toBeInstanceOf(ConsoleMetricsCollector)
  })

  test('flush should not throw', () => {
    const collector = new ConsoleMetricsCollector({
      outputStream: mockStdout,
      errorStream: mockStderr,
    })

    expect(() => collector.flush()).not.toThrow()
  })

  test('should handle high volume metrics efficiently', () => {
    const collector = new ConsoleMetricsCollector({
      outputStream: mockStdout,
      errorStream: mockStderr,
      includeTimestamp: false,
    })

    const start = Date.now()
    for (let i = 0; i < 1000; i++) {
      collector.increment('requests')
    }
    const duration = Date.now() - start

    expect(stdoutChunks.length).toBe(1000)
    expect(duration).toBeLessThan(100)
  })
})

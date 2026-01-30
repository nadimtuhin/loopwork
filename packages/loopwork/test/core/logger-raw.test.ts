import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import { logger, Table, Banner, separator } from '../../src/core/utils'

describe('logger.raw()', () => {
  let stdoutWrite: any
  let originalWrite: any
  let output: string[]

  beforeEach(() => {
    output = []
    originalWrite = process.stdout.write
    stdoutWrite = mock((chunk: string) => {
      output.push(chunk)
      return true
    })
    process.stdout.write = stdoutWrite as any
  })

  afterEach(() => {
    process.stdout.write = originalWrite
  })

  test('should output raw text without formatting', () => {
    logger.raw('Plain text')

    // Should have written line clearing and the text with newline
    expect(output.length).toBeGreaterThan(0)
    const combined = output.join('')
    expect(combined).toContain('Plain text')
  })

  test('should work with Table output', () => {
    const table = new Table(['Name', 'Status'])
    table.addRow(['Task 1', 'Complete'])

    logger.raw(table.render())

    const combined = output.join('')
    expect(combined).toContain('Name')
    expect(combined).toContain('Status')
    expect(combined).toContain('Task 1')
    expect(combined).toContain('┌')
  })

  test('should work with Banner output', () => {
    const banner = new Banner('Test Banner')
    banner.addRow('Key', 'Value')

    logger.raw(banner.render())

    const combined = output.join('')
    expect(combined).toContain('Test Banner')
    expect(combined).toContain('Key')
    expect(combined).toContain('Value')
    expect(combined).toContain('╔')
  })

  test('should work with separator output', () => {
    logger.raw(separator('heavy', 40))

    const combined = output.join('')
    expect(combined).toContain('═')
  })

  test('should not add timestamps or prefixes', () => {
    logger.raw('Test message')

    const combined = output.join('')
    // Should NOT contain typical logger prefixes
    expect(combined).not.toContain('INFO')
    expect(combined).not.toContain('ERROR')
    expect(combined).not.toContain('WARN')
    // Should contain the raw message
    expect(combined).toContain('Test message')
  })
})

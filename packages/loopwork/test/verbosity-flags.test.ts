import { describe, test, expect, beforeEach } from 'bun:test'
import { logger } from '../src/core/utils'

describe('Verbosity Flags Integration', () => {
  beforeEach(() => {
    // Reset logger to default state
    logger.setLogLevel('info')
  })

  test('logger supports all verbosity levels', () => {
    const levels = ['trace', 'debug', 'info', 'warn', 'error', 'silent'] as const

    levels.forEach((level) => {
      logger.setLogLevel(level)
      expect(logger.logLevel).toBe(level)
    })
  })

  test('quiet mode sets error level', () => {
    logger.setLogLevel('error')
    expect(logger.logLevel).toBe('error')
  })

  test('verbose mode sets debug level', () => {
    logger.setLogLevel('debug')
    expect(logger.logLevel).toBe('debug')
  })

  test('very verbose mode sets trace level', () => {
    logger.setLogLevel('trace')
    expect(logger.logLevel).toBe('trace')
  })

  test('logger respects level hierarchy', () => {
    // When set to 'error', only error and silent should be shown
    logger.setLogLevel('error')
    expect(logger._shouldLog('trace')).toBe(false)
    expect(logger._shouldLog('debug')).toBe(false)
    expect(logger._shouldLog('info')).toBe(false)
    expect(logger._shouldLog('warn')).toBe(false)
    expect(logger._shouldLog('error')).toBe(true)

    // When set to 'debug', trace should not be shown but debug and above should
    logger.setLogLevel('debug')
    expect(logger._shouldLog('trace')).toBe(false)
    expect(logger._shouldLog('debug')).toBe(true)
    expect(logger._shouldLog('info')).toBe(true)
    expect(logger._shouldLog('warn')).toBe(true)
    expect(logger._shouldLog('error')).toBe(true)

    // When set to 'trace', all levels should be shown
    logger.setLogLevel('trace')
    expect(logger._shouldLog('trace')).toBe(true)
    expect(logger._shouldLog('debug')).toBe(true)
    expect(logger._shouldLog('info')).toBe(true)
    expect(logger._shouldLog('warn')).toBe(true)
    expect(logger._shouldLog('error')).toBe(true)
  })
})

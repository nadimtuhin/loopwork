import { describe, test, expect, spyOn, beforeEach, afterEach } from 'bun:test'
import { ConsoleLogger } from '../src/logger'
import chalk from 'chalk'

describe('ConsoleLogger', () => {
  let logger: ConsoleLogger
  let logSpy: any
  let errorSpy: any
  let writeSpy: any

  beforeEach(() => {
    logger = new ConsoleLogger({ logLevel: 'debug' })
    logSpy = spyOn(console, 'log').mockImplementation(() => {})
    errorSpy = spyOn(console, 'error').mockImplementation(() => {})
    writeSpy = spyOn(process.stdout, 'write').mockImplementation(() => true as any)
  })

  afterEach(() => {
    logSpy.mockRestore()
    errorSpy.mockRestore()
    writeSpy.mockRestore()
  })

  test('info logs to console', () => {
    logger.info('test message')
    expect(logSpy).toHaveBeenCalled()
    const call = logSpy.mock.calls[0][0]
    expect(call).toContain('info')
    expect(call).toContain('test message')
  })

  test('error logs to console.error', () => {
    logger.error('error message')
    expect(errorSpy).toHaveBeenCalled()
    const call = errorSpy.mock.calls[0][0]
    expect(call).toContain('error')
    expect(call).toContain('error message')
  })

  test('debug logs when level is debug', () => {
    logger.debug('debug message')
    expect(logSpy).toHaveBeenCalled()
  })

  test('debug does not log when level is info', () => {
    logger.setLogLevel('info')
    logger.debug('debug message')
    expect(logSpy).not.toHaveBeenCalled()
  })

  test('update uses \r in TTY', () => {
    // Mock isTTY
    (logger as any).isTTY = true
    logger.update('progress')
    expect(writeSpy).toHaveBeenCalled()
    expect(writeSpy.mock.calls[0][0]).toContain('\r')
    expect(writeSpy.mock.calls[0][0]).toContain('update')
    expect(writeSpy.mock.calls[0][0]).toContain('progress')
  })
  
  test('raw logs directly', () => {
    logger.raw('raw output')
    expect(logSpy).toHaveBeenCalledWith('raw output')
  })
})

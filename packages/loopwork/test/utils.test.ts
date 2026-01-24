import { describe, expect, test, beforeEach, afterEach, spyOn } from 'bun:test'
import { logger, StreamLogger } from '../src/core/utils'

describe('utils', () => {
  describe('logger', () => {
    let consoleSpy: ReturnType<typeof spyOn>

    beforeEach(() => {
      consoleSpy = spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
      consoleSpy.mockRestore()
    })

    test('info logs message', () => {
      logger.info('test message')
      expect(consoleSpy).toHaveBeenCalled()
      const args = consoleSpy.mock.calls[0]
      expect(args.some((a: string) => a.includes('[INFO]') || a.includes('INFO'))).toBe(true)
    })

    test('success logs message', () => {
      logger.success('test message')
      expect(consoleSpy).toHaveBeenCalled()
      const args = consoleSpy.mock.calls[0]
      expect(args.some((a: string) => a.includes('[SUCCESS]') || a.includes('SUCCESS'))).toBe(true)
    })

    test('warn logs message', () => {
      logger.warn('test message')
      expect(consoleSpy).toHaveBeenCalled()
      const args = consoleSpy.mock.calls[0]
      expect(args.some((a: string) => a.includes('[WARN]') || a.includes('WARN'))).toBe(true)
    })

    test('error logs message', () => {
      logger.error('test message')
      expect(consoleSpy).toHaveBeenCalled()
      const args = consoleSpy.mock.calls[0]
      expect(args.some((a: string) => a.includes('[ERROR]') || a.includes('ERROR'))).toBe(true)
    })

    test('debug logs only when LOOPWORK_DEBUG is true', () => {
      const originalDebug = process.env.LOOPWORK_DEBUG

      // Should not log when LOOPWORK_DEBUG is not set
      process.env.LOOPWORK_DEBUG = ''
      logger.debug('test message')
      expect(consoleSpy).not.toHaveBeenCalled()

      // Should log when LOOPWORK_DEBUG is true
      process.env.LOOPWORK_DEBUG = 'true'
      logger.debug('test message')
      expect(consoleSpy).toHaveBeenCalled()

      process.env.LOOPWORK_DEBUG = originalDebug
    })
  })

  describe('StreamLogger', () => {
    let stdoutSpy: ReturnType<typeof spyOn>

    beforeEach(() => {
      stdoutSpy = spyOn(process.stdout, 'write').mockImplementation(() => true)
    })

    afterEach(() => {
      stdoutSpy.mockRestore()
    })

    test('buffers partial lines until newline', () => {
      const logger = new StreamLogger()
      logger.log('partial ')
      expect(stdoutSpy).not.toHaveBeenCalled()

      logger.log('line\n')
      expect(stdoutSpy).toHaveBeenCalled()
      const output = stdoutSpy.mock.calls.map(c => c[0]).join('')
      expect(output).toContain('partial line')
    })

    test('flushes remaining buffer', () => {
      const logger = new StreamLogger()
      logger.log('remaining content')
      expect(stdoutSpy).not.toHaveBeenCalled()

      logger.flush()
      expect(stdoutSpy).toHaveBeenCalled()
      const output = stdoutSpy.mock.calls.map(c => c[0]).join('')
      expect(output).toContain('remaining content')
    })

    test('prefixes output correctly', () => {
      const logger = new StreamLogger('TEST-PREFIX')
      logger.log('prefixed line\n')
      const output = stdoutSpy.mock.calls.map(c => c[0]).join('')
      expect(output).toContain('[TEST-PREFIX]')
      expect(output).toContain('prefixed line')
    })

    test('works without prefix', () => {
      const logger = new StreamLogger()
      logger.log('no prefix line\n')
      const output = stdoutSpy.mock.calls.map(c => c[0]).join('')
      expect(output).toContain('no prefix line')
      expect(output.slice(4)).not.toContain('[')
    })

    test('verifies visual formatting (pipe, dim)', () => {
      const logger = new StreamLogger()
      logger.log('formatted line\n')
      const output = stdoutSpy.mock.calls.map(c => c[0]).join('')
      
      expect(output).toContain('│')
      expect(output).toContain('formatted line')
    })
  })
})

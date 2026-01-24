import { describe, expect, test, beforeEach, afterEach, spyOn } from 'bun:test'
import { logger } from '../src/core/utils'

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
})

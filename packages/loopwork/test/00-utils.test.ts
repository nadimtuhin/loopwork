import { describe, expect, test, beforeEach, afterEach, spyOn, mock } from 'bun:test'
import { logger, StreamLogger, getTimestamp, promptUser } from '../src/core/utils'

describe('utils', () => {
  describe('getTimestamp', () => {
    test('returns formatted timestamp', () => {
      const timestamp = getTimestamp()
      expect(timestamp).toMatch(/\d{1,2}:\d{2}:\d{2}\s(AM|PM)/)
    })
  })

  describe('logger', () => {
    let stdoutSpy: ReturnType<typeof spyOn>
    let stderrSpy: ReturnType<typeof spyOn>

    beforeEach(() => {
      stdoutSpy = spyOn(process.stdout, 'write').mockImplementation(() => true)
      stderrSpy = spyOn(process.stderr, 'write').mockImplementation(() => true)
      logger.setLogLevel('debug') // Ensure all logs are visible
    })

    afterEach(() => {
      stdoutSpy.mockRestore()
      stderrSpy.mockRestore()
      logger.setLogLevel('info') // Reset to default
    })

    test('info logs message', () => {
      logger.info('test message')
      expect(stdoutSpy).toHaveBeenCalled()
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      expect(output).toContain('INFO')
      expect(output).toContain('test message')
    })

    test('success logs message', () => {
      logger.success('test message')
      expect(stdoutSpy).toHaveBeenCalled()
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      expect(output).toContain('SUCCESS')
      expect(output).toContain('test message')
    })

    test('warn logs message', () => {
      logger.warn('test message')
      expect(stdoutSpy).toHaveBeenCalled()
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      expect(output).toContain('WARN')
      expect(output).toContain('test message')
    })

    test('error logs message', () => {
      logger.error('test message')
      expect(stderrSpy).toHaveBeenCalled()
      const output = stderrSpy.mock.calls.map((c: any) => c[0]).join('')
      expect(output).toContain('ERROR')
      expect(output).toContain('test message')
    })

    test('debug logs only when log level is debug', () => {
      // Should not log when log level is info
      logger.setLogLevel('info')
      stdoutSpy.mockClear()
      logger.debug('test message')
      expect(stdoutSpy).not.toHaveBeenCalled()

      // Should log when log level is debug
      logger.setLogLevel('debug')
      stdoutSpy.mockClear()
      logger.debug('test message')
      expect(stdoutSpy).toHaveBeenCalled()
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      expect(output).toContain('DEBUG')
    })

    test('update writes to stdout without newline', () => {
      logger.update('progress message')
      expect(stdoutSpy).toHaveBeenCalled()
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      expect(output).toContain('progress message')
    })
  })

  describe('promptUser', () => {
    test('returns default value in non-interactive mode', async () => {
      const result = await promptUser('Question?', 'y', true)
      expect(result).toBe('y')
    })

    test('uses default when not interactive even with different default', async () => {
      const result = await promptUser('Question?', 'custom-default', true)
      expect(result).toBe('custom-default')
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

    test('prints partial lines immediately', () => {
      const logger = new StreamLogger()
      logger.log('partial ')
      expect(stdoutSpy).toHaveBeenCalled()
      let output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      expect(output).toContain('partial')

      logger.log('line\n')
      expect(stdoutSpy).toHaveBeenCalled()
      output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      expect(output).toContain('partial line')
    })

    test('flushes remaining buffer when paused', () => {
      const logger = new StreamLogger()
      logger.pause()
      logger.log('buffered content')
      expect(stdoutSpy).not.toHaveBeenCalled()

      logger.resume()
      logger.flush()
      expect(stdoutSpy).toHaveBeenCalled()
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      expect(output).toContain('buffered content')
    })

    test('prefixes output correctly', () => {
      const logger = new StreamLogger('TEST-PREFIX')
      logger.log('prefixed line\n')
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      expect(output).toContain('[TEST-PREFIX]')
      expect(output).toContain('prefixed line')
    })

    test('works without prefix', () => {
      const logger = new StreamLogger()
      logger.log('no prefix line\n')
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      expect(output).toContain('no prefix line')
      // Strip ANSI and check for prefix brackets
      const stripped = output.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '')
      expect(stripped).not.toMatch(/\[.*\]/)
    })

    test('verifies visual formatting (pipe, dim)', () => {
      const logger = new StreamLogger()
      logger.log('formatted line\n')
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')

      expect(output).toContain('│')
      expect(output).toContain('formatted line')
    })

    test('cleans pipe prefixes from tool output', () => {
      const logger = new StreamLogger()
      logger.log('| piped content\n')
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      expect(output).toContain('piped content')
      // The leading pipe should be cleaned
      expect(output).not.toMatch(/\|\s*piped/)
    })

    test('handles multiple lines in single log call', () => {
      const logger = new StreamLogger()
      logger.log('line1\nline2\nline3\n')
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      expect(output).toContain('line1')
      expect(output).toContain('line2')
      expect(output).toContain('line3')
    })

    test('flushes remaining buffer when paused', () => {
      const logger = new StreamLogger()
      logger.pause()
      logger.log('buffered content')
      expect(stdoutSpy).not.toHaveBeenCalled()

      logger.resume()
      logger.flush()
      expect(stdoutSpy).toHaveBeenCalled()
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      expect(output).toContain('buffered content')
    })

    test('prefixes output correctly', () => {
      const logger = new StreamLogger('TEST-PREFIX')
      logger.log('prefixed line\n')
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      expect(output).toContain('[TEST-PREFIX]')
      expect(output).toContain('prefixed line')
    })

    test('works without prefix', () => {
      const logger = new StreamLogger()
      logger.log('no prefix line\n')
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      expect(output).toContain('no prefix line')
      // Strip ANSI and check for prefix brackets
      const stripped = output.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '')
      expect(stripped).not.toMatch(/\[.*\]/)
    })

    test('verifies visual formatting (pipe, dim)', () => {
      const logger = new StreamLogger()
      logger.log('formatted line\n')
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')

      expect(output).toContain('│')
      expect(output).toContain('formatted line')
    })

    test('cleans pipe prefixes from tool output', () => {
      const logger = new StreamLogger()
      logger.log('| piped content\n')
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      expect(output).toContain('piped content')
      // The leading pipe should be cleaned
      expect(output).not.toMatch(/\|\s*piped/)
    })

    test('handles multiple lines in single log call', () => {
      const logger = new StreamLogger()
      logger.log('line1\nline2\nline3\n')
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      expect(output).toContain('line1')
      expect(output).toContain('line2')
      expect(output).toContain('line3')
    })
  })
})

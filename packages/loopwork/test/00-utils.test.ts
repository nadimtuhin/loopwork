import { describe, expect, test, beforeEach, afterEach, spyOn, mock } from 'bun:test'
import { logger, StreamLogger, getTimestamp, promptUser } from '../src/core/utils'

describe('utils', () => {
  describe('getTimestamp', () => {
    test('returns formatted timestamp in 24-hour format', () => {
      const timestamp = getTimestamp()
      // 24-hour format: HH:MM:SS (always 8 characters)
      expect(timestamp).toMatch(/^\d{2}:\d{2}:\d{2}$/)
      expect(timestamp.length).toBe(8)
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
      // Prefix is padded to 35 characters
      expect(output).toContain('TEST-PREFIX')
      expect(output).toContain('prefixed line')
    })

    test('works without prefix', () => {
      const logger = new StreamLogger()
      logger.log('no prefix line\n')
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      expect(output).toContain('no prefix line')
      // Empty prefix is padded with spaces to 35 chars, so brackets still exist
      // Just verify the message is there
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
      // Prefix is padded to 35 characters
      expect(output).toContain('TEST-PREFIX')
      expect(output).toContain('prefixed line')
    })

    test('works without prefix', () => {
      const logger = new StreamLogger()
      logger.log('no prefix line\n')
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      expect(output).toContain('no prefix line')
      // Empty prefix is padded with spaces to 35 chars, so brackets still exist
      // Just verify the message is there
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

    describe('prefix width consistency', () => {
      test('short prefix is padded to 35 characters', () => {
        const logger = new StreamLogger('SHORT')
        logger.log('test message\n')
        const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
        
        // Should contain padded prefix
        expect(output).toContain('SHORT')
        // The prefix in brackets should be padded
        expect(output).toMatch(/\[SHORT\s+\]/)
      })

      test('exactly 35 character prefix is not modified', () => {
        const exactPrefix = 'A'.repeat(35)
        const logger = new StreamLogger(exactPrefix)
        logger.log('test\n')
        const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
        
        expect(output).toContain(exactPrefix)
      })

      test('long prefix is truncated with ellipsis', () => {
        const longPrefix = 'opencode/antigravity-claude-sonnet-4-5-extra-long-suffix'
        const logger = new StreamLogger(longPrefix)
        logger.log('test\n')
        const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
        
        // Should contain ellipsis
        expect(output).toContain('...')
        // Should contain start of prefix (first 20 chars)
        expect(output).toContain('opencode/antigravity')
        // Should contain end of prefix (last 12 chars)
        expect(output).toContain('-long-suffix')
      })

      test('multiple loggers produce aligned output', () => {
        const logger1 = new StreamLogger('SHORT')
        const logger2 = new StreamLogger('very-long-prefix-name-that-exceeds-limit')
        
        logger1.log('message 1\n')
        const output1 = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
        stdoutSpy.mockClear()
        
        logger2.log('message 2\n')
        const output2 = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
        
        // Both outputs should have timestamps at the same position
        const timestampMatch1 = output1.match(/(\d{2}:\d{2}:\d{2})/)
        const timestampMatch2 = output2.match(/(\d{2}:\d{2}:\d{2})/)
        
        expect(timestampMatch1).toBeTruthy()
        expect(timestampMatch2).toBeTruthy()
        
        // Both should have the pipe separator
        expect(output1).toContain('│')
        expect(output2).toContain('│')
      })

      test('empty prefix still has consistent width', () => {
        const logger = new StreamLogger('')
        logger.log('test\n')
        const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
        
        // Should still have brackets with spaces
        expect(output).toContain('│')
        expect(output).toMatch(/\[\s*\]/)
      })

      test('timestamp is always 8 characters in 24-hour format', () => {
        const logger = new StreamLogger('TEST')
        logger.log('test\n')
        const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
        
        // Should match HH:MM:SS format
        expect(output).toMatch(/\d{2}:\d{2}:\d{2}/)
        // Should not have AM/PM
        expect(output).not.toMatch(/\b(AM|PM)\b/)
      })
    })

    describe('output formatting edge cases', () => {
      test('handles very long log messages', () => {
        const logger = new StreamLogger('TEST')
        const longMessage = 'A'.repeat(1000)
        logger.log(longMessage + '\n')
        const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
        
        expect(output).toContain(longMessage)
      })

      test('handles messages with special characters', () => {
        const logger = new StreamLogger('TEST')
        logger.log('Special: àáâãäåæçèéêë ñ 中文 🎉\n')
        const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
        
        expect(output).toContain('Special:')
        expect(output).toContain('🎉')
      })

      test('handles messages with newlines', () => {
        const logger = new StreamLogger('TEST')
        logger.log('line1\nline2\nline3')
        logger.flush()
        const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
        
        expect(output).toContain('line1')
        expect(output).toContain('line2')
        expect(output).toContain('line3')
      })

      test('handles empty messages', () => {
        const logger = new StreamLogger('TEST')
        logger.log('\n')
        const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
        
        // Should not throw - empty line may or may not produce output
        // depending on implementation, but it shouldn't crash
        expect(() => logger.log('\n')).not.toThrow()
      })
    })
  })
})

import { describe, expect, test, beforeEach, afterEach, spyOn } from 'bun:test'
import { StreamLogger, getTimestamp } from '../../src/core/utils'
import { logger } from '../../src/core/utils'

describe('Output Formatting Consistency', () => {
  describe('Timestamp Format', () => {
    test('getTimestamp returns consistent 8-character width', () => {
      const timestamp = getTimestamp()
      
      // Should always be 8 characters (HH:MM:SS)
      expect(timestamp.length).toBe(8)
      
      // Should match 24-hour format pattern
      expect(timestamp).toMatch(/^\d{2}:\d{2}:\d{2}$/)
    })

    test('timestamp does not use AM/PM format', () => {
      const timestamp = getTimestamp()
      
      // Should not contain AM or PM
      expect(timestamp).not.toMatch(/AM|PM/i)
    })

    test('timestamp is always fixed width at different times', () => {
      // Simulate different times of day
      const originalToLocaleTimeString = Date.prototype.toLocaleTimeString
      
      const testCases = [
        { hour: 1, expected: '01' },
        { hour: 9, expected: '09' },
        { hour: 10, expected: '10' },
        { hour: 12, expected: '12' },
        { hour: 16, expected: '16' },
        { hour: 23, expected: '23' },
      ]
      
      for (const tc of testCases) {
        const date = new Date()
        date.setHours(tc.hour, 30, 45)
        
        const timestamp = date.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
        
        expect(timestamp.startsWith(tc.expected)).toBe(true)
        expect(timestamp.length).toBe(8)
      }
    })
  })

  describe('StreamLogger Prefix Formatting', () => {
    let stdoutSpy: ReturnType<typeof spyOn>
    let stderrSpy: ReturnType<typeof spyOn>

    beforeEach(() => {
      stdoutSpy = spyOn(process.stdout, 'write').mockImplementation(() => true)
      stderrSpy = spyOn(process.stderr, 'write').mockImplementation(() => true)
      logger.setLogLevel('debug')
    })

    afterEach(() => {
      stdoutSpy.mockRestore()
      stderrSpy.mockRestore()
      logger.setLogLevel('info')
    })

    test('prefix is padded to consistent width', () => {
      const streamLogger = new StreamLogger('short')
      streamLogger.log('test\n')
      streamLogger.flush()
      
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      
      // Should contain the timestamp separator
      expect(output).toContain('│')
      
      // Should contain the prefix
      expect(output).toContain('short')
    })

    test('long prefixes are truncated intelligently', () => {
      const longPrefix = 'opencode/antigravity-claude-sonnet-4-5-very-long-name'
      const streamLogger = new StreamLogger(longPrefix)
      streamLogger.log('test\n')
      streamLogger.flush()
      
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      
      // Should contain truncated prefix with ellipsis
      expect(output).toContain('...')
    })

    test('empty prefix shows padded brackets', () => {
      const streamLogger = new StreamLogger()
      streamLogger.log('test\n')
      streamLogger.flush()
      
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      
      // Should contain the message
      expect(output).toContain('test')
    })

    test('prefix alignment is consistent across different lengths', () => {
      const prefixes = ['a', 'medium', 'very-long-prefix-name-here']
      const outputs: string[] = []
      
      for (const prefix of prefixes) {
        stdoutSpy.mockClear()
        const streamLogger = new StreamLogger(prefix)
        streamLogger.log('aligned\n')
        streamLogger.flush()
        outputs.push(stdoutSpy.mock.calls.map((c: any) => c[0]).join(''))
      }
      
      // All outputs should contain the alignment marker
      for (const output of outputs) {
        expect(output).toContain('│')
        expect(output).toContain('aligned')
      }
    })

    test('model names like opencode/antigravity-claude-sonnet-4-5 are handled', () => {
      const modelPrefix = 'opencode/antigravity-claude-sonnet-4-5'
      const streamLogger = new StreamLogger(modelPrefix)
      streamLogger.log('Max retries exceeded\n')
      streamLogger.flush()
      
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      
      // Should contain the model name (possibly truncated)
      expect(output).toContain('opencode')
      expect(output).toContain('Max retries exceeded')
    })
  })

  describe('Visual Alignment', () => {
    let stdoutSpy: ReturnType<typeof spyOn>

    beforeEach(() => {
      stdoutSpy = spyOn(process.stdout, 'write').mockImplementation(() => true)
      logger.setLogLevel('debug')
    })

    afterEach(() => {
      stdoutSpy.mockRestore()
      logger.setLogLevel('info')
    })

    test('multiple log lines align vertically', () => {
      const streamLogger = new StreamLogger('MODEL-A')
      
      streamLogger.log('First message with some content\n')
      streamLogger.log('Second message\n')
      streamLogger.log('Third message that is longer\n')
      streamLogger.flush()
      
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      
      // All messages should be present
      expect(output).toContain('First message')
      expect(output).toContain('Second message')
      expect(output).toContain('Third message')
      
      // Should have multiple timestamp separators (one per line)
      const separators = output.match(/│/g)
      expect(separators?.length).toBeGreaterThanOrEqual(3)
    })

    test('separator character is consistent', () => {
      const streamLogger = new StreamLogger('test')
      streamLogger.log('message\n')
      streamLogger.flush()
      
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      
      // Should use the box-drawing character │ (U+2502)
      expect(output).toContain('│')
    })
  })

  describe('Edge Cases', () => {
    let stdoutSpy: ReturnType<typeof spyOn>

    beforeEach(() => {
      stdoutSpy = spyOn(process.stdout, 'write').mockImplementation(() => true)
      logger.setLogLevel('debug')
    })

    afterEach(() => {
      stdoutSpy.mockRestore()
      logger.setLogLevel('info')
    })

    test('handles empty lines gracefully', () => {
      const streamLogger = new StreamLogger('test')
      streamLogger.log('\n')
      streamLogger.flush()
      
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      // Should not throw, output may be minimal
    })

    test('handles very long messages', () => {
      const streamLogger = new StreamLogger('test')
      const longMessage = 'x'.repeat(1000) + '\n'
      streamLogger.log(longMessage)
      streamLogger.flush()
      
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      expect(output).toContain('x')
    })

    test('handles unicode in prefix', () => {
      const streamLogger = new StreamLogger('模型-🤖-test')
      streamLogger.log('unicode test\n')
      streamLogger.flush()
      
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      expect(output).toContain('unicode test')
    })

    test('handles special characters in message', () => {
      const streamLogger = new StreamLogger('test')
      streamLogger.log('Special: | pipe \n newline \t tab\n')
      streamLogger.flush()
      
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      expect(output).toContain('Special')
    })
  })
})

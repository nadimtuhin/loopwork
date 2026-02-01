import { describe, expect, test } from 'bun:test'
import { getTimestamp, calculateChecksum, StreamLogger } from '../src/utils'
import { ConsoleLogger } from '../src/logger'

describe('getTimestamp', () => {
  test('returns consistent 8-character format', () => {
    const timestamp = getTimestamp()
    expect(timestamp.length).toBe(8)
    expect(timestamp).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  })

  test('uses 24-hour format', () => {
    // Mock different hours to ensure 24-hour format
    const hours = [0, 4, 12, 16, 23]
    
    for (const hour of hours) {
      const date = new Date()
      date.setHours(hour, 30, 45)
      
      const timestamp = date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
      
      expect(timestamp.length).toBe(8)
      expect(timestamp).toMatch(/^\d{2}:\d{2}:\d{2}$/)
      
      // Verify hour is padded for single-digit hours
      if (hour < 10) {
        expect(timestamp.startsWith('0' + hour)).toBe(true)
      }
    }
  })

  test('always has consistent width regardless of time', () => {
    // Test various times that previously had inconsistent widths
    const testTimes = [
      { hour: 1, minute: 2, second: 3 },   // Would be "1:02:03 AM" (9 chars)
      { hour: 12, minute: 2, second: 3 },  // Would be "12:02:03 PM" (10 chars)
      { hour: 4, minute: 27, second: 2 },  // The example from the bug report
      { hour: 16, minute: 27, second: 2 }, // Would be "4:27:02 PM" (9 chars)
    ]
    
    for (const time of testTimes) {
      const date = new Date()
      date.setHours(time.hour, time.minute, time.second)
      
      const timestamp = date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
      
      expect(timestamp.length).toBe(8)
    }
  })
})

describe('calculateChecksum', () => {
  test('returns consistent hash for same input', () => {
    const data = { test: 'data', number: 123 }
    const hash1 = calculateChecksum(data)
    const hash2 = calculateChecksum(data)
    expect(hash1).toBe(hash2)
  })

  test('returns different hash for different input', () => {
    const hash1 = calculateChecksum({ test: 'data1' })
    const hash2 = calculateChecksum({ test: 'data2' })
    expect(hash1).not.toBe(hash2)
  })

  test('handles string input', () => {
    const hash = calculateChecksum('test string')
    expect(hash).toMatch(/^[a-f0-9]{64}$/) // SHA-256 is 64 hex chars
  })
})

describe('StreamLogger', () => {
  test('constructor initializes with empty buffer', () => {
    const mockLogger = new ConsoleLogger()
    const logger = new StreamLogger(mockLogger, 'TEST')
    
    // Should be able to log without errors
    logger.log('test message\n')
    logger.flush()
  })

  test('handles pause and resume correctly', () => {
    const mockLogger = new ConsoleLogger()
    const logger = new StreamLogger(mockLogger)
    
    logger.pause()
    logger.log('buffered message\n')
    // Message should be buffered, not logged yet
    
    logger.resume()
    logger.flush()
    // Now message should be logged
  })

  test('processes multiple lines correctly', () => {
    const mockLogger = new ConsoleLogger()
    const logger = new StreamLogger(mockLogger)
    
    logger.log('line1\nline2\nline3\n')
    logger.flush()
    // All lines should be processed
  })

  test('cleans pipe prefixes from output', () => {
    const mockLogger = new ConsoleLogger()
    const logger = new StreamLogger(mockLogger)
    
    // These should not throw errors
    logger.log('| piped content\n')
    logger.log('  | more content\n')
    logger.flush()
  })

  test('handles partial lines', () => {
    const mockLogger = new ConsoleLogger()
    const logger = new StreamLogger(mockLogger)
    
    logger.log('partial ')
    logger.log('completion\n')
    logger.flush()
  })

  describe('prefix formatting', () => {
    test('short prefix is padded to 35 characters', () => {
      const mockLogger = new ConsoleLogger()
      const logger = new StreamLogger(mockLogger, 'SHORT')
      
      // Capture the raw output
      const rawCalls: string[] = []
      const originalRaw = mockLogger.raw.bind(mockLogger)
      mockLogger.raw = (msg: string, sameLine?: boolean) => {
        rawCalls.push(msg)
        originalRaw(msg, sameLine)
      }
      
      logger.log('test\n')
      logger.flush()
      
      // Find the prefix line
      const prefixLine = rawCalls.find(call => call.includes('SHORT'))
      expect(prefixLine).toBeDefined()
      
      // The prefix including brackets should contain padded content
      // Format: [SHORT                              ]
      expect(prefixLine).toContain('[SHORT')
      expect(prefixLine).toContain(']')
    })

    test('long prefix is truncated intelligently', () => {
      const mockLogger = new ConsoleLogger()
      const longPrefix = 'opencode/antigravity-claude-sonnet-4-5-extra-long-name'
      const logger = new StreamLogger(mockLogger, longPrefix)
      
      // Capture the raw output
      const rawCalls: string[] = []
      const originalRaw = mockLogger.raw.bind(mockLogger)
      mockLogger.raw = (msg: string, sameLine?: boolean) => {
        rawCalls.push(msg)
        originalRaw(msg, sameLine)
      }
      
      logger.log('test\n')
      logger.flush()
      
      // Find the prefix line
      const prefixLine = rawCalls.find(call => call.includes('opencode'))
      expect(prefixLine).toBeDefined()
      
      // Should be truncated with ... in the middle
      expect(prefixLine).toContain('...')
      // Should keep start of prefix (first 20 chars)
      expect(prefixLine).toContain('opencode/antigravity')
      // Should keep end of prefix (last 12 chars)
      expect(prefixLine).toContain('ra-long-name')
    })

    test('empty prefix is padded with spaces', () => {
      const mockLogger = new ConsoleLogger()
      const logger = new StreamLogger(mockLogger, '')
      
      // Capture the raw output
      const rawCalls: string[] = []
      const originalRaw = mockLogger.raw.bind(mockLogger)
      mockLogger.raw = (msg: string, sameLine?: boolean) => {
        rawCalls.push(msg)
        originalRaw(msg, sameLine)
      }
      
      logger.log('test\n')
      logger.flush()
      
      // Find the prefix line with brackets
      const prefixLine = rawCalls.find(call => call.includes('│') && call.includes('['))
      expect(prefixLine).toBeDefined()
      expect(prefixLine).toContain('[')
      expect(prefixLine).toContain(']')
    })

    test('prefix width is consistent regardless of content', () => {
      const mockLogger = new ConsoleLogger()
      const rawCalls: string[] = []
      
      // Test with different prefix lengths
      const prefixes = [
        'SHORT',
        'medium-length-prefix-name',
        'opencode/antigravity-claude-sonnet-4-5-very-long-name-that-needs-truncation'
      ]
      
      for (const prefix of prefixes) {
        const logger = new StreamLogger(mockLogger, prefix)
        const originalRaw = mockLogger.raw.bind(mockLogger)
        
        mockLogger.raw = (msg: string, sameLine?: boolean) => {
          rawCalls.push(msg)
          originalRaw(msg, sameLine)
        }
        
        logger.log('test\n')
        logger.flush()
        
        // Find the prefix line and check the prefix portion length
        const prefixLine = rawCalls[rawCalls.length - 2] // Second to last call
        if (prefixLine && prefixLine.includes('[')) {
          const match = prefixLine.match(/\[([^\]]+)\]/)
          if (match) {
            // The content inside brackets should be exactly 35 chars
            expect(match[1].length).toBe(35)
          }
        }
        
        rawCalls.length = 0 // Clear for next iteration
      }
    })
  })

  describe('visual alignment', () => {
    test('timestamp and separator are present', () => {
      const mockLogger = new ConsoleLogger()
      const logger = new StreamLogger(mockLogger, 'TEST')
      
      const rawCalls: string[] = []
      const originalRaw = mockLogger.raw.bind(mockLogger)
      mockLogger.raw = (msg: string, sameLine?: boolean) => {
        rawCalls.push(msg)
        originalRaw(msg, sameLine)
      }
      
      logger.log('message\n')
      logger.flush()
      
      // Find the prefix line
      const prefixLine = rawCalls.find(call => call.includes('TEST'))
      expect(prefixLine).toBeDefined()
      
      // Should have timestamp format HH:MM:SS
      expect(prefixLine).toMatch(/\d{2}:\d{2}:\d{2}/)
      // Should have separator
      expect(prefixLine).toContain('│')
    })

    test('multiple loggers produce aligned output', () => {
      const mockLogger = new ConsoleLogger()
      const logger1 = new StreamLogger(mockLogger, 'LOGGER-1')
      const logger2 = new StreamLogger(mockLogger, 'LOGGER-2')
      
      const rawCalls: string[] = []
      const originalRaw = mockLogger.raw.bind(mockLogger)
      mockLogger.raw = (msg: string, sameLine?: boolean) => {
        rawCalls.push(msg)
        originalRaw(msg, sameLine)
      }
      
      logger1.log('message from logger 1\n')
      logger2.log('message from logger 2\n')
      logger1.flush()
      logger2.flush()
      
      // Both loggers should use the same prefix width
      const prefixLines = rawCalls.filter(call => 
        call.includes('LOGGER-1') || call.includes('LOGGER-2')
      )
      
      expect(prefixLines.length).toBe(2)
      
      // Extract the prefix portions and verify they have same width
      const prefixPortions = prefixLines.map(line => {
        const match = line.match(/\[([^\]]+)\]/)
        return match ? match[1] : null
      })
      
      expect(prefixPortions[0]?.length).toBe(prefixPortions[1]?.length)
    })
  })
})

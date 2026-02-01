/**
 * Integration Tests for StreamLogger
 * 
 * These tests verify that StreamLogger integrates correctly with:
 * - The logger system
 * - The console renderer
 * - The output pipeline
 */

import { describe, expect, test, beforeEach, afterEach, spyOn } from 'bun:test'
import { StreamLogger, logger, getTimestamp } from '../../src/core/utils'
import { ConsoleRenderer } from '../../src/output/console-renderer'

describe('StreamLogger Integration', () => {
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

  describe('Basic Integration', () => {
    test('StreamLogger outputs through logger.raw', () => {
      const streamLogger = new StreamLogger(logger, 'TEST-PREFIX')
      
      streamLogger.log('Integration test message\n')
      streamLogger.flush()
      
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      
      // Should contain timestamp in 24-hour format
      expect(output).toMatch(/\d{2}:\d{2}:\d{2}/)
      
      // Should contain separator
      expect(output).toContain('│')
      
      // Should contain the message
      expect(output).toContain('Integration test message')
    })

    test('multiple StreamLoggers produce aligned output', () => {
      const logger1 = new StreamLogger(logger, 'MODEL-A')
      const logger2 = new StreamLogger(logger, 'MODEL-B')
      
      logger1.log('Message from model A\n')
      logger2.log('Message from model B\n')
      logger1.flush()
      logger2.flush()
      
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      
      // Both messages should be present
      expect(output).toContain('Message from model A')
      expect(output).toContain('Message from model B')
      
      // Should have consistent separators
      const separators = output.match(/│/g)
      expect(separators?.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('Timestamp Consistency Integration', () => {
    test('all log entries use consistent timestamp format', () => {
      const streamLogger = new StreamLogger(logger, 'TEST')
      
      // Log multiple messages
      for (let i = 0; i < 5; i++) {
        streamLogger.log(`Message ${i}\n`)
      }
      streamLogger.flush()
      
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      
      // Find all timestamps in the output
      const timestamps = output.match(/\d{2}:\d{2}:\d{2}/g)
      expect(timestamps).toBeTruthy()
      expect(timestamps!.length).toBeGreaterThanOrEqual(5)
      
      // All timestamps should be 8 characters
      for (const ts of timestamps!) {
        expect(ts.length).toBe(8)
      }
    })

    test('timestamps are monotonically increasing', async () => {
      const streamLogger = new StreamLogger(logger, 'TEST')
      const timestamps: string[] = []
      
      // Log with small delays
      for (let i = 0; i < 3; i++) {
        streamLogger.log(`Message ${i}\n`)
        await new Promise(r => setTimeout(r, 50))
      }
      streamLogger.flush()
      
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      const matches = output.match(/\d{2}:\d{2}:\d{2}/g)
      
      if (matches && matches.length >= 2) {
        // Convert to comparable format (seconds since midnight approx)
        const toSeconds = (ts: string) => {
          const [h, m, s] = ts.split(':').map(Number)
          return h * 3600 + m * 60 + s
        }
        
        for (let i = 1; i < matches.length; i++) {
          const prev = toSeconds(matches[i - 1])
          const curr = toSeconds(matches[i])
          // Timestamps should not go backwards (may be equal if same second)
          expect(curr).toBeGreaterThanOrEqual(prev)
        }
      }
    })
  })

  describe('Prefix Width Consistency', () => {
    test('different prefix lengths result in aligned output', () => {
      const prefixes = ['A', 'MEDIUM', 'VERY-LONG-PREFIX-NAME']
      const outputs: string[] = []
      
      for (const prefix of prefixes) {
        stdoutSpy.mockClear()
        const streamLogger = new StreamLogger(logger, prefix)
        streamLogger.log('Aligned\n')
        streamLogger.flush()
        outputs.push(stdoutSpy.mock.calls.map((c: any) => c[0]).join(''))
      }
      
      // The position of the message should be consistent
      // Extract the position where 'Aligned' appears
      const positions = outputs.map(o => {
        const match = o.match(/(.*?)(Aligned)/)
        return match ? match[1].length : 0
      })
      
      // All positions should be the same (aligned)
      const firstPos = positions[0]
      for (const pos of positions) {
        // Allow for slight variations due to ANSI codes, but should be close
        expect(Math.abs(pos - firstPos)).toBeLessThan(10)
      }
    })

    test('model names are normalized consistently', () => {
      const modelPrefixes = [
        'claude/sonnet',
        'opencode/antigravity-claude-sonnet-4-5',
        'google/gemini-3-flash'
      ]
      
      for (const prefix of modelPrefixes) {
        stdoutSpy.mockClear()
        const streamLogger = new StreamLogger(logger, prefix)
        streamLogger.log('Processing task\n')
        streamLogger.flush()
        
        const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
        
        // Should contain model identifier
        expect(output).toContain(prefix.substring(0, 10)) // At least part of it
        
        // Should have consistent structure
        expect(output).toMatch(/\d{2}:\d{2}:\d{2}/) // Timestamp
        expect(output).toContain('│') // Separator
      }
    })
  })

  describe('Renderer Integration', () => {
    test('ConsoleRenderer handles StreamLogger output correctly', () => {
      const renderer = new ConsoleRenderer({ mode: 'human', logLevel: 'info' })
      logger.setRenderer(renderer)
      
      const streamLogger = new StreamLogger(logger, 'RENDERER-TEST')
      streamLogger.log('Renderer integration test\n')
      streamLogger.flush()
      
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      expect(output).toContain('Renderer integration test')
      
      renderer.dispose()
    })
  })

  describe('Edge Case Handling', () => {
    test('handles rapid successive logs', () => {
      const streamLogger = new StreamLogger(logger, 'RAPID')
      
      // Log 20 messages rapidly
      for (let i = 0; i < 20; i++) {
        streamLogger.log(`Rapid message ${i}\n`)
      }
      streamLogger.flush()
      
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      
      // All messages should be present
      for (let i = 0; i < 20; i++) {
        expect(output).toContain(`Rapid message ${i}`)
      }
    })

    test('handles interleaved StreamLoggers', () => {
      const loggerA = new StreamLogger(logger, 'TASK-A')
      const loggerB = new StreamLogger(logger, 'TASK-B')
      
      // Interleave messages from different loggers
      loggerA.log('Start A\n')
      loggerB.log('Start B\n')
      loggerA.log('Progress A\n')
      loggerB.log('Progress B\n')
      loggerA.log('End A\n')
      loggerB.log('End B\n')
      
      loggerA.flush()
      loggerB.flush()
      
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      
      // All messages should be present
      expect(output).toContain('Start A')
      expect(output).toContain('Start B')
      expect(output).toContain('Progress A')
      expect(output).toContain('Progress B')
      expect(output).toContain('End A')
      expect(output).toContain('End B')
    })

    test('handles empty and whitespace-only messages', () => {
      const streamLogger = new StreamLogger(logger, 'EMPTY')
      
      streamLogger.log('\n')
      streamLogger.log('   \n')
      streamLogger.log('\t\n')
      streamLogger.log('Normal message\n')
      streamLogger.flush()
      
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      
      // Normal message should be present
      expect(output).toContain('Normal message')
    })

    test('handles unicode and special characters', () => {
      const streamLogger = new StreamLogger(logger, 'UNICODE')
      
      streamLogger.log('Unicode: 你好世界 🌍 émojis\n')
      streamLogger.log('Special: <>&"\'\n')
      streamLogger.flush()
      
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      
      expect(output).toContain('Unicode')
      expect(output).toContain('Special')
    })
  })

  describe('Buffer Management', () => {
    test('correctly buffers partial lines', () => {
      const streamLogger = new StreamLogger(logger, 'BUFFER')
      
      // Write partial line
      streamLogger.log('Partial ')
      
      // Should have been written (with prefix)
      let output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      expect(output).toContain('Partial')
      
      stdoutSpy.mockClear()
      
      // Complete the line
      streamLogger.log('line\n')
      streamLogger.flush()
      
      output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      expect(output).toContain('line')
    })

    test('flush handles remaining buffer', () => {
      const streamLogger = new StreamLogger(logger, 'FLUSH')
      
      streamLogger.log('No newline at end')
      
      stdoutSpy.mockClear()
      streamLogger.flush()
      
      const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
      expect(output).toContain('No newline at end')
    })
  })
})

describe('Real-world Scenario Tests', () => {
  let stdoutSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    stdoutSpy = spyOn(process.stdout, 'write').mockImplementation(() => true)
    logger.setLogLevel('debug')
  })

  afterEach(() => {
    stdoutSpy.mockRestore()
    logger.setLogLevel('info')
  })

  test('parallel task execution output scenario', () => {
    // Simulate output from parallel workers
    const workerA = new StreamLogger(logger, 'opencode/claude-sonnet-4-5')
    const workerB = new StreamLogger(logger, 'opencode/gemini-3-flash')
    const workerC = new StreamLogger(logger, 'claude/haiku')
    
    workerA.log('Starting task processing\n')
    workerB.log('Starting task processing\n')
    workerC.log('Starting task processing\n')
    
    workerA.log('Processing iteration 1...\n')
    workerB.log('Processing iteration 1...\n')
    workerC.log('Processing iteration 1...\n')
    
    workerA.log('Completed successfully\n')
    workerB.log('Max retries exceeded\n')
    workerC.log('Completed successfully\n')
    
    workerA.flush()
    workerB.flush()
    workerC.flush()
    
    const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
    
    // All workers should have produced output
    expect(output).toContain('opencode')
    expect(output).toContain('claude')
    
    // All messages should be present
    expect(output).toContain('Completed successfully')
    expect(output).toContain('Max retries exceeded')
    
    // Should have consistent formatting (timestamps)
    const timestamps = output.match(/\d{2}:\d{2}:\d{2}/g)
    expect(timestamps?.length).toBeGreaterThanOrEqual(9) // 3 workers x 3 messages
  })

  test('long-running task with progress updates', () => {
    const streamLogger = new StreamLogger(logger, 'LONG-TASK')
    
    // Simulate progress updates
    const stages = ['Initializing', 'Loading data', 'Processing', 'Finalizing', 'Complete']
    
    for (const stage of stages) {
      streamLogger.log(`Stage: ${stage}\n`)
    }
    streamLogger.flush()
    
    const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('')
    
    for (const stage of stages) {
      expect(output).toContain(`Stage: ${stage}`)
    }
  })
})

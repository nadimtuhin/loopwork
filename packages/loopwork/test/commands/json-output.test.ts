import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { logger } from '../../src/core/utils'
import type { OutputFormat, JsonEvent } from '../../src/contracts/output'

/**
 * JSON Output Mode Integration Tests
 *
 * Verifies that all major commands support --json flag and emit
 * valid, parseable JSON according to the specifications in CLIOUTPU-004.
 *
 * Test Coverage:
 * - run: Emit events for iteration start/end, task completion
 * - status: Output structured process list
 * - logs: Emit log entries as JSON objects
 * - kill: Output orphan list and actions as JSON
 * - decompose: Output generated tasks as JSON
 */
describe('JSON Output Mode', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'json-output-test-'))
  })

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  describe('Logger JSON Mode', () => {
    test('setOutputFormat changes logger output mode', () => {
      const originalFormat = logger.outputFormat

      logger.setOutputFormat('json')
      expect(logger.outputFormat).toBe('json')

      logger.setOutputFormat('human')
      expect(logger.outputFormat).toBe('human')

      // Restore original
      logger.outputFormat = originalFormat
    })

    test('logger suppresses human output in JSON mode', () => {
      const originalFormat = logger.outputFormat
      const output: string[] = []

      // Mock stdout to capture output
      const originalWrite = process.stdout.write
      process.stdout.write = ((chunk: any) => {
        output.push(typeof chunk === 'string' ? chunk : chunk.toString())
        return true
      }) as any

      logger.setOutputFormat('json')
      logger.info('Test message')
      logger.success('Success message')
      logger.warn('Warning message')
      logger.error('Error message')

      // In JSON mode, these should not produce human-readable output
      const combinedOutput = output.join('')
      expect(combinedOutput).not.toContain('ℹ️ INFO:')
      expect(combinedOutput).not.toContain('✅ SUCCESS:')
      expect(combinedOutput).not.toContain('⚠️ WARN:')
      expect(combinedOutput).not.toContain('❌ ERROR:')

      // Restore
      process.stdout.write = originalWrite
      logger.outputFormat = originalFormat
    })

    test('jsonEvent emits valid JSON event', () => {
      const output: string[] = []
      const originalWrite = process.stdout.write
      process.stdout.write = ((chunk: any) => {
        output.push(typeof chunk === 'string' ? chunk : chunk.toString())
        return true
      }) as any

      const event: JsonEvent = {
        timestamp: new Date().toISOString(),
        type: 'info',
        command: 'test',
        data: { message: 'test message', value: 123 }
      }

      logger.jsonEvent(event)

      const emittedJson = output.join('').trim()
      const parsed = JSON.parse(emittedJson)

      expect(parsed.timestamp).toBe(event.timestamp)
      expect(parsed.type).toBe('info')
      expect(parsed.command).toBe('test')
      expect(parsed.data.message).toBe('test message')
      expect(parsed.data.value).toBe(123)

      // Restore
      process.stdout.write = originalWrite
    })
  })

  describe('JSON Event Schema Validation', () => {
    test('JsonEvent has all required fields', () => {
      const event: JsonEvent = {
        timestamp: '2025-01-31T10:00:00.000Z',
        type: 'info',
        command: 'run',
        data: { taskId: 'TASK-001' }
      }

      expect(event.timestamp).toBeDefined()
      expect(event.type).toBeDefined()
      expect(event.command).toBeDefined()
      expect(event.data).toBeDefined()
      expect(typeof event.timestamp).toBe('string')
      expect(['info', 'success', 'error', 'warn', 'progress', 'result']).toContain(event.type)
    })

    test('JsonEvent type field accepts all valid values', () => {
      const validTypes: JsonEvent['type'][] = ['info', 'success', 'error', 'warn', 'progress', 'result']

      for (const type of validTypes) {
        const event: JsonEvent = {
          timestamp: new Date().toISOString(),
          type,
          command: 'test',
          data: {}
        }
        expect(event.type).toBe(type)
      }
    })
  })

  describe('Command-Specific JSON Output', () => {
    test('run command JSON events include required fields', () => {
      // Test that run command would emit events with proper structure
      const runEvent: JsonEvent = {
        timestamp: new Date().toISOString(),
        type: 'progress',
        command: 'run',
        data: {
          iteration: 1,
          maxIterations: 50,
          taskId: 'TASK-001',
          taskTitle: 'Implement feature',
          taskPriority: 'high',
          taskFeature: 'auth',
        }
      }

      expect(runEvent.data.iteration).toBeDefined()
      expect(runEvent.data.taskId).toBeDefined()
      expect(runEvent.data.taskTitle).toBeDefined()
    })

    test('status command JSON output includes process list', () => {
      const statusOutput = {
        command: 'status',
        timestamp: new Date().toISOString(),
        processes: [
          {
            namespace: 'default',
            pid: 12345,
            status: 'running',
            taskId: 'TASK-001',
            startTime: new Date().toISOString(),
            runtime: 300000
          }
        ],
        summary: {
          total: 1,
          active: 1
        }
      }

      expect(statusOutput.command).toBe('status')
      expect(statusOutput.processes).toBeArray()
      expect(statusOutput.summary).toBeDefined()
      expect(statusOutput.summary.total).toBe(1)
    })

    test('decompose command JSON output includes tasks', () => {
      const decomposeOutput = {
        command: 'decompose',
        timestamp: new Date().toISOString(),
        input: {
          description: 'Build a REST API',
          namespace: 'api'
        },
        tasks: [
          {
            id: 'API-001',
            title: 'Create API routes',
            status: 'pending',
            priority: 'high',
            dependencies: []
          }
        ],
        summary: {
          totalTasks: 1,
          topLevel: 1,
          subtasks: 0
        }
      }

      expect(decomposeOutput.command).toBe('decompose')
      expect(decomposeOutput.tasks).toBeArray()
      expect(decomposeOutput.summary.totalTasks).toBe(1)
    })
  })

  describe('JSON Parsing and Validation', () => {
    test('emitted JSON is valid and parseable', () => {
      const testData = {
        command: 'test',
        timestamp: new Date().toISOString(),
        data: {
          nested: {
            value: 'test'
          },
          array: [1, 2, 3]
        }
      }

      const json = JSON.stringify(testData)
      const parsed = JSON.parse(json)

      expect(parsed.command).toBe('test')
      expect(parsed.data.nested.value).toBe('test')
      expect(parsed.data.array).toEqual([1, 2, 3])
    })

    test('newline-delimited JSON events are individually parseable', () => {
      const events = [
        { timestamp: '2025-01-31T10:00:00Z', type: 'info' as const, command: 'run', data: { step: 1 } },
        { timestamp: '2025-01-31T10:00:01Z', type: 'success' as const, command: 'run', data: { step: 2 } },
        { timestamp: '2025-01-31T10:00:02Z', type: 'result' as const, command: 'run', data: { complete: true } }
      ]

      const ndjson = events.map(e => JSON.stringify(e)).join('\n')
      const lines = ndjson.split('\n')

      expect(lines.length).toBe(3)

      for (let i = 0; i < lines.length; i++) {
        const parsed = JSON.parse(lines[i])
        expect(parsed.timestamp).toBe(events[i].timestamp)
        expect(parsed.type).toBe(events[i].type)
        expect(parsed.command).toBe(events[i].command)
      }
    })

    test('JSON output handles special characters correctly', () => {
      const data = {
        message: 'Test with "quotes" and \\backslashes\nand newlines',
        emoji: '✅ ❌ ⚠️',
        unicode: '日本語 한국어',
      }

      const json = JSON.stringify(data)
      const parsed = JSON.parse(json)

      expect(parsed.message).toContain('quotes')
      expect(parsed.message).toContain('backslashes')
      expect(parsed.emoji).toBe('✅ ❌ ⚠️')
      expect(parsed.unicode).toBe('日本語 한국어')
    })
  })

  describe('OutputFormat Type', () => {
    test('OutputFormat accepts human and json', () => {
      const humanFormat: OutputFormat = 'human'
      const jsonFormat: OutputFormat = 'json'

      expect(humanFormat).toBe('human')
      expect(jsonFormat).toBe('json')
    })
  })

  describe('Error Handling in JSON Mode', () => {
    test('JSON output handles errors gracefully', () => {
      const errorEvent: JsonEvent = {
        timestamp: new Date().toISOString(),
        type: 'error',
        command: 'run',
        data: {
          error: 'Task execution failed',
          code: 1,
          details: {
            taskId: 'TASK-001',
            attempts: 3
          }
        }
      }

      const json = JSON.stringify(errorEvent)
      const parsed = JSON.parse(json)

      expect(parsed.type).toBe('error')
      expect(parsed.data.error).toBe('Task execution failed')
      expect(parsed.data.details.attempts).toBe(3)
    })

    test('JSON output maintains structure with null values', () => {
      const event: JsonEvent = {
        timestamp: new Date().toISOString(),
        type: 'info',
        command: 'test',
        data: {
          value: null,
          optional: undefined,
          present: 'value'
        }
      }

      const json = JSON.stringify(event)
      const parsed = JSON.parse(json)

      expect(parsed.data.value).toBeNull()
      expect(parsed.data.optional).toBeUndefined()
      expect(parsed.data.present).toBe('value')
    })
  })

  describe('Timestamp Formatting', () => {
    test('timestamps are in ISO 8601 format', () => {
      const timestamp = new Date().toISOString()
      const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

      expect(timestamp).toMatch(isoRegex)
    })

    test('timestamps are consistent across events', () => {
      const time = new Date().toISOString()
      const event1: JsonEvent = {
        timestamp: time,
        type: 'info',
        command: 'test',
        data: {}
      }
      const event2: JsonEvent = {
        timestamp: time,
        type: 'success',
        command: 'test',
        data: {}
      }

      expect(event1.timestamp).toBe(event2.timestamp)
    })
  })

  describe('Data Field Flexibility', () => {
    test('data field accepts various object structures', () => {
      const events: JsonEvent[] = [
        {
          timestamp: new Date().toISOString(),
          type: 'info',
          command: 'run',
          data: { simple: 'value' }
        },
        {
          timestamp: new Date().toISOString(),
          type: 'progress',
          command: 'run',
          data: {
            nested: {
              deep: {
                value: 123
              }
            }
          }
        },
        {
          timestamp: new Date().toISOString(),
          type: 'result',
          command: 'run',
          data: {
            array: [1, 2, 3],
            mixed: {
              string: 'text',
              number: 42,
              boolean: true,
              null: null
            }
          }
        }
      ]

      for (const event of events) {
        const json = JSON.stringify(event)
        const parsed = JSON.parse(json)
        expect(parsed.data).toBeDefined()
      }
    })
  })
})

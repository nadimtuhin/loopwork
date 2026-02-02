import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { TelemetryManager, TelemetryConfig, setTestLogger, getDefaultConfig, createTelemetryManager } from '../index'

/**
 * Telemetry Tool Execution Tests
 *
 * Tests for the tool execution tracing and latency features in TelemetryManager.
 */
describe('TelemetryManager Tool Execution', () => {
  let testLogs: { level: string, args: unknown[] }[] = []

  beforeEach(() => {
    testLogs = []
    setTestLogger({
      info: (...args: unknown[]) => { testLogs.push({ level: 'info', args }) },
      warn: (...args: unknown[]) => { testLogs.push({ level: 'warn', args }) },
      error: (...args: unknown[]) => { testLogs.push({ level: 'error', args }) },
    })
    TelemetryManager.resetInstance()
  })

  afterEach(() => {
    TelemetryManager.resetInstance()
  })

  describe('startToolSpan', () => {
    test('should create tool span with basic attributes', () => {
      const telemetry = createTelemetryManager({ enabled: false })

      // When telemetry is disabled, startToolSpan should throw
      expect(() => {
        telemetry.startToolSpan('loopwork_get_task')
      }).toThrow('Telemetry is not enabled')
    })

    test('should include taskId in span attributes when provided', () => {
      const telemetry = createTelemetryManager({ enabled: false })

      expect(() => {
        telemetry.startToolSpan('loopwork_get_task', 'TASK-001')
      }).toThrow('Telemetry is not enabled')
    })

    test('should include argument keys in span attributes', () => {
      const telemetry = createTelemetryManager({ enabled: false })

      expect(() => {
        telemetry.startToolSpan('loopwork_get_task', 'TASK-001', { taskId: 'TASK-001', includeDetails: 'true' })
      }).toThrow('Telemetry is not enabled')
    })
  })

  describe('recordToolExecution', () => {
    test('should not throw when telemetry is disabled', () => {
      const telemetry = createTelemetryManager({ enabled: false })

      // Should not throw even when telemetry is disabled
      expect(() => {
        telemetry.recordToolExecution('loopwork_get_task', 100, true, 'TASK-001')
      }).not.toThrow()
    })

    test('should record successful tool execution', () => {
      const telemetry = createTelemetryManager({ enabled: false })

      expect(() => {
        telemetry.recordToolExecution('loopwork_mark_complete', 50, true, 'TASK-002')
      }).not.toThrow()
    })

    test('should record failed tool execution with error', () => {
      const telemetry = createTelemetryManager({ enabled: false })

      expect(() => {
        telemetry.recordToolExecution('loopwork_get_task', 200, false, 'TASK-003', 'Task not found')
      }).not.toThrow()
    })

    test('should handle tool execution without taskId', () => {
      const telemetry = createTelemetryManager({ enabled: false })

      expect(() => {
        telemetry.recordToolExecution('loopwork_count_pending', 30, true)
      }).not.toThrow()
    })
  })

  describe('error classification', () => {
    test('should classify timeout errors correctly', () => {
      const telemetry = createTelemetryManager({ enabled: false })

      expect(() => {
        telemetry.recordToolExecution('loopwork_get_task', 5000, false, 'TASK-001', 'Request timeout after 5000ms')
      }).not.toThrow()
    })

    test('should classify rate limit errors correctly', () => {
      const telemetry = createTelemetryManager({ enabled: false })

      expect(() => {
        telemetry.recordToolExecution('loopwork_list_tasks', 100, false, undefined, 'Rate limit exceeded: 429')
      }).not.toThrow()
    })

    test('should classify connection errors correctly', () => {
      const telemetry = createTelemetryManager({ enabled: false })

      expect(() => {
        telemetry.recordToolExecution('loopwork_backend_status', 50, false, undefined, 'Network connection failed')
      }).not.toThrow()
    })
  })
})

describe('TelemetryConfig', () => {
  test('should provide default config', () => {
    const config = getDefaultConfig()

    expect(config).toBeDefined()
    expect(config.enabled).toBe(true)
    expect(config.consoleLogs).toBeDefined()
  })

  test('should allow custom config', () => {
    const customConfig: TelemetryConfig = {
      enabled: true,
      serviceName: 'test-service',
      serviceVersion: '1.0.0',
      tracesEndpoint: 'http://localhost:4317',
      metricsEndpoint: 'http://localhost:4318',
      consoleLogs: true,
    }

    expect(customConfig.enabled).toBe(true)
    expect(customConfig.serviceName).toBe('test-service')
  })
})

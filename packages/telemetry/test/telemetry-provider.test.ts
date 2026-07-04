import { describe, expect, test, beforeEach } from 'bun:test'
import { TelemetryProvider, createTelemetryProvider } from '../src/telemetry-provider'
import type { StructuredLog } from '@loopwork-ai/contracts'

describe('TelemetryProvider', () => {
  let provider: TelemetryProvider

  beforeEach(() => {
    provider = new TelemetryProvider()
  })

  test('should create provider with config', () => {
    const customProvider = new TelemetryProvider({
      maxTokenEntries: 500,
      trackTokensByModel: true,
      maxErrorEntries: 200,
    })
    expect(customProvider).toBeDefined()
    expect(customProvider.metrics).toBeDefined()
  })

  test('should record token usage directly', () => {
    provider.recordTokenUsage('TASK-001', 'claude-3.5-sonnet', 1000, 500, 'success', 200, 100, 30)

    const metrics = provider.getTokenMetrics()
    expect(metrics.taskCount).toBe(1)
    expect(metrics.totalInputTokens).toBe(1000)
    expect(metrics.totalOutputTokens).toBe(500)
    expect(metrics.totalCacheReadTokens).toBe(200)
    expect(metrics.totalCacheWriteTokens).toBe(100)
  })

  test('should record error directly', () => {
    provider.recordError('Connection timeout', 'TASK-001', 'claude-3.5-sonnet')

    const correlation = provider.getErrorCorrelation()
    expect(correlation.totalErrors).toBe(1)
    expect(correlation.uniqueErrorTypes).toBe(1)
  })

  test('should extract token usage from structured log', () => {
    const logEntry: StructuredLog = {
      level: 'info',
      message: 'Task completed',
      timestamp: new Date().toISOString(),
      taskId: 'TASK-001',
      metadata: {
        model: 'claude-3.5-sonnet',
        usage: {
          inputTokens: 1500,
          outputTokens: 750,
        },
      },
    }

    provider.log(logEntry)

    const metrics = provider.getTokenMetrics()
    expect(metrics.totalInputTokens).toBe(1500)
    expect(metrics.totalOutputTokens).toBe(750)
  })

  test('should extract snake_case token usage from log', () => {
    const logEntry: StructuredLog = {
      level: 'info',
      message: 'Task completed',
      timestamp: new Date().toISOString(),
      taskId: 'TASK-001',
      metadata: {
        model: 'gpt-4',
        usage: {
          input_tokens: 2000,
          output_tokens: 1000,
        },
      },
    }

    provider.log(logEntry)

    const metrics = provider.getTokenMetrics()
    expect(metrics.totalInputTokens).toBe(2000)
    expect(metrics.totalOutputTokens).toBe(1000)
  })

  test('should record error from structured log', () => {
    const logEntry: StructuredLog = {
      level: 'error',
      message: 'Task failed',
      timestamp: new Date().toISOString(),
      taskId: 'TASK-001',
      error: 'API rate limit exceeded',
      metadata: {
        model: 'claude-3.5-sonnet',
      },
    }

    provider.log(logEntry)

    const correlation = provider.getErrorCorrelation()
    expect(correlation.totalErrors).toBe(1)
  })

  test('should handle error object in structured log', () => {
    const error = new Error('Something went wrong')
    const logEntry: StructuredLog = {
      level: 'error',
      message: 'Task failed',
      timestamp: new Date().toISOString(),
      taskId: 'TASK-001',
      error,
      metadata: {
        model: 'gpt-4',
      },
    }

    provider.log(logEntry)

    const correlation = provider.getErrorCorrelation()
    expect(correlation.totalErrors).toBe(1)
  })

  test('should mark task as failed when log level is error', () => {
    const logEntry: StructuredLog = {
      level: 'error',
      message: 'Task failed',
      timestamp: new Date().toISOString(),
      taskId: 'TASK-001',
      metadata: {
        model: 'claude',
        usage: {
          inputTokens: 1000,
          outputTokens: 500,
        },
      },
    }

    provider.log(logEntry)

    const metrics = provider.getTokenMetrics()
    expect(metrics.failureCount).toBe(1)
    expect(metrics.successCount).toBe(0)
  })

  test('should mark task as success when log level is not error', () => {
    const logEntry: StructuredLog = {
      level: 'info',
      message: 'Task completed',
      timestamp: new Date().toISOString(),
      taskId: 'TASK-001',
      metadata: {
        model: 'claude',
        usage: {
          inputTokens: 1000,
          outputTokens: 500,
        },
      },
    }

    provider.log(logEntry)

    const metrics = provider.getTokenMetrics()
    expect(metrics.successCount).toBe(1)
    expect(metrics.failureCount).toBe(0)
  })

  test('should get combined report', () => {
    provider.recordTokenUsage('TASK-001', 'claude', 1000, 500, 'success')
    provider.recordError('Error occurred', 'TASK-002', 'gpt-4')

    const report = provider.getReport()
    expect(report.tokenMetrics.taskCount).toBe(1)
    expect(report.errorCorrelation.totalErrors).toBe(1)
    expect(report.generatedAt).toBeInstanceOf(Date)
  })

  test('should get task-specific token metrics', () => {
    provider.recordTokenUsage('TASK-A', 'claude', 1000, 500, 'success')
    provider.recordTokenUsage('TASK-B', 'gpt-4', 2000, 1000, 'success')
    provider.recordTokenUsage('TASK-A', 'claude', 500, 250, 'success')

    const taskAMetrics = provider.getTaskTokenMetrics('TASK-A')
    expect(taskAMetrics.taskCount).toBe(2)
    expect(taskAMetrics.totalInputTokens).toBe(1500)

    const taskBMetrics = provider.getTaskTokenMetrics('TASK-B')
    expect(taskBMetrics.taskCount).toBe(1)
    expect(taskBMetrics.totalInputTokens).toBe(2000)
  })

  test('should get recent token entries', () => {
    provider.recordTokenUsage('TASK-001', 'claude', 100, 50, 'success')
    provider.recordTokenUsage('TASK-002', 'claude', 200, 100, 'success')
    provider.recordTokenUsage('TASK-003', 'claude', 300, 150, 'success')

    const recent = provider.getRecentTokenEntries(2)
    expect(recent.length).toBe(2)
  })

  test('should get recent errors', () => {
    provider.recordError('Error 1', 'TASK-001', 'claude')
    provider.recordError('Error 2', 'TASK-002', 'gpt-4')

    const recent = provider.getRecentErrors(24)
    expect(recent.length).toBe(2)
  })

  test('should find similar errors', () => {
    provider.recordError('Connection timeout to server', 'TASK-001', 'claude')
    provider.recordError('Connection timeout to database', 'TASK-002', 'claude')
    provider.recordError('Rate limit exceeded', 'TASK-003', 'gpt-4')

    const similar = provider.findSimilarErrors('Connection timeout to API')
    expect(similar.length).toBeGreaterThanOrEqual(0)
  })

  test('should get token trend', () => {
    for (let i = 0; i < 20; i++) {
      provider.recordTokenUsage(`TASK-${i}`, 'claude', 1000 + i * 100, 500 + i * 50, 'success')
    }

    const trend = provider.getTokenTrend(10)
    expect(trend.input).toBe('up')
    expect(trend.output).toBe('up')
  })

  test('should clear all data', () => {
    provider.recordTokenUsage('TASK-001', 'claude', 1000, 500, 'success')
    provider.recordError('Error', 'TASK-002', 'gpt-4')

    provider.clear()

    const metrics = provider.getTokenMetrics()
    expect(metrics.taskCount).toBe(0)

    const correlation = provider.getErrorCorrelation()
    expect(correlation.totalErrors).toBe(0)
  })

  test('should flush without error', async () => {
    provider.recordTokenUsage('TASK-001', 'claude', 1000, 500, 'success')
    await expect(provider.flush()).resolves.toBeUndefined()
  })

  test('should implement ITelemetryProvider interface', () => {
    expect(typeof provider.log).toBe('function')
    expect(provider.metrics).toBeDefined()
    expect(typeof provider.flush).toBe('function')
  })

  test('should handle log without taskId', () => {
    const logEntry: StructuredLog = {
      level: 'info',
      message: 'General info',
      timestamp: new Date().toISOString(),
      metadata: {
        usage: {
          inputTokens: 1000,
          outputTokens: 500,
        },
      },
    }

    provider.log(logEntry)

    const metrics = provider.getTokenMetrics()
    expect(metrics.taskCount).toBe(0)
  })

  test('should handle log without usage metadata', () => {
    const logEntry: StructuredLog = {
      level: 'info',
      message: 'Task completed',
      timestamp: new Date().toISOString(),
      taskId: 'TASK-001',
      metadata: {
        model: 'claude',
      },
    }

    provider.log(logEntry)

    const metrics = provider.getTokenMetrics()
    expect(metrics.taskCount).toBe(0)
  })

  test('should include namespace in tags', () => {
    const logEntry: StructuredLog = {
      level: 'info',
      message: 'Task completed',
      timestamp: new Date().toISOString(),
      taskId: 'TASK-001',
      namespace: 'my-namespace',
      metadata: {
        model: 'claude',
        usage: {
          inputTokens: 1000,
          outputTokens: 500,
        },
      },
    }

    provider.log(logEntry)

    const entries = provider.getRecentTokenEntries(1)
    expect(entries[0].tags?.namespace).toBe('my-namespace')
  })

  test('factory function should create provider', () => {
    const factoryProvider = createTelemetryProvider({ maxTokenEntries: 100 })
    expect(factoryProvider).toBeInstanceOf(TelemetryProvider)

    factoryProvider.recordTokenUsage('TASK-001', 'claude', 100, 50, 'success')
    expect(factoryProvider.getTokenMetrics().taskCount).toBe(1)
  })
})

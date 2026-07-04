import { describe, expect, test, beforeEach } from 'bun:test'
import { TokenMetricsCollector, createTokenMetricsCollector } from '../src/token-metrics'

describe('TokenMetricsCollector', () => {
  let collector: TokenMetricsCollector

  beforeEach(() => {
    collector = new TokenMetricsCollector()
  })

  test('should record token usage entry', () => {
    collector.record({
      taskId: 'TASK-001',
      model: 'claude-3.5-sonnet',
      usage: { inputTokens: 1000, outputTokens: 500 },
      timestamp: new Date(),
      status: 'success',
    })

    const summary = collector.getSummary()
    expect(summary.taskCount).toBe(1)
    expect(summary.totalInputTokens).toBe(1000)
    expect(summary.totalOutputTokens).toBe(500)
  })

  test('should record token usage with recordUsage method', () => {
    collector.recordUsage('TASK-002', 'gpt-4', { inputTokens: 2000, outputTokens: 1000 }, 'success', 30)

    const summary = collector.getSummary()
    expect(summary.taskCount).toBe(1)
    expect(summary.totalInputTokens).toBe(2000)
    expect(summary.totalOutputTokens).toBe(1000)
  })

  test('should track cache tokens when enabled', () => {
    collector = new TokenMetricsCollector({ trackCacheTokens: true })

    collector.recordUsage(
      'TASK-003',
      'claude-3.5-sonnet',
      { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 200, cacheWriteTokens: 100 },
      'success'
    )

    const summary = collector.getSummary()
    expect(summary.totalCacheReadTokens).toBe(200)
    expect(summary.totalCacheWriteTokens).toBe(100)
    expect(summary.totalTokens).toBe(1800)
  })

  test('should calculate task-specific summary', () => {
    collector.recordUsage('TASK-A', 'model-1', { inputTokens: 1000, outputTokens: 500 }, 'success')
    collector.recordUsage('TASK-B', 'model-1', { inputTokens: 2000, outputTokens: 1000 }, 'success')
    collector.recordUsage('TASK-A', 'model-1', { inputTokens: 500, outputTokens: 250 }, 'success')

    const taskASummary = collector.getTaskSummary('TASK-A')
    expect(taskASummary.taskCount).toBe(2)
    expect(taskASummary.totalInputTokens).toBe(1500)
    expect(taskASummary.totalOutputTokens).toBe(750)

    const taskBSummary = collector.getTaskSummary('TASK-B')
    expect(taskBSummary.taskCount).toBe(1)
    expect(taskBSummary.totalInputTokens).toBe(2000)
  })

  test('should calculate model-specific summary', () => {
    collector.recordUsage('TASK-001', 'claude-3.5-sonnet', { inputTokens: 1000, outputTokens: 500 }, 'success')
    collector.recordUsage('TASK-002', 'gpt-4', { inputTokens: 2000, outputTokens: 1000 }, 'success')
    collector.recordUsage('TASK-003', 'claude-3.5-sonnet', { inputTokens: 1500, outputTokens: 750 }, 'success')

    const claudeSummary = collector.getModelSummary('claude-3.5-sonnet')
    expect(claudeSummary).not.toBeNull()
    expect(claudeSummary!.taskCount).toBe(2)
    expect(claudeSummary!.totalInputTokens).toBe(2500)

    const gptSummary = collector.getModelSummary('gpt-4')
    expect(gptSummary).not.toBeNull()
    expect(gptSummary!.taskCount).toBe(1)
    expect(gptSummary!.totalInputTokens).toBe(2000)
  })

  test('should return null for unknown model', () => {
    const summary = collector.getModelSummary('unknown-model')
    expect(summary).toBeNull()
  })

  test('should track success and failure counts', () => {
    collector.recordUsage('TASK-001', 'model', { inputTokens: 1000, outputTokens: 500 }, 'success')
    collector.recordUsage('TASK-002', 'model', { inputTokens: 1000, outputTokens: 500 }, 'failed')
    collector.recordUsage('TASK-003', 'model', { inputTokens: 1000, outputTokens: 500 }, 'failed')

    const summary = collector.getSummary()
    expect(summary.successCount).toBe(1)
    expect(summary.failureCount).toBe(2)
  })

  test('should get recent entries', () => {
    collector.recordUsage('TASK-001', 'model', { inputTokens: 100, outputTokens: 50 }, 'success')
    collector.recordUsage('TASK-002', 'model', { inputTokens: 200, outputTokens: 100 }, 'success')
    collector.recordUsage('TASK-003', 'model', { inputTokens: 300, outputTokens: 150 }, 'success')

    const recent = collector.getRecentEntries(2)
    expect(recent.length).toBe(2)
    expect(recent[0].taskId).toBe('TASK-002')
    expect(recent[1].taskId).toBe('TASK-003')
  })

  test('should get entries by status', () => {
    collector.recordUsage('TASK-001', 'model', { inputTokens: 100, outputTokens: 50 }, 'success')
    collector.recordUsage('TASK-002', 'model', { inputTokens: 200, outputTokens: 100 }, 'failed')
    collector.recordUsage('TASK-003', 'model', { inputTokens: 300, outputTokens: 150 }, 'success')

    const successEntries = collector.getEntriesByStatus('success')
    expect(successEntries.length).toBe(2)

    const failedEntries = collector.getEntriesByStatus('failed')
    expect(failedEntries.length).toBe(1)
    expect(failedEntries[0].taskId).toBe('TASK-002')
  })

  test('should calculate average tokens per task', () => {
    collector.recordUsage('TASK-001', 'model', { inputTokens: 1000, outputTokens: 500 }, 'success')
    collector.recordUsage('TASK-002', 'model', { inputTokens: 2000, outputTokens: 1000 }, 'success')

    const summary = collector.getSummary()
    expect(summary.avgTokensPerTask).toBe(2250)
    expect(summary.avgInputTokens).toBe(1500)
    expect(summary.avgOutputTokens).toBe(750)
  })

  test('should get top models by token usage', () => {
    collector.recordUsage('TASK-001', 'claude-3.5-sonnet', { inputTokens: 1000, outputTokens: 500 }, 'success')
    collector.recordUsage('TASK-002', 'gpt-4', { inputTokens: 5000, outputTokens: 2500 }, 'success')
    collector.recordUsage('TASK-003', 'gemini-flash', { inputTokens: 2000, outputTokens: 1000 }, 'success')

    const topModels = collector.getTopModels(2)
    expect(topModels.length).toBe(2)
    expect(topModels[0].model).toBe('gpt-4')
    expect(topModels[1].model).toBe('gemini-flash')
  })

  test('should detect upward trend', () => {
    for (let i = 0; i < 20; i++) {
      collector.recordUsage(`TASK-${i}`, 'model', { inputTokens: 1000 + i * 100, outputTokens: 500 + i * 50 }, 'success')
    }

    const trend = collector.getTrend(10)
    expect(trend.input).toBe('up')
    expect(trend.output).toBe('up')
  })

  test('should detect downward trend', () => {
    for (let i = 0; i < 20; i++) {
      collector.recordUsage(`TASK-${i}`, 'model', { inputTokens: 2000 - i * 100, outputTokens: 1000 - i * 50 }, 'success')
    }

    const trend = collector.getTrend(10)
    expect(trend.input).toBe('down')
    expect(trend.output).toBe('down')
  })

  test('should detect stable trend', () => {
    for (let i = 0; i < 20; i++) {
      collector.recordUsage(`TASK-${i}`, 'model', { inputTokens: 1000, outputTokens: 500 }, 'success')
    }

    const trend = collector.getTrend(10)
    expect(trend.input).toBe('stable')
    expect(trend.output).toBe('stable')
  })

  test('should return stable trend with insufficient data', () => {
    collector.recordUsage('TASK-001', 'model', { inputTokens: 1000, outputTokens: 500 }, 'success')

    const trend = collector.getTrend(10)
    expect(trend.input).toBe('stable')
    expect(trend.output).toBe('stable')
  })

  test('should respect max entries limit', () => {
    collector = new TokenMetricsCollector({ maxEntries: 5 })

    for (let i = 0; i < 10; i++) {
      collector.recordUsage(`TASK-${i}`, 'model', { inputTokens: 100, outputTokens: 50 }, 'success')
    }

    const entries = collector.getEntries()
    expect(entries.length).toBe(5)
    expect(entries[0].taskId).toBe('TASK-5')
    expect(entries[4].taskId).toBe('TASK-9')
  })

  test('should calculate totals correctly', () => {
    collector.recordUsage('TASK-001', 'model', { inputTokens: 1000, outputTokens: 500 }, 'success')
    collector.recordUsage('TASK-002', 'model', { inputTokens: 2000, outputTokens: 1000 }, 'success')

    expect(collector.getTotalTokens()).toBe(4500)
    expect(collector.getAverageTokensPerTask()).toBe(2250)
  })

  test('should return zero for empty collector', () => {
    expect(collector.getTotalTokens()).toBe(0)
    expect(collector.getAverageTokensPerTask()).toBe(0)
    expect(collector.getSummary().taskCount).toBe(0)
  })

  test('should implement IMetricsCollector interface', () => {
    collector.increment('counter', 1)
    collector.decrement('counter', 1)
    collector.gauge('gauge', 100)
    collector.timing('timing', 1000)

    expect(() => collector.flush()).not.toThrow()
  })

  test('should clear all entries', () => {
    collector.recordUsage('TASK-001', 'model', { inputTokens: 1000, outputTokens: 500 }, 'success')
    collector.clear()

    expect(collector.getSummary().taskCount).toBe(0)
    expect(collector.getEntries().length).toBe(0)
  })

  test('should track by model when enabled', () => {
    collector = new TokenMetricsCollector({ trackByModel: true })

    collector.recordUsage('TASK-001', 'claude-3.5-sonnet', { inputTokens: 1000, outputTokens: 500 }, 'success')
    collector.recordUsage('TASK-002', 'claude-3.5-sonnet', { inputTokens: 2000, outputTokens: 1000 }, 'success')
    collector.recordUsage('TASK-003', 'gpt-4', { inputTokens: 3000, outputTokens: 1500 }, 'success')

    const summary = collector.getSummary()
    expect(Object.keys(summary.byModel).length).toBe(2)
    expect(summary.byModel['claude-3.5-sonnet'].taskCount).toBe(2)
    expect(summary.byModel['gpt-4'].taskCount).toBe(1)
  })

  test('should not track by model when disabled', () => {
    collector = new TokenMetricsCollector({ trackByModel: false })

    collector.recordUsage('TASK-001', 'claude-3.5-sonnet', { inputTokens: 1000, outputTokens: 500 }, 'success')
    collector.recordUsage('TASK-002', 'gpt-4', { inputTokens: 2000, outputTokens: 1000 }, 'success')

    const summary = collector.getSummary()
    expect(Object.keys(summary.byModel).length).toBe(0)
  })

  test('factory function should create collector', () => {
    const factoryCollector = createTokenMetricsCollector({ maxEntries: 100 })
    expect(factoryCollector).toBeInstanceOf(TokenMetricsCollector)

    factoryCollector.recordUsage('TASK-001', 'model', { inputTokens: 100, outputTokens: 50 }, 'success')
    expect(factoryCollector.getSummary().taskCount).toBe(1)
  })
})

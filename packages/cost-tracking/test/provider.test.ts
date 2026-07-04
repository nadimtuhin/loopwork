import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { CostTrackingTelemetryProvider, createCostTelemetryProvider } from '../src/provider'
import type { ITelemetryProvider, IMetricsCollector, StructuredLog } from '@loopwork-ai/contracts'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('CostTrackingTelemetryProvider', () => {
  const TEST_DIR = path.join(os.tmpdir(), 'loopwork-telemetry-provider-test-' + Date.now())

  beforeEach(() => {
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true })
    }
  })

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  test('should create provider with options', () => {
    const provider = createCostTelemetryProvider({
      projectRoot: TEST_DIR,
      namespace: 'test',
    })

    expect(provider).toBeDefined()
    expect(provider.metrics).toBeDefined()
  })

  test('should implement ITelemetryProvider interface', () => {
    const provider = new CostTrackingTelemetryProvider({
      projectRoot: TEST_DIR,
      namespace: 'test',
    })

    expect(typeof provider.log).toBe('function')
    expect(provider.metrics).toBeDefined()
    expect(typeof provider.flush).toBe('function')
  })

  test('should record usage and update metrics', () => {
    const provider = new CostTrackingTelemetryProvider({
      projectRoot: TEST_DIR,
      namespace: 'test',
    })

    provider.recordUsage(
      'TASK-001',
      'claude-3.5-sonnet',
      { inputTokens: 1000, outputTokens: 500 },
      30,
      'success'
    )

    expect(provider.metrics.getValue('tasks.total')).toBe(1)
    expect(provider.metrics.getValue('tasks.success')).toBe(1)
    expect(provider.metrics.getValue('tokens.input')).toBe(1000)
    expect(provider.metrics.getValue('tokens.output')).toBe(500)
    expect(provider.metrics.getValue('cost.total')).toBeGreaterThan(0)
  })

  test('should track failed tasks separately', () => {
    const provider = new CostTrackingTelemetryProvider({
      projectRoot: TEST_DIR,
      namespace: 'test',
    })

    provider.recordUsage(
      'TASK-001',
      'claude-3.5-sonnet',
      { inputTokens: 1000, outputTokens: 500 },
      30,
      'failed',
      'Connection error'
    )

    expect(provider.metrics.getValue('tasks.total')).toBe(1)
    expect(provider.metrics.getValue('tasks.failed')).toBe(1)
    expect(provider.metrics.getValue('tasks.success')).toBeUndefined()
  })

  test('should track cache tokens when provided', () => {
    const provider = new CostTrackingTelemetryProvider({
      projectRoot: TEST_DIR,
      namespace: 'test',
    })

    provider.recordUsage(
      'TASK-001',
      'claude-3.5-sonnet',
      { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 200, cacheWriteTokens: 100 },
      30,
      'success'
    )

    expect(provider.metrics.getValue('tokens.cache.read')).toBe(200)
    expect(provider.metrics.getValue('tokens.cache.write')).toBe(100)
  })

  test('should extract usage from log metadata', () => {
    const provider = new CostTrackingTelemetryProvider({
      projectRoot: TEST_DIR,
      namespace: 'test',
    })

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
        duration: 45,
      },
    }

    provider.log(logEntry)

    expect(provider.metrics.getValue('tasks.total')).toBe(1)
    expect(provider.metrics.getValue('tokens.input')).toBe(1500)
  })

  test('should track log levels in metrics', () => {
    const provider = new CostTrackingTelemetryProvider({
      projectRoot: TEST_DIR,
      namespace: 'test',
    })

    provider.log({
      level: 'info',
      message: 'Info message',
      timestamp: new Date().toISOString(),
    })

    provider.log({
      level: 'warn',
      message: 'Warning message',
      timestamp: new Date().toISOString(),
    })

    provider.log({
      level: 'error',
      message: 'Error message',
      timestamp: new Date().toISOString(),
    })

    expect(provider.metrics.getValue('logs.info')).toBe(1)
    expect(provider.metrics.getValue('logs.warn')).toBe(1)
    expect(provider.metrics.getValue('logs.error')).toBe(1)
    expect(provider.metrics.getValue('errors.total')).toBe(1)
  })

  test('should track namespace in metrics when provided', () => {
    const provider = new CostTrackingTelemetryProvider({
      projectRoot: TEST_DIR,
      namespace: 'test',
    })

    provider.log({
      level: 'info',
      message: 'Namespaced message',
      timestamp: new Date().toISOString(),
      namespace: 'my-namespace',
    })

    expect(provider.metrics.getValue('logs.namespace.my-namespace')).toBe(1)
  })

  test('should provide access to underlying CostTracker', () => {
    const provider = new CostTrackingTelemetryProvider({
      projectRoot: TEST_DIR,
      namespace: 'test',
    })

    const tracker = provider.getCostTracker()
    expect(tracker).toBeDefined()
    expect(typeof tracker.record).toBe('function')
  })

  test('should get today summary', () => {
    const provider = new CostTrackingTelemetryProvider({
      projectRoot: TEST_DIR,
      namespace: 'test',
    })

    provider.recordUsage(
      'TASK-001',
      'claude-3.5-sonnet',
      { inputTokens: 1000, outputTokens: 500 },
      30,
      'success'
    )

    const summary = provider.getTodaySummary()
    expect(summary.taskCount).toBe(1)
    expect(summary.totalInputTokens).toBe(1000)
    expect(summary.totalOutputTokens).toBe(500)
  })

  test('should get task summary', () => {
    const provider = new CostTrackingTelemetryProvider({
      projectRoot: TEST_DIR,
      namespace: 'test',
    })

    provider.recordUsage(
      'TASK-001',
      'claude-3.5-sonnet',
      { inputTokens: 1000, outputTokens: 500 },
      30,
      'success'
    )

    const summary = provider.getTaskSummary('TASK-001')
    expect(summary.taskCount).toBe(1)
  })

  test('should get telemetry report', () => {
    const provider = new CostTrackingTelemetryProvider({
      projectRoot: TEST_DIR,
      namespace: 'test',
    })

    provider.recordUsage(
      'TASK-001',
      'claude-3.5-sonnet',
      { inputTokens: 1000, outputTokens: 500 },
      30,
      'success'
    )

    const report = provider.getTelemetryReport()
    expect(report.summary.taskCount).toBe(1)
    expect(report.byModel['claude-3.5-sonnet']).toBeDefined()
  })

  test('should validate budgets', () => {
    const provider = new CostTrackingTelemetryProvider({
      projectRoot: TEST_DIR,
      namespace: 'test',
      config: {
        dailyBudget: 10.0,
        perTaskBudget: 5.0,
      },
    })

    const validation = provider.validateBudgets('TASK-001')
    expect(validation.allowed).toBe(true)
    expect(validation.warnings).toEqual([])
  })

  test('should check daily budget', () => {
    const provider = new CostTrackingTelemetryProvider({
      projectRoot: TEST_DIR,
      namespace: 'test',
    })

    provider.recordUsage(
      'TASK-001',
      'claude-3.5-sonnet',
      { inputTokens: 1000, outputTokens: 500 },
      30,
      'success'
    )

    const check = provider.checkDailyBudget(10.0)
    expect(check.allowed).toBe(true)
    expect(check.currentCost).toBeGreaterThan(0)
  })

  test('should flush pending logs', async () => {
    const provider = new CostTrackingTelemetryProvider({
      projectRoot: TEST_DIR,
      namespace: 'test',
    })

    await provider.flush()
    expect(true).toBe(true)
  })

  test('should parse usage from output', () => {
    const provider = new CostTrackingTelemetryProvider({
      projectRoot: TEST_DIR,
      namespace: 'test',
    })

    const claudeOutput = 'Done. Tokens: 1234 input, 567 output'
    const usage = provider.parseUsageFromOutput(claudeOutput)

    expect(usage).toEqual({ inputTokens: 1234, outputTokens: 567 })
  })

  test('should store timing metrics', () => {
    const provider = new CostTrackingTelemetryProvider({
      projectRoot: TEST_DIR,
      namespace: 'test',
    })

    provider.recordUsage(
      'TASK-001',
      'claude-3.5-sonnet',
      { inputTokens: 1000, outputTokens: 500 },
      30,
      'success'
    )

    const timing = provider.metrics.getValue('timing:task.duration')
    expect(timing).toBe(30000)
  })

  test('should return all metrics', () => {
    const provider = new CostTrackingTelemetryProvider({
      projectRoot: TEST_DIR,
      namespace: 'test',
    })

    provider.recordUsage(
      'TASK-001',
      'claude-3.5-sonnet',
      { inputTokens: 1000, outputTokens: 500 },
      30,
      'success'
    )

    const allMetrics = (provider.metrics as any).getAllMetrics()
    expect(Object.keys(allMetrics).length).toBeGreaterThan(0)
    expect(allMetrics['tasks.total']).toBeDefined()
  })
})

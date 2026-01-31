import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { CostTracker, formatTelemetryReport } from '../src'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('Cost Tracking - Telemetry & Error Correlation', () => {
  const TEST_DIR = path.join(os.tmpdir(), 'loopwork-telemetry-test-' + Date.now())
  
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

  test('CostTracker records status and errors', () => {
    const tracker = new CostTracker(TEST_DIR, 'test-ns')
    
    tracker.record('TASK-001', 'claude-3.5-sonnet', { inputTokens: 100, outputTokens: 50 }, 5, 'success')
    tracker.record('TASK-002', 'claude-3.5-sonnet', { inputTokens: 200, outputTokens: 100 }, 10, 'failed', 'Connection timeout', 2)
    
    const report = tracker.getTelemetryReport()
    
    expect(report.summary.taskCount).toBe(2)
    expect(report.summary.successCount).toBe(1)
    expect(report.summary.failureCount).toBe(1)
    expect(report.recentFailures.length).toBe(1)
    expect(report.recentFailures[0].taskId).toBe('TASK-002')
    expect(report.recentFailures[0].error).toBe('Connection timeout')
    expect(report.recentFailures[0].iteration).toBe(2)

    // Check new metrics
    expect(report.summary.avgCostPerTask).toBeGreaterThan(0)
    // Total tokens: 150 + 300 = 450. Total duration: 5 + 10 = 15. Avg speed: 450/15 = 30
    expect(report.summary.avgTokensPerSecond).toBe(30)
  })

  test('CostTracker correlates errors', () => {
    const tracker = new CostTracker(TEST_DIR, 'test-ns-errors')
    
    tracker.record('TASK-001', 'claude-3.5-sonnet', { inputTokens: 100, outputTokens: 50 }, 5, 'failed', 'Rate limit exceeded')
    tracker.record('TASK-002', 'claude-3.5-sonnet', { inputTokens: 100, outputTokens: 50 }, 5, 'failed', 'Rate limit exceeded')
    tracker.record('TASK-003', 'claude-3.5-sonnet', { inputTokens: 100, outputTokens: 50 }, 5, 'failed', 'Context length exceeded')
    
    const report = tracker.getTelemetryReport()
    
    expect(report.errorCorrelation.length).toBe(2)
    expect(report.errorCorrelation[0].message).toBe('Rate limit exceeded')
    expect(report.errorCorrelation[0].count).toBe(2)
    expect(report.errorCorrelation[1].message).toBe('Context length exceeded')
    expect(report.errorCorrelation[1].count).toBe(1)
  })

  test('formatTelemetryReport() produces expected output', () => {
    const tracker = new CostTracker(TEST_DIR, 'test-ns-format')
    
    tracker.record('TASK-001', 'claude-3.5-sonnet', { inputTokens: 1000, outputTokens: 500 }, 2, 'success')
    tracker.record('TASK-002', 'gpt-4o', { inputTokens: 2000, outputTokens: 1000 }, 5, 'failed', 'Rate limit exceeded')
    
    const report = tracker.getTelemetryReport()
    const formatted = formatTelemetryReport(report)
    
    expect(formatted).toContain('Telemetry & Token Metrics Report')
    expect(formatted).toContain('Overall Summary')
    expect(formatted).toContain('Tasks: 2 (1 success, 1 failed, 50.0% success rate)')
    expect(formatted).toContain('Breakdown by Model')
    expect(formatted).toContain('claude-3.5-sonnet')
    expect(formatted).toContain('gpt-4o')
    expect(formatted).toContain('Recent Failures:')
    expect(formatted).toContain('Rate limit exceeded')
    expect(formatted).toContain('Error Correlation (Top Issues):')
    expect(formatted).toContain('Speed:')
    expect(formatted).toContain('tokens/sec')
  })

  test('parseUsageFromOutput supports various formats', () => {
    const tracker = new CostTracker(TEST_DIR, 'test-ns-parse')
    
    const claudeOutput = 'Done. Tokens: 1234 input, 567 output'
    const usage1 = tracker.parseUsageFromOutput(claudeOutput)
    expect(usage1).toEqual({ inputTokens: 1234, outputTokens: 567 })
    
    const openCodeOutput = 'Usage: 1000 prompt tokens, 500 completion tokens'
    const usage2 = tracker.parseUsageFromOutput(openCodeOutput)
    expect(usage2).toEqual({ inputTokens: 1000, outputTokens: 500 })
    
    const jsonOutput = 'Final metrics: {"input_tokens": 100, "output_tokens": 50}'
    const usage3 = tracker.parseUsageFromOutput(jsonOutput)
    expect(usage3).toEqual({ inputTokens: 100, outputTokens: 50 })
  })
})

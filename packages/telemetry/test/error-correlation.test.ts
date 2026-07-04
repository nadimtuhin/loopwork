import { describe, expect, test, beforeEach } from 'bun:test'
import { ErrorCorrelationAnalyzer, createErrorCorrelationAnalyzer } from '../src/error-correlation'

describe('ErrorCorrelationAnalyzer', () => {
  let analyzer: ErrorCorrelationAnalyzer

  beforeEach(() => {
    analyzer = new ErrorCorrelationAnalyzer()
  })

  test('should record error entry', () => {
    analyzer.record({
      message: 'Connection timeout',
      taskId: 'TASK-001',
      model: 'claude-3.5-sonnet',
      timestamp: new Date(),
    })

    expect(analyzer.getErrorCount()).toBe(1)
  })

  test('should record error with recordError method', () => {
    analyzer.recordError('API rate limit exceeded', 'TASK-002', 'gpt-4')
    expect(analyzer.getErrorCount()).toBe(1)
  })

  test('should group similar errors', () => {
    analyzer.recordError('Connection timeout after 30s', 'TASK-001', 'claude')
    analyzer.recordError('Connection timeout after 45s', 'TASK-002', 'claude')
    analyzer.recordError('Connection timeout after 60s', 'TASK-003', 'gpt-4')

    const groups = analyzer.analyze()
    expect(groups.length).toBe(1)
    expect(groups[0].count).toBe(3)
    expect(groups[0].affectedTasks).toContain('TASK-001')
    expect(groups[0].affectedTasks).toContain('TASK-002')
    expect(groups[0].affectedTasks).toContain('TASK-003')
  })

  test('should group different errors separately', () => {
    analyzer.recordError('Connection timeout', 'TASK-001', 'claude')
    analyzer.recordError('API rate limit exceeded', 'TASK-002', 'claude')
    analyzer.recordError('Invalid API key', 'TASK-003', 'gpt-4')

    const groups = analyzer.analyze()
    expect(groups.length).toBe(3)
  })

  test('should track affected models', () => {
    analyzer.recordError('Connection timeout', 'TASK-001', 'claude')
    analyzer.recordError('Connection timeout', 'TASK-002', 'claude')
    analyzer.recordError('Connection timeout', 'TASK-003', 'gpt-4')

    const groups = analyzer.analyze()
    expect(groups[0].affectedModels).toContain('claude')
    expect(groups[0].affectedModels).toContain('gpt-4')
    expect(groups[0].affectedModels.length).toBe(2)
  })

  test('should generate correlation report', () => {
    analyzer.recordError('Error A', 'TASK-001', 'claude')
    analyzer.recordError('Error A', 'TASK-002', 'claude')
    analyzer.recordError('Error B', 'TASK-003', 'gpt-4')

    const report = analyzer.getReport()
    expect(report.totalErrors).toBe(3)
    expect(report.uniqueErrorTypes).toBe(2)
    expect(report.mostCommonError).not.toBeNull()
    expect(report.mostCommonError!.count).toBe(2)
    expect(report.groups.length).toBe(2)
  })

  test('should track first and last occurrence', () => {
    const now = new Date()
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    analyzer.record({ message: 'Error', taskId: 'TASK-001', timestamp: yesterday })
    analyzer.record({ message: 'Error', taskId: 'TASK-002', timestamp: now })

    const groups = analyzer.analyze()
    expect(groups[0].firstOccurred).toEqual(yesterday)
    expect(groups[0].lastOccurred).toEqual(now)
  })

  test('should limit examples per group', () => {
    analyzer = new ErrorCorrelationAnalyzer({ maxExamplesPerGroup: 2 })

    analyzer.recordError('Same error', 'TASK-001', 'claude')
    analyzer.recordError('Same error', 'TASK-002', 'claude')
    analyzer.recordError('Same error', 'TASK-003', 'claude')
    analyzer.recordError('Same error', 'TASK-004', 'claude')

    const groups = analyzer.analyze()
    expect(groups[0].examples.length).toBe(2)
  })

  test('should get task-specific errors', () => {
    analyzer.recordError('Error 1', 'TASK-A', 'claude')
    analyzer.recordError('Error 2', 'TASK-B', 'claude')
    analyzer.recordError('Error 3', 'TASK-A', 'claude')

    const taskAErrors = analyzer.getTaskErrors('TASK-A')
    expect(taskAErrors.length).toBe(2)

    const taskBErrors = analyzer.getTaskErrors('TASK-B')
    expect(taskBErrors.length).toBe(1)
  })

  test('should get model-specific errors', () => {
    analyzer.recordError('Error 1', 'TASK-001', 'claude')
    analyzer.recordError('Error 2', 'TASK-002', 'gpt-4')
    analyzer.recordError('Error 3', 'TASK-003', 'claude')

    const claudeErrors = analyzer.getModelErrors('claude')
    expect(claudeErrors.length).toBe(2)

    const gptErrors = analyzer.getModelErrors('gpt-4')
    expect(gptErrors.length).toBe(1)
  })

  test('should get recent errors', () => {
    const now = new Date()
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)
    const yesterday = new Date(now.getTime() - 25 * 60 * 60 * 1000)

    analyzer.record({ message: 'Recent error', taskId: 'TASK-001', timestamp: now })
    analyzer.record({ message: '2h old error', taskId: 'TASK-002', timestamp: twoHoursAgo })
    analyzer.record({ message: 'Old error', taskId: 'TASK-003', timestamp: yesterday })

    const recent = analyzer.getRecentErrors(24)
    expect(recent.length).toBe(2)
  })

  test('should get groups for specific task', () => {
    analyzer.recordError('Error type A', 'TASK-001', 'claude')
    analyzer.recordError('Error type A', 'TASK-002', 'claude')
    analyzer.recordError('Error type B', 'TASK-001', 'claude')

    const taskGroups = analyzer.getGroupsForTask('TASK-001')
    expect(taskGroups.length).toBe(2)
  })

  test('should find similar errors', () => {
    analyzer.recordError('Connection timeout to server A', 'TASK-001', 'claude')
    analyzer.recordError('Connection timeout to server B', 'TASK-002', 'claude')
    analyzer.recordError('Rate limit exceeded', 'TASK-003', 'gpt-4')

    const similar = analyzer.findSimilar('Connection timeout to server C', 0.7)
    expect(similar.length).toBe(2)
  })

  test('should filter with ignore patterns', () => {
    analyzer = new ErrorCorrelationAnalyzer({ ignorePatterns: ['.*noise.*'] })

    analyzer.recordError('This is just noise in logs', 'TASK-001', 'claude')
    analyzer.recordError('Real error occurred', 'TASK-002', 'claude')

    expect(analyzer.getErrorCount()).toBe(1)
  })

  test('should handle empty analyzer', () => {
    const groups = analyzer.analyze()
    expect(groups.length).toBe(0)

    const report = analyzer.getReport()
    expect(report.totalErrors).toBe(0)
    expect(report.uniqueErrorTypes).toBe(0)
    expect(report.mostCommonError).toBeNull()
  })

  test('should normalize error signatures', () => {
    analyzer.recordError('Error code: 12345', 'TASK-001', 'claude')
    analyzer.recordError('Error code: 67890', 'TASK-002', 'claude')

    const groups = analyzer.analyze()
    expect(groups.length).toBe(1)
    expect(groups[0].count).toBe(2)
  })

  test('should normalize hex IDs in signatures', () => {
    analyzer.recordError('Failed with id: abc123def456', 'TASK-001', 'claude')
    analyzer.recordError('Failed with id: fed456abc789', 'TASK-002', 'claude')

    const groups = analyzer.analyze()
    expect(groups.length).toBe(1)
  })

  test('should report recent errors by time window', () => {
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

    analyzer.record({ message: 'New error', taskId: 'TASK-001', timestamp: now })
    analyzer.record({ message: 'Old error', taskId: 'TASK-002', timestamp: oneHourAgo })

    const report = analyzer.getReport()
    expect(report.recentlyOccurred.length).toBeGreaterThan(0)
  })

  test('should group errors by model in report', () => {
    analyzer.recordError('Error A', 'TASK-001', 'claude')
    analyzer.recordError('Error B', 'TASK-002', 'claude')
    analyzer.recordError('Error C', 'TASK-003', 'gpt-4')

    const report = analyzer.getReport()
    expect(Object.keys(report.byModel).length).toBe(2)
    expect(report.byModel['claude'].length).toBe(2)
    expect(report.byModel['gpt-4'].length).toBe(1)
  })

  test('should clear all errors', () => {
    analyzer.recordError('Error', 'TASK-001', 'claude')
    analyzer.clear()

    expect(analyzer.getErrorCount()).toBe(0)
    expect(analyzer.analyze().length).toBe(0)
  })

  test('factory function should create analyzer', () => {
    const factoryAnalyzer = createErrorCorrelationAnalyzer({ maxExamplesPerGroup: 5 })
    expect(factoryAnalyzer).toBeInstanceOf(ErrorCorrelationAnalyzer)

    factoryAnalyzer.recordError('Test error', 'TASK-001', 'claude')
    expect(factoryAnalyzer.getErrorCount()).toBe(1)
  })

  test('should respect signature max length', () => {
    analyzer = new ErrorCorrelationAnalyzer({ signatureMaxLength: 20 })

    const longMessage = 'This is a very long error message that should be truncated for signature purposes'
    analyzer.recordError(longMessage, 'TASK-001', 'claude')

    const groups = analyzer.analyze()
    expect(groups[0].signature.length).toBeLessThanOrEqual(20)
  })
})

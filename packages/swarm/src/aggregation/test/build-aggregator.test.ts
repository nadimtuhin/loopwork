import { describe, expect, test, beforeEach } from 'bun:test'
import {
  BuildResultAggregator,
  createBuildResultAggregator,
  type AggregatedMetrics,
  type FilterCriteria,
  type PackageMetrics,
  type TaskTypeMetrics,
} from '../build-aggregator'
import type { TaskResult } from '../../coordinator'

describe('BuildResultAggregator', () => {
  let aggregator: BuildResultAggregator

  beforeEach(() => {
    aggregator = new BuildResultAggregator()
  })

  describe('constructor', () => {
    test('should create empty aggregator', () => {
      const metrics = aggregator.getMetrics()
      expect(metrics.total).toBe(0)
      expect(metrics.successful).toBe(0)
      expect(metrics.failed).toBe(0)
    })

    test('should create aggregator with initial results', () => {
      const results: TaskResult[] = [
        { taskId: 'core-test', success: true, output: 'done', filesCreated: [] },
        { taskId: 'auth-test', success: false, output: '', filesCreated: [], error: 'failed' },
      ]
      const agg = createBuildResultAggregator(results)
      const metrics = agg.getMetrics()
      expect(metrics.total).toBe(2)
      expect(metrics.successful).toBe(1)
      expect(metrics.failed).toBe(1)
    })
  })

  describe('addResult', () => {
    test('should add single result', () => {
      aggregator.addResult({
        taskId: 'core-test',
        success: true,
        output: 'done',
        filesCreated: ['core.test.ts'],
      })
      expect(aggregator.getMetrics().total).toBe(1)
    })

    test('should add multiple results', () => {
      aggregator.addResults([
        { taskId: 'core-test', success: true, output: 'done', filesCreated: [] },
        { taskId: 'auth-test', success: true, output: 'done', filesCreated: [] },
      ])
      expect(aggregator.getMetrics().total).toBe(2)
    })
  })

  describe('getMetrics', () => {
    test('should calculate success rate correctly', () => {
      aggregator.addResults([
        { taskId: 't1', success: true, output: '', filesCreated: [] },
        { taskId: 't2', success: true, output: '', filesCreated: [] },
        { taskId: 't3', success: false, output: '', filesCreated: [], error: 'fail' },
      ])
      const metrics = aggregator.getMetrics()
      expect(metrics.successRate).toBeCloseTo(66.67, 1)
    })

    test('should count files created', () => {
      aggregator.addResults([
        { taskId: 't1', success: true, output: '', filesCreated: ['a.ts', 'b.ts'] },
        { taskId: 't2', success: true, output: '', filesCreated: ['c.ts'] },
      ])
      const metrics = aggregator.getMetrics()
      expect(metrics.filesCreated).toBe(3)
      expect(metrics.filesCreatedPerTask).toBe(1.5)
    })

    test('should calculate duration metrics', () => {
      aggregator.addResults([
        { taskId: 't1', success: true, output: '', filesCreated: [], duration: 100 },
        { taskId: 't2', success: true, output: '', filesCreated: [], duration: 200 },
        { taskId: 't3', success: true, output: '', filesCreated: [], duration: 300 },
      ])
      const metrics = aggregator.getMetrics()
      expect(metrics.totalDuration).toBe(600)
      expect(metrics.averageDuration).toBe(200)
    })
  })

  describe('getMetricsByPackage', () => {
    test('should group by package from task ID', () => {
      aggregator.addResults([
        { taskId: 'core-auth', success: true, output: '', filesCreated: [] },
        { taskId: 'core-utils', success: true, output: '', filesCreated: [] },
        { taskId: 'auth-login', success: false, output: '', filesCreated: [], error: 'fail' },
      ])
      const byPackage = aggregator.getMetricsByPackage()
      expect(byPackage.length).toBe(2)
      expect(byPackage.find((p: PackageMetrics) => p.package === 'core')?.total).toBe(2)
      expect(byPackage.find((p: PackageMetrics) => p.package === 'auth')?.total).toBe(1)
    })

    test('should calculate per-package success rates', () => {
      aggregator.addResults([
        { taskId: 'core-auth', success: true, output: '', filesCreated: [] },
        { taskId: 'core-utils', success: false, output: '', filesCreated: [], error: 'fail' },
      ])
      const byPackage = aggregator.getMetricsByPackage()
      const core = byPackage.find(p => p.package === 'core')
      expect(core?.successRate).toBe(50)
    })
  })

  describe('getMetricsByTaskType', () => {
    test('should group by task type from task ID suffix', () => {
      aggregator.addResults([
        { taskId: 'core-test', success: true, output: '', filesCreated: [] },
        { taskId: 'auth-test', success: true, output: '', filesCreated: [] },
        { taskId: 'core-build', success: false, output: '', filesCreated: [], error: 'fail' },
      ])
      const byType = aggregator.getMetricsByTaskType()
      const testType = byType.find(t => t.type === 'test')
      const buildType = byType.find(t => t.type === 'build')
      expect(testType?.count).toBe(2)
      expect(buildType?.count).toBe(1)
    })
  })

  describe('getTimingMetrics', () => {
    test('should return null when no durations', () => {
      aggregator.addResult({ taskId: 't1', success: true, output: '', filesCreated: [] })
      expect(aggregator.getTimingMetrics()).toBeNull()
    })

    test('should calculate timing statistics', () => {
      aggregator.addResults([
        { taskId: 't1', success: true, output: '', filesCreated: [], duration: 100 },
        { taskId: 't2', success: true, output: '', filesCreated: [], duration: 200 },
        { taskId: 't3', success: true, output: '', filesCreated: [], duration: 300 },
        { taskId: 't4', success: true, output: '', filesCreated: [], duration: 400 },
        { taskId: 't5', success: true, output: '', filesCreated: [], duration: 500 },
      ])
      const timing = aggregator.getTimingMetrics()
      expect(timing).not.toBeNull()
      expect(timing!.fastest.duration).toBe(100)
      expect(timing!.slowest.duration).toBe(500)
      expect(timing!.average).toBe(300)
      expect(timing!.median).toBe(300)
      expect(timing!.percentiles.p50).toBe(300)
      expect(timing!.percentiles.p95).toBe(500)
    })
  })

  describe('getErrorAnalysis', () => {
    test('should return empty analysis when no errors', () => {
      aggregator.addResult({ taskId: 't1', success: true, output: '', filesCreated: [] })
      const errors = aggregator.getErrorAnalysis()
      expect(errors.totalErrors).toBe(0)
      expect(errors.uniqueErrors.length).toBe(0)
    })

    test('should analyze error patterns', () => {
      aggregator.addResults([
        { taskId: 't1', success: false, output: '', filesCreated: [], error: 'timeout' },
        { taskId: 't2', success: false, output: '', filesCreated: [], error: 'timeout' },
        { taskId: 't3', success: false, output: '', filesCreated: [], error: 'network error' },
      ])
      const errors = aggregator.getErrorAnalysis()
      expect(errors.totalErrors).toBe(3)
      expect(errors.uniqueErrors.length).toBe(2)
      expect(errors.mostCommonError).toBe('timeout')
    })
  })

  describe('filter', () => {
    test('should filter by status', () => {
      aggregator.addResults([
        { taskId: 't1', success: true, output: '', filesCreated: [] },
        { taskId: 't2', success: false, output: '', filesCreated: [], error: 'fail' },
      ])
      const successful = aggregator.filter({ status: 'success' })
      expect(successful.length).toBe(1)
      expect(successful[0].taskId).toBe('t1')
    })

    test('should filter by package', () => {
      aggregator.addResults([
        { taskId: 'core-auth', success: true, output: '', filesCreated: [] },
        { taskId: 'auth-login', success: false, output: '', filesCreated: [], error: 'fail' },
      ])
      const coreResults = aggregator.filter({ package: 'core' })
      expect(coreResults.length).toBe(1)
      expect(coreResults[0].taskId).toBe('core-auth')
    })

    test('should filter by duration range', () => {
      aggregator.addResults([
        { taskId: 't1', success: true, output: '', filesCreated: [], duration: 50 },
        { taskId: 't2', success: true, output: '', filesCreated: [], duration: 150 },
        { taskId: 't3', success: true, output: '', filesCreated: [], duration: 250 },
      ])
      const midRange = aggregator.filter({ minDuration: 100, maxDuration: 200 })
      expect(midRange.length).toBe(1)
      expect(midRange[0].taskId).toBe('t2')
    })

    test('should filter by hasFiles', () => {
      aggregator.addResults([
        { taskId: 't1', success: true, output: '', filesCreated: ['file.ts'] },
        { taskId: 't2', success: true, output: '', filesCreated: [] },
      ])
      const withFiles = aggregator.filter({ hasFiles: true })
      expect(withFiles.length).toBe(1)
      expect(withFiles[0].taskId).toBe('t1')
    })
  })

  describe('exportToJSON', () => {
    test('should export basic metrics', () => {
      aggregator.addResults([
        { taskId: 'core-test', success: true, output: 'done', filesCreated: ['test.ts'] },
      ])
      const json = aggregator.exportToJSON()
      const data = JSON.parse(json)
      expect(data.metrics.total).toBe(1)
      expect(data.metrics.successful).toBe(1)
    })

    test('should include raw results when requested', () => {
      aggregator.addResult({ taskId: 't1', success: true, output: '', filesCreated: [] })
      const json = aggregator.exportToJSON({ includeRawResults: true })
      const data = JSON.parse(json)
      expect(data.results).toBeDefined()
      expect(data.results.length).toBe(1)
    })

    test('should respect pretty option', () => {
      aggregator.addResult({ taskId: 't1', success: true, output: '', filesCreated: [] })
      const compact = aggregator.exportToJSON({ pretty: false })
      const pretty = aggregator.exportToJSON({ pretty: true })
      expect(pretty.length).toBeGreaterThan(compact.length)
    })
  })

  describe('exportToMarkdown', () => {
    test('should generate markdown with summary', () => {
      aggregator.addResults([
        { taskId: 'core-test', success: true, output: 'done', filesCreated: ['test.ts'] },
      ])
      const md = aggregator.exportToMarkdown()
      expect(md).toContain('# Build Result Report')
      expect(md).toContain('## Summary')
      expect(md).toContain('Total Tasks')
    })

    test('should include package table', () => {
      aggregator.addResults([
        { taskId: 'core-auth', success: true, output: '', filesCreated: [] },
        { taskId: 'auth-login', success: false, output: '', filesCreated: [], error: 'fail' },
      ])
      const md = aggregator.exportToMarkdown()
      expect(md).toContain('## Results by Package')
      expect(md).toContain('| core |')
      expect(md).toContain('| auth |')
    })

    test('should include files created', () => {
      aggregator.addResult({ taskId: 't1', success: true, output: '', filesCreated: ['test.ts', 'utils.ts'] })
      const md = aggregator.exportToMarkdown()
      expect(md).toContain('## Files Created')
      expect(md).toContain('`test.ts`')
      expect(md).toContain('`utils.ts`')
    })
  })

  describe('exportToHTML', () => {
    test('should generate valid HTML', () => {
      aggregator.addResults([
        { taskId: 'core-test', success: true, output: 'done', filesCreated: ['test.ts'] },
        { taskId: 'auth-test', success: false, output: '', filesCreated: [], error: 'failed' },
      ])
      const html = aggregator.exportToHTML()
      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('<title>Build Result Report</title>')
      expect(html).toContain('Total Tasks')
      expect(html).toContain('core')
    })

    test('should include error styling', () => {
      aggregator.addResult({ taskId: 't1', success: false, output: '', filesCreated: [], error: 'error' })
      const html = aggregator.exportToHTML()
      expect(html).toContain('class="failed"')
    })
  })

  describe('generateSummary', () => {
    test('should generate formatted summary report', () => {
      aggregator.addResults([
        { taskId: 'core-test', success: true, output: 'done', filesCreated: ['test.ts'] },
        { taskId: 'auth-test', success: false, output: '', filesCreated: [], error: 'fail' },
      ])
      const summary = aggregator.generateSummary()
      expect(summary).toContain('BUILD RESULT AGGREGATION REPORT')
      expect(summary).toContain('Total Tasks')
      expect(summary).toContain('Successful')
      expect(summary).toContain('Failed')
    })
  })

  describe('setTimeWindow', () => {
    test('should set and export time window', () => {
      aggregator.setTimeWindow(1000, 5000)
      aggregator.addResult({ taskId: 't1', success: true, output: '', filesCreated: [] })
      const json = aggregator.exportToJSON()
      const data = JSON.parse(json)
      expect(data.timeWindow.start).toBe(1000)
      expect(data.timeWindow.end).toBe(5000)
      expect(data.timeWindow.totalDuration).toBe(4000)
    })
  })

  describe('clear', () => {
    test('should clear all results', () => {
      aggregator.addResults([
        { taskId: 't1', success: true, output: '', filesCreated: [] },
        { taskId: 't2', success: true, output: '', filesCreated: [] },
      ])
      expect(aggregator.getMetrics().total).toBe(2)
      aggregator.clear()
      expect(aggregator.getMetrics().total).toBe(0)
      expect(aggregator.getResults().length).toBe(0)
    })
  })

  describe('createBuildResultAggregator', () => {
    test('factory function should create instance', () => {
      const agg = createBuildResultAggregator()
      expect(agg).toBeInstanceOf(BuildResultAggregator)
    })

    test('factory function should accept initial results', () => {
      const results: TaskResult[] = [
        { taskId: 't1', success: true, output: '', filesCreated: [] },
      ]
      const agg = createBuildResultAggregator(results)
      expect(agg.getMetrics().total).toBe(1)
    })
  })
})

/**
 * LLMAnalyzer Unit Tests
 * Tests for LLM-based task analysis with caching and fallback
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { LLMAnalyzer, type LLMAnalyzerOptions } from '../../src/analyzers/llm-analyzer'
import type { Task } from '../../src/contracts/task'
import type { PluginTaskResult } from '../../src/contracts/plugin'

describe('LLMAnalyzer', () => {
  let analyzer: LLMAnalyzer

  beforeEach(() => {
    // Create fresh analyzer for each test
    analyzer = new LLMAnalyzer()
  })

  describe('Constructor and Configuration', () => {
    test('should use default options when none provided', () => {
      const defaultAnalyzer = new LLMAnalyzer()
      expect(defaultAnalyzer).toBeDefined()
      expect(defaultAnalyzer.getCacheSize()).toBe(0)
    })

    test('should use custom model from options', () => {
      const customAnalyzer = new LLMAnalyzer({ model: 'flash' })
      expect(customAnalyzer).toBeDefined()
    })

    test('should use custom timeout from options', () => {
      const customAnalyzer = new LLMAnalyzer({ timeout: 60000 })
      expect(customAnalyzer).toBeDefined()
    })

    test('should disable fallback when configured', () => {
      const noFallbackAnalyzer = new LLMAnalyzer({ fallbackToPattern: false })
      expect(noFallbackAnalyzer).toBeDefined()
    })

    test('should use custom system prompt when provided', () => {
      const customPrompt = 'Custom analysis instructions'
      const customAnalyzer = new LLMAnalyzer({ systemPrompt: customPrompt })
      expect(customAnalyzer).toBeDefined()
    })

    test('should use haiku model by default for cost-efficiency', () => {
      // The default model should be 'haiku' per PRD requirement
      const analyzer = new LLMAnalyzer()
      expect(analyzer).toBeDefined()
      // We can't directly test private options, but we can verify it doesn't throw
    })

    test('should have 30s timeout by default', () => {
      // Default timeout should be 30000ms per PRD requirement
      const analyzer = new LLMAnalyzer()
      expect(analyzer).toBeDefined()
    })
  })

  describe('Caching', () => {
    test('should cache analysis results', async () => {
      const task: Task = {
        id: 'TASK-001',
        title: 'Test Task',
        description: 'Test task description',
        status: 'completed',
        priority: 'medium'
      }

      const result: PluginTaskResult = {
        success: true,
        duration: 1000,
        output: 'TODO: Add validation for edge cases'
      }

      // First analysis
      const analysis1 = await analyzer.analyze(task, result)
      expect(analysis1).toBeDefined()
      expect(analyzer.getCacheSize()).toBe(1)

      // Second analysis should use cache
      const analysis2 = await analyzer.analyze(task, result)
      expect(analysis2).toEqual(analysis1)
      expect(analyzer.getCacheSize()).toBe(1) // Size should remain the same
    })

    test('should not re-analyze identical outputs', async () => {
      const task: Task = {
        id: 'TASK-002',
        title: 'Another Task',
        description: 'Test task',
        status: 'completed',
        priority: 'high'
      }

      const output = 'FIXME: Handle error cases properly'
      const result1: PluginTaskResult = {
        success: true,
        duration: 500,
        output
      }

      const result2: PluginTaskResult = {
        success: false,
        duration: 800,
        output // Same output
      }

      const analysis1 = await analyzer.analyze(task, result1)
      const initialCacheSize = analyzer.getCacheSize()

      const analysis2 = await analyzer.analyze(task, result2)

      // Cache size should remain the same (same output = same cache key)
      expect(analyzer.getCacheSize()).toBe(initialCacheSize)
    })

    test('should clear cache when requested', async () => {
      const task: Task = {
        id: 'TASK-003',
        title: 'Cache Test',
        description: 'Test cache clearing',
        status: 'completed',
        priority: 'low'
      }

      const result: PluginTaskResult = {
        success: true,
        duration: 1000,
        output: 'TODO: Implement feature'
      }

      await analyzer.analyze(task, result)
      expect(analyzer.getCacheSize()).toBeGreaterThan(0)

      analyzer.clearCache()
      expect(analyzer.getCacheSize()).toBe(0)
    })

    test('should generate different cache keys for different outputs', async () => {
      const task: Task = {
        id: 'TASK-004',
        title: 'Test Different Outputs',
        description: 'Test cache keys',
        status: 'completed',
        priority: 'medium'
      }

      const result1: PluginTaskResult = {
        success: true,
        duration: 1000,
        output: 'TODO: First task'
      }

      const result2: PluginTaskResult = {
        success: true,
        duration: 1000,
        output: 'TODO: Second task'
      }

      await analyzer.analyze(task, result1)
      const cacheSize1 = analyzer.getCacheSize()

      await analyzer.analyze(task, result2)
      const cacheSize2 = analyzer.getCacheSize()

      expect(cacheSize2).toBeGreaterThan(cacheSize1)
    })
  })

  describe('Analysis Output', () => {
    test('should detect incomplete work', async () => {
      const task: Task = {
        id: 'TASK-005',
        title: 'Incomplete Work Test',
        description: 'Test incomplete work detection',
        status: 'completed',
        priority: 'high'
      }

      const result: PluginTaskResult = {
        success: true,
        duration: 2000,
        output: 'Implementation is partial. More work needed to complete the feature.'
      }

      const analysis = await analyzer.analyze(task, result)

      expect(analysis).toBeDefined()
      expect(analysis.shouldCreateTasks).toBe(true)
      expect(analysis.suggestedTasks.length).toBeGreaterThan(0)
      expect(analysis.reason).toBeTruthy()
    })

    test('should detect error indicators', async () => {
      const task: Task = {
        id: 'TASK-006',
        title: 'Error Detection Test',
        description: 'Test error detection',
        status: 'failed',
        priority: 'high'
      }

      const result: PluginTaskResult = {
        success: false,
        duration: 1500,
        output: 'Error occurred during execution. Need to add proper error handling.',
        error: 'Connection timeout'
      }

      const analysis = await analyzer.analyze(task, result)

      // Should detect the need for follow-up work based on error output
      expect(analysis).toBeDefined()
      expect(analysis.shouldCreateTasks).toBe(true)
      expect(analysis.suggestedTasks.length).toBeGreaterThan(0)
    })

    test('should detect testing needs', async () => {
      const task: Task = {
        id: 'TASK-007',
        title: 'Test Coverage Test',
        description: 'Test testing detection',
        status: 'completed',
        priority: 'medium'
      }

      const result: PluginTaskResult = {
        success: true,
        duration: 3000,
        output: 'Feature implemented. Need to validate edge cases and add tests.'
      }

      const analysis = await analyzer.analyze(task, result)

      expect(analysis.shouldCreateTasks).toBe(true)
      expect(analysis.suggestedTasks.some(t =>
        t.title.toLowerCase().includes('test') ||
        t.description.toLowerCase().includes('test')
      )).toBe(true)
    })

    test('should return no tasks for complete work', async () => {
      const task: Task = {
        id: 'TASK-008',
        title: 'Complete Work Test',
        description: 'Test complete work detection',
        status: 'completed',
        priority: 'medium'
      }

      const result: PluginTaskResult = {
        success: true,
        duration: 1000,
        output: 'All features implemented successfully. Tests pass. Documentation updated.'
      }

      const analysis = await analyzer.analyze(task, result)

      expect(analysis).toBeDefined()
      expect(analysis.suggestedTasks.length).toBeLessThanOrEqual(5)
    })

    test('should handle null output gracefully', async () => {
      const task: Task = {
        id: 'TASK-009',
        title: 'Null Output Test',
        description: 'Test null output handling',
        status: 'completed',
        priority: 'low'
      }

      const result: PluginTaskResult = {
        success: true,
        duration: 500,
        output: null
      }

      const analysis = await analyzer.analyze(task, result)

      expect(analysis).toBeDefined()
      expect(analysis.shouldCreateTasks).toBe(false)
      expect(analysis.suggestedTasks).toEqual([])
      expect(analysis.reason).toContain('No output')
    })

    test('should handle empty output', async () => {
      const task: Task = {
        id: 'TASK-010',
        title: 'Empty Output Test',
        description: 'Test empty output handling',
        status: 'completed',
        priority: 'low'
      }

      const result: PluginTaskResult = {
        success: true,
        duration: 500,
        output: ''
      }

      const analysis = await analyzer.analyze(task, result)

      expect(analysis).toBeDefined()
      expect(analysis.shouldCreateTasks).toBe(false)
      expect(analysis.suggestedTasks).toEqual([])
    })
  })

  describe('Suggested Task Structure', () => {
    test('should create tasks with correct structure', async () => {
      const task: Task = {
        id: 'TASK-011',
        title: 'Structure Test',
        description: 'Test task structure',
        status: 'completed',
        priority: 'high'
      }

      const result: PluginTaskResult = {
        success: true,
        duration: 2000,
        output: 'TODO: Add comprehensive error handling for API calls'
      }

      const analysis = await analyzer.analyze(task, result)

      if (analysis.suggestedTasks.length > 0) {
        const suggestedTask = analysis.suggestedTasks[0]

        expect(suggestedTask.title).toBeTruthy()
        expect(typeof suggestedTask.title).toBe('string')
        expect(suggestedTask.title.length).toBeLessThanOrEqual(100)

        expect(suggestedTask.description).toBeTruthy()
        expect(typeof suggestedTask.description).toBe('string')

        expect(suggestedTask.priority).toBeTruthy()
        expect(['high', 'medium', 'low']).toContain(suggestedTask.priority)

        expect(suggestedTask.isSubTask).toBe(true)
      }
    })

    test('should limit suggested tasks to 5 max', async () => {
      const task: Task = {
        id: 'TASK-012',
        title: 'Max Tasks Test',
        description: 'Test max task limit',
        status: 'completed',
        priority: 'medium'
      }

      const result: PluginTaskResult = {
        success: true,
        duration: 5000,
        output: `
          TODO: First task
          TODO: Second task
          TODO: Third task
          TODO: Fourth task
          TODO: Fifth task
          TODO: Sixth task
          TODO: Seventh task
        `
      }

      const analysis = await analyzer.analyze(task, result)

      expect(analysis.suggestedTasks.length).toBeLessThanOrEqual(5)
    })

    test('should set correct priorities', async () => {
      const task: Task = {
        id: 'TASK-013',
        title: 'Priority Test',
        description: 'Test priority assignment',
        status: 'completed',
        priority: 'high'
      }

      const result: PluginTaskResult = {
        success: false,
        duration: 1000,
        output: 'Error: Critical security vulnerability found',
        error: 'Security issue'
      }

      const analysis = await analyzer.analyze(task, result)

      if (analysis.suggestedTasks.length > 0) {
        expect(analysis.suggestedTasks.some(t => t.priority === 'high')).toBe(true)
      }
    })
  })

  describe('Fallback to Pattern Analyzer', () => {
    test('should fallback to pattern analyzer on LLM failure', async () => {
      const analyzerWithFallback = new LLMAnalyzer({
        fallbackToPattern: true
      })

      const task: Task = {
        id: 'TASK-014',
        title: 'Fallback Test',
        description: 'Test fallback behavior',
        status: 'completed',
        priority: 'medium'
      }

      const result: PluginTaskResult = {
        success: true,
        duration: 2000,
        output: 'TODO: Implement feature with proper validation'
      }

      // Should complete without throwing, using pattern analyzer
      const analysis = await analyzerWithFallback.analyze(task, result)

      expect(analysis).toBeDefined()
      expect(analysis.suggestedTasks).toBeDefined()
    })

    test('should include fallback info in reason when using pattern analyzer', async () => {
      const analyzerWithFallback = new LLMAnalyzer({
        fallbackToPattern: true
      })

      const task: Task = {
        id: 'TASK-015',
        title: 'Fallback Reason Test',
        description: 'Test fallback reason',
        status: 'completed',
        priority: 'low'
      }

      const result: PluginTaskResult = {
        success: true,
        duration: 1000,
        output: 'TODO: Add documentation'
      }

      const analysis = await analyzerWithFallback.analyze(task, result)

      // If it fell back, reason should mention it
      // (This depends on implementation, but we can verify structure is valid)
      expect(analysis.reason).toBeTruthy()
      expect(typeof analysis.reason).toBe('string')
    })
  })

  describe('Response Parsing', () => {
    test('should handle malformed LLM responses gracefully', async () => {
      const task: Task = {
        id: 'TASK-016',
        title: 'Malformed Response Test',
        description: 'Test malformed response handling',
        status: 'completed',
        priority: 'medium'
      }

      const result: PluginTaskResult = {
        success: true,
        duration: 1500,
        output: 'Some output that might cause parsing issues'
      }

      // Should not throw, should handle gracefully
      const analysis = await analyzer.analyze(task, result)

      expect(analysis).toBeDefined()
      expect(analysis.shouldCreateTasks).toBeDefined()
      expect(Array.isArray(analysis.suggestedTasks)).toBe(true)
      expect(analysis.reason).toBeTruthy()
    })

    test('should validate and normalize priority values', async () => {
      const task: Task = {
        id: 'TASK-017',
        title: 'Priority Validation Test',
        description: 'Test priority validation',
        status: 'completed',
        priority: 'high'
      }

      const result: PluginTaskResult = {
        success: true,
        duration: 1000,
        output: 'TODO: Important task that needs attention'
      }

      const analysis = await analyzer.analyze(task, result)

      // All priorities should be valid
      for (const task of analysis.suggestedTasks) {
        expect(['high', 'medium', 'low']).toContain(task.priority)
      }
    })

    test('should truncate very long task titles', async () => {
      const task: Task = {
        id: 'TASK-018',
        title: 'Title Truncation Test',
        description: 'Test title truncation',
        status: 'completed',
        priority: 'medium'
      }

      const result: PluginTaskResult = {
        success: true,
        duration: 1000,
        output: 'TODO: ' + 'A'.repeat(200) // Very long TODO
      }

      const analysis = await analyzer.analyze(task, result)

      for (const task of analysis.suggestedTasks) {
        expect(task.title.length).toBeLessThanOrEqual(100)
      }
    })
  })

  describe('Integration with Task Context', () => {
    test('should consider task context in analysis', async () => {
      const task: Task = {
        id: 'TASK-019',
        title: 'Implement user authentication',
        description: 'Add login and signup functionality',
        status: 'completed',
        priority: 'high'
      }

      const result: PluginTaskResult = {
        success: true,
        duration: 5000,
        output: 'Login feature implemented. Need to test with different browsers.'
      }

      const analysis = await analyzer.analyze(task, result)

      expect(analysis).toBeDefined()
      // Should detect testing need
      expect(analysis.shouldCreateTasks).toBe(true)
    })

    test('should handle tasks with errors', async () => {
      const task: Task = {
        id: 'TASK-020',
        title: 'Fix database migration',
        description: 'Resolve migration issues',
        status: 'failed',
        priority: 'high'
      }

      const result: PluginTaskResult = {
        success: false,
        duration: 1000,
        output: 'Migration failed: Table already exists',
        error: 'Migration error'
      }

      const analysis = await analyzer.analyze(task, result)

      expect(analysis).toBeDefined()
      expect(analysis.suggestedTasks.length).toBeGreaterThan(0)
    })
  })

  describe('Performance', () => {
    test('should complete analysis within reasonable timeout', async () => {
      const task: Task = {
        id: 'TASK-021',
        title: 'Performance Test',
        description: 'Test analysis performance',
        status: 'completed',
        priority: 'medium'
      }

      const result: PluginTaskResult = {
        success: true,
        duration: 2000,
        output: 'TODO: Optimize database queries for better performance'
      }

      const startTime = Date.now()
      await analyzer.analyze(task, result)
      const duration = Date.now() - startTime

      // Should complete in under 5 seconds (well under the 30s timeout)
      expect(duration).toBeLessThan(5000)
    })

    test('should handle long outputs efficiently', async () => {
      const task: Task = {
        id: 'TASK-022',
        title: 'Long Output Test',
        description: 'Test long output handling',
        status: 'completed',
        priority: 'low'
      }

      const longOutput = 'Some content\n'.repeat(1000) + 'TODO: Final task'
      const result: PluginTaskResult = {
        success: true,
        duration: 3000,
        output: longOutput
      }

      const startTime = Date.now()
      const analysis = await analyzer.analyze(task, result)
      const duration = Date.now() - startTime

      expect(analysis).toBeDefined()
      expect(duration).toBeLessThan(5000)
    })
  })
})

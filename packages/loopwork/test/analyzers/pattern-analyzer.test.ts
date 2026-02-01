import { describe, test, expect, beforeEach } from 'bun:test'
import { PatternAnalyzer } from '../../src/analyzers/pattern-analyzer'
import type { Task } from '../../src/contracts/task'
import type { PluginTaskResult } from '../../src/contracts/plugin'

describe('PatternAnalyzer', () => {
  let analyzer: PatternAnalyzer
  const mockTask: Task = {
    id: 'TASK-001',
    title: 'Test Task',
    description: 'Test description',
    status: 'completed',
    priority: 'medium'
  }

  beforeEach(() => {
    analyzer = new PatternAnalyzer()
  })

  describe('Pattern Detection', () => {
    test('should detect TODO comments', async () => {
      const result: PluginTaskResult = {
        success: true,
        duration: 100,
        output: 'Some output\nTODO: Implement error handling\nMore output'
      }

      const analysis = await analyzer.analyze(mockTask, result)
      expect(analysis.shouldCreateTasks).toBe(true)
      expect(analysis.suggestedTasks.length).toBe(1)
      expect(analysis.suggestedTasks[0].title).toBe('Implement error handling')
      expect(analysis.suggestedTasks[0].priority).toBe('medium')
    })

    test('should detect FIXME comments', async () => {
      const result: PluginTaskResult = {
        success: true,
        duration: 100,
        output: 'FIXME: Critical bug in parser'
      }

      const analysis = await analyzer.analyze(mockTask, result)
      expect(analysis.shouldCreateTasks).toBe(true)
      expect(analysis.suggestedTasks[0].title).toBe('Critical bug in parser')
      expect(analysis.suggestedTasks[0].priority).toBe('high')
    })

    test('should detect next steps section', async () => {
      const result: PluginTaskResult = {
        success: true,
        duration: 100,
        output: 'Task complete.\nNext steps: Deploy to production and verify'
      }

      const analysis = await analyzer.analyze(mockTask, result)
      expect(analysis.shouldCreateTasks).toBe(true)
      expect(analysis.suggestedTasks[0].title).toBe('Deploy to production and verify')
    })

    test('should detect prerequisite work', async () => {
      const result: PluginTaskResult = {
        success: true,
        duration: 100,
        output: 'Error: Prerequisite: Install Docker first'
      }

      const analysis = await analyzer.analyze(mockTask, result)
      expect(analysis.shouldCreateTasks).toBe(true)
      expect(analysis.suggestedTasks[0].title).toBe('Install Docker first')
      expect(analysis.suggestedTasks[0].priority).toBe('high')
    })

    test('should detect partial completion', async () => {
      const result: PluginTaskResult = {
        success: true,
        duration: 100,
        output: 'Feature partially implemented: Missing UI components'
      }

      const analysis = await analyzer.analyze(mockTask, result)
      expect(analysis.shouldCreateTasks).toBe(true)
      expect(analysis.suggestedTasks[0].title).toBe('Missing UI components')
    })

    test('should detect AI suggestions', async () => {
      const result: PluginTaskResult = {
        success: true,
        duration: 100,
        output: 'I suggest adding: Unit tests for the new API'
      }

      const analysis = await analyzer.analyze(mockTask, result)
      expect(analysis.shouldCreateTasks).toBe(true)
      expect(analysis.suggestedTasks[0].title).toBe('Unit tests for the new API')
      expect(analysis.suggestedTasks[0].priority).toBe('low')
    })
  })

  describe('Configuration and Limits', () => {
    test('should respect maxTasksPerAnalysis limit', async () => {
      const result: PluginTaskResult = {
        success: true,
        duration: 100,
        output: 'TODO: task 1\nTODO: task 2\nTODO: task 3\nTODO: task 4\nTODO: task 5\nTODO: task 6'
      }

      const customAnalyzer = new PatternAnalyzer({ maxTasksPerAnalysis: 3 })
      const analysis = await customAnalyzer.analyze(mockTask, result)
      expect(analysis.suggestedTasks.length).toBe(3)
    })

    test('should deduplicate same patterns', async () => {
      const result: PluginTaskResult = {
        success: true,
        duration: 100,
        output: 'TODO: Fix bug\nTODO: Fix bug'
      }

      const analysis = await analyzer.analyze(mockTask, result)
      expect(analysis.suggestedTasks.length).toBe(1)
    })

    test('should handle disabled analyzer', async () => {
      const result: PluginTaskResult = {
        success: true,
        duration: 100,
        output: 'TODO: Fix bug'
      }

      const disabledAnalyzer = new PatternAnalyzer({ enabled: false })
      const analysis = await disabledAnalyzer.analyze(mockTask, result)
      expect(analysis.shouldCreateTasks).toBe(false)
      expect(analysis.suggestedTasks).toEqual([])
    })

    test('should filter patterns by config', async () => {
      const result: PluginTaskResult = {
        success: true,
        duration: 100,
        output: 'TODO: task 1\nFIXME: bug 1'
      }

      const filteredAnalyzer = new PatternAnalyzer({ patterns: ['fixme-comment'] })
      const analysis = await filteredAnalyzer.analyze(mockTask, result)
      expect(analysis.suggestedTasks.length).toBe(1)
      expect(analysis.suggestedTasks[0].title).toBe('bug 1')
    })
  })

  describe('Edge Cases', () => {
    test('should handle undefined output', async () => {
      const result: PluginTaskResult = {
        success: true,
        duration: 100,
        output: undefined
      }

      const analysis = await analyzer.analyze(mockTask, result)
      expect(analysis.shouldCreateTasks).toBe(false)
    })

    test('should handle empty output', async () => {
      const result: PluginTaskResult = {
        success: true,
        duration: 100,
        output: ''
      }

      const analysis = await analyzer.analyze(mockTask, result)
      expect(analysis.shouldCreateTasks).toBe(false)
    })

    test('should truncate long titles', async () => {
      const longTitle = 'A'.repeat(100)
      const result: PluginTaskResult = {
        success: true,
        duration: 100,
        output: `TODO: ${longTitle}`
      }

      const analysis = await analyzer.analyze(mockTask, result)
      expect(analysis.suggestedTasks[0].title.length).toBeLessThanOrEqual(63)
      expect(analysis.suggestedTasks[0].title).toContain('...')
    })
  })
})

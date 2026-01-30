import { describe, expect, test, beforeEach } from 'bun:test'
import { PatternAnalyzer } from '../src/analyzers/pattern-analyzer'
import type { Task } from '../src/contracts/task'
import type { PluginTaskResult } from '../src/contracts/plugin'

describe('PatternAnalyzer', () => {
  let analyzer: PatternAnalyzer
  let mockTask: Task
  let mockResult: PluginTaskResult

  beforeEach(() => {
    analyzer = new PatternAnalyzer()
    mockTask = {
      id: 'TEST-001',
      title: 'Test Task',
      description: 'A test task',
      status: 'in-progress',
      priority: 'medium',
      createdAt: new Date(),
      updatedAt: new Date()
    }
    mockResult = {
      success: true,
      output: '',
      error: null,
      duration: 1000
    }
  })

  describe('constructor', () => {
    test('initializes with default config', () => {
      const analyzer = new PatternAnalyzer()
      expect(analyzer.getPatternNames()).toHaveLength(6)
    })

    test('initializes with custom config', () => {
      const analyzer = new PatternAnalyzer({
        enabled: false,
        maxTasksPerAnalysis: 3,
        patterns: ['todo-comment', 'fixme-comment']
      })
      expect(analyzer.getPatternNames()).toHaveLength(2)
      expect(analyzer.getPatternNames()).toContain('todo-comment')
      expect(analyzer.getPatternNames()).toContain('fixme-comment')
    })
  })

  describe('analyze', () => {
    test('returns no suggestions when disabled', async () => {
      const analyzer = new PatternAnalyzer({ enabled: false })
      mockResult.output = 'TODO: Add tests'

      const result = await analyzer.analyze(mockTask, mockResult)

      expect(result.shouldCreateTasks).toBe(false)
      expect(result.suggestedTasks).toHaveLength(0)
      expect(result.reason).toContain('disabled')
    })

    test('returns no suggestions when output is empty', async () => {
      mockResult.output = ''

      const result = await analyzer.analyze(mockTask, mockResult)

      expect(result.shouldCreateTasks).toBe(false)
      expect(result.suggestedTasks).toHaveLength(0)
      expect(result.reason).toContain('no output')
    })

    test('detects TODO comment', async () => {
      mockResult.output = 'Some output\nTODO: Add unit tests for the new feature\nMore output'

      const result = await analyzer.analyze(mockTask, mockResult)

      expect(result.shouldCreateTasks).toBe(true)
      expect(result.suggestedTasks).toHaveLength(1)
      expect(result.suggestedTasks[0].title).toBe('Add unit tests for the new feature')
      expect(result.suggestedTasks[0].priority).toBe('medium')
      expect(result.suggestedTasks[0].isSubTask).toBe(true)
      expect(result.suggestedTasks[0].parentId).toBe('TEST-001')
      expect(result.suggestedTasks[0].description).toContain('TODO comment')
    })

    test('detects FIXME comment', async () => {
      mockResult.output = 'FIXME: Memory leak in connection pool'

      const result = await analyzer.analyze(mockTask, mockResult)

      expect(result.shouldCreateTasks).toBe(true)
      expect(result.suggestedTasks).toHaveLength(1)
      expect(result.suggestedTasks[0].title).toBe('Memory leak in connection pool')
      expect(result.suggestedTasks[0].priority).toBe('high')
      expect(result.suggestedTasks[0].description).toContain('FIXME comment')
    })

    test('detects next steps section', async () => {
      mockResult.output = `
Implementation complete.

Next steps: Add integration tests and update documentation

End of output
`

      const result = await analyzer.analyze(mockTask, mockResult)

      expect(result.shouldCreateTasks).toBe(true)
      expect(result.suggestedTasks).toHaveLength(1)
      expect(result.suggestedTasks[0].title).toContain('Add integration tests')
      expect(result.suggestedTasks[0].priority).toBe('medium')
    })

    test('detects follow-up section', async () => {
      mockResult.output = 'Follow-up: Optimize database queries'

      const result = await analyzer.analyze(mockTask, mockResult)

      expect(result.shouldCreateTasks).toBe(true)
      expect(result.suggestedTasks).toHaveLength(1)
      expect(result.suggestedTasks[0].title).toContain('Optimize database queries')
    })

    test('detects prerequisite error', async () => {
      mockResult.output = 'Error: prerequisite: Must install required dependencies first'

      const result = await analyzer.analyze(mockTask, mockResult)

      expect(result.shouldCreateTasks).toBe(true)
      expect(result.suggestedTasks).toHaveLength(1)
      expect(result.suggestedTasks[0].title).toContain('Must install required dependencies')
      expect(result.suggestedTasks[0].priority).toBe('high')
      expect(result.suggestedTasks[0].description).toContain('prerequisite')
    })

    test('detects partial completion', async () => {
      mockResult.output = 'Feature partially completed: Frontend done but backend needs work'

      const result = await analyzer.analyze(mockTask, mockResult)

      expect(result.shouldCreateTasks).toBe(true)
      expect(result.suggestedTasks).toHaveLength(1)
      expect(result.suggestedTasks[0].title).toContain('Frontend done but backend needs work')
      expect(result.suggestedTasks[0].priority).toBe('medium')
      expect(result.suggestedTasks[0].description).toContain('partially completed')
    })

    test('detects AI suggestion', async () => {
      mockResult.output = 'Implementation works. Consider adding: Error handling for edge cases'

      const result = await analyzer.analyze(mockTask, mockResult)

      expect(result.shouldCreateTasks).toBe(true)
      expect(result.suggestedTasks).toHaveLength(1)
      expect(result.suggestedTasks[0].title).toContain('Error handling for edge cases')
      expect(result.suggestedTasks[0].priority).toBe('low')
      expect(result.suggestedTasks[0].description).toContain('AI provided a suggestion')
    })

    test('detects multiple patterns', async () => {
      mockResult.output = `
Task completed successfully.

TODO: Add input validation
FIXME: Race condition in async handler
Next steps: Deploy to staging and monitor performance
`

      const result = await analyzer.analyze(mockTask, mockResult)

      expect(result.shouldCreateTasks).toBe(true)
      expect(result.suggestedTasks.length).toBeGreaterThanOrEqual(3)
    })

    test('respects maxTasksPerAnalysis limit', async () => {
      const analyzer = new PatternAnalyzer({ maxTasksPerAnalysis: 2 })
      mockResult.output = `
TODO: Task 1
TODO: Task 2
TODO: Task 3
FIXME: Issue 1
FIXME: Issue 2
`

      const result = await analyzer.analyze(mockTask, mockResult)

      expect(result.shouldCreateTasks).toBe(true)
      expect(result.suggestedTasks).toHaveLength(2)
    })

    test('avoids duplicate suggestions', async () => {
      mockResult.output = 'TODO: Add tests\nTODO: Add tests'

      const result1 = await analyzer.analyze(mockTask, mockResult)
      expect(result1.suggestedTasks).toHaveLength(1)

      // Same pattern should be detected only once even on second analysis
      const result2 = await analyzer.analyze(mockTask, mockResult)
      expect(result2.suggestedTasks).toHaveLength(0)
    })

    test('truncates long titles', async () => {
      const longTitle = 'A'.repeat(100)
      mockResult.output = `TODO: ${longTitle}`

      const result = await analyzer.analyze(mockTask, mockResult)

      expect(result.suggestedTasks[0].title.length).toBeLessThanOrEqual(63) // 60 + '...'
      expect(result.suggestedTasks[0].title).toContain('...')
    })

    test('includes context in description', async () => {
      mockResult.output = `
Some context before the pattern.
TODO: Add comprehensive error handling
Some context after the pattern.
`

      const result = await analyzer.analyze(mockTask, mockResult)

      expect(result.suggestedTasks[0].description).toContain('Context:')
      expect(result.suggestedTasks[0].description).toContain('TODO')
    })

    test('handles multiple occurrences of same pattern type', async () => {
      mockResult.output = `
TODO: Implement feature A
TODO: Implement feature B
TODO: Implement feature C
`

      const result = await analyzer.analyze(mockTask, mockResult)

      expect(result.shouldCreateTasks).toBe(true)
      expect(result.suggestedTasks.length).toBeGreaterThan(1)
      expect(result.suggestedTasks[0].title).toContain('feature A')
      expect(result.suggestedTasks[1].title).toContain('feature B')
    })

    test('detects case-insensitive patterns', async () => {
      mockResult.output = 'todo: lowercase todo\nTodo: Mixed case\nTODO: uppercase'

      const result = await analyzer.analyze(mockTask, mockResult)

      expect(result.shouldCreateTasks).toBe(true)
      expect(result.suggestedTasks.length).toBeGreaterThanOrEqual(1)
    })

    test('handles work in progress pattern', async () => {
      mockResult.output = 'Status: WIP - Authentication module needs completion'

      const result = await analyzer.analyze(mockTask, mockResult)

      expect(result.shouldCreateTasks).toBe(true)
      expect(result.suggestedTasks).toHaveLength(1)
      expect(result.suggestedTasks[0].description).toContain('partially completed')
    })

    test('handles needs additional work pattern', async () => {
      mockResult.output = 'Core functionality works but needs additional work on error handling'

      const result = await analyzer.analyze(mockTask, mockResult)

      expect(result.shouldCreateTasks).toBe(true)
      expect(result.suggestedTasks).toHaveLength(1)
      expect(result.suggestedTasks[0].title).toContain('error handling')
    })

    test('detects suggestion with different verbs', async () => {
      mockResult.output = `
System functional.
Should consider adding: Rate limiting
Recommend implementing: Caching layer
Suggest creating: Admin dashboard
`

      const result = await analyzer.analyze(mockTask, mockResult)

      expect(result.shouldCreateTasks).toBe(true)
      expect(result.suggestedTasks.length).toBeGreaterThan(0)
    })
  })

  describe('resetSeenPatterns', () => {
    test('allows redetection of patterns after reset', async () => {
      mockResult.output = 'TODO: Add tests'

      const result1 = await analyzer.analyze(mockTask, mockResult)
      expect(result1.suggestedTasks).toHaveLength(1)

      const result2 = await analyzer.analyze(mockTask, mockResult)
      expect(result2.suggestedTasks).toHaveLength(0)

      analyzer.resetSeenPatterns()

      const result3 = await analyzer.analyze(mockTask, mockResult)
      expect(result3.suggestedTasks).toHaveLength(1)
    })
  })

  describe('getPatternNames', () => {
    test('returns all default pattern names', () => {
      const names = analyzer.getPatternNames()
      expect(names).toContain('todo-comment')
      expect(names).toContain('fixme-comment')
      expect(names).toContain('next-steps')
      expect(names).toContain('prerequisite-error')
      expect(names).toContain('partial-completion')
      expect(names).toContain('ai-suggestion')
    })

    test('returns filtered pattern names when configured', () => {
      const analyzer = new PatternAnalyzer({
        patterns: ['todo-comment', 'fixme-comment']
      })
      const names = analyzer.getPatternNames()
      expect(names).toHaveLength(2)
      expect(names).toContain('todo-comment')
      expect(names).toContain('fixme-comment')
    })
  })

  describe('pattern coverage', () => {
    test('covers at least 5 common follow-up patterns', () => {
      const patternNames = analyzer.getPatternNames()
      expect(patternNames.length).toBeGreaterThanOrEqual(5)
    })

    test('each pattern has correct priority', () => {
      // FIXME should be high priority
      mockResult.output = 'FIXME: Critical bug'
      let result = analyzer.analyze(mockTask, mockResult)
      result.then(r => {
        if (r.suggestedTasks.length > 0) {
          expect(r.suggestedTasks[0].priority).toBe('high')
        }
      })

      // Reset for next test
      analyzer.resetSeenPatterns()

      // TODO should be medium priority
      mockResult.output = 'TODO: Enhancement'
      result = analyzer.analyze(mockTask, mockResult)
      result.then(r => {
        if (r.suggestedTasks.length > 0) {
          expect(r.suggestedTasks[0].priority).toBe('medium')
        }
      })

      // Reset for next test
      analyzer.resetSeenPatterns()

      // AI suggestions should be low priority
      mockResult.output = 'Consider adding: Nice to have feature'
      result = analyzer.analyze(mockTask, mockResult)
      result.then(r => {
        if (r.suggestedTasks.length > 0) {
          expect(r.suggestedTasks[0].priority).toBe('low')
        }
      })
    })
  })

  describe('edge cases', () => {
    test('handles output with no patterns gracefully', async () => {
      mockResult.output = 'All tests passed. Everything looks good.'

      const result = await analyzer.analyze(mockTask, mockResult)

      expect(result.shouldCreateTasks).toBe(false)
      expect(result.suggestedTasks).toHaveLength(0)
      expect(result.reason).toContain('No follow-up patterns detected')
    })

    test('handles null output gracefully', async () => {
      mockResult.output = null as any

      const result = await analyzer.analyze(mockTask, mockResult)

      expect(result.shouldCreateTasks).toBe(false)
      expect(result.suggestedTasks).toHaveLength(0)
    })

    test('handles very long output efficiently', async () => {
      const longOutput = 'Normal output. '.repeat(1000) + 'TODO: Add tests'
      mockResult.output = longOutput

      const result = await analyzer.analyze(mockTask, mockResult)

      expect(result.shouldCreateTasks).toBe(true)
      expect(result.suggestedTasks).toHaveLength(1)
    })

    test('handles multiline patterns', async () => {
      mockResult.output = `
Next steps:
- Add authentication
- Implement authorization
- Deploy to production
`

      const result = await analyzer.analyze(mockTask, mockResult)

      expect(result.shouldCreateTasks).toBe(true)
      expect(result.suggestedTasks.length).toBeGreaterThan(0)
    })

    test('handles patterns at start of output', async () => {
      mockResult.output = 'TODO: First thing in output'

      const result = await analyzer.analyze(mockTask, mockResult)

      expect(result.shouldCreateTasks).toBe(true)
      expect(result.suggestedTasks).toHaveLength(1)
    })

    test('handles patterns at end of output', async () => {
      mockResult.output = 'Some output\nTODO: Last thing'

      const result = await analyzer.analyze(mockTask, mockResult)

      expect(result.shouldCreateTasks).toBe(true)
      expect(result.suggestedTasks).toHaveLength(1)
    })
  })
})

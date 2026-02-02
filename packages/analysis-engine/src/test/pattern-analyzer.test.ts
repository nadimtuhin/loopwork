import { describe, test, expect, beforeEach } from 'bun:test'
import { PatternAnalyzer } from '../pattern-analyzer'
import type { AnalysisContext } from '@loopwork-ai/contracts'

describe('PatternAnalyzer', () => {
  let analyzer: PatternAnalyzer

  beforeEach(() => {
    analyzer = new PatternAnalyzer()
  })

  test('should detect TODO comments', async () => {
    const context: AnalysisContext = {
      input: 'Code is done. TODO: Add validation',
    }

    const result = await analyzer.analyze(context)

    expect(result.success).toBe(true)
    expect(result.patterns?.length).toBeGreaterThan(0)
    expect(result.patterns?.[0]?.pattern).toBe('todo-comment')
  })

  test('should detect FIXME comments', async () => {
    const context: AnalysisContext = {
      input: 'Implementation complete. FIXME: Memory leak in handler',
    }

    const result = await analyzer.analyze(context)

    expect(result.success).toBe(true)
    expect(result.patterns?.length).toBeGreaterThan(0)
    expect(result.patterns?.[0]?.pattern).toBe('fixme-comment')
    expect(result.patterns?.[0]?.severity).toBe('HIGH')
  })

  test('should detect next steps', async () => {
    const context: AnalysisContext = {
      input: 'Task complete. Next steps: Deploy to staging',
    }

    const result = await analyzer.analyze(context)

    expect(result.success).toBe(true)
    expect(result.patterns?.length).toBeGreaterThan(0)
    expect(result.patterns?.[0]?.pattern).toBe('next-steps')
  })

  test('should return empty results for clean input', async () => {
    const context: AnalysisContext = {
      input: 'All tests passing. Implementation complete. No issues found.',
    }

    const result = await analyzer.analyze(context)

    expect(result.success).toBe(true)
    expect(result.patterns?.length).toBe(0)
  })

  test('should handle disabled analyzer', async () => {
    const disabledAnalyzer = new PatternAnalyzer({ enabled: false })
    const context: AnalysisContext = {
      input: 'TODO: Something',
    }

    const result = await disabledAnalyzer.analyze(context)

    expect(result.success).toBe(true)
    expect(result.patterns?.length).toBe(0)
  })

  test('should respect maxMatches configuration', async () => {
    const limitedAnalyzer = new PatternAnalyzer({ maxMatches: 2 })
    const context: AnalysisContext = {
      input: 'TODO: Task 1\nTODO: Task 2\nTODO: Task 3\nTODO: Task 4',
    }

    const result = await limitedAnalyzer.analyze(context)

    expect(result.success).toBe(true)
    expect(result.patterns?.length).toBeLessThanOrEqual(2)
  })

  test('should support pattern filtering', async () => {
    const filteredAnalyzer = new PatternAnalyzer({
      patterns: ['todo-comment'],
    })

    const context: AnalysisContext = {
      input: 'TODO: Task\nFIXME: Bug',
    }

    const result = await filteredAnalyzer.analyze(context)

    expect(result.success).toBe(true)
    expect(result.patterns?.every((p) => p.pattern === 'todo-comment')).toBe(true)
  })

  test('should implement IAnalysisEngine interface', () => {
    expect(analyzer.name).toBe('pattern-analyzer')
    expect(analyzer.supports('pattern')).toBe(true)
    expect(analyzer.supports('llm')).toBe(false)
  })

  test('should initialize and dispose cleanly', async () => {
    await analyzer.initialize()
    await analyzer.dispose()
    expect(analyzer.getPatternNames().length).toBeGreaterThan(0)
  })
})

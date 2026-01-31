import { describe, test, expect } from 'bun:test'
import { TaskSuggestionParser } from '../../src/parsers/task-suggestion-parser'
import type { ParseContext } from '../../src/contracts'

describe('TaskSuggestionParser', () => {
  const parser = new TaskSuggestionParser()

  const createContext = (overrides: Partial<ParseContext> = {}): ParseContext => ({
    workDir: '/test',
    exitCode: 0,
    durationMs: 1000,
    ...overrides,
  })

  test('parses TODO: patterns', () => {
    const output = `
      Completed the task.
      TODO: Add unit tests for the new feature
      TODO: Update documentation
    `
    const context = createContext()
    const result = parser.parse(output, context)

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      title: 'Add unit tests for the new feature',
      source: 'pattern',
    })
    expect(result[1]).toMatchObject({
      title: 'Update documentation',
      source: 'pattern',
    })
  })

  test('parses NEXT: patterns', () => {
    const output = `
      Done with implementation.
      NEXT: Implement error handling
    `
    const context = createContext()
    const result = parser.parse(output, context)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      title: 'Implement error handling',
      source: 'pattern',
    })
  })

  test('parses JSON task blocks', () => {
    const output = `
      Work completed.
      \`\`\`json:follow-up-tasks
      [
        {
          "title": "Refactor authentication",
          "description": "Extract auth logic into separate module",
          "priority": 2
        }
      ]
      \`\`\`
    `
    const context = createContext()
    const result = parser.parse(output, context)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      title: 'Refactor authentication',
      description: 'Extract auth logic into separate module',
      priority: 2,
      source: 'json',
    })
  })

  test('parses agent suggestions from output', () => {
    const output = `
      TODO: @architect Review the system design
    `
    const context = createContext()
    const result = parser.parse(output, context)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      title: 'Review the system design',
      suggestedAgent: 'architect',
      source: 'pattern',
    })
  })

  test('returns empty array when no suggestions found', () => {
    const output = 'Task completed successfully with no follow-ups.'
    const context = createContext()
    const result = parser.parse(output, context)

    expect(result).toEqual([])
  })

  test('handles FOLLOWUP: pattern', () => {
    const output = `
      FOLLOWUP: Check performance after deployment
    `
    const context = createContext()
    const result = parser.parse(output, context)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      title: 'Check performance after deployment',
      source: 'pattern',
    })
  })

  test('deduplicates suggestions with same title', () => {
    const output = `
      TODO: Add tests
      NEXT: Add tests
    `
    const context = createContext()
    const result = parser.parse(output, context)

    expect(result).toHaveLength(1)
  })
})

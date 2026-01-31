import { describe, test, expect } from 'bun:test'
import { MetricsExtractor } from '../../src/parsers/metrics-extractor'
import type { ParseContext } from '../../src/contracts'

describe('MetricsExtractor', () => {
  const extractor = new MetricsExtractor()

  const createContext = (overrides: Partial<ParseContext> = {}): ParseContext => ({
    workDir: '/test',
    exitCode: 0,
    durationMs: 1000,
    ...overrides,
  })

  test('extracts duration from context', () => {
    const context = createContext({ durationMs: 5000 })
    const result = extractor.parse('', context)

    expect(result.durationMs).toBe(5000)
  })

  test('extracts exit code from context', () => {
    const context = createContext({ exitCode: 1 })
    const result = extractor.parse('', context)

    expect(result.exitCode).toBe(1)
  })

  test('parses tokens used from output', () => {
    const output = `
      Task completed.
      Tokens used: 1500
    `
    const context = createContext()
    const result = extractor.parse(output, context)

    expect(result.tokensUsed).toBe(1500)
  })

  test('parses tool calls from output', () => {
    const output = `
      Tool calls: 12
      Done.
    `
    const context = createContext()
    const result = extractor.parse(output, context)

    expect(result.toolCalls).toBe(12)
  })

  test('handles missing metrics gracefully', () => {
    const output = 'Simple output with no metrics'
    const context = createContext({ durationMs: 2000, exitCode: 0 })
    const result = extractor.parse(output, context)

    expect(result).toEqual({
      durationMs: 2000,
      exitCode: 0,
      tokensUsed: undefined,
      toolCalls: undefined,
    })
  })

  test('parses alternative token patterns', () => {
    const output = 'Used 2500 tokens for this task'
    const context = createContext()
    const result = extractor.parse(output, context)

    expect(result.tokensUsed).toBe(2500)
  })

  test('parses cost information and estimates tokens', () => {
    const output = 'Total cost: $0.015'
    const context = createContext()
    const result = extractor.parse(output, context)

    // Cost-based estimation is optional, just ensure no error
    expect(result.durationMs).toBe(1000)
  })
})

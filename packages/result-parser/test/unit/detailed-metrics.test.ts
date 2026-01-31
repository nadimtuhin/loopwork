import { describe, expect, test } from 'bun:test'
import { MetricsExtractor } from '../../src/parsers/metrics-extractor'
import type { ParseContext } from '../../src/contracts'

describe('MetricsExtractor - Detailed Tokens', () => {
  const extractor = new MetricsExtractor()
  const mockContext: ParseContext = {
    durationMs: 5000,
    exitCode: 0,
    workDir: process.cwd(),
  }

  test('extracts input and output tokens separately', () => {
    const output = `
      Execution finished.
      Tokens: 1200 input, 400 output
      Total used: 1600 tokens
    `
    const result = extractor.parse(output, mockContext)
    
    expect(result.inputTokens).toBe(1200)
    expect(result.outputTokens).toBe(400)
    expect(result.tokensUsed).toBe(1600)
  })

  test('extracts prompt and completion tokens', () => {
    const output = `
      Usage: 1000 prompt tokens, 500 completion tokens
    `
    const result = extractor.parse(output, mockContext)
    
    expect(result.inputTokens).toBe(1000)
    expect(result.outputTokens).toBe(500)
    expect(result.tokensUsed).toBe(1500)
  })

  test('extracts from generic input/output token labels', () => {
    const output = `
      input tokens: 100
      output tokens: 50
    `
    const result = extractor.parse(output, mockContext)
    
    expect(result.inputTokens).toBe(100)
    expect(result.outputTokens).toBe(50)
    expect(result.tokensUsed).toBe(150)
  })
})

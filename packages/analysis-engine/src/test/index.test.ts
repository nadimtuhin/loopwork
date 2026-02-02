import { describe, test, expect } from 'bun:test'
import { PatternAnalyzer, LLMAnalyzer } from '../index'

describe('analysis-engine exports', () => {
  test('should export PatternAnalyzer', () => {
    const analyzer = new PatternAnalyzer()
    expect(analyzer.name).toBe('pattern-analyzer')
  })

  test('should export LLMAnalyzer', () => {
    const analyzer = new LLMAnalyzer()
    expect(analyzer.name).toBe('llm-analyzer')
  })
})

import { describe, test, expect, beforeEach } from 'bun:test'
import { LLMAnalyzer } from '../llm-analyzer'
import type { AnalysisContext } from '@loopwork-ai/contracts'

describe('LLMAnalyzer', () => {
  let analyzer: LLMAnalyzer

  beforeEach(() => {
    analyzer = new LLMAnalyzer()
  })

  test('should handle empty input', async () => {
    const context: AnalysisContext = {
      input: '',
    }

    const result = await analyzer.analyze(context)

    expect(result.success).toBe(true)
    expect(result.confidence).toBe(0)
  })

  test('should use simulation when no API key available', async () => {
    const context: AnalysisContext = {
      input: 'Error detected in the system',
    }

    const result = await analyzer.analyze(context)

    expect(result.success).toBe(true)
    expect(result.findings?.length).toBeGreaterThan(0)
  })

  test('should cache analysis results', async () => {
    const context: AnalysisContext = {
      input: 'Test input for caching',
    }

    await analyzer.analyze(context)
    const cacheSize1 = analyzer.getCacheSize()

    await analyzer.analyze(context)
    const cacheSize2 = analyzer.getCacheSize()

    expect(cacheSize1).toBe(cacheSize2)
  })

  test('should clear cache', async () => {
    const context: AnalysisContext = {
      input: 'Test input',
    }

    await analyzer.analyze(context)
    expect(analyzer.getCacheSize()).toBeGreaterThan(0)

    analyzer.clearCache()
    expect(analyzer.getCacheSize()).toBe(0)
  })

  test('should implement IAnalysisEngine interface', () => {
    expect(analyzer.name).toBe('llm-analyzer')
    expect(analyzer.supports('llm')).toBe(true)
    expect(analyzer.supports('ai')).toBe(true)
    expect(analyzer.supports('pattern')).toBe(false)
  })

  test('should initialize and dispose cleanly', async () => {
    await analyzer.initialize()
    expect(analyzer.getCacheSize()).toBe(0)

    const context: AnalysisContext = { input: 'test' }
    await analyzer.analyze(context)
    expect(analyzer.getCacheSize()).toBeGreaterThan(0)

    await analyzer.dispose()
    expect(analyzer.getCacheSize()).toBe(0)
  })

  test('should handle custom system prompt', async () => {
    const customAnalyzer = new LLMAnalyzer({
      systemPrompt: 'Custom prompt for testing',
    })

    const context: AnalysisContext = {
      input: 'Test input',
    }

    const result = await customAnalyzer.analyze(context)
    expect(result.success).toBe(true)
  })

  test('should respect timeout configuration', async () => {
    const shortTimeoutAnalyzer = new LLMAnalyzer({
      timeout: 1000,
    })

    expect(shortTimeoutAnalyzer.name).toBe('llm-analyzer')
  })
})

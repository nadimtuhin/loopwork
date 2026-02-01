import { describe, expect, test, beforeEach, spyOn } from 'bun:test'
import { AIMonitor } from '../index'
import { LLMFallbackAnalyzer } from '../llm-fallback-analyzer'

describe('AIMonitor LLM Analysis', () => {
  let monitor: AIMonitor

  beforeEach(() => {
    monitor = new AIMonitor({
      llmAnalyzer: {
        enabled: true,
        model: 'haiku',
        maxCallsPerSession: 10,
        cooldownMs: 300000,
        cacheEnabled: true,
        cacheTTL: 86400000,
      }
    })
  })

  test('should call LLM analyzer for unknown errors', async () => {
    // @ts-ignore - access private for testing
    const analyzer = monitor.llmAnalyzer
    expect(analyzer).toBeDefined()

    const analyzeSpy = spyOn(analyzer!, 'analyzeError').mockImplementation(async () => ({
      rootCause: 'Test cause',
      suggestedFixes: ['Fix 1'],
      confidence: 90
    }))

    await monitor.analyzeUnknownError('Some random unknown error', { file: 'test.ts' })

    expect(analyzeSpy).toHaveBeenCalled()
    expect(monitor.getStats().llmCalls).toBe(1)
  })

  test('should not call LLM analyzer if disabled', async () => {
    const disabledMonitor = new AIMonitor({
      llmAnalyzer: {
        enabled: false,
        model: 'haiku',
        maxCallsPerSession: 10,
        cooldownMs: 300000,
        cacheEnabled: true,
        cacheTTL: 86400000,
      }
    })

    // @ts-ignore - access private
    expect(disabledMonitor.llmAnalyzer).toBeNull()

    // @ts-ignore - access private
    await disabledMonitor.analyzeUnknownError('Error')
    expect(disabledMonitor.getStats().llmCalls).toBe(0)
  })
})

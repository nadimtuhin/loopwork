import type { IErrorAnalyzer } from '../contracts/llm-analyzer'
import { analyzerRegistry } from './analyzer-registry'

type AIMonitorLLMAnalyzer = {
  name: 'error-analyzer'
  analyze: (request: { errorMessage: string; stackTrace?: string; context?: Record<string, unknown> }) => Promise<{ rootCause: string; suggestedFixes: string[]; confidence: number } | null>
  canMakeCall: () => boolean
  getCacheKey: (request: { errorMessage: string; stackTrace?: string }) => string
  clearCache: () => void
  getCallCount: () => number
  resetCallCount: () => void
  getTimeUntilNextCall: () => number
}

export function registerAIMonitorAnalyzer(
  aiMonitorAnalyzer: AIMonitorLLMAnalyzer,
  name = 'ai-monitor'
): void {
  const adapter: IErrorAnalyzer = {
    name: 'error-analyzer',
    analyze: async (req) => {
      const result = await aiMonitorAnalyzer.analyze({
        errorMessage: req.errorMessage,
        stackTrace: req.stackTrace,
        context: req.context,
      })
      return result
    },
    canMakeCall: () => aiMonitorAnalyzer.canMakeCall(),
    getCacheKey: (req) => aiMonitorAnalyzer.getCacheKey({
      errorMessage: req.errorMessage,
      stackTrace: req.stackTrace,
    }),
    clearCache: () => aiMonitorAnalyzer.clearCache(),
    getCallCount: () => aiMonitorAnalyzer.getCallCount(),
    resetCallCount: () => aiMonitorAnalyzer.resetCallCount(),
    getTimeUntilNextCall: () => aiMonitorAnalyzer.getTimeUntilNextCall(),
  }

  analyzerRegistry.addErrorAnalyzer(name, adapter)
}

export function swapToAIMonitorAnalyzer(name = 'ai-monitor'): boolean {
  return analyzerRegistry.swapErrorAnalyzer(name)
}

export function getAIMonitorAnalyzerStatus(): {
  registered: boolean
  active: boolean
} {
  const allAnalyzers = analyzerRegistry.getAllErrorAnalyzers()
  const aiMonitorAnalyzer = allAnalyzers.find((a) => a.name === 'ai-monitor')

  return {
    registered: !!aiMonitorAnalyzer,
    active: aiMonitorAnalyzer ? analyzerRegistry.isActive('ai-monitor') : false,
  }
}

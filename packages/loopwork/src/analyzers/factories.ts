import type { IErrorAnalyzerFactory, ITaskOutputAnalyzerFactory } from './providers'
import { GLMErrorAnalyzer } from './glm-analyzer'
import { LLMAnalyzer } from './llm-analyzer'

export class GLMErrorAnalyzerFactory implements IErrorAnalyzerFactory {
  create(config?: Record<string, unknown>): GLMErrorAnalyzer {
    return new GLMErrorAnalyzer({
      apiKey: config?.apiKey as string,
      baseUrl: config?.baseUrl as string,
      model: config?.model as string,
      maxCallsPerSession: config?.maxCallsPerSession as number,
      cooldownMs: config?.cooldownMs as number,
    })
  }
}

export class TaskOutputAnalyzerFactory implements ITaskOutputAnalyzerFactory {
  create(config?: Record<string, unknown>): LLMAnalyzer {
    return new LLMAnalyzer({
      model: config?.model as string,
      timeout: config?.timeout as number,
      fallbackToPattern: config?.fallbackToPattern as boolean,
      systemPrompt: config?.systemPrompt as string,
    })
  }
}

export class MockErrorAnalyzerFactory implements IErrorAnalyzerFactory {
  create(): import('../contracts/llm-analyzer').IErrorAnalyzer {
    return {
      name: 'error-analyzer',
      analyze: async () => ({
        rootCause: 'Mock analysis',
        suggestedFixes: ['Mock fix'],
        confidence: 0.5,
      }),
      getCacheKey: () => 'mock',
      clearCache: () => {},
      canMakeCall: () => true,
      getCallCount: () => 0,
      resetCallCount: () => {},
      getTimeUntilNextCall: () => 0,
    }
  }
}

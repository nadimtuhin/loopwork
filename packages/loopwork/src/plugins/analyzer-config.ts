import type { LoopworkPlugin, TaskContext } from '../contracts/plugin'
import type { LoopworkConfig } from '../contracts/config'
import type { PluginTaskResult } from '../contracts/types'
import { analyzerRegistry } from '../core/analyzer-registry'
import { GLMErrorAnalyzer, ZAI_CONFIG, OPENCODE_ZAI_MODEL } from '../analyzers/glm-analyzer'

export interface AnalyzerConfigOptions {
  provider: 'claude' | 'glm' | 'mock'
  model?: string
  apiKey?: string
  baseUrl?: string
  maxCallsPerSession?: number
  cooldownMs?: number
}

export function createErrorAnalyzerFromConfig(config: AnalyzerConfigOptions) {
  switch (config.provider) {
    case 'glm':
      return new GLMErrorAnalyzer({
        apiKey: config.apiKey,
        baseUrl: config.baseUrl || ZAI_CONFIG.baseUrl,
        model: config.model || ZAI_CONFIG.model,
        maxCallsPerSession: config.maxCallsPerSession,
        cooldownMs: config.cooldownMs,
      })
    case 'mock':
      return {
        name: 'error-analyzer' as const,
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
    case 'claude':
    default:
      return null
  }
}

export function configureAnalyzer(config: LoopworkConfig): void {
  if (!config.errorAnalyzer) return

  const analyzer = createErrorAnalyzerFromConfig(config.errorAnalyzer)
  if (analyzer) {
    analyzerRegistry.addErrorAnalyzer(config.errorAnalyzer.provider, analyzer)
    analyzerRegistry.swapErrorAnalyzer(config.errorAnalyzer.provider)
  }
}

export function withAnalyzerConfig(options: AnalyzerConfigOptions): LoopworkPlugin {
  return {
    name: 'analyzer-config',
    onConfigLoad: (config) => {
      const cfg = config as LoopworkConfig
      cfg.errorAnalyzer = options
      return cfg
    },
    onBackendReady: () => {
      configureAnalyzer({ errorAnalyzer: options } as LoopworkConfig)
    },
  }
}

export function withGLMAnalyzer(options?: {
  apiKey?: string
  baseUrl?: string
  model?: string
  maxCallsPerSession?: number
  cooldownMs?: number
}): LoopworkPlugin {
  return withAnalyzerConfig({
    provider: 'glm',
    baseUrl: options?.baseUrl || ZAI_CONFIG.baseUrl,
    model: options?.model || ZAI_CONFIG.model,
    ...options,
  })
}

export function withZaiGLM47(apiKey: string): LoopworkPlugin {
  return withGLMAnalyzer({
    apiKey,
    baseUrl: ZAI_CONFIG.baseUrl,
    model: ZAI_CONFIG.model,
  })
}

export function withOpenCodeGLM47(): LoopworkPlugin {
  return {
    name: 'opencode-glm-analyzer',
    onConfigLoad: (config) => {
      const cfg = config as LoopworkConfig
      cfg.errorAnalyzer = {
        provider: 'glm',
        model: OPENCODE_ZAI_MODEL,
      }
      return cfg
    },
  }
}

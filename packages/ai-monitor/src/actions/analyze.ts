import fs from 'fs'
import path from 'path'
import { logger } from '../utils'
import { LLMAnalyzer, type ErrorAnalysis } from '../llm-analyzer'
import type { Action } from './types'

export interface AnalysisResult extends ErrorAnalysis {
  timestamp: Date
  cached?: boolean
}

export interface ThrottleState {
  llmCallCount: number
  lastLLMCall: number
  llmCooldown: number
  llmMaxPerSession: number
}

export async function executeAnalyze(
  action: Action,
  _llmModel?: string,
  _anthropicApiKey?: string,
  projectRoot?: string,
  throttleState?: ThrottleState
): Promise<AnalysisResult> {
  if (action.type !== 'analyze') {
    throw new Error('Invalid action type for analyze executor')
  }

  const analyzeAction = action as { type: 'analyze'; pattern: string; context: Record<string, string>; prompt: string }
  const errorMessage = analyzeAction.prompt || action.context.rawLine || ''

  if (!errorMessage) {
    throw new Error('No error message provided for analysis')
  }

  const analyzer = new LLMAnalyzer({ projectRoot })
  const hash = analyzer.hashError(errorMessage)
  const cachedResult = analyzer.getCachedAnalysis(hash)

  if (cachedResult) {
    return {
      ...cachedResult,
      timestamp: new Date(),
      cached: true
    }
  }

  if (throttleState) {
    const throttle = shouldThrottleLLM(throttleState)
    if (throttle.throttled) {
      logger.warn(throttle.reason)
      
      const result = await analyzer.analyzeError(errorMessage)
      if (result) {
        return {
          ...result,
          timestamp: new Date()
        }
      }

      return {
        rootCause: 'LLM analysis throttled or failed',
        suggestedFixes: ['Check logs for more details'],
        confidence: 0,
        timestamp: new Date()
      }
    }
  }

  if (throttleState) {
    analyzer.syncState(throttleState.llmCallCount, throttleState.lastLLMCall)
  }

  const result = await analyzer.analyzeError(errorMessage)

  if (throttleState) {
    const prevCallCount = throttleState.llmCallCount
    throttleState.llmCallCount = analyzer.getCallCount()
    
    if (throttleState.llmCallCount > prevCallCount) {
      throttleState.lastLLMCall = Date.now()
    }
  }

  if (!result) {
    return {
      rootCause: 'LLM analysis failed',
      suggestedFixes: ['Check logs for more details'],
      confidence: 0,
      timestamp: new Date()
    }
  }

  logger.info(`Error Analysis:`)
  logger.info(`  Root Cause: ${result.rootCause}`)
  logger.info(`  Suggested Fixes:`)
  result.suggestedFixes.forEach((fix, i) => {
    logger.info(`    ${i + 1}. ${fix}`)
  })
  logger.info(`  Confidence: ${(result.confidence * 100).toFixed(0)}%`)

  return {
    ...result,
    timestamp: new Date()
  }
}

export function cleanupCache(projectRoot?: string): void {
  const analyzer = new LLMAnalyzer({ projectRoot })
  analyzer.cleanupExpired()
}

export function shouldThrottleLLM(state: ThrottleState): { throttled: true; reason: string } | { throttled: false } {
  if (state.llmCallCount >= state.llmMaxPerSession) {
    return {
      throttled: true,
      reason: `LLM analysis throttled: max ${state.llmMaxPerSession} calls per session reached`
    }
  }

  const timeSinceLastCall = Date.now() - state.lastLLMCall
  if (state.lastLLMCall > 0 && timeSinceLastCall < state.llmCooldown) {
    const remainingCooldown = Math.ceil((state.llmCooldown - timeSinceLastCall) / 1000)
    return {
      throttled: true,
      reason: `LLM analysis throttled: ${remainingCooldown}s remaining in cooldown period`
    }
  }

  return { throttled: false }
}

export function hashError(errorMessage: string): string {
  const analyzer = new LLMAnalyzer()
  return analyzer.hashError(errorMessage)
}

export function getCachedAnalysis(errorMessage: string, projectRoot?: string): AnalysisResult | null {
  const analyzer = new LLMAnalyzer({ projectRoot })
  const result = analyzer.getCachedAnalysis(analyzer.hashError(errorMessage))
  if (!result) return null
  return {
    ...result,
    timestamp: new Date(),
    cached: true
  }
}

export function cacheAnalysisResult(errorMessage: string, result: AnalysisResult, projectRoot?: string): void {
  const analyzer = new LLMAnalyzer({ projectRoot })
  const hash = analyzer.hashError(errorMessage)
  analyzer.cacheAnalysis(hash, result)
}

export function loadAnalysisCache(projectRoot?: string): Record<string, any> {
  const analyzer = new LLMAnalyzer({ projectRoot })
  try {
    const cacheFile = (analyzer as any).cacheFile
    if (!fs.existsSync(cacheFile)) return {}
    return JSON.parse(fs.readFileSync(cacheFile, 'utf-8'))
  } catch (e) {
    return {}
  }
}

export function saveAnalysisCache(cache: any, projectRoot?: string): void {
  const analyzer = new LLMAnalyzer({ projectRoot })
  try {
    const cacheFile = (analyzer as any).cacheFile
    const dir = path.dirname(cacheFile)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2))
  } catch (e) {}
}

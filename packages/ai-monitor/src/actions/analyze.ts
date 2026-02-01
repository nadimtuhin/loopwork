/**
 * LLM fallback analysis for unknown errors
 *
 * Uses Anthropic SDK to analyze error logs and suggest fixes.
 * Implements caching and throttling to avoid excessive API calls.
 */

import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import Anthropic from '@anthropic-ai/sdk'
import { logger } from '../utils'
import type { Action } from './types'

// Import LoopworkState from loopwork if available, otherwise use fallback
let LoopworkState: any
try {
  const loopwork = require('@loopwork-ai/loopwork')
  LoopworkState = loopwork.LoopworkState
} catch {
  // Fallback implementation for when loopwork is not available
  LoopworkState = class {
    paths: any
    constructor(options: any = {}) {
      const projectRoot = options?.projectRoot || process.cwd()
      const stateDir = path.join(projectRoot, '.loopwork')
      this.paths = {
        llmCache: () => path.join(stateDir, 'ai-monitor', 'llm-cache.json')
      }
    }
  }
}

export interface AnalysisResult {
  rootCause: string
  suggestedFixes: string[]
  confidence: number
  timestamp: Date
  cached?: boolean
}

/**
 * LLM Cache Entry Schema (as per PRD AI-MONITOR-001h)
 */
export interface LLMCacheEntry {
  errorHash: string
  analysis: {
    rootCause: string
    suggestedFixes: string[]
    confidence: number
  }
  cachedAt: string  // ISO timestamp
  expiresAt: string // ISO timestamp
}

export interface AnalysisCache {
  [errorHash: string]: LLMCacheEntry
}

const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

function findOpencode(): string | null {
  const home = process.env.HOME || ''
  const candidates = [`${home}/.opencode/bin/opencode`, '/usr/local/bin/opencode']

  try {
    const whichResult = spawnSync('which', ['opencode'], { encoding: 'utf-8' })
    if (whichResult.status === 0 && whichResult.stdout?.trim()) {
      return whichResult.stdout.trim()
    }

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        return p
      }
    }
  } catch {
  }
  return null
}

function patternBasedAnalysis(errorMessage: string): AnalysisResult {
  let rootCause = 'Unknown error'
  let suggestedFixes: string[] = ['Manual investigation required']
  let confidence = 0.5

  if (errorMessage.includes('ENOENT') || errorMessage.includes('not found')) {
    rootCause = 'File or resource not found'
    suggestedFixes = ['Verify file path exists and is accessible', 'Check for typos in file paths']
    confidence = 0.8
  } else if (errorMessage.includes('EACCES') || errorMessage.includes('permission')) {
    rootCause = 'Permission denied'
    suggestedFixes = ['Check file/directory permissions', 'Run with appropriate user privileges']
    confidence = 0.9
  } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
    rootCause = 'Operation timed out'
    suggestedFixes = ['Increase timeout limit', 'Check network connectivity', 'Verify service availability']
    confidence = 0.7
  } else if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
    rootCause = 'Rate limit exceeded'
    suggestedFixes = ['Wait before retrying', 'Reduce request frequency', 'Implement exponential backoff']
    confidence = 0.9
  }

  return {
    rootCause,
    suggestedFixes,
    confidence,
    timestamp: new Date(),
    cached: false
  }
}

/**
 * Get cache file path
 */
function getCacheFilePath(projectRoot?: string): string {
  const loopworkState = new LoopworkState({ projectRoot })
  return loopworkState.paths.llmCache()
}

/**
 * Load analysis cache from disk
 */
export function loadAnalysisCache(projectRoot?: string): AnalysisCache {
  const cacheFile = getCacheFilePath(projectRoot)

  if (!fs.existsSync(cacheFile)) {
    return {}
  }

  try {
    const data = fs.readFileSync(cacheFile, 'utf8')
    return JSON.parse(data) as AnalysisCache
  } catch (error) {
    logger.warn(`Failed to load analysis cache: ${error instanceof Error ? error.message : String(error)}`)
    return {}
  }
}

/**
 * Save analysis cache to disk
 */
export function saveAnalysisCache(cache: AnalysisCache, projectRoot?: string): void {
  const cacheFile = getCacheFilePath(projectRoot)

  try {
    const dir = path.dirname(cacheFile)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2), 'utf8')
    logger.debug(`Analysis cache saved to ${cacheFile}`)
  } catch (error) {
    logger.error(`Failed to save analysis cache: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Generate hash for error message (simple hash for caching)
 */
export function hashError(errorMessage: string): string {
  const normalized = errorMessage
    .toLowerCase()
    .replace(/\d{4}-\d{2}-\d{2}/g, 'DATE')
    .replace(/\d{2}:\d{2}:\d{2}/g, 'TIME')
    .replace(/\/[^\s]+\//g, '/PATH/')
    .trim()
    .substring(0, 100)

  return Buffer.from(normalized).toString('base64').substring(0, 32)
}

/**
 * Check if cached result is still valid (checks expiresAt timestamp)
 */
function isCacheValid(cacheEntry: LLMCacheEntry): boolean {
  const expiresAt = new Date(cacheEntry.expiresAt).getTime()
  return Date.now() < expiresAt
}

/**
 * Get cached analysis result
 */
export function getCachedAnalysis(errorMessage: string, projectRoot?: string): AnalysisResult | null {
  const cache = loadAnalysisCache(projectRoot)
  const hash = hashError(errorMessage)
  const entry = cache[hash]

  if (!entry || !isCacheValid(entry)) {
    return null
  }

  return {
    rootCause: entry.analysis.rootCause,
    suggestedFixes: entry.analysis.suggestedFixes,
    confidence: entry.analysis.confidence,
    timestamp: new Date(entry.cachedAt),
    cached: true
  }
}

/**
 * Cache analysis result with proper schema
 */
export function cacheAnalysisResult(errorMessage: string, result: AnalysisResult, projectRoot?: string): void {
  const cache = loadAnalysisCache(projectRoot)
  const hash = hashError(errorMessage)
  const now = new Date()
  const expiresAt = new Date(now.getTime() + CACHE_TTL)

  cache[hash] = {
    errorHash: hash,
    analysis: {
      rootCause: result.rootCause,
      suggestedFixes: result.suggestedFixes,
      confidence: result.confidence
    },
    cachedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString()
  }

  saveAnalysisCache(cache, projectRoot)
}

/**
 * Clean up expired cache entries
 */
export function cleanupCache(projectRoot?: string): void {
  const cache = loadAnalysisCache(projectRoot)
  let cleaned = 0

  for (const [hash, entry] of Object.entries(cache)) {
    if (!isCacheValid(entry)) {
      delete cache[hash]
      cleaned++
    }
  }

  if (cleaned > 0) {
    saveAnalysisCache(cache, projectRoot)
    logger.debug(`Cleaned up ${cleaned} expired cache entries`)
  }
}

/**
 * Analyze error using Anthropic SDK
 */
async function analyzeWithAnthropic(errorMessage: string, model: string = 'haiku', apiKey?: string): Promise<AnalysisResult> {
  const key = apiKey || process.env.ANTHROPIC_API_KEY

  if (!key) {
    logger.debug('Anthropic API key not provided, skipping Anthropic analysis')
    return patternBasedAnalysis(errorMessage)
  }

  logger.debug(`Analyzing error with Anthropic (model: ${model})`)

  const prompt = `Analyze this loopwork error log entry and suggest a fix:
${errorMessage}

Return your analysis in this JSON format ONLY:
{
  "rootCause": "Short description of the root cause",
  "suggestedFixes": ["fix 1", "fix 2", "fix 3"],
  "confidence": 0.8
}

Where confidence is a number between 0 and 1 indicating how confident you are in the analysis.`

  const modelMap: Record<string, string> = {
    'haiku': 'claude-3-haiku-20240307',
    'sonnet': 'claude-3-5-sonnet-20241022',
    'opus': 'claude-3-opus-20240229'
  }

  const anthropicModel = modelMap[model] || modelMap['haiku']

  try {
    const anthropic = new Anthropic({ apiKey: key })

    const message = await anthropic.messages.create({
      model: anthropicModel,
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: prompt
      }]
    })

    const responseText = message.content[0].type === 'text'
      ? message.content[0].text
      : ''

    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        rootCause: parsed.rootCause || 'Unknown error',
        suggestedFixes: Array.isArray(parsed.suggestedFixes) ? parsed.suggestedFixes : ['Manual investigation required'],
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        timestamp: new Date(),
        cached: false
      }
    }
  } catch (error) {
    logger.debug(`Anthropic analysis failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  return patternBasedAnalysis(errorMessage)
}

async function analyzeLLM(errorMessage: string, model: string = 'haiku', apiKey?: string): Promise<AnalysisResult> {
  // Try Anthropic SDK first if API key is available
  if (apiKey || process.env.ANTHROPIC_API_KEY) {
    return analyzeWithAnthropic(errorMessage, model, apiKey)
  }

  // No API key - use fast pattern-based analysis (synchronous, no CLI delays)
  return patternBasedAnalysis(errorMessage)
}

/**
 * Throttling state - tracks LLM call limits per session
 */
export interface ThrottleState {
  llmCallCount: number
  lastLLMCall: number
  llmCooldown: number
  llmMaxPerSession: number
}

/**
 * Check if we should throttle LLM analysis
 * Returns null if allowed, or a throttle result if blocked
 */
export function shouldThrottleLLM(state: ThrottleState): { throttled: true; reason: string } | { throttled: false } {
  // Check if we've exceeded max calls per session
  if (state.llmCallCount >= state.llmMaxPerSession) {
    return {
      throttled: true,
      reason: `LLM analysis throttled: max ${state.llmMaxPerSession} calls per session reached`
    }
  }

  // Check if we're within the cooldown period
  const timeSinceLastCall = Date.now() - state.lastLLMCall
  if (timeSinceLastCall < state.llmCooldown) {
    const remainingCooldown = Math.ceil((state.llmCooldown - timeSinceLastCall) / 1000)
    return {
      throttled: true,
      reason: `LLM analysis throttled: ${remainingCooldown}s remaining in cooldown period`
    }
  }

  return { throttled: false }
}

/**
 * Execute analyze action
 */
export async function executeAnalyze(
  action: Action,
  llmModel?: string,
  anthropicApiKey?: string,
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

  // Check cache first
  const cached = getCachedAnalysis(errorMessage, projectRoot)
  if (cached) {
    logger.debug('Using cached analysis result')
    return cached
  }

  // Check throttling if state is provided
  if (throttleState) {
    const throttle = shouldThrottleLLM(throttleState)
    if (throttle.throttled) {
      logger.warn(throttle.reason)
      // Return pattern-based fallback when throttled
      return patternBasedAnalysis(errorMessage)
    }
  }

  // Perform LLM analysis
  const result = await analyzeLLM(errorMessage, llmModel || 'haiku', anthropicApiKey)

  // Cache the result
  cacheAnalysisResult(errorMessage, result, projectRoot)

  // Update throttle state if provided
  if (throttleState) {
    throttleState.llmCallCount++
    throttleState.lastLLMCall = Date.now()
  }

  // Log analysis
  logger.info(`Error Analysis:`)
  logger.info(`  Root Cause: ${result.rootCause}`)
  logger.info(`  Suggested Fixes:`)
  result.suggestedFixes.forEach((fix, i) => {
    logger.info(`    ${i + 1}. ${fix}`)
  })
  logger.info(`  Confidence: ${(result.confidence * 100).toFixed(0)}%`)

  return result
}


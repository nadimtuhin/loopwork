/**
 * LLM fallback analysis for unknown errors
 *
 * Uses Anthropic SDK to analyze error logs and suggest fixes.
 * Implements caching and throttling to avoid excessive API calls.
 */

import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import { logger } from '../../core/utils'
import type { Action } from './index'

export interface AnalysisResult {
  cause: string
  fix: string
  severity: 'low' | 'medium' | 'high'
  timestamp: Date
  cached?: boolean
}

export interface AnalysisCache {
  [errorHash: string]: {
    result: Omit<AnalysisResult, 'timestamp' | 'cached'>
    timestamp: number
  }
}

const ANALYSIS_CACHE_FILE = '.loopwork/monitor-analysis-cache.json'
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
  let cause = 'Unknown error'
  let fix = 'Manual investigation required'
  let severity: 'low' | 'medium' | 'high' = 'medium'

  if (errorMessage.includes('ENOENT') || errorMessage.includes('not found')) {
    cause = 'File or resource not found'
    fix = 'Verify file path exists and is accessible'
    severity = 'medium'
  } else if (errorMessage.includes('EACCES') || errorMessage.includes('permission')) {
    cause = 'Permission denied'
    fix = 'Check file/directory permissions'
    severity = 'high'
  } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
    cause = 'Operation timed out'
    fix = 'Increase timeout limit or check network connectivity'
    severity = 'medium'
  } else if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
    cause = 'Rate limit exceeded'
    fix = 'Wait before retrying or reduce request frequency'
    severity = 'high'
  }

  return {
    cause,
    fix,
    severity,
    timestamp: new Date(),
    cached: false
  }
}

/**
 * Get cache file path
 */
function getCacheFilePath(): string {
  return path.join(process.cwd(), ANALYSIS_CACHE_FILE)
}

/**
 * Load analysis cache from disk
 */
export function loadAnalysisCache(): AnalysisCache {
  const cacheFile = getCacheFilePath()

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
export function saveAnalysisCache(cache: AnalysisCache): void {
  const cacheFile = getCacheFilePath()

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
 * Check if cached result is still valid
 */
function isCacheValid(cacheEntry: AnalysisCache[string], ttl: number = CACHE_TTL): boolean {
  const age = Date.now() - cacheEntry.timestamp
  return age < ttl
}

/**
 * Get cached analysis result
 */
export function getCachedAnalysis(errorMessage: string): AnalysisResult | null {
  const cache = loadAnalysisCache()
  const hash = hashError(errorMessage)
  const entry = cache[hash]

  if (!entry || !isCacheValid(entry)) {
    return null
  }

  return {
    ...entry.result,
    timestamp: new Date(entry.timestamp),
    cached: true
  }
}

/**
 * Cache analysis result
 */
export function cacheAnalysisResult(errorMessage: string, result: AnalysisResult): void {
  const cache = loadAnalysisCache()
  const hash = hashError(errorMessage)

  cache[hash] = {
    result: {
      cause: result.cause,
      fix: result.fix,
      severity: result.severity
    },
    timestamp: Date.now()
  }

  saveAnalysisCache(cache)
}

/**
 * Clean up expired cache entries
 */
export function cleanupCache(ttl: number = CACHE_TTL): void {
  const cache = loadAnalysisCache()
  let cleaned = 0

  for (const [hash, entry] of Object.entries(cache)) {
    if (!isCacheValid(entry, ttl)) {
      delete cache[hash]
      cleaned++
    }
  }

  if (cleaned > 0) {
    saveAnalysisCache(cache)
    logger.debug(`Cleaned up ${cleaned} expired cache entries`)
  }
}

async function analyzeLLM(errorMessage: string, model: string = 'haiku'): Promise<AnalysisResult> {
  const opencode = findOpencode()
  if (!opencode) {
    logger.debug('Opencode not found, falling back to pattern-based analysis')
    return patternBasedAnalysis(errorMessage)
  }

  logger.debug(`Analyzing error with LLM (model: ${model})`)

  const prompt = `Analyze this loopwork error log entry and suggest a fix:
${errorMessage}

Return your analysis in this JSON format ONLY:
{
  "cause": "Short description of the root cause",
  "fix": "Specific action to fix it",
  "severity": "low" | "medium" | "high"
}`

  const fullModel = model === 'haiku' ? 'google/antigravity-claude-3-haiku' : model
  
  try {
    const result = spawnSync(opencode, ['run', '--model', fullModel, prompt], {
      encoding: 'utf-8',
      env: { ...process.env, OPENCODE_PERMISSION: '{"*":"allow"}' }
    })

    if (result.status === 0 && result.stdout) {
      const jsonMatch = result.stdout.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          cause: parsed.cause || 'Unknown error',
          fix: parsed.fix || 'Manual investigation required',
          severity: parsed.severity || 'medium',
          timestamp: new Date(),
          cached: false
        }
      }
    }
  } catch (error) {
    logger.debug(`LLM analysis failed: ${error}`)
  }

  return patternBasedAnalysis(errorMessage)
}

/**
 * Execute analyze action
 */
export async function executeAnalyze(action: Action, llmModel?: string): Promise<AnalysisResult> {
  if (action.type !== 'analyze') {
    throw new Error('Invalid action type for analyze executor')
  }

  const analyzeAction = action as { type: 'analyze'; pattern: string; context: Record<string, string>; prompt: string }
  const errorMessage = analyzeAction.prompt || action.context.rawLine || ''

  if (!errorMessage) {
    throw new Error('No error message provided for analysis')
  }

  // Check cache first
  const cached = getCachedAnalysis(errorMessage)
  if (cached) {
    logger.debug('Using cached analysis result')
    return cached
  }

  // Perform LLM analysis
  const result = await analyzeLLM(errorMessage, llmModel || 'haiku')

  // Cache the result
  cacheAnalysisResult(errorMessage, result)

  // Log analysis
  logger.info(`Error Analysis:`)
  logger.info(`  Cause: ${result.cause}`)
  logger.info(`  Fix: ${result.fix}`)
  logger.info(`  Severity: ${result.severity}`)

  return result
}


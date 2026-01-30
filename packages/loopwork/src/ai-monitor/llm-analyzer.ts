/**
 * LLM Fallback Analyzer for unknown errors
 * Uses Claude Haiku for cost-efficient error analysis
 * Includes rate limiting (10 calls/session, 5-min cooldown) and 24h caching
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import { logger } from '../core/utils'

export interface ErrorAnalysis {
  rootCause: string
  suggestedFixes: string[]
  confidence: number
}

export interface LLMCacheEntry {
  errorHash: string
  analysis: ErrorAnalysis
  cachedAt: string
  expiresAt: string
}

export interface LLMAnalyzerOptions {
  cacheDir?: string
  maxCallsPerSession?: number
  cooldownMs?: number
}

export class LLMAnalyzer {
  private cacheDir: string
  private maxCallsPerSession: number
  private cooldownMs: number
  private callCount: number = 0
  private lastCallTime: number = 0
  private cacheFile: string

  constructor(options: LLMAnalyzerOptions = {}) {
    this.cacheDir = options.cacheDir || '.loopwork/ai-monitor'
    this.maxCallsPerSession = options.maxCallsPerSession ?? 10
    this.cooldownMs = options.cooldownMs ?? 5 * 60 * 1000 // 5 minutes
    this.cacheFile = path.join(this.cacheDir, 'llm-cache.json')

    // Ensure cache directory exists
    try {
      fs.mkdirSync(this.cacheDir, { recursive: true })
    } catch (e) {
      // Directory may already exist
    }
  }

  /**
   * Analyze an unknown error using LLM
   * First checks cache, then rate limiting, then calls LLM
   */
  async analyzeError(errorMessage: string, stackTrace?: string): Promise<ErrorAnalysis | null> {
    const errorHash = this.hashError(errorMessage, stackTrace)

    // Check cache first
    const cached = this.getCachedAnalysis(errorHash)
    if (cached) {
      logger.debug(`Using cached analysis for error: ${errorHash}`)
      return cached
    }

    // Check rate limiting
    if (!this.canMakeCall()) {
      logger.warn('LLM analyzer throttled: max calls/session reached or cooldown active')
      return null
    }

    // Make LLM call
    try {
      const analysis = await this.callLLM(errorMessage, stackTrace)

      // Cache the response
      this.cacheAnalysis(errorHash, analysis)

      // Update call tracking
      this.callCount++
      this.lastCallTime = Date.now()

      return analysis
    } catch (error) {
      logger.error(`LLM analyzer failed: ${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }

  /**
   * Check if we can make an LLM call
   */
  private canMakeCall(): boolean {
    // Check call count
    if (this.callCount >= this.maxCallsPerSession) {
      logger.debug(`Call limit reached: ${this.callCount}/${this.maxCallsPerSession}`)
      return false
    }

    // Check cooldown
    if (this.lastCallTime > 0) {
      const timeSinceLastCall = Date.now() - this.lastCallTime
      if (timeSinceLastCall < this.cooldownMs) {
        logger.debug(`Cooldown active: ${this.cooldownMs - timeSinceLastCall}ms remaining`)
        return false
      }
    }

    return true
  }

  /**
   * Call Claude Haiku for error analysis
   */
  private async callLLM(errorMessage: string, stackTrace?: string): Promise<ErrorAnalysis> {
    const prompt = this.buildPrompt(errorMessage, stackTrace)

    // In a real implementation, this would call the Anthropic API
    // For now, return a structured response
    try {
      const response = await this.invokeHaiku(prompt)
      return this.parseAnalysis(response)
    } catch (error) {
      // Graceful fallback
      return {
        rootCause: 'Unable to analyze error',
        suggestedFixes: ['Check logs for more details', 'Review recent code changes'],
        confidence: 0.1
      }
    }
  }

  /**
   * Invoke Haiku model via Anthropic SDK
   * Falls back to deterministic mock when API key is not available
   */
  private async invokeHaiku(prompt: string): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY

    // If no API key, use deterministic fallback for testing/development
    if (!apiKey) {
      logger.debug('ANTHROPIC_API_KEY not set, using deterministic fallback')
      return this.mockHaikuResponse(prompt)
    }

    // Model mapping following the pattern from analyze.ts
    const modelMap: Record<string, string> = {
      'haiku': 'claude-3-haiku-20240307',
      'sonnet': 'claude-3-5-sonnet-20241022',
      'opus': 'claude-3-opus-20240229'
    }

    const anthropicModel = modelMap['haiku']

    try {
      const anthropic = new Anthropic({ apiKey })

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

      return responseText
    } catch (error) {
      logger.error(`Anthropic API call failed: ${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
  }

  /**
   * Mock Haiku response for testing/development (when API key not available)
   * Returns deterministic but varying responses based on prompt content
   */
  private mockHaikuResponse(prompt: string): string {
    // Use multiple characters to get better hash distribution
    let seed = 0
    for (let i = 0; i < prompt.length; i++) {
      seed += prompt.charCodeAt(i)
    }
    seed = seed % 5

    const causes = [
      'Process timeout occurred during execution',
      'Memory leak detected in resource handling',
      'Race condition in concurrent operations',
      'File descriptor not found',
      'Invalid configuration parameter'
    ]
    const fixes = [
      ['Increase timeout value', 'Check for blocking I/O operations', 'Monitor system resources'],
      ['Implement garbage collection', 'Review memory allocation', 'Add leak detection'],
      ['Use mutex locks', 'Add synchronization', 'Review critical sections'],
      ['Check file permissions', 'Verify file paths', 'Add error handling'],
      ['Validate config file', 'Check environment variables', 'Review defaults']
    ]

    const mockResponse = `{
      "rootCause": "${causes[seed]}",
      "suggestedFixes": ${JSON.stringify(fixes[seed])},
      "confidence": ${0.6 + seed * 0.08}
    }`
    return mockResponse
  }

  /**
   * Build analysis prompt for LLM
   */
  private buildPrompt(errorMessage: string, stackTrace?: string): string {
    return `Analyze the following error and provide structured guidance:

Error: ${errorMessage}
${stackTrace ? `\nStack Trace:\n${stackTrace}` : ''}

Provide your analysis in this exact JSON format:
{
  "rootCause": "brief explanation of root cause",
  "suggestedFixes": ["fix1", "fix2", "fix3"],
  "confidence": 0.0-1.0
}`
  }

  /**
   * Parse LLM response into structured format
   */
  private parseAnalysis(response: string): ErrorAnalysis {
    try {
      const parsed = JSON.parse(response)
      return {
        rootCause: parsed.rootCause || 'Unknown error',
        suggestedFixes: Array.isArray(parsed.suggestedFixes) ? parsed.suggestedFixes : [],
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5
      }
    } catch {
      return {
        rootCause: 'Failed to parse analysis',
        suggestedFixes: [],
        confidence: 0.0
      }
    }
  }

  /**
   * Hash error for cache key
   */
  private hashError(message: string, stackTrace?: string): string {
    const combined = `${message}${stackTrace || ''}`
    return crypto.createHash('sha256').update(combined).digest('hex')
  }

  /**
   * Get cached analysis if valid
   */
  private getCachedAnalysis(errorHash: string): ErrorAnalysis | null {
    try {
      if (!fs.existsSync(this.cacheFile)) {
        return null
      }

      const content = fs.readFileSync(this.cacheFile, 'utf-8')
      const cache = JSON.parse(content) as Record<string, LLMCacheEntry>

      const entry = cache[errorHash]
      if (!entry) {
        return null
      }

      // Check expiry
      const expiresAt = new Date(entry.expiresAt).getTime()
      if (Date.now() > expiresAt) {
        logger.debug(`Cache entry expired: ${errorHash}`)
        this.removeCacheEntry(errorHash)
        return null
      }

      logger.debug(`Cache hit: ${errorHash}`)
      return entry.analysis
    } catch (error) {
      logger.debug(`Cache read failed: ${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }

  /**
   * Cache analysis response
   */
  private cacheAnalysis(errorHash: string, analysis: ErrorAnalysis): void {
    try {
      let cache: Record<string, LLMCacheEntry> = {}

      if (fs.existsSync(this.cacheFile)) {
        const content = fs.readFileSync(this.cacheFile, 'utf-8')
        cache = JSON.parse(content)
      }

      const now = new Date()
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000) // 24 hours

      cache[errorHash] = {
        errorHash,
        analysis,
        cachedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString()
      }

      fs.writeFileSync(this.cacheFile, JSON.stringify(cache, null, 2))
      logger.debug(`Cached analysis: ${errorHash}`)
    } catch (error) {
      logger.error(`Cache write failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Remove expired cache entry
   */
  private removeCacheEntry(errorHash: string): void {
    try {
      if (!fs.existsSync(this.cacheFile)) {
        return
      }

      const content = fs.readFileSync(this.cacheFile, 'utf-8')
      const cache = JSON.parse(content) as Record<string, LLMCacheEntry>

      delete cache[errorHash]

      fs.writeFileSync(this.cacheFile, JSON.stringify(cache, null, 2))
    } catch (error) {
      logger.debug(`Cache cleanup failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Get current call count
   */
  getCallCount(): number {
    return this.callCount
  }

  /**
   * Reset call counter (typically done at session start)
   */
  resetCallCount(): void {
    this.callCount = 0
    this.lastCallTime = 0
  }

  /**
   * Get time until next call is available
   */
  getTimeUntilNextCall(): number {
    if (this.callCount >= this.maxCallsPerSession) {
      return Infinity // Can't make calls until next session
    }

    if (this.lastCallTime === 0) {
      return 0 // Can make call immediately
    }

    const timeSinceLastCall = Date.now() - this.lastCallTime
    const remainingCooldown = this.cooldownMs - timeSinceLastCall

    return Math.max(0, remainingCooldown)
  }

  /**
   * Clear all cache
   */
  clearCache(): void {
    try {
      if (fs.existsSync(this.cacheFile)) {
        fs.unlinkSync(this.cacheFile)
        logger.debug('Cache cleared')
      }
    } catch (error) {
      logger.error(`Failed to clear cache: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

export function createLLMAnalyzer(options?: LLMAnalyzerOptions): LLMAnalyzer {
  return new LLMAnalyzer(options)
}

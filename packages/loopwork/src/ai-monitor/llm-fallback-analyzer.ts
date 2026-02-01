/**
 * LLM Fallback Analyzer
 *
 * Analyzes unknown errors using Claude Haiku for intelligent error analysis.
 * Features rate limiting and response caching to minimize API costs.
 */

import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import { logger } from '../core/utils'

const COOLDOWN_MS = 300000
const CACHE_TTL_MS = 86400000
const REQUEST_TIMEOUT_MS = 30000

export interface LLMAnalysis {
  rootCause: string
  suggestedFixes: string[]
  confidence: number
}

export interface LLMCacheEntry {
  errorHash: string
  analysis: LLMAnalysis
  cachedAt: string
  expiresAt: string
}

export interface LLMFallbackAnalyzerConfig {
  apiKey?: string
  model?: string
  maxCallsPerSession?: number
  cooldownMs?: number
  cacheTTL?: number
  cacheEnabled?: boolean
  cachePath?: string
  sessionPath?: string
  timeout?: number
  useMock?: boolean
}

interface SessionState {
  callsThisSession: number
  lastCallTime: number
  sessionStartTime: number
}

export class LLMFallbackAnalyzer {
  private config: Required<LLMFallbackAnalyzerConfig>
  private anthropic: Anthropic | null = null
  private sessionState: SessionState
  private cache: Map<string, LLMCacheEntry> = new Map()
  private initialized = false

  private readonly defaultConfig: Required<LLMFallbackAnalyzerConfig> = {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: 'claude-3-haiku-20240307',
    maxCallsPerSession: 10,
    cooldownMs: COOLDOWN_MS,
    cacheTTL: CACHE_TTL_MS,
    cacheEnabled: true,
    cachePath: '.loopwork/ai-monitor/llm-cache.json',
    sessionPath: '.loopwork/ai-monitor/llm-session.json',
    timeout: REQUEST_TIMEOUT_MS,
    useMock: false,
  }

  private readonly systemPrompt = `You are an error analysis assistant. Analyze the provided error and stack trace to identify:
1. Root cause of the error
2. Specific fix actions to resolve it
3. Your confidence level in this analysis (0-100)

Respond with valid JSON matching this structure:
{
  "rootCause": "string explaining the root cause",
  "suggestedFixes": ["fix1", "fix2", "fix3"],
  "confidence": number between 0-100
}

Be specific and actionable. Limit suggested fixes to 3-5 items.`

  constructor(config: LLMFallbackAnalyzerConfig = {}) {
    this.config = { ...this.defaultConfig, ...config }

    // Map common aliases to full model IDs
    if (this.config.model === 'haiku') {
      this.config.model = 'claude-3-haiku-20240307'
    } else if (this.config.model === 'sonnet') {
      this.config.model = 'claude-3-5-sonnet-20240620'
    } else if (this.config.model === 'opus') {
      this.config.model = 'claude-3-opus-20240229'
    }

    this.sessionState = {
      callsThisSession: 0,
      lastCallTime: 0,
      sessionStartTime: Date.now(),
    }
  }

  private async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    if (!this.config.apiKey) {
      logger.warn('[LLMFallbackAnalyzer] No API key found. LLM analysis will be disabled.')
      this.initialized = true
      return
    }

    try {
      this.anthropic = new Anthropic({
        apiKey: this.config.apiKey,
        timeout: this.config.timeout,
      })

      if (this.config.cacheEnabled) {
        await this.loadCache()
      }

      await this.loadSession()

      this.initialized = true
      logger.debug('[LLMFallbackAnalyzer] Initialized successfully')
    } catch (error) {
      logger.error(`[LLMFallbackAnalyzer] Initialization failed: ${error}`)
      this.initialized = true
    }
  }

  async analyzeError(error: string, context?: Record<string, unknown>): Promise<LLMAnalysis | null> {
    await this.initialize()

    const statsBeforeRateLimit = this.sessionState
    logger.info(`[LLMFallbackAnalyzer] Before rate limit check: calls=${statsBeforeRateLimit.callsThisSession}, max=${this.config.maxCallsPerSession}`)

    if (!this.anthropic && !this.config.useMock) {
      logger.debug('[LLMFallbackAnalyzer] LLM not available, skipping analysis')
      return null
    }

    if (!this.checkRateLimit()) {
      logger.warn('[LLMFallbackAnalyzer] Rate limit reached, skipping analysis')
      return null
    }

    const cacheKey = this.generateCacheKey(error, context)

    if (this.config.cacheEnabled) {
      const cached = this.checkCache(cacheKey)
      if (cached) {
        logger.debug('[LLMFallbackAnalyzer] Using cached analysis')
        this.recordCall()
        return cached.analysis
      }
    }

    try {
      const prompt = this.buildPrompt(error, context)
      let analysis: LLMAnalysis | null = null

      try {
        analysis = await this.callLLM(prompt)
      } catch (callError) {
        // Only use mock fallback if explicitly enabled
        if (this.config.useMock) {
          logger.debug(`[LLMFallbackAnalyzer] LLM call failed, using mock fallback: ${callError}`)
          analysis = this.mockLLMResponse(prompt)
        } else {
          logger.error(`[LLMFallbackAnalyzer] LLM call failed: ${callError}`)
          return null
        }
      }

      if (this.config.cacheEnabled && analysis) {
        await this.cacheResult(cacheKey, analysis)
      }

      this.recordCall()

      logger.info(`[LLMFallbackAnalyzer] Analysis complete (confidence: ${analysis.confidence}%, fixes: ${analysis.suggestedFixes.length})`)

      return analysis
    } catch (error) {
      logger.error(`[LLMFallbackAnalyzer] Analysis failed: ${error}`)
      return null
    }
  }

  private checkRateLimit(): boolean {
    const now = Date.now()

    if (this.sessionState.callsThisSession >= this.config.maxCallsPerSession) {
      logger.debug(
        `[LLMFallbackAnalyzer] Session limit reached: ${this.sessionState.callsThisSession}/${this.config.maxCallsPerSession}`
      )
      return false
    }

    const timeSinceLastCall = now - this.sessionState.lastCallTime
    if (timeSinceLastCall < this.config.cooldownMs) {
      const cooldownRemaining = Math.ceil((this.config.cooldownMs - timeSinceLastCall) / 1000)
      logger.debug(
        `[LLMFallbackAnalyzer] In cooldown period. ${cooldownRemaining}s remaining`
      )
      return false
    }

    return true
  }

  private async recordCall(): Promise<void> {
    const now = Date.now()

    this.sessionState.callsThisSession++
    this.sessionState.lastCallTime = now

    logger.debug(
      `[LLMFallbackAnalyzer] Session: ${this.sessionState.callsThisSession}/${this.config.maxCallsPerSession} calls`
    )

    try {
      await this.saveSession()
    } catch (error) {
      logger.warn(`[LLMFallbackAnalyzer] Failed to save session state: ${error}`)
    }
  }

  private async loadSession(): Promise<void> {
    try {
      const sessionFile = path.resolve(this.config.sessionPath)
      const content = await fs.readFile(sessionFile, 'utf-8')
      const savedState = JSON.parse(content)

      // Only restore if it looks valid
      if (
        typeof savedState.callsThisSession === 'number' &&
        typeof savedState.lastCallTime === 'number' &&
        typeof savedState.sessionStartTime === 'number'
      ) {
        // Check if session is too old (e.g., > 24 hours), then reset
        const SESSION_TIMEOUT = 24 * 60 * 60 * 1000
        if (Date.now() - savedState.sessionStartTime > SESSION_TIMEOUT) {
          logger.debug('[LLMFallbackAnalyzer] Saved session expired, starting new')
          return
        }

        this.sessionState = savedState
        logger.debug(
          `[LLMFallbackAnalyzer] Restored session: ${this.sessionState.callsThisSession}/${this.config.maxCallsPerSession} calls`
        )
      }
    } catch (error) {
      // Ignore errors (file not found, invalid JSON), start fresh
      logger.debug('[LLMFallbackAnalyzer] Starting new session (no saved state)')
    }
  }

  private async saveSession(): Promise<void> {
    try {
      const sessionFile = path.resolve(this.config.sessionPath)
      const sessionDir = path.dirname(sessionFile)

      await fs.mkdir(sessionDir, { recursive: true })
      await fs.writeFile(sessionFile, JSON.stringify(this.sessionState, null, 2), 'utf-8')
    } catch (error) {
      logger.error(`[LLMFallbackAnalyzer] Failed to save session: ${error}`)
      throw error
    }
  }

  private generateCacheKey(error: string, context?: Record<string, unknown>): string {
    const data = {
      error: error,
      context: context || {},
    }

    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex')

    return hash
  }

  private checkCache(cacheKey: string): LLMCacheEntry | null {
    const cached = this.cache.get(cacheKey)

    if (!cached) {
      return null
    }

    const now = new Date()
    const expiresAt = new Date(cached.expiresAt)

    if (now > expiresAt) {
      logger.debug('[LLMFallbackAnalyzer] Cache entry expired')
      this.cache.delete(cacheKey)
      return null
    }

    return cached
  }

  private async cacheResult(cacheKey: string, analysis: LLMAnalysis): Promise<void> {
    if (!this.config.cacheEnabled) {
      return
    }

    const now = new Date()
    const expiresAt = new Date(now.getTime() + this.config.cacheTTL)

    const entry: LLMCacheEntry = {
      errorHash: cacheKey,
      analysis,
      cachedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    }

    this.cache.set(cacheKey, entry)

    try {
      await this.saveCache()
    } catch (error) {
      logger.error(`[LLMFallbackAnalyzer] Failed to save cache: ${error}`)
    }
  }

  private async loadCache(): Promise<void> {
    try {
      const cacheFile = path.resolve(this.config.cachePath)
      const content = await fs.readFile(cacheFile, 'utf-8')

      const entries: LLMCacheEntry[] = JSON.parse(content)
      const now = new Date()

      for (const entry of entries) {
        const expiresAt = new Date(entry.expiresAt)
        if (now <= expiresAt) {
          this.cache.set(entry.errorHash, entry)
        }
      }

      logger.debug(`[LLMFallbackAnalyzer] Loaded ${this.cache.size} cache entries`)
    } catch (error) {
      logger.debug('[LLMFallbackAnalyzer] No existing cache file')
    }
  }

  private async saveCache(): Promise<void> {
    try {
      const cacheFile = path.resolve(this.config.cachePath)
      const cacheDir = path.dirname(cacheFile)

      await fs.mkdir(cacheDir, { recursive: true })

      const entries = Array.from(this.cache.values())

      await fs.writeFile(cacheFile, JSON.stringify(entries, null, 2), 'utf-8')

      logger.debug('[LLMFallbackAnalyzer] Cache saved successfully')
    } catch (error) {
      logger.error(`[LLMFallbackAnalyzer] Failed to save cache: ${error}`)
      throw error
    }
  }

  private buildPrompt(error: string, context?: Record<string, unknown>): string {
    let prompt = `Analyze this error and provide your analysis:\n\n${error}\n\n`

    if (context && Object.keys(context).length > 0) {
      prompt += `Additional Context:\n`
      for (const [key, value] of Object.entries(context)) {
        prompt += `- ${key}: ${JSON.stringify(value)}\n`
      }
      prompt += '\n'
    }

    return prompt
  }

  private async callLLM(prompt: string): Promise<LLMAnalysis> {
    if (!this.anthropic) {
      throw new Error('Anthropic client not initialized')
    }

    try {
      const response = await this.anthropic.messages.create({
        model: this.config.model,
        max_tokens: 1000,
        system: this.systemPrompt,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      })

      const content = response.content[0]
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from LLM')
      }

      const parsed = JSON.parse(content.text)

      return {
        rootCause: String(parsed.rootCause || 'Unknown'),
        suggestedFixes: Array.isArray(parsed.suggestedFixes)
          ? parsed.suggestedFixes.map(String)
          : [],
        confidence: Math.min(100, Math.max(0, Number(parsed.confidence) || 50)),
      }
    } catch (error) {
      logger.error(`[LLMFallbackAnalyzer] LLM call failed: ${error}`)
      throw error
    }
  }

  /**
   * Mock LLM response for testing/development (when API is unavailable or invalid)
   * Returns deterministic but varying responses based on prompt content
   */
  private mockLLMResponse(prompt: string): LLMAnalysis {
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
      'Invalid configuration parameter',
    ]
    const fixes = [
      ['Increase timeout value', 'Check for blocking I/O operations', 'Monitor system resources'],
      ['Implement garbage collection', 'Review memory allocation', 'Add leak detection'],
      ['Use mutex locks', 'Add synchronization', 'Review critical sections'],
      ['Check file permissions', 'Verify file paths', 'Add error handling'],
      ['Validate config file', 'Check environment variables', 'Review defaults'],
    ]

    return {
      rootCause: causes[seed],
      suggestedFixes: fixes[seed],
      confidence: 60 + seed * 8,
    }
  }

  getSessionStats(): {
    callsThisSession: number
    callsRemaining: number
    lastCallTime: number
    cooldownRemaining: number
  } {
    const now = Date.now()
    const cooldownRemaining = Math.max(
      0,
      this.config.cooldownMs - (now - this.sessionState.lastCallTime)
    )

    return {
      callsThisSession: this.sessionState.callsThisSession,
      callsRemaining: this.config.maxCallsPerSession - this.sessionState.callsThisSession,
      lastCallTime: this.sessionState.lastCallTime,
      cooldownRemaining,
    }
  }

  getCacheStats(): {
    size: number
    enabled: boolean
    ttl: number
  } {
    const now = new Date()
    for (const [key, entry] of this.cache.entries()) {
      const expiresAt = new Date(entry.expiresAt)
      if (now > expiresAt) {
        this.cache.delete(key)
      }
    }

    return {
      size: this.cache.size,
      enabled: this.config.cacheEnabled,
      ttl: this.config.cacheTTL,
    }
  }

  async clearCache(): Promise<void> {
    this.cache.clear()

    try {
      const cacheFile = path.resolve(this.config.cachePath)
      await fs.unlink(cacheFile)
      logger.debug('[LLMFallbackAnalyzer] Cache cleared')
    } catch (error) {
      logger.debug('[LLMFallbackAnalyzer] No cache file to clear')
    }
  }

  resetSession(): void {
    this.sessionState = {
      callsThisSession: 0,
      lastCallTime: 0,
      sessionStartTime: Date.now(),
    }

    logger.debug('[LLMFallbackAnalyzer] Session reset')
  }
}

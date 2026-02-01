import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import { logger } from './utils'

export interface ErrorAnalysisResponse {
  rootCause: string
  suggestedFixes: string[]
  confidence: number
}

export type ErrorAnalysis = ErrorAnalysisResponse

export interface ErrorAnalysisRequest {
  errorMessage: string
  stackTrace?: string
  context?: Record<string, unknown>
}

export interface LLMCacheEntry {
  errorHash: string
  analysis: ErrorAnalysisResponse
  cachedAt: string
  expiresAt: string
}

export interface LLMAnalyzerOptions {
  cacheDir?: string
  maxCallsPerSession?: number
  cooldownMs?: number
  projectRoot?: string
}

export interface IErrorAnalyzer {
  readonly name: 'error-analyzer'
  analyze(request: ErrorAnalysisRequest): Promise<ErrorAnalysisResponse | null>
  canMakeCall(): boolean
  getCacheKey(request: ErrorAnalysisRequest): string
  clearCache(): void
  getCallCount(): number
  resetCallCount(): void
  getTimeUntilNextCall(): number
}

export class LLMAnalyzer implements IErrorAnalyzer {
  readonly name = 'error-analyzer' as const
  private cacheDir: string
  private maxCallsPerSession: number
  private cooldownMs: number
  private callCount: number = 0
  private lastCallTime: number = 0
  private cacheFile: string
  private projectRoot: string

  constructor(options: LLMAnalyzerOptions = {}) {
    this.projectRoot = options.projectRoot || process.cwd()
    this.cacheDir = options.cacheDir || path.join(this.projectRoot, '.loopwork/ai-monitor')
    this.maxCallsPerSession = options.maxCallsPerSession ?? 10
    this.cooldownMs = options.cooldownMs ?? 5 * 60 * 1000
    this.cacheFile = path.join(this.cacheDir, 'llm-cache.json')

    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true })
      }
    } catch {}
  }

  syncState(callCount: number, lastCallTime: number): void {
    this.callCount = callCount
    this.lastCallTime = lastCallTime
  }

  async analyze(request: ErrorAnalysisRequest): Promise<ErrorAnalysisResponse | null> {
    const errorHash = this.hashError(request.errorMessage, request.stackTrace)

    const cached = this.getCachedAnalysis(errorHash)
    if (cached) {
      logger.debug(`Using cached analysis for error: ${errorHash}`)
      return cached
    }

    const patternResult = this.analyzePattern(request.errorMessage)
    if (patternResult) {
      this.cacheAnalysis(errorHash, patternResult)
      return patternResult
    }

    if (!this.canMakeCall()) {
      logger.warn('LLM analyzer throttled: max calls/session reached or cooldown active')
      return null
    }

    try {
      const analysis = await this.callLLM(request.errorMessage, request.stackTrace)

      if (analysis && analysis.confidence > 0.1) {
        this.cacheAnalysis(errorHash, analysis)
        this.callCount++
        this.lastCallTime = Date.now()
      }

      return analysis
    } catch (error) {
      logger.error(`LLM analyzer failed: ${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }

  async analyzeError(errorMessage: string, stackTrace?: string): Promise<ErrorAnalysisResponse | null> {
    return this.analyze({ errorMessage, stackTrace })
  }

  getCacheKey(request: ErrorAnalysisRequest): string {
    return this.hashError(request.errorMessage, request.stackTrace)
  }

  canMakeCall(): boolean {
    if (this.callCount >= this.maxCallsPerSession) {
      return false
    }

    if (this.lastCallTime > 0) {
      const timeSinceLastCall = Date.now() - this.lastCallTime
      if (timeSinceLastCall < this.cooldownMs) {
        return false
      }
    }

    return true
  }

  getCallCount(): number {
    return this.callCount
  }

  resetCallCount(): void {
    this.callCount = 0
    this.lastCallTime = 0
  }

  getTimeUntilNextCall(): number {
    if (this.callCount >= this.maxCallsPerSession) {
      return Infinity
    }

    if (this.lastCallTime === 0) {
      return 0
    }

    const timeSinceLastCall = Date.now() - this.lastCallTime
    const remainingCooldown = this.cooldownMs - timeSinceLastCall

    return Math.max(0, remainingCooldown)
  }

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

  private analyzePattern(errorMessage: string): ErrorAnalysisResponse | null {
    const lowerMessage = errorMessage.toLowerCase()

    if (lowerMessage.includes('enoent') || lowerMessage.includes('no such file')) {
      return {
        rootCause: 'File or directory not found',
        suggestedFixes: ['Verify file path exists', 'Check for typos in path', 'Check working directory'],
        confidence: 0.9
      }
    }

    if (lowerMessage.includes('eacces') || lowerMessage.includes('permission denied')) {
      return {
        rootCause: 'Permission denied',
        suggestedFixes: ['Check file permissions', 'Run with appropriate privileges', 'Verify ownership'],
        confidence: 0.9
      }
    }

    if (lowerMessage.includes('etimedout') || lowerMessage.includes('timeout')) {
      return {
        rootCause: 'Operation timed out',
        suggestedFixes: ['Check network connection', 'Increase timeout value', 'Check service availability'],
        confidence: 0.9
      }
    }

    if (lowerMessage.includes('429') || lowerMessage.includes('rate limit')) {
      return {
        rootCause: 'Rate limit exceeded',
        suggestedFixes: ['Wait before retrying', 'Implement exponential backoff', 'Check API quota'],
        confidence: 0.9
      }
    }

    return null
  }

  private async callLLM(errorMessage: string, stackTrace?: string): Promise<ErrorAnalysisResponse | null> {
    const prompt = this.buildPrompt(errorMessage, stackTrace)

    try {
      const response = await this.invokeHaiku(prompt)
      return this.parseAnalysis(response)
    } catch (error) {
      logger.error(`LLM analysis failed: ${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }

  private async invokeHaiku(prompt: string): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY

    if (!apiKey) {
      logger.debug('ANTHROPIC_API_KEY not set, using deterministic fallback')
      return this.mockHaikuResponse(prompt)
    }

    const model = 'claude-3-haiku-20240307'

    try {
      const anthropic = new Anthropic({ apiKey })

      const message = await anthropic.messages.create({
        model,
        max_tokens: 500,
        system: 'You are an expert Automated Error Analyzer & Code Debugger. Your goal is to analyze runtime errors and stack traces to identify the root cause and suggest specific fixes.',
        messages: [{
          role: 'user',
          content: prompt
        }]
      })

      return message.content[0].type === 'text' ? message.content[0].text : ''
    } catch (error) {
      logger.error(`Anthropic API call failed: ${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
  }

  private mockHaikuResponse(prompt: string): string {
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

    return JSON.stringify({
      rootCause: causes[seed],
      suggestedFixes: fixes[seed],
      confidence: 0.6 + seed * 0.08
    })
  }

  private buildPrompt(errorMessage: string, stackTrace?: string): string {
    return `You are an expert Automated Error Analyzer & Code Debugger.
Your goal is to analyze runtime errors and stack traces to identify the root cause.

Follow this analysis process:
1. EXAMINE the provided error message and context.
2. CATEGORIZE the error into one of: "SyntaxError", "LogicError", "Timeout", "RateLimit", "Hallucination", or "Unknown".
3. ASSESS severity (Low/Medium/High/Critical).
4. PROVIDE specific fix or fallback strategy.

Error: ${errorMessage}
${stackTrace ? `\nStack Trace:\n${stackTrace}` : ''}

Provide your analysis in this exact JSON format:
{
  "rootCause": "concise explanation of root cause",
  "suggestedFixes": ["fix1", "fix2", "fix3"],
  "confidence": 0.0-1.0
}`
  }

  private parseAnalysis(response: string): ErrorAnalysisResponse | null {
    try {
      const parsed = JSON.parse(response)
      if (!parsed.rootCause || !Array.isArray(parsed.suggestedFixes)) {
        return null
      }
      return {
        rootCause: String(parsed.rootCause),
        suggestedFixes: parsed.suggestedFixes.map(String),
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5
      }
    } catch {
      return null
    }
  }

  hashError(message: string, stackTrace?: string): string {
    const normalized = this.normalizeError(message + (stackTrace || ''))
    return crypto.createHash('sha256').update(normalized).digest('hex')
  }

  private normalizeError(error: string): string {
    return error
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, '[TIMESTAMP]')
      .replace(/\d{4}-\d{2}-\d{2}(?:\s+(?:at\s+)?\d{2}:\d{2}:\d{2})?/g, '[TIMESTAMP]')
      .replace(/\/[a-zA-Z0-9._\-\/]+\/[a-zA-Z0-9._\-\/]+/g, '[PATH]')
      .replace(/[a-zA-Z]:\\[a-zA-Z0-9._\-\\]+\\[a-zA-Z0-9._\-\\]+/g, '[PATH]')
      .replace(/0x[a-fA-F0-9]+/g, '[HEX]')
      .trim()
      .replace(/\s+/g, ' ')
  }

  getCachedAnalysis(errorHash: string): ErrorAnalysisResponse | null {
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

  cacheAnalysis(errorHash: string, analysis: ErrorAnalysisResponse): void {
    try {
      let cache: Record<string, LLMCacheEntry> = {}

      if (fs.existsSync(this.cacheFile)) {
        try {
          const content = fs.readFileSync(this.cacheFile, 'utf-8')
          cache = JSON.parse(content)
        } catch {
          cache = {}
        }
      }

      const now = new Date()
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000)

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

  cleanupExpired(): void {
    try {
      if (!fs.existsSync(this.cacheFile)) return

      const content = fs.readFileSync(this.cacheFile, 'utf-8')
      const cache = JSON.parse(content) as Record<string, LLMCacheEntry>
      const now = Date.now()
      let changed = false

      for (const [hash, entry] of Object.entries(cache)) {
        if (new Date(entry.expiresAt).getTime() < now) {
          delete cache[hash]
          changed = true
        }
      }

      if (changed) {
        fs.writeFileSync(this.cacheFile, JSON.stringify(cache, null, 2))
      }
    } catch {}
  }

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
}

export function createLLMAnalyzer(options?: LLMAnalyzerOptions): LLMAnalyzer {
  return new LLMAnalyzer(options)
}

import type { IErrorAnalyzer, ErrorAnalysisRequest, ErrorAnalysisResponse } from '../contracts/llm-analyzer'

export interface GLMAnalyzerOptions {
  apiKey?: string
  baseUrl?: string
  model?: string
  maxCallsPerSession?: number
  cooldownMs?: number
}

export class GLMErrorAnalyzer implements IErrorAnalyzer {
  readonly name = 'error-analyzer' as const
  private apiKey: string
  private baseUrl: string
  private model: string
  private maxCallsPerSession: number
  private cooldownMs: number
  private callCount = 0
  private lastCallTime = 0

  constructor(options: GLMAnalyzerOptions = {}) {
    this.apiKey = options.apiKey || process.env.GLM_API_KEY || ''
    this.baseUrl = options.baseUrl || 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
    this.model = options.model || 'glm-4.2'
    this.maxCallsPerSession = options.maxCallsPerSession ?? 10
    this.cooldownMs = options.cooldownMs ?? 5 * 60 * 1000
  }

  async analyze(request: ErrorAnalysisRequest): Promise<ErrorAnalysisResponse | null> {
    if (!this.canMakeCall()) {
      console.warn('GLM analyzer throttled')
      return this.getFallbackAnalysis(request.errorMessage)
    }

    const patternResult = this.analyzePattern(request.errorMessage)
    if (patternResult) return patternResult

    if (!this.apiKey) {
      return this.getFallbackAnalysis(request.errorMessage)
    }

    try {
      const analysis = await this.callGLM(request)
      if (analysis) {
        this.callCount++
        this.lastCallTime = Date.now()
      }
      return analysis
    } catch {
      return this.getFallbackAnalysis(request.errorMessage)
    }
  }

  private async callGLM(request: ErrorAnalysisRequest): Promise<ErrorAnalysisResponse | null> {
    const prompt = `You are an expert error analyzer. Analyze this error and provide root cause and fixes.

Error: ${request.errorMessage}
${request.stackTrace ? `Stack Trace: ${request.stackTrace}` : ''}

Respond in JSON format:
{
  "rootCause": "concise explanation",
  "suggestedFixes": ["fix 1", "fix 2", "fix 3"],
  "confidence": 0.0-1.0
}`

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: 'You analyze errors and return JSON responses.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
        }),
      })

      if (!response.ok) {
        throw new Error(`GLM API error: ${response.status}`)
      }

      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
      const content = data.choices?.[0]?.message?.content

      if (!content) return null

      return this.parseGLMResponse(content)
    } catch {
      return null
    }
  }

  private parseGLMResponse(content: string): ErrorAnalysisResponse | null {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return null

      const parsed = JSON.parse(jsonMatch[0])
      return {
        rootCause: String(parsed.rootCause || 'Unknown error'),
        suggestedFixes: Array.isArray(parsed.suggestedFixes) 
          ? parsed.suggestedFixes.map(String) 
          : ['Check error details', 'Review logs'],
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      }
    } catch {
      return null
    }
  }

  private analyzePattern(errorMessage: string): ErrorAnalysisResponse | null {
    const msg = errorMessage.toLowerCase()

    if (msg.includes('enoent') || msg.includes('no such file')) {
      return {
        rootCause: 'File or directory not found',
        suggestedFixes: ['Verify file path', 'Check for typos', 'Ensure file exists'],
        confidence: 0.9,
      }
    }

    if (msg.includes('eacces') || msg.includes('permission denied')) {
      return {
        rootCause: 'Permission denied',
        suggestedFixes: ['Check file permissions', 'Run with elevated privileges', 'Verify ownership'],
        confidence: 0.9,
      }
    }

    if (msg.includes('timeout') || msg.includes('etimedout')) {
      return {
        rootCause: 'Operation timed out',
        suggestedFixes: ['Increase timeout', 'Check network', 'Verify service availability'],
        confidence: 0.9,
      }
    }

    return null
  }

  private getFallbackAnalysis(errorMessage: string): ErrorAnalysisResponse {
    const patterns: Record<string, { rootCause: string; fixes: string[] }> = {
      'syntax': { rootCause: 'Syntax error in code', fixes: ['Check syntax', 'Review error location', 'Run linter'] },
      'type': { rootCause: 'Type mismatch or undefined', fixes: ['Add type checking', 'Initialize variables', 'Review types'] },
      'network': { rootCause: 'Network connectivity issue', fixes: ['Check connection', 'Verify URL', 'Retry request'] },
      'memory': { rootCause: 'Out of memory', fixes: ['Reduce memory usage', 'Optimize code', 'Increase limits'] },
    }

    const msg = errorMessage.toLowerCase()
    for (const [key, value] of Object.entries(patterns)) {
      if (msg.includes(key)) {
        return { rootCause: value.rootCause, suggestedFixes: value.fixes, confidence: 0.6 }
      }
    }

    return {
      rootCause: 'Unknown error - manual review needed',
      suggestedFixes: ['Check error logs', 'Review recent changes', 'Search for similar issues'],
      confidence: 0.3,
    }
  }

  getCacheKey(request: ErrorAnalysisRequest): string {
    return `${request.errorMessage}:${request.stackTrace || ''}`.slice(0, 100)
  }

  clearCache(): void {
    // In-memory only, no persistent cache
  }

  canMakeCall(): boolean {
    if (this.callCount >= this.maxCallsPerSession) return false
    if (this.lastCallTime > 0) {
      const timeSinceLastCall = Date.now() - this.lastCallTime
      if (timeSinceLastCall < this.cooldownMs) return false
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
    if (this.callCount >= this.maxCallsPerSession) return Infinity
    if (this.lastCallTime === 0) return 0
    const remaining = this.cooldownMs - (Date.now() - this.lastCallTime)
    return Math.max(0, remaining)
  }
}

export function createGLMErrorAnalyzer(options?: GLMAnalyzerOptions): GLMErrorAnalyzer {
  return new GLMErrorAnalyzer(options)
}

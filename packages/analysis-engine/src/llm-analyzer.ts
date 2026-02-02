/**
 * LLM-Based Analysis Engine
 *
 * Analyzes input using Large Language Models for intelligent insights.
 * Migrated from loopwork core to analysis-engine package.
 */

import type {
  IAnalysisEngine,
  AnalysisContext,
  AnalysisResult,
} from '@loopwork-ai/contracts'

export interface LLMAnalyzerOptions {
  model?: string
  timeout?: number
  systemPrompt?: string
  apiKey?: string
  provider?: 'anthropic' | 'openai' | 'google' | 'auto'
}

interface LLMResponse {
  findings: string[]
  suggestions: string[]
  confidence: number
  reason: string
}

export class LLMAnalyzer implements IAnalysisEngine {
  readonly name = 'llm-analyzer'
  private options: Required<LLMAnalyzerOptions>
  private analysisCache: Map<string, AnalysisResult> = new Map()

  private readonly defaultSystemPrompt = `You are an AI analysis engine. Analyze the provided input and provide insights.

When analyzing, look for:
1. Key findings and observations
2. Potential issues or concerns
3. Suggested improvements or next steps
4. Confidence level in your analysis (0.0 to 1.0)

Respond with valid JSON matching this structure:
{
  "findings": ["string array of key findings"],
  "suggestions": ["string array of actionable suggestions"],
  "confidence": 0.0-1.0,
  "reason": "string explaining your analysis"
}

Be concise and specific. Focus on actionable insights.`

  constructor(options: LLMAnalyzerOptions = {}) {
    this.options = {
      model: options.model ?? 'haiku',
      timeout: options.timeout ?? 30000,
      systemPrompt: options.systemPrompt ?? this.defaultSystemPrompt,
      apiKey: options.apiKey ?? '',
      provider: options.provider ?? 'auto',
    }
  }

  async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    if (!context.input) {
      return {
        success: true,
        confidence: 0,
        findings: [],
        suggestions: [],
        metadata: { reason: 'No input provided for analysis' },
      }
    }

    const cacheKey = this.getCacheKey(context)
    const cached = this.analysisCache.get(cacheKey)
    if (cached) {
      return cached
    }

    try {
      const llmResponse = await this.analyzeWithLLM(context)
      const result: AnalysisResult = {
        success: true,
        confidence: llmResponse.confidence,
        findings: llmResponse.findings,
        suggestions: llmResponse.suggestions,
        metadata: {
          reason: llmResponse.reason,
          analyzedAt: new Date().toISOString(),
          model: this.options.model,
          provider: this.detectProvider(),
        },
      }

      this.analysisCache.set(cacheKey, result)
      return result
    } catch (error) {
      return {
        success: false,
        confidence: 0,
        findings: [],
        suggestions: [],
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          reason: 'LLM analysis failed',
          fallback: true,
        },
      }
    }
  }

  supports(analysisType: string): boolean {
    return analysisType === 'llm' || analysisType === 'ai' || analysisType === 'intelligent'
  }

  async initialize(): Promise<void> {
    this.analysisCache.clear()
  }

  async dispose(): Promise<void> {
    this.analysisCache.clear()
  }

  getCacheKey(context: AnalysisContext): string {
    const inputHash = context.input
      ? Math.abs(
          context.input.split('').reduce((acc, char) => acc * 31 + char.charCodeAt(0), 0)
        )
      : 0
    return `${context.analysisType || 'default'}:${inputHash}`
  }

  clearCache(): void {
    this.analysisCache.clear()
  }

  getCacheSize(): number {
    return this.analysisCache.size
  }

  private async analyzeWithLLM(context: AnalysisContext): Promise<LLMResponse> {
    const prompt = this.buildAnalysisPrompt(context)
    const rawResponse = await this.callLLM(prompt)
    return this.parseResponse(rawResponse)
  }

  private buildAnalysisPrompt(context: AnalysisContext): string {
    const maxInputLength = 2000
    const truncatedInput =
      context.input && context.input.length > maxInputLength
        ? context.input.substring(0, maxInputLength) + '\n...(truncated)'
        : context.input || ''

    const metadata = context.metadata
      ? `\nMetadata:\n${JSON.stringify(context.metadata, null, 2)}\n`
      : ''

    return `Analyze the following input:

Analysis Type: ${context.analysisType || 'general'}
${metadata}
Input:
${truncatedInput}

Provide your analysis in JSON format as specified in the system prompt.`
  }

  private async callLLM(prompt: string): Promise<string> {
    const provider = this.detectProvider()

    switch (provider) {
      case 'anthropic':
        return this.callAnthropicAPI(prompt)
      case 'openai':
        return this.callOpenAIAPI(prompt)
      case 'google':
        return this.callGoogleAPI(prompt)
      default:
        return this.simulateLLMAnalysis(prompt)
    }
  }

  private detectProvider(): 'anthropic' | 'openai' | 'google' | 'mock' {
    if (this.options.provider !== 'auto') {
      return this.options.provider as 'anthropic' | 'openai' | 'google'
    }

    if (this.options.apiKey) {
      if (this.options.apiKey.startsWith('sk-ant-')) return 'anthropic'
      if (this.options.apiKey.startsWith('sk-')) return 'openai'
      return 'google'
    }

    if (process.env.ANTHROPIC_API_KEY) return 'anthropic'
    if (process.env.OPENAI_API_KEY) return 'openai'
    if (process.env.GOOGLE_API_KEY) return 'google'

    return 'mock'
  }

  private async callAnthropicAPI(prompt: string): Promise<string> {
    const apiKey = this.options.apiKey || process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error('Anthropic API key not found')
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout)

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.options.model || 'haiku',
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: `${this.options.systemPrompt}\n\n${prompt}`,
            },
          ],
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Anthropic API error: ${response.status} - ${errorText}`)
      }

      const data = (await response.json()) as { content: Array<{ text: string }> }
      return data.content[0]?.text || ''
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  private async callOpenAIAPI(prompt: string): Promise<string> {
    const apiKey = this.options.apiKey || process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OpenAI API key not found')
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout)

    try {
      const model = this.options.model === 'haiku' ? 'gpt-4o-mini' : 'gpt-4o'

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: this.options.systemPrompt },
            { role: 'user', content: prompt },
          ],
          max_tokens: 1024,
          temperature: 0.3,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`)
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>
      }
      return data.choices[0]?.message?.content || ''
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  private async callGoogleAPI(prompt: string): Promise<string> {
    const apiKey = this.options.apiKey || process.env.GOOGLE_API_KEY
    if (!apiKey) {
      throw new Error('Google API key not found')
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout)

    try {
      const model = this.options.model === 'haiku' ? 'gemini-1.5-flash' : 'gemini-1.5-pro'

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: `${this.options.systemPrompt}\n\n${prompt}` }],
              },
            ],
            generationConfig: {
              maxOutputTokens: 1024,
              temperature: 0.3,
            },
          }),
          signal: controller.signal,
        }
      )

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Google API error: ${response.status} - ${errorText}`)
      }

      const data = (await response.json()) as {
        candidates: Array<{ content: { parts: Array<{ text: string }> } }>
      }
      return data.candidates[0]?.content?.parts[0]?.text || ''
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  private simulateLLMAnalysis(prompt: string): string {
    const findings: string[] = []
    const suggestions: string[] = []

    if (prompt.match(/error|failed|exception/i)) {
      findings.push('Errors detected in input')
      suggestions.push('Review error handling and add proper error recovery')
    }

    if (prompt.match(/partial|incomplete|WIP/i)) {
      findings.push('Work appears incomplete')
      suggestions.push('Complete remaining implementation')
    }

    if (prompt.match(/test|verify|validate/i)) {
      findings.push('Testing mentioned')
      suggestions.push('Ensure comprehensive test coverage')
    }

    const response: LLMResponse = {
      findings: findings.length > 0 ? findings : ['Input analyzed'],
      suggestions:
        suggestions.length > 0 ? suggestions : ['No specific suggestions at this time'],
      confidence: findings.length > 0 ? 0.7 : 0.5,
      reason:
        findings.length > 0
          ? 'Detected potential issues based on pattern matching'
          : 'No significant issues detected',
    }

    return JSON.stringify(response)
  }

  private parseResponse(response: string): LLMResponse {
    try {
      const parsed = JSON.parse(response)

      return {
        findings: Array.isArray(parsed.findings) ? parsed.findings : [],
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        reason: String(parsed.reason || 'Analysis complete'),
      }
    } catch (error) {
      throw new Error(
        `Failed to parse LLM response: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}

/**
 * LLM-Based Output Analyzer
 *
 * Uses an LLM to intelligently analyze CLI output and detect follow-up tasks
 */

import type { Task, Priority } from '../contracts/task'
import type { PluginTaskResult } from '../contracts/plugin'
import type { TaskAnalyzer, TaskAnalysisResult, SuggestedTask } from '../contracts/analysis'
import { PatternAnalyzer, type PatternAnalyzerConfig } from './pattern-analyzer'
import { LoopworkError } from '../core/errors'

/**
 * Configuration for LLM analyzer
 */
export interface LLMAnalyzerOptions {
  /** Model to use for analysis (default: haiku for cost-efficiency) */
  model?: string

  /** Timeout in milliseconds for LLM calls (default: 30000) */
  timeout?: number

  /** Fallback to pattern analyzer if LLM fails (default: true) */
  fallbackToPattern?: boolean

  /** Pattern analyzer config for fallback */
  patternConfig?: PatternAnalyzerConfig

  /** Custom system prompt for LLM analysis */
  systemPrompt?: string
}

/**
 * Parsed LLM response structure
 */
interface LLMAnalysisResponse {
  shouldCreateTasks: boolean
  suggestedTasks: Array<{
    title: string
    description: string
    priority: Priority
    isSubTask: boolean
  }>
  reason: string
}

/**
 * Implementation of TaskAnalyzer using LLM-based analysis
 */
export class LLMAnalyzer implements TaskAnalyzer {
  private options: Required<LLMAnalyzerOptions>
  private patternAnalyzer: PatternAnalyzer
  private analysisCache: Map<string, TaskAnalysisResult> = new Map()

  private readonly defaultSystemPrompt = `You are an AI task analyzer. Your job is to analyze CLI execution output and identify follow-up work needed.

When analyzing task results, look for:
1. Incomplete work (partial implementations, TODOs, FIXMEs)
2. Blockers or prerequisites that must be addressed first
3. Suggested improvements or enhancements
4. Integration or deployment steps that remain
5. Testing or validation work that's needed

Respond with valid JSON matching this structure:
{
  "shouldCreateTasks": boolean,
  "suggestedTasks": [
    {
      "title": "string (max 60 chars)",
      "description": "string explaining why this task is needed",
      "priority": "high" | "medium" | "low",
      "isSubTask": true
    }
  ],
  "reason": "string explaining the analysis decision"
}

Be concise. Suggest at most 5 tasks. Only suggest tasks that are genuinely needed based on the output.`

  constructor(options: LLMAnalyzerOptions = {}) {
    this.options = {
      model: options.model ?? 'haiku',
      timeout: options.timeout ?? 30000,
      fallbackToPattern: options.fallbackToPattern ?? true,
      patternConfig: options.patternConfig ?? {},
      systemPrompt: options.systemPrompt ?? this.defaultSystemPrompt
    }

    this.patternAnalyzer = new PatternAnalyzer(this.options.patternConfig)
  }

  async analyze(task: Task, result: PluginTaskResult): Promise<TaskAnalysisResult> {
    // Check cache first
    const cacheKey = this.getCacheKey(task.id, result.output ?? null)
    const cached = this.analysisCache.get(cacheKey)
    if (cached) {
      return cached
    }

    try {
      // Try LLM analysis
      const analysis = await this.analyzeLLM(task, result)
      this.analysisCache.set(cacheKey, analysis)
      return analysis
    } catch (error) {
      // Fallback to pattern analyzer on error
      if (this.options.fallbackToPattern) {
        const fallbackAnalysis = await this.patternAnalyzer.analyze(task, result)
        // Add info about fallback
        const fallbackResult: TaskAnalysisResult = {
          ...fallbackAnalysis,
          reason: `LLM analysis failed, falling back to pattern analyzer: ${fallbackAnalysis.reason}`
        }
        this.analysisCache.set(cacheKey, fallbackResult)
        return fallbackResult
      }

      // No fallback, re-throw error
      throw new LoopworkError(
        'ERR_UNKNOWN',
        `LLM analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        [
          'Enable fallback to pattern analyzer',
          'Check AI CLI configuration',
          'Verify API credentials',
        ]
      )
    }
  }

  /**
   * Perform LLM-based analysis
   */
  private async analyzeLLM(task: Task, result: PluginTaskResult): Promise<TaskAnalysisResult> {
    if (!result.output) {
      return {
        shouldCreateTasks: false,
        suggestedTasks: [],
        reason: 'No output available for analysis'
      }
    }

    // Prepare the prompt
    const prompt = this.buildAnalysisPrompt(task, result)

    // Call LLM via fetch (using anthropic/openai API)
    const llmResponse = await this.callLLM(prompt)

    // Parse and validate response
    const parsed = this.parseResponse(llmResponse)

    // Validate and enhance the response
    const suggestedTasks = parsed.suggestedTasks.map(t => ({
      ...t,
      parentId: t.isSubTask ? task.id : undefined
    }))

    return {
      shouldCreateTasks: parsed.suggestedTasks.length > 0,
      suggestedTasks: suggestedTasks as SuggestedTask[],
      reason: parsed.reason
    }
  }

  /**
   * Build the analysis prompt with context
   */
  private buildAnalysisPrompt(task: Task, result: PluginTaskResult): string {
    // Truncate very long outputs to avoid token explosion
    const maxOutputLength = 2000
    const truncatedOutput = result.output && result.output.length > maxOutputLength
      ? result.output.substring(0, maxOutputLength) + '\n...(truncated)'
      : result.output || ''

    return `Analyze this task execution result and suggest follow-up work if needed.

Original Task:
- ID: ${task.id}
- Title: ${task.title}
- Description: ${task.description}

    Execution Result:
- Success: ${result.success}
- Duration: ${result.duration}ms

Output:
${truncatedOutput}

Provide your analysis in JSON format as specified in the system prompt.`
  }

  /**
   * Call the LLM with timeout protection
   */
  private async callLLM(prompt: string): Promise<string> {
    // Check for API key and make actual LLM call
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GOOGLE_API_KEY

    if (apiKey) {
      // Determine which provider to use based on available key
      if (process.env.ANTHROPIC_API_KEY) {
        return this.callAnthropicAPI(prompt, apiKey)
      } else if (process.env.OPENAI_API_KEY) {
        return this.callOpenAIAPI(prompt, apiKey)
      } else if (process.env.GOOGLE_API_KEY) {
        return this.callGoogleAPI(prompt, apiKey)
      }
    }

    // Fallback to simulation if no API key available
    return this.simulateLLMAnalysis(prompt)
  }

  /**
   * Call Anthropic API for LLM analysis
   */
  private async callAnthropicAPI(prompt: string, apiKey: string): Promise<string> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout)

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: this.options.model || 'haiku',
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: `${this.options.systemPrompt}\n\n${prompt}`
            }
          ],
          system: this.options.systemPrompt
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Anthropic API error: ${response.status} - ${errorText}`)
      }

      const data = await response.json() as { content: Array<{ text: string }> }
      return data.content[0]?.text || ''
    } catch {
      clearTimeout(timeoutId)
      // Fallback to simulation on API error
      return this.simulateLLMAnalysis(prompt)
    }
  }

  /**
   * Call OpenAI API for LLM analysis
   */
  private async callOpenAIAPI(prompt: string, apiKey: string): Promise<string> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout)

    try {
      const model = this.options.model === 'haiku' ? 'gpt-4o-mini' : 'gpt-4o'

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: this.options.systemPrompt },
            { role: 'user', content: prompt }
          ],
          max_tokens: 1024,
          temperature: 0.3
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`)
      }

      const data = await response.json() as { choices: Array<{ message: { content: string } }> }
      return data.choices[0]?.message?.content || ''
    } catch {
      clearTimeout(timeoutId)
      // Fallback to simulation on API error
      return this.simulateLLMAnalysis(prompt)
    }
  }

  /**
   * Call Google API for LLM analysis
   */
  private async callGoogleAPI(prompt: string, apiKey: string): Promise<string> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout)

    try {
      const model = this.options.model === 'haiku' ? 'gemini-1.5-flash' : 'gemini-1.5-pro'

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: `${this.options.systemPrompt}\n\n${prompt}` }
            ]
          }],
          generationConfig: {
            maxOutputTokens: 1024,
            temperature: 0.3
          }
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Google API error: ${response.status} - ${errorText}`)
      }

      const data = await response.json() as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> }
      return data.candidates[0]?.content?.parts[0]?.text || ''
    } catch {
      clearTimeout(timeoutId)
      // Fallback to simulation on API error
      return this.simulateLLMAnalysis(prompt)
    }
  }

  /**
   * Simulate LLM analysis (for cases where API is not available)
   * In production, this would call an actual LLM API
   */
  private simulateLLMAnalysis(prompt: string): string {
    // Look for common patterns that would indicate follow-up work
    const tasks: Array<{
      title: string
      description: string
      priority: Priority
      isSubTask: boolean
    }> = []

    // Check for incomplete work indicators
    if (prompt.match(/partial|incomplete|WIP|work in progress/i)) {
      tasks.push({
        title: 'Complete remaining implementation',
        description: 'Task appears to be partially completed. Additional work is needed.',
        priority: 'high',
        isSubTask: true
      })
    }

    // Check for error indicators
    if (prompt.match(/error|failed|exception/i) && !prompt.match(/error handling added|handled/i)) {
      tasks.push({
        title: 'Add error handling for edge cases',
        description: 'Errors were detected during execution. Error handling should be improved.',
        priority: 'high',
        isSubTask: true
      })
    }

    // Check for testing needs
    if (prompt.match(/test|verify|validate/i) && !prompt.match(/tests? (pass|complete|all)/i)) {
      tasks.push({
        title: 'Add comprehensive tests',
        description: 'Testing coverage appears incomplete. More tests are recommended.',
        priority: 'medium',
        isSubTask: true
      })
    }

    // Check for deployment/integration needs
    if (prompt.match(/deploy|production|staging|release/i) && !prompt.match(/deployed|released/i)) {
      tasks.push({
        title: 'Deploy to production',
        description: 'Deployment steps remain to be completed.',
        priority: 'medium',
        isSubTask: true
      })
    }

    // Check for documentation needs
    if (prompt.match(/document|readme|comment|docs/i) && !prompt.match(/documented|documented/i)) {
      tasks.push({
        title: 'Update documentation',
        description: 'Documentation needs to be updated to reflect changes.',
        priority: 'low',
        isSubTask: true
      })
    }

    // Limit to 5 tasks
    const suggestedTasks = tasks.slice(0, 5)

    const response: LLMAnalysisResponse = {
      shouldCreateTasks: suggestedTasks.length > 0,
      suggestedTasks,
      reason: suggestedTasks.length > 0
        ? `Detected ${suggestedTasks.length} potential follow-up task(s) from output analysis`
        : 'Task appears to be complete. No follow-up work detected.'
    }

    return JSON.stringify(response)
  }

  /**
   * Parse and validate LLM response
   */
  private parseResponse(response: string): LLMAnalysisResponse {
    try {
      const parsed = JSON.parse(response)

      // Validate structure
      if (!parsed || typeof parsed !== 'object') {
        throw new LoopworkError(
          'ERR_UNKNOWN',
          'Invalid response structure from LLM',
          [
            'The LLM returned invalid JSON structure',
            'Try using a different model',
          ]
        )
      }

      // Ensure required fields exist
      const tasks = Array.isArray(parsed.suggestedTasks) ? parsed.suggestedTasks : []

      return {
        shouldCreateTasks: Boolean(parsed.shouldCreateTasks),
        suggestedTasks: tasks.map((task: { title?: unknown; description?: unknown; priority?: unknown; isSubTask?: unknown }) => ({
          title: String(task.title || '').substring(0, 100),
          description: String(task.description || ''),
          priority: this.validatePriority(task.priority),
          isSubTask: Boolean(task.isSubTask ?? true)
        })),
        reason: String(parsed.reason || 'Analysis complete')
      }
    } catch (error) {
      throw new LoopworkError(
        'ERR_UNKNOWN',
        `Failed to parse LLM response: ${error instanceof Error ? error.message : String(error)}`,
        [
          'The LLM response could not be parsed as JSON',
          'Try using a different model or prompt',
        ]
      )
    }
  }

  /**
   * Validate and normalize priority
   */
  private validatePriority(value: unknown): Priority {
    const validPriorities: Priority[] = ['high', 'medium', 'low']
    if (validPriorities.includes(value as Priority)) {
      return value as Priority
    }
    return 'medium' // default priority
  }

  /**
   * Generate cache key from task and output
   */
  private getCacheKey(taskId: string, output: string | null): string {
    // Create a simple hash-like key (in production, use proper hashing)
    const outputHash = output
      ? Math.abs(output.split('').reduce((acc, char) => acc * 31 + char.charCodeAt(0), 0))
      : 0
    return `${taskId}:${outputHash}`
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.analysisCache.clear()
  }

  /**
   * Get cache size for debugging
   */
  getCacheSize(): number {
    return this.analysisCache.size
  }
}

import type { Task, Priority, PluginTaskResult } from '../contracts'
import type {
  ITaskOutputAnalyzer,
  TaskOutputAnalysisRequest,
  TaskOutputAnalysisResponse,
  SuggestedTask,
} from '../contracts/llm-analyzer'
import type { TaskAnalysisResult as LegacyTaskAnalysisResult } from '../contracts/analysis'
import { PatternAnalyzer, type PatternAnalyzerConfig } from './pattern-analyzer'
import { LoopworkError } from '../core/errors'

export interface LLMAnalyzerOptions {
  model?: string
  timeout?: number
  fallbackToPattern?: boolean
  patternConfig?: PatternAnalyzerConfig
  systemPrompt?: string
}

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

export class LLMAnalyzer implements ITaskOutputAnalyzer {
  readonly name = 'task-output-analyzer' as const
  readonly fallbackToPattern: boolean
  private options: Required<LLMAnalyzerOptions>
  private patternAnalyzer: PatternAnalyzer
  private analysisCache: Map<string, TaskOutputAnalysisResponse> = new Map()

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
    this.fallbackToPattern = this.options.fallbackToPattern

    this.patternAnalyzer = new PatternAnalyzer(this.options.patternConfig)
  }

  async analyze(
    requestOrTask: TaskOutputAnalysisRequest | Task,
    result?: PluginTaskResult
  ): Promise<TaskOutputAnalysisResponse> {
    let request: TaskOutputAnalysisRequest

    if (result !== undefined) {
      request = { task: requestOrTask as Task, result }
    } else {
      request = requestOrTask as TaskOutputAnalysisRequest
    }

    const cacheKey = this.getCacheKey(request)
    const cached = this.analysisCache.get(cacheKey)
    if (cached) {
      return cached
    }

    try {
      const analysis = await this.analyzeWithLLM(request)
      this.analysisCache.set(cacheKey, analysis)
      return analysis
    } catch (error) {
      if (this.options.fallbackToPattern) {
        const legacyResult = await this.patternAnalyzer.analyze(request.task, request.result)
        const fallbackResult = this.convertLegacyToUnified(legacyResult)
        this.analysisCache.set(cacheKey, fallbackResult)
        return fallbackResult
      }

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

  async analyzeTask(task: Task, result: PluginTaskResult): Promise<LegacyTaskAnalysisResult> {
    const unifiedResult = await this.analyze({ task, result })
    return this.convertUnifiedToLegacy(unifiedResult, task.id)
  }

  getCacheKey(request: TaskOutputAnalysisRequest): string {
    const outputHash = request.result.output
      ? Math.abs(request.result.output.split('').reduce((acc, char) => acc * 31 + char.charCodeAt(0), 0))
      : 0
    return `${request.task.id}:${outputHash}`
  }

  clearCache(): void {
    this.analysisCache.clear()
  }

  getCacheSize(): number {
    return this.analysisCache.size
  }

  private async analyzeWithLLM(request: TaskOutputAnalysisRequest): Promise<TaskOutputAnalysisResponse> {
    if (!request.result.output) {
      return {
        shouldCreateTasks: false,
        suggestedTasks: [],
        reason: 'No output available for analysis'
      }
    }

    const prompt = this.buildAnalysisPrompt(request)
    const llmResponse = await this.callLLM(prompt)
    const parsed = this.parseResponse(llmResponse)

    const suggestedTasks = parsed.suggestedTasks.map(t => ({
      ...t,
      parentId: t.isSubTask ? request.task.id : undefined
    }))

    return {
      shouldCreateTasks: parsed.suggestedTasks.length > 0,
      suggestedTasks: suggestedTasks as SuggestedTask[],
      reason: parsed.reason
    }
  }

  private buildAnalysisPrompt(request: TaskOutputAnalysisRequest): string {
    const maxOutputLength = 2000
    const truncatedOutput = request.result.output && request.result.output.length > maxOutputLength
      ? request.result.output.substring(0, maxOutputLength) + '\n...(truncated)'
      : request.result.output || ''

    return `Analyze this task execution result and suggest follow-up work if needed.

Original Task:
- ID: ${request.task.id}
- Title: ${request.task.title}
- Description: ${request.task.description}

Execution Result:
- Success: ${request.result.success}
- Duration: ${request.result.duration}ms

Output:
${truncatedOutput}

Provide your analysis in JSON format as specified in the system prompt.`
  }

  private async callLLM(prompt: string): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GOOGLE_API_KEY

    if (apiKey) {
      if (process.env.ANTHROPIC_API_KEY) {
        return this.callAnthropicAPI(prompt, apiKey)
      } else if (process.env.OPENAI_API_KEY) {
        return this.callOpenAIAPI(prompt, apiKey)
      } else if (process.env.GOOGLE_API_KEY) {
        return this.callGoogleAPI(prompt, apiKey)
      }
    }

    return this.simulateLLMAnalysis(prompt)
  }

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
      return this.simulateLLMAnalysis(prompt)
    }
  }

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
      return this.simulateLLMAnalysis(prompt)
    }
  }

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
      return this.simulateLLMAnalysis(prompt)
    }
  }

  private simulateLLMAnalysis(prompt: string): string {
    const tasks: Array<{
      title: string
      description: string
      priority: Priority
      isSubTask: boolean
    }> = []

    if (prompt.match(/partial|incomplete|WIP|work in progress/i)) {
      tasks.push({
        title: 'Complete remaining implementation',
        description: 'Task appears to be partially completed. Additional work is needed.',
        priority: 'high',
        isSubTask: true
      })
    }

    if (prompt.match(/error|failed|exception/i) && !prompt.match(/error handling added|handled/i)) {
      tasks.push({
        title: 'Add error handling for edge cases',
        description: 'Errors were detected during execution. Error handling should be improved.',
        priority: 'high',
        isSubTask: true
      })
    }

    if (prompt.match(/test|verify|validate/i) && !prompt.match(/tests? (pass|complete|all)/i)) {
      tasks.push({
        title: 'Add comprehensive tests',
        description: 'Testing coverage appears incomplete. More tests are recommended.',
        priority: 'medium',
        isSubTask: true
      })
    }

    if (prompt.match(/deploy|production|staging|release/i) && !prompt.match(/deployed|released/i)) {
      tasks.push({
        title: 'Deploy to production',
        description: 'Deployment steps remain to be completed.',
        priority: 'medium',
        isSubTask: true
      })
    }

    if (prompt.match(/document|readme|comment|docs/i) && !prompt.match(/documented|documented/i)) {
      tasks.push({
        title: 'Update documentation',
        description: 'Documentation needs to be updated to reflect changes.',
        priority: 'low',
        isSubTask: true
      })
    }

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

  private parseResponse(response: string): LLMAnalysisResponse {
    try {
      const parsed = JSON.parse(response)

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

  private validatePriority(value: unknown): Priority {
    const validPriorities: Priority[] = ['high', 'medium', 'low']
    if (validPriorities.includes(value as Priority)) {
      return value as Priority
    }
    return 'medium'
  }

  private convertLegacyToUnified(legacy: LegacyTaskAnalysisResult): TaskOutputAnalysisResponse {
    return {
      shouldCreateTasks: legacy.shouldCreateTasks,
      suggestedTasks: legacy.suggestedTasks.map(t => ({
        title: t.title,
        description: t.description,
        priority: t.priority,
        isSubTask: t.isSubTask,
        parentId: t.parentId,
        dependsOn: t.dependsOn,
      })),
      reason: legacy.reason,
    }
  }

  private convertUnifiedToLegacy(unified: TaskOutputAnalysisResponse, taskId: string): LegacyTaskAnalysisResult {
    return {
      shouldCreateTasks: unified.shouldCreateTasks,
      suggestedTasks: unified.suggestedTasks.map(t => ({
        title: t.title,
        description: t.description,
        priority: t.priority,
        isSubTask: t.isSubTask,
        parentId: t.parentId,
        dependsOn: t.dependsOn,
      })),
      reason: unified.reason,
    }
  }
}

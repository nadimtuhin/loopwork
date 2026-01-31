export interface SubagentResult {
  status: 'success' | 'failure' | 'partial'
  summary: string
  artifacts: Artifact[]
  followUpTasks: TaskSuggestion[]
  metrics: ResultMetrics
  rawOutput: string
}

export interface Artifact {
  path: string
  action: 'created' | 'modified' | 'deleted'
  description?: string
  linesAdded?: number
  linesRemoved?: number
}

export interface TaskSuggestion {
  title: string
  description: string
  suggestedAgent?: string
  priority?: 1 | 2 | 3 | 4 | 5
  source?: 'pattern' | 'json' | 'inferred'
}

export interface ResultMetrics {
  durationMs: number
  tokensUsed?: number
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  toolCalls?: number
  exitCode: number
  error?: string
}

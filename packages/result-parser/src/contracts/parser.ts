import type { SubagentResult, Artifact, TaskSuggestion, ResultMetrics } from './result'

export interface ParseContext {
  workDir: string
  exitCode: number
  durationMs: number
  gitRunner?: IGitRunner
  taskId?: string
}

export interface IGitRunner {
  diff(args: string[]): Promise<string>
  status(): Promise<string>
}

export interface ISubParser<T> {
  parse(output: string, context: ParseContext): T | Promise<T>
}

export type IStatusParser = ISubParser<SubagentResult['status']>
export type IArtifactDetector = ISubParser<Artifact[]>
export type ITaskSuggestionParser = ISubParser<TaskSuggestion[]>
export type IMetricsExtractor = ISubParser<ResultMetrics>

export interface IResultParser {
  parse(output: string, context: ParseContext): Promise<SubagentResult>
}

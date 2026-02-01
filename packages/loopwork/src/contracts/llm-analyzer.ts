/**
 * Unified LLM Analyzer Contracts
 *
 * Provides a common interface for all LLM-based analyzers, enabling
 * runtime swapping and polymorphic usage.
 */

import type { Task, Priority, PluginTaskResult } from './types'

/**
 * Base interface for all LLM analyzers
 * Enables polymorphic usage and runtime swapping
 */
export interface ILLMAnalyzer<TRequest, TResponse> {
  /** Unique identifier for this analyzer type */
  readonly name: string

  /** Analyze the given request and return a response */
  analyze(request: TRequest): Promise<TResponse>

  /** Check if this analyzer can handle the request without calling LLM (e.g., pattern match) */
  canAnalyze?(request: TRequest): boolean

  /** Get cache key for the request (for deduplication) */
  getCacheKey(request: TRequest): string

  /** Clear any internal caches */
  clearCache(): void

  /** Get current cache size for debugging */
  getCacheSize?(): number
}

/**
 * Base configuration for all LLM analyzers
 */
export interface LLMAnalyzerConfig {
  /** Model to use for analysis */
  model?: string

  /** Timeout in milliseconds for LLM calls */
  timeout?: number

  /** Maximum calls per session */
  maxCallsPerSession?: number

  /** Cooldown period between calls in milliseconds */
  cooldownMs?: number

  /** Whether caching is enabled */
  cacheEnabled?: boolean

  /** Cache TTL in milliseconds */
  cacheTTL?: number
}

// ============================================================================
// Error Analysis Types
// ============================================================================

/**
 * Request for error analysis
 */
export interface ErrorAnalysisRequest {
  /** The error message to analyze */
  errorMessage: string

  /** Optional stack trace */
  stackTrace?: string

  /** Additional context */
  context?: Record<string, unknown>
}

/**
 * Response from error analysis
 */
export interface ErrorAnalysisResponse {
  /** Root cause of the error */
  rootCause: string

  /** Suggested fixes for the error */
  suggestedFixes: string[]

  /** Confidence level (0-1) */
  confidence: number
}

/**
 * Error analyzer interface
 * Analyzes error messages to determine root cause and suggest fixes
 */
export interface IErrorAnalyzer
  extends ILLMAnalyzer<ErrorAnalysisRequest, ErrorAnalysisResponse | null> {
  readonly name: 'error-analyzer'

  /** Check if rate limiting allows another call */
  canMakeCall(): boolean

  /** Get time until next allowed call in milliseconds */
  getTimeUntilNextCall(): number

  /** Get current call count for this session */
  getCallCount(): number

  /** Reset call count (for testing) */
  resetCallCount(): void
}

// ============================================================================
// Task Output Analysis Types
// ============================================================================

/**
 * Suggested task to be created based on task analysis
 */
export interface SuggestedTask {
  /** Title of the suggested task */
  title: string

  /** Detailed description */
  description: string

  /** Priority level */
  priority: Priority

  /** Whether this should be a sub-task */
  isSubTask: boolean

  /** Parent task ID if sub-task */
  parentId?: string

  /** Dependencies */
  dependsOn?: string[]
}

/**
 * Request for task output analysis
 */
export interface TaskOutputAnalysisRequest {
  /** The task that was executed */
  task: Task

  /** The execution result */
  result: PluginTaskResult
}

/**
 * Response from task output analysis
 */
export interface TaskOutputAnalysisResponse {
  /** Whether new tasks should be created */
  shouldCreateTasks: boolean

  /** List of suggested tasks */
  suggestedTasks: SuggestedTask[]

  /** Reasoning for the analysis */
  reason: string
}

/**
 * Task output analyzer interface
 * Analyzes task execution output to suggest follow-up tasks
 */
export interface ITaskOutputAnalyzer
  extends ILLMAnalyzer<TaskOutputAnalysisRequest, TaskOutputAnalysisResponse> {
  readonly name: 'task-output-analyzer'

  /** Fallback to pattern-based analysis if LLM fails */
  fallbackToPattern?: boolean
}

// ============================================================================
// Union Types for Runtime Swapping
// ============================================================================

/** All analyzer types */
export type AnyLLMAnalyzer = IErrorAnalyzer | ITaskOutputAnalyzer

/** All analyzer request types */
export type AnyAnalyzerRequest = ErrorAnalysisRequest | TaskOutputAnalysisRequest

/** All analyzer response types */
export type AnyAnalyzerResponse =
  | ErrorAnalysisResponse
  | null
  | TaskOutputAnalysisResponse

// ============================================================================
// Analyzer Registry
// ============================================================================

/**
 * Analyzer registry for managing and swapping analyzers at runtime
 */
export interface IAnalyzerRegistry {
  /** Register an analyzer */
  register<TRequest, TResponse>(
    name: string,
    analyzer: ILLMAnalyzer<TRequest, TResponse>
  ): void

  /** Get an analyzer by name */
  get<TRequest, TResponse>(name: string): ILLMAnalyzer<TRequest, TResponse> | undefined

  /** Get error analyzer */
  getErrorAnalyzer(): IErrorAnalyzer | undefined

  /** Get task output analyzer */
  getTaskOutputAnalyzer(): ITaskOutputAnalyzer | undefined

  /** Set the active error analyzer */
  setErrorAnalyzer(analyzer: IErrorAnalyzer): void

  /** Set the active task output analyzer */
  setTaskOutputAnalyzer(analyzer: ITaskOutputAnalyzer): void

  /** List all registered analyzers */
  list(): string[]

  /** Unregister an analyzer */
  unregister(name: string): boolean

  /** Clear all analyzers */
  clear(): void
}

// ============================================================================
// Factory Types
// ============================================================================

/** Factory function type for creating analyzers */
export type AnalyzerFactory<TConfig, TAnalyzer extends ILLMAnalyzer<unknown, unknown>> = (
  config?: TConfig
) => TAnalyzer

/** Configuration for error analyzer factory */
export interface ErrorAnalyzerFactoryConfig extends LLMAnalyzerConfig {
  /** Project root for cache directory */
  projectRoot?: string

  /** Cache directory path */
  cacheDir?: string
}

/** Configuration for task output analyzer factory */
export interface TaskOutputAnalyzerFactoryConfig extends LLMAnalyzerConfig {
  /** Pattern analyzer config for fallback */
  patternConfig?: Record<string, unknown>

  /** Custom system prompt */
  systemPrompt?: string
}

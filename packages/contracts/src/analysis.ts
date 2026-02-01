/**
 * Analysis Engine Contracts
 *
 * Contracts for analysis and pattern matching capabilities.
 * Used by AI monitors, failure analyzers, and pattern detection systems.
 */

/**
 * Severity level for detected patterns or issues
 */
export type PatternSeverity = 'INFO' | 'WARN' | 'ERROR' | 'HIGH' | 'CRITICAL' | 'MEDIUM'

/**
 * Result of a pattern match operation
 */
export interface PatternMatch {
  /** Name or identifier of the matched pattern */
  pattern: string

  /** Severity level of the match */
  severity: PatternSeverity

  /** Contextual data extracted from the match */
  context: Record<string, string>

  /** Original line or text that matched */
  rawLine: string

  /** Optional timestamp when match occurred */
  timestamp?: Date
}

/**
 * Result of an analysis operation
 */
export interface AnalysisResult {
  /** Whether the analysis completed successfully */
  success: boolean

  /** Confidence score (0.0 to 1.0) */
  confidence: number

  /** Findings from the analysis */
  findings: string[]

  /** Suggested actions or next steps */
  suggestions?: string[]

  /** Pattern matches detected during analysis */
  patterns?: PatternMatch[]

  /** Additional metadata about the analysis */
  metadata?: Record<string, unknown>

  /** Error message if analysis failed */
  error?: string
}

/**
 * Context provided to analysis engines for processing
 */
export interface AnalysisContext {
  /** Input text or data to analyze */
  input: string

  /** Type of analysis to perform */
  analysisType?: string

  /** Additional context metadata */
  metadata?: Record<string, unknown>

  /** Timestamp when analysis was requested */
  timestamp?: Date
}

/**
 * Core analysis engine interface.
 * Implementations can use pattern matching, AI models, or heuristics.
 */
export interface IAnalysisEngine {
  /**
   * Unique identifier for this analysis engine
   */
  readonly name: string

  /**
   * Analyze input and return results
   * @param context Analysis context containing input and metadata
   * @returns Analysis results with findings and suggestions
   */
  analyze(context: AnalysisContext): Promise<AnalysisResult>

  /**
   * Check if this engine supports the given analysis type
   * @param analysisType Type of analysis to check
   */
  supports?(analysisType: string): boolean

  /**
   * Initialize the analysis engine
   */
  initialize?(): Promise<void>

  /**
   * Cleanup resources before shutdown
   */
  dispose?(): Promise<void>
}

/**
 * Context for failure analysis
 */
export interface FailureContext {
  /** Task or operation that failed */
  taskId?: string

  /** Error message or description */
  error: string

  /** Stack trace if available */
  stackTrace?: string

  /** Logs leading up to the failure */
  logs?: string[]

  /** Iteration or attempt number */
  iteration?: number

  /** Additional context metadata */
  metadata?: Record<string, unknown>
}

/**
 * Result of failure analysis
 */
export interface FailureAnalysisResult extends AnalysisResult {
  /** Root cause identified */
  rootCause?: string

  /** Category of the failure */
  category?: 'configuration' | 'dependency' | 'code' | 'environment' | 'unknown'

  /** Recommended recovery strategy */
  recoveryStrategy?: string

  /** Whether the failure is recoverable */
  recoverable: boolean
}

/**
 * Failure analyzer interface.
 * Specialized analysis engine for diagnosing and suggesting fixes for failures.
 */
export interface IFailureAnalyzer {
  /**
   * Unique identifier for this failure analyzer
   */
  readonly name: string

  /**
   * Analyze a failure and provide diagnosis
   * @param context Failure context with error details
   * @returns Analysis results with root cause and recovery suggestions
   */
  analyzeFailure(context: FailureContext): Promise<FailureAnalysisResult>

  /**
   * Check if this analyzer can handle the given failure type
   * @param error Error message or type
   */
  canAnalyze?(error: string): boolean

  /**
   * Initialize the failure analyzer
   */
  initialize?(): Promise<void>

  /**
   * Cleanup resources before shutdown
   */
  dispose?(): Promise<void>
}

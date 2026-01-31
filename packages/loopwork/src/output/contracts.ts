/**
 * Output System Contracts
 *
 * Event interfaces for the Ink-based output system
 * Covers all logger methods: info, warn, error, success, debug, trace, raw
 * Includes streaming events for CLI subprocess output
 */

/**
 * Output mode type - determines how output is rendered
 */
export type OutputMode = 'ink' | 'json' | 'silent' | 'human'

/**
 * Base output event - all events extend this
 */
export interface BaseOutputEvent {
  timestamp: number
  type: string
}

/**
 * Log level types matching logger methods
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'success' | 'silent'

/**
 * Log event - emitted for all logger.* calls
 */
export interface LogEvent extends BaseOutputEvent {
  type: 'log'
  level: LogLevel
  message: string
  metadata?: Record<string, unknown>
}

/**
 * Task lifecycle events
 */
export interface TaskStartEvent extends BaseOutputEvent {
  type: 'task:start'
  taskId: string
  title: string
  iteration: number
  namespace: string
  priority?: string
  feature?: string
}

export interface TaskCompleteEvent extends BaseOutputEvent {
  type: 'task:complete'
  taskId: string
  title: string
  duration: number
  success: boolean
  output?: string
}

export interface TaskFailedEvent extends BaseOutputEvent {
  type: 'task:failed'
  taskId: string
  title: string
  error: string
  duration: number
  retryCount?: number
  maxRetries?: number
}

/**
 * Loop lifecycle events
 */
export interface LoopStartEvent extends BaseOutputEvent {
  type: 'loop:start'
  namespace: string
  maxIterations: number
  taskCount: number
}

export interface LoopEndEvent extends BaseOutputEvent {
  type: 'loop:end'
  namespace: string
  completed: number
  failed: number
  duration: number
}

export interface LoopIterationEvent extends BaseOutputEvent {
  type: 'loop:iteration'
  iteration: number
  maxIterations: number
  remainingTasks: number
}

/**
 * CLI/streaming events
 */
export interface CliStartEvent extends BaseOutputEvent {
  type: 'cli:start'
  taskId: string
  command: string
  model: string
  timeout: number
}

export interface CliOutputEvent extends BaseOutputEvent {
  type: 'cli:output'
  taskId: string
  chunk: string
  isStderr?: boolean
}

export interface CliCompleteEvent extends BaseOutputEvent {
  type: 'cli:complete'
  taskId: string
  exitCode: number
  duration: number
}

export interface CliErrorEvent extends BaseOutputEvent {
  type: 'cli:error'
  taskId: string
  error: string
  isRetryable?: boolean
}

/**
 * Progress/spinner events
 */
export interface ProgressStartEvent extends BaseOutputEvent {
  type: 'progress:start'
  message: string
  id?: string
}

export interface ProgressUpdateEvent extends BaseOutputEvent {
  type: 'progress:update'
  message: string
  id?: string
  percent?: number
}

export interface ProgressStopEvent extends BaseOutputEvent {
  type: 'progress:stop'
  id?: string
  message?: string
  success?: boolean
}

/**
 * Raw output event - for pre-formatted content
 */
export interface RawOutputEvent extends BaseOutputEvent {
  type: 'raw'
  content: string
  noNewline?: boolean
}

/**
 * JSON event for structured output (backward compatibility)
 */
export interface JsonOutputEvent extends BaseOutputEvent {
  type: 'json'
  eventType: string
  data: Record<string, unknown>
}

/**
 * Union type of all output events
 */
export type OutputEvent =
  | LogEvent
  | TaskStartEvent
  | TaskCompleteEvent
  | TaskFailedEvent
  | LoopStartEvent
  | LoopEndEvent
  | LoopIterationEvent
  | CliStartEvent
  | CliOutputEvent
  | CliCompleteEvent
  | CliErrorEvent
  | ProgressStartEvent
  | ProgressUpdateEvent
  | ProgressStopEvent
  | RawOutputEvent
  | JsonOutputEvent

/**
 * Event subscriber callback type
 */
export type OutputEventSubscriber = (event: OutputEvent) => void

/**
 * Output configuration options
 */
export interface OutputConfig {
  mode: OutputMode
  logLevel: LogLevel
  useColor?: boolean
  useTty?: boolean
  jsonPretty?: boolean
}

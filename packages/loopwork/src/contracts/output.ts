/**
 * JSON Output Contracts
 *
 * Standardized JSON output schemas for CLI commands
 */

/**
 * Output format type
 * @deprecated Use OutputMode from './config' instead
 */
export type OutputFormat = 'human' | 'json' | 'ink' | 'silent'

/**
 * Base JSON event structure
 */
export interface JsonEvent {
  timestamp: string
  type: 'info' | 'success' | 'error' | 'warn' | 'progress' | 'result'
  command: string
  data: Record<string, unknown>
}

/**
 * JSON output for 'run' command
 */
export interface RunJsonOutput {
  command: 'run'
  namespace: string
  startTime: string
  endTime?: string
  events: JsonEvent[]
  summary?: {
    totalIterations: number
    tasksCompleted: number
    tasksFailed: number
    tasksSkipped: number
    duration: number
  }
}

/**
 * JSON output for 'status' command
 */
export interface StatusJsonOutput {
  command: 'status'
  timestamp: string
  processes: Array<{
    namespace: string
    pid: number
    status: string
    taskId?: string
    startTime: string
    runtime: number
  }>
  summary: {
    total: number
    active: number
  }
}

/**
 * JSON output for 'logs' command
 */
export interface LogsJsonOutput {
  command: 'logs'
  namespace?: string
  timestamp: string
  entries: Array<{
    timestamp: string
    level: string
    message: string
    raw: string
  }>
  metadata?: {
    sessionPath: string
    totalLines: number
    following: boolean
  }
}

/**
 * JSON output for 'kill' command (already exists in kill.ts)
 * Documented here for completeness
 */
export interface KillJsonOutput {
  command: 'kill'
  timestamp: string
  orphans: Array<{
    pid: number
    namespace: string
    command: string
    age: number
    startTime: string
  }>
  summary: {
    killed: number
    skipped: number
    failed: number
  }
  failures?: Array<{
    pid: number
    error: string
  }>
}

/**
 * JSON output for 'decompose' command
 */
export interface DecomposeJsonOutput {
  command: 'decompose'
  timestamp: string
  input: {
    description: string
    taskId?: string
    namespace: string
  }
  tasks: Array<{
    id: string
    title: string
    status: string
    priority: string
    dependencies?: string[]
    files?: string[]
    timeEstimate?: string
    complexity?: number
    testStrategy?: string
    edgeCases?: string[]
    prdPath?: string
  }>
  summary: {
    totalTasks: number
    topLevel: number
    subtasks: number
    totalTimeEstimate?: string
  }
  dryRun?: boolean
}

/**
 * Ink Renderer Implementation
 *
 * React-based TUI output renderer using Ink.
 * Supports both TTY and non-TTY environments with automatic fallback.
 *
 * Architecture:
 * - Global state singleton shared across all Ink components
 * - Subscriber pattern for event broadcasting
 * - Event handlers map to specific output actions
 * - Automatic TTY detection for renderer selection
 *
 * Performance Notes:
 * - Keeps last 100 log entries (prevents memory bloat)
 * - Event subscribers are called synchronously
 * - Log filtering happens before state updates
 */

import React from 'react'
import { render } from 'ink'
import type {
  OutputEvent,
  OutputConfig,
  LogEvent,
  TaskStartEvent,
  TaskCompleteEvent,
  TaskFailedEvent,
  LoopStartEvent,
  LoopEndEvent,
  LoopIterationEvent,
  CliStartEvent,
  CliOutputEvent,
  CliCompleteEvent,
  CliErrorEvent,
  ProgressStartEvent,
  ProgressUpdateEvent,
  ProgressStopEvent,
  RawOutputEvent,
  JsonOutputEvent,
  WorkerStatusEvent,
} from './contracts'
import { BaseRenderer } from './renderer'
import { InkApp, type InkAppState, type LogLine, type TaskInfo } from './InkApp'

let globalState: InkAppState = {
  logs: [],
  currentTask: null,
  tasks: [],
  stats: { completed: 0, failed: 0, total: 0 },
  loopStartTime: null,
  progressMessage: null,
  progressPercent: null,
  namespace: 'default',
  iteration: 0,
  maxIterations: 0,
  layout: 'inline',
  workerStatus: {
    totalWorkers: 0,
    activeWorkers: 0,
    pendingTasks: 0,
    runningTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
  },
}

let logIdCounter = 0
let stateListeners: Array<(state: InkAppState) => void> = []

/**
 * Update global state and notify all subscribers
 * Uses immutable update pattern for React compatibility
 */
function updateState(updates: Partial<InkAppState>) {
  globalState = { ...globalState, ...updates }
  stateListeners.forEach((fn) => fn(globalState))
}

/**
 * Subscribe to state changes
 * Returns unsubscribe function for cleanup
 */
function subscribe(fn: (state: InkAppState) => void) {
  stateListeners.push(fn)
  return () => {
    stateListeners = stateListeners.filter((f) => f !== fn)
  }
}

function _formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function getTimestamp(): string {
  // Use 24-hour format for consistent width (always 8 chars: HH:MM:SS)
  return new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function getLevelColor(level: string): string {
  switch (level) {
    case 'error':
      return 'red'
    case 'warn':
      return 'yellow'
    case 'success':
      return 'green'
    case 'debug':
      return 'cyan'
    case 'trace':
      return 'gray'
    default:
      return 'white'
  }
}

export class InkRenderer extends BaseRenderer {
  readonly name = 'ink'
  readonly isSupported: boolean
  private inkInstance: ReturnType<typeof render> | null = null
  private isRunning = false

  constructor(config: OutputConfig) {
    super(config)
    this.isSupported = process.stdout.isTTY || false
  }

  /**
   * Main entry point for events into the Ink renderer.
   * This method coordinates filtering, concrete rendering, and subscriber notification.
   */
  render(event: OutputEvent): void {
    if (this.disposed) return

    switch (event.type) {
      case 'log':
        this.handleLogEvent(event as LogEvent)
        break
      case 'task:start':
        this.handleTaskStart(event as TaskStartEvent)
        break
      case 'task:complete':
        this.handleTaskComplete(event as TaskCompleteEvent)
        break
      case 'task:failed':
        this.handleTaskFailed(event as TaskFailedEvent)
        break
      case 'loop:start':
        this.handleLoopStart(event as LoopStartEvent)
        break
      case 'loop:end':
        this.handleLoopEnd(event as LoopEndEvent)
        break
      case 'loop:iteration':
        this.handleLoopIteration(event as LoopIterationEvent)
        break
      case 'cli:start':
        this.handleCliStart(event as CliStartEvent)
        break
      case 'cli:output':
        this.handleCliOutput(event as CliOutputEvent)
        break
      case 'cli:complete':
        this.handleCliComplete(event as CliCompleteEvent)
        break
      case 'cli:error':
        this.handleCliError(event as CliErrorEvent)
        break
      case 'progress:start':
        this.handleProgressStart(event as ProgressStartEvent)
        break
      case 'progress:update':
        this.handleProgressUpdate(event as ProgressUpdateEvent)
        break
      case 'progress:stop':
        this.handleProgressStop(event as ProgressStopEvent)
        break
      case 'raw':
        this.handleRawOutput(event as RawOutputEvent)
        break
      case 'json':
        this.handleJsonOutput(event as JsonOutputEvent)
        break
      case 'worker:status':
        this.handleWorkerStatus(event as WorkerStatusEvent)
        break
    }
  }

  private handleLogEvent(event: LogEvent): void {
    if (!this.shouldLog(event.level)) return

    const logLine: LogLine = {
      id: ++logIdCounter,
      timestamp: getTimestamp(),
      level: event.level,
      message: event.message,
      color: getLevelColor(event.level),
    }

    updateState({
      logs: [...globalState.logs, logLine].slice(-100),
    })

    if (!this.isRunning && this.config.useTty !== false) {
      this.startInk()
    }
  }

  private handleTaskStart(event: TaskStartEvent): void {
    const taskInfo: TaskInfo = {
      id: event.taskId,
      title: event.title,
      status: 'running',
      startTime: event.timestamp,
    }

    updateState({
      currentTask: taskInfo,
      tasks: [...globalState.tasks, taskInfo],
    })
  }

  private handleTaskComplete(event: TaskCompleteEvent): void {
    const updatedTasks = globalState.tasks.map((t) =>
      t.id === event.taskId
        ? { ...t, status: 'completed' as const, duration: event.duration }
        : t
    )

    updateState({
      currentTask: null,
      tasks: updatedTasks,
      stats: {
        ...globalState.stats,
        completed: globalState.stats.completed + 1,
      },
    })
  }

  private handleTaskFailed(event: TaskFailedEvent): void {
    const updatedTasks = globalState.tasks.map((t) =>
      t.id === event.taskId
        ? { ...t, status: 'failed' as const, duration: event.duration, error: event.error }
        : t
    )

    updateState({
      currentTask: null,
      tasks: updatedTasks,
      stats: {
        ...globalState.stats,
        failed: globalState.stats.failed + 1,
      },
    })
  }

  private handleLoopStart(event: LoopStartEvent): void {
    updateState({
      namespace: event.namespace,
      loopStartTime: event.timestamp,
      stats: {
        completed: 0,
        failed: 0,
        total: event.taskCount,
      },
    })

    if (this.config.useTty !== false) {
      this.startInk()
    }
  }

  private handleLoopEnd(event: LoopEndEvent): void {
    updateState({
      currentTask: null,
    })

    const summaryLog: LogLine = {
      id: ++logIdCounter,
      timestamp: getTimestamp(),
      level: 'info',
      message: `Loop complete: ${event.completed} completed, ${event.failed} failed`,
      color: 'green',
    }

    updateState({
      logs: [...globalState.logs, summaryLog].slice(-100),
    })
  }

  private handleLoopIteration(event: LoopIterationEvent): void {
    updateState({
      iteration: event.iteration,
      maxIterations: event.maxIterations,
    })
  }

  private handleCliStart(event: CliStartEvent): void {
    const log: LogLine = {
      id: ++logIdCounter,
      timestamp: getTimestamp(),
      level: 'debug',
      message: `CLI start: ${event.model} (timeout: ${event.timeout}s)`,
      color: 'cyan',
    }

    updateState({
      logs: [...globalState.logs, log].slice(-100),
    })
  }

  private handleCliOutput(event: CliOutputEvent): void {
    if (this.config.logLevel !== 'trace') return

    const log: LogLine = {
      id: ++logIdCounter,
      timestamp: getTimestamp(),
      level: 'trace',
      message: event.chunk.slice(0, 100),
      color: 'gray',
    }

    updateState({
      logs: [...globalState.logs, log].slice(-100),
    })
  }

  private handleCliComplete(event: CliCompleteEvent): void {
    const log: LogLine = {
      id: ++logIdCounter,
      timestamp: getTimestamp(),
      level: event.exitCode === 0 ? 'success' : 'error',
      message: `CLI complete: exit code ${event.exitCode}`,
      color: event.exitCode === 0 ? 'green' : 'red',
    }

    updateState({
      logs: [...globalState.logs, log].slice(-100),
    })
  }

  private handleCliError(event: CliErrorEvent): void {
    const log: LogLine = {
      id: ++logIdCounter,
      timestamp: getTimestamp(),
      level: 'error',
      message: `CLI error: ${event.error}`,
      color: 'red',
    }

    updateState({
      logs: [...globalState.logs, log].slice(-100),
    })
  }

  private handleProgressStart(event: ProgressStartEvent): void {
    updateState({
      progressMessage: event.message,
      progressPercent: event.percent ?? null,
    })
  }

  private handleProgressUpdate(event: ProgressUpdateEvent): void {
    updateState({
      progressMessage: event.message,
      progressPercent: event.percent ?? null,
    })
  }

  private handleProgressStop(_event: ProgressStopEvent): void {
    updateState({
      progressMessage: null,
      progressPercent: null,
    })
  }

  private handleRawOutput(event: RawOutputEvent): void {
    const log: LogLine = {
      id: ++logIdCounter,
      timestamp: getTimestamp(),
      level: 'raw',
      message: event.content.slice(0, 200),
      color: 'white',
    }

    updateState({
      logs: [...globalState.logs, log].slice(-100),
    })
  }

  private handleJsonOutput(event: JsonOutputEvent): void {
    if (this.config.mode === 'json') {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({
        timestamp: new Date(event.timestamp).toISOString(),
        type: event.eventType,
        data: event.data,
      }))
    }
  }

  private handleWorkerStatus(event: WorkerStatusEvent): void {
    updateState({
      workerStatus: {
        totalWorkers: event.totalWorkers,
        activeWorkers: event.activeWorkers,
        pendingTasks: event.pendingTasks,
        runningTasks: event.runningTasks,
        completedTasks: event.completedTasks,
        failedTasks: event.failedTasks,
      },
    })
  }

  private startInk(): void {
    if (this.isRunning || !this.isSupported) return

    try {
      this.inkInstance = render(<InkApp initialState={globalState} subscribe={subscribe} />)
      this.isRunning = true
    } catch {
      // Fallback to non-TTY mode
    }
  }

  dispose(): void {
    if (this.inkInstance) {
      this.inkInstance.unmount()
      this.inkInstance = null
    }
    this.isRunning = false
    super.dispose()
  }
}

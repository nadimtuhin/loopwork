/**
 * Debugger Contract
 *
 * Types and interfaces for the Loopwork debugger system.
 * Enables breakpoints, inspection, and edit-and-continue functionality.
 */

import type { TaskContext } from './plugin'

/**
 * Debugger event types
 */
export type DebugEventType =
  | 'LOOP_START'
  | 'LOOP_END'
  | 'TASK_START'
  | 'PRE_TASK'
  | 'POST_TASK'
  | 'PRE_PROMPT'
  | 'TOOL_CALL'
  | 'AGENT_RESPONSE'
  | 'ERROR'

/**
 * Base debugger event
 */
export interface DebugEvent {
  type: DebugEventType
  timestamp: number
  taskId?: string
  iteration?: number
  data?: Record<string, unknown>
  error?: Error | string
}

/**
 * PRE_PROMPT event with prompt content for edit-and-continue
 */
export interface PrePromptEvent extends DebugEvent {
  type: 'PRE_PROMPT'
  prompt: string
}

/**
 * Breakpoint configuration
 */
export interface Breakpoint {
  /** Event type to break on */
  eventType: DebugEventType
  /** Optional task ID filter */
  taskId?: string
  /** Optional condition function */
  condition?: (event: DebugEvent) => boolean
  /** Whether breakpoint is enabled */
  enabled: boolean
}

/**
 * Debugger state
 */
export type DebuggerState = 'running' | 'paused' | 'stepping'

/**
 * Listener for debugger state changes
 */
export interface DebuggerListener {
  onPause?: () => void
  onResume?: () => void
  onStep?: (event: DebugEvent) => void
}

/**
 * TUI command types
 */
export type TUICommand =
  | 'continue'
  | 'step'
  | 'inspect'
  | 'breakpoint'
  | 'list'
  | 'quit'
  | 'help'
  | 'edit'

/**
 * TUI result from user interaction
 */
export interface TUIResult {
  command: TUICommand
  /** For breakpoint command: event type to toggle */
  eventType?: DebugEventType
  /** For edit command: modified prompt content */
  modifiedPrompt?: string
}

/**
 * Debugger interface
 */
export interface IDebugger {
  /** Current debugger state */
  readonly state: DebuggerState

  /** Handle debugger event (may pause if breakpoint hit) */
  onEvent(event: DebugEvent): Promise<void>

  /** Add state change listener */
  addListener(listener: DebuggerListener): void

  /** Remove state change listener */
  removeListener(listener: DebuggerListener): void

  /** Set current task context for inspection */
  setContext(context: TaskContext): void

  /** Clear current task context */
  clearContext(): void

  /** Get current task context */
  getContext(): TaskContext | undefined

  /** Add a breakpoint */
  addBreakpoint(breakpoint: Breakpoint): void

  /** Remove a breakpoint */
  removeBreakpoint(eventType: DebugEventType, taskId?: string): void

  /** List all breakpoints */
  listBreakpoints(): Breakpoint[]

  /** Continue execution */
  continue(): void

  /** Step to next event */
  step(): void

  /** Check if debugger is enabled */
  isEnabled(): boolean

  /** Enable/disable debugger */
  setEnabled(enabled: boolean): void

  /** Get and clear modified prompt from edit-and-continue */
  getAndClearModifiedPrompt?(): string | undefined
}

/**
 * TUI interface for interactive debugging
 */
export interface IDebuggerTUI {
  /** Show TUI and wait for user command */
  prompt(event: DebugEvent, context?: TaskContext): Promise<TUIResult>

  /** Display current state */
  displayState(event: DebugEvent, context?: TaskContext): void

  /** Display help information */
  displayHelp(): void

  /** Open prompt in editor for editing */
  editPrompt(prompt: string): Promise<string | null>
}

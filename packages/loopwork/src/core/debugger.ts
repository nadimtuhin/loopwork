/**
 * Debugger Core Implementation
 *
 * Provides breakpoint-based debugging for the Loopwork task loop.
 * Supports pausing at events, inspection, and edit-and-continue.
 */

/* eslint-disable no-console */
import * as fs from 'fs'
import * as path from 'path'
import type {
  IDebugger,
  DebugEvent,
  DebugEventType,
  Breakpoint,
  DebuggerState,
  DebuggerListener,
  PrePromptEvent,
} from '../contracts/debugger'
import type { TaskContext } from '../contracts/plugin'
import { DebuggerTUI } from './debugger-tui'
import { logger } from './utils'

/**
 * Main Debugger class
 *
 * Handles event-based debugging with breakpoints, pause/resume,
 * and TUI-based interaction.
 */
export class Debugger implements IDebugger {
  private _state: DebuggerState = 'running'
  private _enabled: boolean = false
  private _context?: TaskContext
  private _breakpoints: Breakpoint[] = []
  private _listeners: Set<DebuggerListener> = new Set()
  private _tui: DebuggerTUI
  private _stepMode: boolean = false
  private _pendingContinue: (() => void) | null = null
  private _modifiedPrompt?: string

  constructor() {
    this._tui = new DebuggerTUI()

    // Default breakpoints (all disabled by default)
    this._breakpoints = [
      { eventType: 'LOOP_START', enabled: false },
      { eventType: 'LOOP_END', enabled: false },
      { eventType: 'TASK_START', enabled: false },
      { eventType: 'PRE_TASK', enabled: false },
      { eventType: 'POST_TASK', enabled: false },
      { eventType: 'PRE_PROMPT', enabled: false },
      { eventType: 'TOOL_CALL', enabled: false },
      { eventType: 'ERROR', enabled: false },
    ]
  }

  get state(): DebuggerState {
    return this._state
  }

  isEnabled(): boolean {
    return this._enabled
  }

  setEnabled(enabled: boolean): void {
    this._enabled = enabled
    if (enabled) {
      logger.info('Debugger enabled - use breakpoints to pause execution')
    }
  }

  /**
   * Handle a debugger event
   * May pause execution if a breakpoint is hit
   */
  async onEvent(event: DebugEvent): Promise<void> {
    // If debugger is disabled, just log and continue
    if (!this._enabled) {
      return
    }

    // Check if we should break
    const shouldBreak = this._stepMode || this.checkBreakpoints(event)

    if (!shouldBreak) {
      return
    }

    // Pause execution
    this._state = 'paused'
    this._stepMode = false

    // Notify listeners
    this._listeners.forEach(l => l.onPause?.())

    // Show TUI and wait for user command
    await this.handlePausedState(event)
  }

  /**
   * Handle the paused state with TUI interaction
   */
  private async handlePausedState(event: DebugEvent): Promise<void> {
    while (this._state === 'paused') {
      const result = await this._tui.prompt(event, this._context)

      switch (result.command) {
        case 'continue':
          this.continue()
          break

        case 'step':
          this.step()
          break

        case 'inspect':
          this._tui.displayState(event, this._context)
          break

        case 'breakpoint':
          if (result.eventType) {
            this.toggleBreakpoint(result.eventType)
          }
          break

        case 'list':
          this.listBreakpointsToConsole()
          break

        case 'help':
          this._tui.displayHelp()
          break

        case 'edit':
          if (event.type === 'PRE_PROMPT') {
            const prePromptEvent = event as PrePromptEvent
            const modified = await this._tui.editPrompt(prePromptEvent.prompt)
            if (modified !== null) {
              this._modifiedPrompt = modified
              logger.info('Prompt modified - will use edited version')

              if (this._context) {
                this.logPromptChange(this._context.task.id, prePromptEvent.prompt, modified)
              }
            }
            this.continue()
          } else {
            logger.warn('Edit command only available at PRE_PROMPT breakpoints')
          }
          break

        case 'quit':
          logger.info('Debugger quit - exiting')
          process.exit(0)
      }
    }
  }

  /**
   * Get the modified prompt if any, and clear it
   */
  getAndClearModifiedPrompt(): string | undefined {
    const prompt = this._modifiedPrompt
    this._modifiedPrompt = undefined
    return prompt
  }

  private logPromptChange(taskId: string, original: string, modified: string): void {
    const config = this._context?.config as { outputDir?: string } | undefined
    if (!config?.outputDir) return

    const logDir = path.join(config.outputDir, 'logs')
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true })
    }

    const logFile = path.join(logDir, 'prompt-changes.log')
    const timestamp = new Date().toISOString()
    const entry = `[${timestamp}] Task: ${taskId}\n--- ORIGINAL ---\n${original}\n--- MODIFIED ---\n${modified}\n${'='.repeat(40)}\n\n`

    fs.appendFileSync(logFile, entry)
  }

  /**
   * Check if any breakpoint matches the event
   */
  private checkBreakpoints(event: DebugEvent): boolean {
    for (const bp of this._breakpoints) {
      if (!bp.enabled) continue
      if (bp.eventType !== event.type) continue
      if (bp.taskId && bp.taskId !== event.taskId) continue
      if (bp.condition && !bp.condition(event)) continue
      return true
    }
    return false
  }

  /**
   * Toggle a breakpoint on/off
   */
  private toggleBreakpoint(eventType: DebugEventType): void {
    const bp = this._breakpoints.find(b => b.eventType === eventType)
    if (bp) {
      bp.enabled = !bp.enabled
      logger.info(`Breakpoint ${eventType}: ${bp.enabled ? 'enabled' : 'disabled'}`)
    }
  }

  /**
   * List breakpoints to console
   */
  private listBreakpointsToConsole(): void {
     
    console.log('\nBreakpoints:')
    for (const bp of this._breakpoints) {
      const status = bp.enabled ? '✓' : '○'
      const taskFilter = bp.taskId ? ` (task: ${bp.taskId})` : ''
       
      console.log(`  ${status} ${bp.eventType}${taskFilter}`)
    }
     
    console.log('')
  }

  addListener(listener: DebuggerListener): void {
    this._listeners.add(listener)
  }

  removeListener(listener: DebuggerListener): void {
    this._listeners.delete(listener)
  }

  setContext(context: TaskContext): void {
    this._context = context
  }

  clearContext(): void {
    this._context = undefined
  }

  getContext(): TaskContext | undefined {
    return this._context
  }

  addBreakpoint(breakpoint: Breakpoint): void {
    // Check if breakpoint already exists for this event type
    const existing = this._breakpoints.findIndex(
      b => b.eventType === breakpoint.eventType && b.taskId === breakpoint.taskId
    )
    if (existing >= 0) {
      this._breakpoints[existing] = breakpoint
    } else {
      this._breakpoints.push(breakpoint)
    }
  }

  removeBreakpoint(eventType: DebugEventType, taskId?: string): void {
    this._breakpoints = this._breakpoints.filter(
      b => !(b.eventType === eventType && b.taskId === taskId)
    )
  }

  listBreakpoints(): Breakpoint[] {
    return [...this._breakpoints]
  }

  continue(): void {
    this._state = 'running'
    this._stepMode = false
    this._listeners.forEach(l => l.onResume?.())
  }

  step(): void {
    this._state = 'running'
    this._stepMode = true
    this._listeners.forEach(l => l.onResume?.())
  }
}

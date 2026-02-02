import chalk from 'chalk'
import { calculateBarFilled, calculateBarEmpty } from './formatting'

/**
 * Progress bar render mode
 */
export type ProgressBarMode = 'deterministic' | 'indeterminate' | 'chalk' | 'blessed'

/**
 * Progress bar renderer options
 */
export interface ProgressBarOptions {
  /** Output mode: 'chalk' for CLI or 'blessed' for TUI */
  mode?: ProgressBarMode
  /** Color for filled portion */
  filledColor?: string
  /** Color for empty portion */
  emptyColor?: string
  /** Character for filled portion */
  filledChar?: string
  /** Character for empty portion */
  emptyChar?: string
  /** Spinner frames for indeterminate mode */
  spinnerFrames?: string[]
  /** Throttle time in milliseconds (prevents flickering) */
  throttleMs?: number
}

/**
 * Unified progress bar for Loopwork
 *
 * Supports both deterministic mode (with percentage) and indeterminate mode (spinner),
 * and renders output in either chalk (CLI) or blessed tag format (TUI).
 */
export class ProgressBar {
  private total: number
  private current: number = 0
  private indeterminate: boolean
  private isTTY: boolean
  private mode: ProgressBarMode
  private filledColor: string
  private emptyColor: string
  private filledChar: string
  private emptyChar: string
  private spinnerFrames: string[]
  private spinnerIndex = 0
  private lastOutputTime = 0
  private throttleMs: number

  constructor(
    total?: number,
    options: ProgressBarOptions = {}
  ) {
    this.total = total ?? 0
    this.indeterminate = !total || total <= 0
    this.isTTY = process.stdout.isTTY ?? false
    this.mode = options.mode ?? 'deterministic'
    this.filledColor = options.filledColor ?? 'cyan'
    this.emptyColor = options.emptyColor ?? 'gray'
    this.filledChar = options.filledChar ?? '█'
    this.emptyChar = options.emptyChar ?? '░'
    this.spinnerFrames = options.spinnerFrames ?? ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
    this.throttleMs = options.throttleMs ?? 50
  }

  /**
   * Increment current progress by 1
   */
  increment(): void {
    if (!this.indeterminate && this.current < this.total) {
      this.current++
    }
  }

  /**
   * Update progress with optional message
   * Throttles output to reduce flickering
   */
  tick(message?: string): void {
    const now = Date.now()
    if (now - this.lastOutputTime < this.throttleMs) {
      return
    }
    this.lastOutputTime = now

    if (!this.isTTY) {
      this.logProgressNonTTY(message)
      return
    }

    if (this.indeterminate) {
      this.displayIndeterminate(message)
    } else {
      this.displayDeterminate(message)
    }
  }

  /**
   * Mark progress as complete with optional message
   */
  complete(message?: string): void {
    if (!this.isTTY) {
      if (message) {
        process.stdout.write(`\n${this.filledChar} ${message}\n`)
      }
      return
    }

    process.stdout.write('\r\x1b[K')
    if (message) {
      if (this.mode === 'chalk') {
        process.stdout.write(`${process.env.FG_GREEN ?? chalk.bgGreen?.('✓') ?? '✓'} ${message}\n`)
      } else {
        process.stdout.write(`{green-fg}${this.filledChar} ${message}\n`)
      }
    } else if (this.indeterminate) {
      if (this.mode === 'chalk') {
        process.stdout.write(`${chalk.green('✓')} Complete\n`)
      } else {
        process.stdout.write(`{green-fg}${this.filledChar} Complete\n`)
      }
    } else {
      if (this.mode === 'chalk') {
        process.stdout.write(`${chalk.green('✓')} Complete [100%]\n`)
      } else {
        process.stdout.write(`{green-fg}${this.filledChar} Complete [100%]\n`)
      }
    }
  }

  /**
   * Display progress in deterministic mode (with percentage)
   */
  private displayDeterminate(message?: string): void {
    const percent = Math.round((this.current / this.total) * 100)
    const filledLength = calculateBarFilled(this.current, this.total, 20)
    const emptyLength = calculateBarEmpty(this.current, this.total, 20)
    const bar = this.renderBar(filledLength, emptyLength)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const status = this.mode === 'chalk' ? (chalk as any)[this.filledColor]?.(`${percent}%`) : `{${this.filledColor}-fg}`

    const msg = message ? ` ${message}` : ''
    if (this.mode === 'chalk') {
      process.stdout.write(`\r\x1b[K[${bar}] ${status}${msg}`)
    } else {
      process.stdout.write(`\r\x1b[K[${bar}] ${status}${msg}`)
    }
  }

  /**
   * Display progress in indeterminate mode (spinner)
   */
  private displayIndeterminate(message?: string): void {
    const frame = this.spinnerFrames[this.spinnerIndex]
    this.spinnerIndex = (this.spinnerIndex + 1) % this.spinnerFrames.length

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spinner = this.mode === 'chalk' ? (chalk as any)[this.filledColor]?.(frame) ?? frame : `{${this.filledColor}-fg}${frame}`.replace('{', '').replace('}', '')
    const msg = message ? ` ${message}` : ''

    if (this.mode === 'chalk') {
      process.stdout.write(`\r\x1b[K${spinner}${msg}`)
    } else {
      process.stdout.write(`\r\x1b[K${spinner}${msg}`)
    }
  }

  /**
   * Render progress bar with specified filled/empty lengths
   */
  private renderBar(filled: number, empty: number): string {
    const filledStr = this.filledChar.repeat(filled)
    const emptyStr = this.emptyChar.repeat(empty)
    if (this.mode === 'chalk') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (chalk as any)[this.filledColor]?.(filledStr) + (chalk as any)[this.emptyColor]?.(emptyStr)
    } else {
      return `{${this.filledColor}-fg}${filledStr}{${this.emptyColor}-fg}${emptyStr}`
    }
  }

  /**
   * Log progress for non-TTY environments
   */
  private logProgressNonTTY(message?: string): void {
    if (this.indeterminate) {
      if (message) {
        process.stdout.write(message + '\n')
      }
    } else {
      const percent = Math.round((this.current / this.total) * 100)
      const msg = message ? ` - ${message}` : ''
      if (this.mode === 'chalk') {
        process.stdout.write(`Progress: ${this.current}/${this.total} (${percent}%)${msg}\n`)
      } else {
        process.stdout.write(`Progress: ${this.current}/${this.total} (${percent}%)${msg}\n`)
      }
    }
  }
}

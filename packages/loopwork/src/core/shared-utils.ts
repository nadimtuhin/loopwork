import chalk from 'chalk'

/**
 * Shared formatting utilities for Loopwork dashboard and CLI output systems
 *
 * Provides unified formatting functions used by:
 * - CLI output (StreamLogger, logger)
 * - TUI (blessed renderer)
 * - Web UI (React components)
 *
 * This module eliminates code duplication and ensures consistent
 * formatting across all output channels.
 */

/**
 * Format duration in milliseconds to human-readable string
 *
 * @param ms - Duration in milliseconds
 * @returns Human-readable duration (e.g., "5m 30s", "2h 15m", "45s")
 *
 * @example
 * formatDuration(60000) // "1m"
 * formatDuration(3600000) // "1h 0m"
 * formatDuration(125000) // "2m 5s"
 */
export function formatDuration(ms: number | undefined): string {
  if (!ms) return '0s'

  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  }
  return `${seconds}s`
}

/**
 * Format duration in milliseconds to short format for UI displays
 *
 * @param ms - Duration in milliseconds
 * @returns Short duration (e.g., "5m30s", "2h", "45s")
 */
export function formatDurationShort(ms: number | undefined): string {
  if (!ms) return '0s'

  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h`
  }
  if (minutes > 0) {
    const secs = seconds % 60
    return secs === 0 ? `${minutes}m` : `${minutes}m${secs}s`
  }
  return `${seconds}s`
}

/**
 * Format relative time from timestamp
 *
 * @param timestamp - Timestamp in milliseconds
 * @param now - Current timestamp (defaults to Date.now())
 * @returns Relative time string (e.g., "just now", "5m ago", "2h ago")
 */
export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const diff = now - timestamp

  if (diff < 60000) { // Less than 1 minute
    return 'just now'
  }
  if (diff < 3600000) { // Less than 1 hour
    const minutes = Math.floor(diff / 60000)
    return `${minutes}m ago`
  }
  if (diff < 86400000) { // Less than 1 day
    const hours = Math.floor(diff / 3600000)
    return `${hours}h ago`
  }

  const days = Math.floor(diff / 86400000)
  return `${days}d ago`
}

/**
 * Truncate text to specified length with ellipsis
 *
 * @param text - Text to truncate
 * @param maxLength - Maximum length before truncation
 * @returns Truncated text with ellipsis if needed
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength - 3) + '...'
}

/**
 * Pad text to right with spaces
 *
 * @param text - Text to pad
 * @param width - Target width
 * @returns Padded text
 */
export function padRight(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - text.length))
}

/**
 * Pad text to left with spaces
 *
 * @param text - Text to pad
 * @param width - Target width
 * @returns Padded text
 */
export function padLeft(text: string, width: number): string {
  return ' '.repeat(Math.max(0, width - text.length)) + text
}

/**
 * Center text within specified width
 *
 * @param text - Text to center
 * @param width - Target width
 * @returns Centered text
 */
export function center(text: string, width: number): string {
  const padding = Math.max(0, width - text.length)
  const leftPad = Math.floor(padding / 2)
  const rightPad = padding - leftPad
  return ' '.repeat(leftPad) + text + ' '.repeat(rightPad)
}

/**
 * Format task ID for display
 *
 * @param id - Task ID
 * @returns Formatted task ID (e.g., "[TASK-001]")
 */
export function formatTaskId(id: string): string {
  return `[${id}]`
}

/**
 * Format percentage to string
 *
 * @param value - Value (0-1)
 * @param decimals - Number of decimal places (default: 1)
 * @returns Percentage string (e.g., "85.7%")
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${(value * 100).toFixed(decimals)}%`
}

/**
 * Get percentage as fraction (0-1)
 *
 * @param value - Value (0-100)
 * @returns Fraction (0-1)
 */
export function fractionPercentage(value: number): number {
  return Math.min(Math.max(value / 100, 0), 1)
}

/**
 * Calculate filled length for progress bars
 *
 * @param current - Current value
 * @param total - Total value
 * @param barLength - Total bar length
 * @returns Number of filled characters
 */
export function calculateBarFilled(current: number, total: number, barLength: number): number {
  if (total === 0 || current > total) return barLength
  return Math.round((current / total) * barLength)
}

/**
 * Calculate empty length for progress bars
 *
 * @param current - Current value
 * @param total - Total value
 * @param barLength - Total bar length
 * @returns Number of empty characters
 */
export function calculateBarEmpty(current: number, total: number, barLength: number): number {
  if (total === 0) return barLength
  return barLength - calculateBarFilled(current, total, barLength)
}

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
 *
 * @example
 * // CLI mode with deterministic progress
 * const bar = new ProgressBar(100, { mode: 'chalk' })
 * bar.increment()
 * bar.tick('Processing...')
 * bar.complete('Done!')
 *
 * // TUI mode with indeterminate progress
 * const bar = new ProgressBar(undefined, { mode: 'blessed' })
 * bar.tick('Loading...')
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

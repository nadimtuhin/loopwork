/**
 * Unified Output Utilities Module
 *
 * Provides consistent, well-formatted output components:
 * - Table: Unicode box-drawing tables with flexible columns
 * - Separator: Standardized horizontal dividers
 * - Banner: Startup/completion announcement boxes
 * - Emoji fallback: Terminal capability detection
 *
 * All utilities work with the existing logger and follow the project's
 * chalk color scheme and terminal width awareness patterns.
 */

import chalk from 'chalk'

/**
 * Box-drawing character sets
 */
export const BOX_CHARS = {
  light: {
    topLeft: '┌',
    topRight: '┐',
    bottomLeft: '└',
    bottomRight: '┘',
    horizontal: '─',
    vertical: '│',
    cross: '┼',
    teeDown: '┬',
    teeUp: '┴',
    teeRight: '├',
    teeLeft: '┤',
  },
  heavy: {
    topLeft: '╔',
    topRight: '╗',
    bottomLeft: '╚',
    bottomRight: '╝',
    horizontal: '═',
    vertical: '║',
  },
} as const

/**
 * Emoji fallback ASCII replacements
 */
const EMOJI_FALLBACKS: Record<string, string> = {
  '✅': '[OK]',
  '❌': '[ERR]',
  '⚠️': '[WARN]',
  'ℹ️': '[INFO]',
  '[DEBUG]': '[DEBUG]',
  '→': '->',
  '✓': '[+]',
  '✗': '[x]',
  '●': '*',
  '○': 'o',
}

/**
 * Detect if terminal supports emoji
 */
export function supportsEmoji(): boolean {
  // Check if TTY
  if (!process.stdout.isTTY) return false

  // Windows terminals before Windows 10 don't support emoji well
  if (process.platform === 'win32') {
    // Check Windows version if possible
    const release = process.release
    if (release && release.name === 'node') {
      return true // Modern Windows Terminal supports emoji
    }
    return false
  }

  // Unix-like systems with TERM set usually support emoji
  return Boolean(process.env.TERM && process.env.TERM !== 'dumb')
}

/**
 * Get emoji or fallback based on terminal capability
 */
export function getEmoji(emoji: string): string {
  return supportsEmoji() ? emoji : (EMOJI_FALLBACKS[emoji] || emoji)
}

/**
 * Column alignment options
 */
type Alignment = 'left' | 'right' | 'center'

/**
 * Column configuration
 */
interface ColumnConfig {
  width?: number
  align?: Alignment
}

/**
 * Table class with Unicode box-drawing support
 *
 * @example
 * const table = new Table(['Name', 'Status', 'Time'])
 * table.addRow(['Task 1', 'Complete', '5m'])
 * table.addRow(['Task 2', 'Failed', '2m'])
 * console.log(table.render())
 */
export class Table {
  private headers: string[]
  private rows: string[][] = []
  private columnConfigs: ColumnConfig[] = []
  private columnWidths: number[] = []

  constructor(headers: string[], columnConfigs?: ColumnConfig[]) {
    this.headers = headers
    this.columnConfigs = columnConfigs || headers.map(() => ({ align: 'left' }))

    // Initialize column widths from headers
    this.columnWidths = headers.map(h => h.length)
  }

  /**
   * Add a data row to the table
   */
  addRow(cells: string[]): void {
    if (cells.length !== this.headers.length) {
      throw new Error(`Row must have ${this.headers.length} cells, got ${cells.length}`)
    }

    // Update column widths
    cells.forEach((cell, i) => {
      const plainText = this.stripAnsi(cell)
      this.columnWidths[i] = Math.max(this.columnWidths[i], plainText.length)
    })

    this.rows.push(cells)
  }

  /**
   * Render the table as a string
   */
  render(): string {
    const lines: string[] = []

    // Apply configured widths if specified
    this.columnWidths = this.columnWidths.map((width, i) => {
      return this.columnConfigs[i]?.width || width
    })

    // Top border
    lines.push(this.buildBorder('top'))

    // Header row
    lines.push(this.buildRow(this.headers, true))

    // Header separator
    lines.push(this.buildBorder('middle'))

    // Data rows
    for (const row of this.rows) {
      lines.push(this.buildRow(row, false))
    }

    // Bottom border
    lines.push(this.buildBorder('bottom'))

    return lines.join('\n')
  }

  /**
   * Build a border line
   */
  private buildBorder(position: 'top' | 'middle' | 'bottom'): string {
    const { light } = BOX_CHARS
    const leftChar = position === 'top' ? light.topLeft
      : position === 'middle' ? light.teeRight
      : light.bottomLeft

    const rightChar = position === 'top' ? light.topRight
      : position === 'middle' ? light.teeLeft
      : light.bottomRight

    const joinChar = position === 'middle' ? light.cross
      : position === 'top' ? light.teeDown
      : light.teeUp

    const segments = this.columnWidths.map(w => light.horizontal.repeat(w + 2))
    return leftChar + segments.join(joinChar) + rightChar
  }

  /**
   * Build a data or header row
   */
  private buildRow(cells: string[], isHeader: boolean): string {
    const { light } = BOX_CHARS
    const paddedCells = cells.map((cell, i) => {
      const align = this.columnConfigs[i]?.align || 'left'
      const width = this.columnWidths[i]
      const padded = this.padCell(cell, width, align)
      return isHeader ? chalk.bold(padded) : padded
    })

    return light.vertical + ' ' + paddedCells.join(` ${light.vertical} `) + ' ' + light.vertical
  }

  /**
   * Pad a cell to specified width with alignment
   */
  private padCell(cell: string, width: number, align: Alignment): string {
    const plainText = this.stripAnsi(cell)
    const padding = width - plainText.length

    if (padding <= 0) return cell

    if (align === 'right') {
      return ' '.repeat(padding) + cell
    } else if (align === 'center') {
      const leftPad = Math.floor(padding / 2)
      const rightPad = padding - leftPad
      return ' '.repeat(leftPad) + cell + ' '.repeat(rightPad)
    } else {
      return cell + ' '.repeat(padding)
    }
  }

  /**
   * Strip ANSI color codes to get plain text length
   */
  private stripAnsi(str: string): string {
     
    return str.replace(/\u001b\[[0-9;]*m/g, '')
  }
}

/**
 * Separator types
 */
type SeparatorType = 'light' | 'heavy' | 'section'

/**
 * Create a horizontal separator line
 *
 * @param type - Separator style: 'light' (─), 'heavy' (═), or 'section' (blank line padded)
 * @param width - Width of separator (defaults to terminal width)
 * @returns Formatted separator string
 *
 * @example
 * console.log(separator('heavy', 80))
 * console.log(separator('section'))
 */
export function separator(type: SeparatorType = 'light', width?: number): string {
  const terminalWidth = width || process.stdout.columns || 120

  if (type === 'section') {
    return '\n' + chalk.gray('─'.repeat(terminalWidth)) + '\n'
  }

  const char = type === 'heavy' ? BOX_CHARS.heavy.horizontal : BOX_CHARS.light.horizontal
  return chalk.gray(char.repeat(terminalWidth))
}

/**
 * Banner component for startup/completion messages
 *
 * Creates a visually distinct box with title and optional key-value pairs.
 *
 * @example
 * const banner = new Banner('Build Complete')
 * banner.addRow('Duration', '5m 30s')
 * banner.addRow('Tests', '42 passed')
 * console.log(banner.render())
 */
export class Banner {
  private title: string
  private rows: Array<{ key: string; value: string }> = []
  private style: 'light' | 'heavy' = 'heavy'

  constructor(title: string, style: 'light' | 'heavy' = 'heavy') {
    this.title = title
    this.style = style
  }

  /**
   * Add a key-value row to the banner
   */
  addRow(key: string, value: string): void {
    this.rows.push({ key, value })
  }

  /**
   * Render the banner as a string
   */
  render(): string {
    const lines: string[] = []
    const chars = this.style === 'heavy' ? BOX_CHARS.heavy : BOX_CHARS.light

    // Calculate content width
    const titleLen = this.stripAnsi(this.title).length
    const maxRowLen = this.rows.reduce((max, row) => {
      const len = this.stripAnsi(row.key).length + this.stripAnsi(row.value).length + 2 // +2 for ': '
      return Math.max(max, len)
    }, 0)

    const contentWidth = Math.max(titleLen, maxRowLen, 40) + 4 // +4 for padding
    const innerWidth = contentWidth - 2 // -2 for borders

    // Top border
    lines.push(chalk.bold.cyan(chars.topLeft + chars.horizontal.repeat(contentWidth) + chars.topRight))

    // Title
    const titlePadding = Math.floor((innerWidth - titleLen) / 2)
    const titleLine = ' '.repeat(titlePadding) + chalk.bold.white(this.title) + ' '.repeat(innerWidth - titlePadding - titleLen)
    lines.push(chalk.bold.cyan(chars.vertical) + titleLine + chalk.bold.cyan(chars.vertical))

    // Rows
    if (this.rows.length > 0) {
      // Separator after title
      if (this.style === 'heavy') {
        lines.push(chalk.cyan(chars.vertical + chars.horizontal.repeat(contentWidth) + chars.vertical))
      }

      for (const row of this.rows) {
        const keyPart = chalk.gray(`  ${row.key}: `)
        const valuePart = chalk.white(row.value)
        const combined = keyPart + valuePart
        const plainLen = this.stripAnsi(row.key).length + this.stripAnsi(row.value).length + 4 // +4 for '  : '
        const padding = ' '.repeat(Math.max(0, innerWidth - plainLen))
        lines.push(chalk.cyan(chars.vertical) + combined + padding + chalk.cyan(chars.vertical))
      }
    }

    // Bottom border
    lines.push(chalk.bold.cyan(chars.bottomLeft + chars.horizontal.repeat(contentWidth) + chars.bottomRight))

    return lines.join('\n')
  }

  /**
   * Strip ANSI color codes to get plain text length
   */
  private stripAnsi(str: string): string {
     
    return str.replace(/\u001b\[[0-9;]*m/g, '')
  }
}

/**
 * Progress bar for tracking task/operation progress
 *
 * Features:
 * - Deterministic mode: tracks current/total progress with percentage
 * - Indeterminate mode: spinner-like animation
 * - TTY auto-detection: disables in non-interactive mode
 * - Graceful degradation: logs progress in non-TTY mode
 *
 * @example
 * const progress = new ProgressBar(100)
 * progress.increment()
 * progress.tick('Processing...')
 * progress.complete('Done!')
 */
export class ProgressBar {
  private total: number
  private current: number = 0
  private indeterminate: boolean
  private isTTY: boolean
  private spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  private spinnerIndex = 0
  private lastOutputTime = 0
  private throttleMs = 50

  constructor(total?: number) {
    this.total = total ?? 0
    this.indeterminate = !total || total <= 0
    this.isTTY = process.stdout.isTTY ?? false
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
   * Update progress with optional message (for deterministic mode)
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
        process.stdout.write(`\n✓ ${message}\n`)
      }
      return
    }

    process.stdout.write('\r\x1b[K')
    if (message) {
      process.stdout.write(`${chalk.green('✓')} ${message}\n`)
    } else if (this.indeterminate) {
      process.stdout.write(`${chalk.green('✓')} Complete\n`)
    } else {
      process.stdout.write(`${chalk.green('✓')} Complete [100%]\n`)
    }
  }

  /**
   * Display progress in deterministic mode (with percentage)
   */
  private displayDeterminate(message?: string): void {
    const percent = Math.round((this.current / this.total) * 100)
    const barLength = 20
    const filledLength = Math.round((this.current / this.total) * barLength)
    const emptyLength = barLength - filledLength

    const bar = chalk.cyan('█'.repeat(filledLength)) + chalk.gray('░'.repeat(emptyLength))
    const status = chalk.bold(`${percent}%`)

    const msg = message ? ` ${message}` : ''
    process.stdout.write(`\r\x1b[K[${bar}] ${status}${msg}`)
  }

  /**
   * Display progress in indeterminate mode (spinner)
   */
  private displayIndeterminate(message?: string): void {
    const frame = this.spinnerFrames[this.spinnerIndex]
    this.spinnerIndex = (this.spinnerIndex + 1) % this.spinnerFrames.length

    const spinner = chalk.cyan(frame)
    const msg = message ? ` ${message}` : ''
    process.stdout.write(`\r\x1b[K${spinner}${msg}`)
  }

  /**
   * Log progress for non-TTY environments (falls back to text updates)
   */
  private logProgressNonTTY(message?: string): void {
    if (this.indeterminate) {
      if (message) {
        process.stdout.write(message + '\n')
      }
    } else {
      const percent = Math.round((this.current / this.total) * 100)
      const msg = message ? ` - ${message}` : ''
      process.stdout.write(`Progress: ${this.current}/${this.total} (${percent}%)${msg}\n`)
    }
  }
}

/**
 * Completion summary for displaying task results
 *
 * Features:
 * - Stats display (completed/failed/skipped counts)
 * - Duration display
 * - Next steps suggestions
 * - Consistent formatting with Banner styling
 *
 * @example
 * const summary = new CompletionSummary('Build Complete')
 * summary.setStats({ completed: 10, failed: 0, skipped: 2 })
 * summary.setDuration(1800000) // 30 minutes in ms
 * summary.addNextStep('Run tests with `bun test`')
 * console.log(summary.render())
 */
export class CompletionSummary {
  private title: string
  private stats: { completed: number; failed: number; skipped: number } = {
    completed: 0,
    failed: 0,
    skipped: 0,
  }
  private duration: number | null = null
  private nextSteps: string[] = []
  private isTTY: boolean
  private isDegraded: boolean = false
  private disabledPlugins: string[] = []

  constructor(title: string) {
    this.title = title
    this.isTTY = process.stdout.isTTY ?? false
  }

  /**
   * Set completion statistics
   */
  setStats(stats: { 
    completed?: number; 
    failed?: number; 
    skipped?: number;
    isDegraded?: boolean;
    disabledPlugins?: string[];
  }): void {
    this.stats = {
      completed: stats.completed ?? this.stats.completed,
      failed: stats.failed ?? this.stats.failed,
      skipped: stats.skipped ?? this.stats.skipped,
    }
    if (stats.isDegraded !== undefined) {
      this.isDegraded = stats.isDegraded
    }
    if (stats.disabledPlugins) {
      this.disabledPlugins = stats.disabledPlugins
    }
  }

  /**
   * Set duration in milliseconds
   */
  setDuration(ms: number): void {
    this.duration = ms
  }

  /**
   * Add a next step suggestion
   */
  addNextStep(step: string): void {
    this.nextSteps.push(step)
  }

  /**
   * Add multiple next steps
   */
  addNextSteps(steps: string[]): void {
    this.nextSteps.push(...steps)
  }

  /**
   * Format duration in human-readable format
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  }

  /**
   * Render as plain text (for non-TTY environments)
   */
  private renderPlainText(): string {
    const lines: string[] = []
    lines.push(`\n${this.title}`)
    lines.push('='.repeat(this.title.length))

    // Stats
    if (
      this.stats.completed > 0 ||
      this.stats.failed > 0 ||
      this.stats.skipped > 0
    ) {
      let statsLine = 'Stats: '
      const parts = []
      if (this.stats.completed > 0) {
        parts.push(`${this.stats.completed} completed`)
      }
      if (this.stats.failed > 0) {
        parts.push(`${this.stats.failed} failed`)
      }
      if (this.stats.skipped > 0) {
        parts.push(`${this.stats.skipped} skipped`)
      }
      statsLine += parts.join(', ')
      lines.push(statsLine)
    }

    // Duration
    if (this.duration !== null) {
      lines.push(`Duration: ${this.formatDuration(this.duration)}`)
    }

    if (this.isDegraded) {
      lines.push('Status: RUNNING IN REDUCED/DEGRADED MODE')
      if (this.disabledPlugins.length > 0) {
        lines.push(`Disabled Plugins: ${this.disabledPlugins.join(', ')}`)
      }
    }

    // Next steps
    if (this.nextSteps.length > 0) {
      lines.push('\nNext Steps:')
      for (const step of this.nextSteps) {
        lines.push(`  → ${step}`)
      }
    }

    lines.push('')
    return lines.join('\n')
  }

  /**
   * Render as a formatted Banner (TTY-aware)
   */
  render(): string {
    if (!this.isTTY) {
      return this.renderPlainText()
    }

    const banner = new Banner(this.title)

    // Add stats
    if (
      this.stats.completed > 0 ||
      this.stats.failed > 0 ||
      this.stats.skipped > 0
    ) {
      const parts = []
      if (this.stats.completed > 0) {
        parts.push(chalk.green(`${this.stats.completed} completed`))
      }
      if (this.stats.failed > 0) {
        parts.push(chalk.red(`${this.stats.failed} failed`))
      }
      if (this.stats.skipped > 0) {
        parts.push(chalk.yellow(`${this.stats.skipped} skipped`))
      }

      if (parts.length > 0) {
        banner.addRow('Stats', parts.join(', '))
      }
    }

    // Add duration
    if (this.duration !== null) {
      banner.addRow('Duration', chalk.cyan(this.formatDuration(this.duration)))
    }

    if (this.isDegraded) {
      banner.addRow('Status', chalk.yellow('⚡ REDUCED/DEGRADED MODE'))
      if (this.disabledPlugins.length > 0) {
        banner.addRow('Disabled', chalk.dim(this.disabledPlugins.join(', ')))
      }
    }

    // Add next steps
    if (this.nextSteps.length > 0) {
      const stepsText = this.nextSteps.map((s, i) => {
        const prefix = i === 0 ? getEmoji('→') : ' '
        return `${prefix} ${s}`
      }).join('\n  ')
      banner.addRow('Next Steps', `\n  ${stepsText}`)
    }

    return banner.render()
  }
}

/**
 * JSON output utilities
 */

/**
 * Create a JSON output wrapper for a command
 * @param command - Command name (run, status, logs, kill, decompose)
 * @param data - Command-specific data
 * @returns Formatted JSON string
 */
export function createJsonOutput(command: string, data: Record<string, unknown>): string {
  const output = {
    command,
    timestamp: new Date().toISOString(),
    ...data,
  }
  return JSON.stringify(output, null, 2)
}

/**
 * Emit a newline-delimited JSON event
 * @param type - Event type
 * @param command - Command name
 * @param data - Event data
 */
export function emitJsonEvent(
  type: 'info' | 'success' | 'error' | 'warn' | 'progress' | 'result',
  command: string,
  data: Record<string, unknown>
): void {
  const event = {
    timestamp: new Date().toISOString(),
    type,
    command,
    data,
  }
  process.stdout.write(JSON.stringify(event) + '\n')
}

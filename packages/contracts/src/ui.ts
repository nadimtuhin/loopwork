/**
 * UI Contracts
 *
 * Defines interfaces for UI rendering layer to enable swapping implementations.
 * Supports Ink (TUI), console, and web rendering backends.
 */

/**
 * Rendering environment type
 */
export type RenderEnvironment = 'tty' | 'non-tty' | 'web'

/**
 * Color scheme for theming
 */
export interface ThemeColors {
  /** Primary accent color */
  primary: string
  /** Success color */
  success: string
  /** Warning color */
  warning: string
  /** Error color */
  error: string
  /** Info/debug color */
  info: string
  /** Dim/subtle color */
  dim: string
}

/**
 * Box drawing characters for borders
 */
export interface BoxChars {
  /** Horizontal line */
  horizontal: string
  /** Vertical line */
  vertical: string
  /** Top-left corner */
  topLeft: string
  /** Top-right corner */
  topRight: string
  /** Bottom-left corner */
  bottomLeft: string
  /** Bottom-right corner */
  bottomRight: string
}

/**
 * Progress bar style configuration
 */
export interface ProgressBarStyle {
  /** Completed portion character */
  completeChar: string
  /** Incomplete portion character */
  incompleteChar: string
  /** Show percentage text */
  showPercent: boolean
  /** Total width in characters */
  width: number
}

/**
 * Table rendering configuration
 */
export interface TableStyle {
  /** Column separator */
  separator: string
  /** Use borders instead of separators */
  useBorders: boolean
  /** Border characters */
  borders?: BoxChars
  /** Column alignment */
  alignments?: ('left' | 'center' | 'right')[]
}

/**
 * Spinner configuration
 */
export interface SpinnerStyle {
  /** Frame set for animation */
  frames: string[]
  /** Frame duration in milliseconds */
  interval: number
}

/**
 * Complete theme configuration
 */
export interface Theme {
  /** Color palette */
  colors: ThemeColors
  /** Box drawing characters */
  boxChars: BoxChars
  /** Progress bar style */
  progressBar: ProgressBarStyle
  /** Table style */
  table: TableStyle
  /** Spinner style */
  spinner: SpinnerStyle
  /** Enable emoji in output */
  enableEmoji: boolean
  /** Enable colors in output */
  enableColors: boolean
}

/**
 * Render context provides utilities and configuration for UI rendering
 */
export interface IRenderContext {
  /** Rendering environment type */
  readonly environment: RenderEnvironment

  /** Current theme */
  readonly theme: Theme

  /** Terminal width in columns (TTY only) */
  readonly columns: number

  /** Terminal height in rows (TTY only) */
  readonly rows: number

  /** Whether output supports colors */
  readonly supportsColors: boolean

  /** Whether output supports emoji */
  readonly supportsEmoji: boolean

  /** Update the theme */
  setTheme(theme: Partial<Theme>): void

  /** Get a themed color value */
  getColor(colorName: keyof ThemeColors): string

  /** Format text with a themed color */
  formatColor(text: string, colorName: keyof ThemeColors): string

  /**
   * Measure text width (accounts for wide characters like emoji)
   * Returns display width in terminal columns
   */
  measureText(text: string): number

  /**
   * Truncate text to fit within max width
   * Adds ellipsis if truncated
   */
  truncate(text: string, maxWidth: number): string

  /**
   * Wrap text to fit within max width
   * Returns array of lines
   */
  wrap(text: string, maxWidth: number): string[]
}

/**
 * Default box drawing characters (Unicode box-drawing)
 */
export const DEFAULT_BOX_CHARS: BoxChars = {
  horizontal: '─',
  vertical: '│',
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
}

/**
 * Default colors (ANSI color codes)
 */
export const DEFAULT_COLORS: ThemeColors = {
  primary: '\x1b[34m',      // Blue
  success: '\x1b[32m',      // Green
  warning: '\x1b[33m',      // Yellow
  error: '\x1b[31m',        // Red
  info: '\x1b[36m',         // Cyan
  dim: '\x1b[90m',          // Gray/Bright Black
}

/**
 * Reset color code
 */
export const COLOR_RESET = '\x1b[0m'

/**
 * Default progress bar style
 */
export const DEFAULT_PROGRESS_BAR: ProgressBarStyle = {
  completeChar: '█',
  incompleteChar: '░',
  showPercent: true,
  width: 30,
}

/**
 * Default table style
 */
export const DEFAULT_TABLE: TableStyle = {
  separator: ' │ ',
  useBorders: false,
}

/**
 * Default spinner (dots)
 */
export const DEFAULT_SPINNER: SpinnerStyle = {
  frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  interval: 80,
}

/**
 * Default theme configuration
 */
export const DEFAULT_THEME: Theme = {
  colors: DEFAULT_COLORS,
  boxChars: DEFAULT_BOX_CHARS,
  progressBar: DEFAULT_PROGRESS_BAR,
  table: DEFAULT_TABLE,
  spinner: DEFAULT_SPINNER,
  enableEmoji: true,
  enableColors: true,
}

/**
 * Lightweight spinner for non-TTY environments
 */
export const LIGHTWEIGHT_SPINNER: SpinnerStyle = {
  frames: ['.', '..', '...'],
  interval: 500,
}

/**
 * Lightweight theme for non-TTY environments
 */
export const LIGHTWEIGHT_THEME: Theme = {
  ...DEFAULT_THEME,
  spinner: LIGHTWEIGHT_SPINNER,
  enableEmoji: false,
}

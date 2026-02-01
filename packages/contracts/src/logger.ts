/**
 * Log levels for controlling output verbosity
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'success' | 'silent'

/**
 * Logger interface to decouple from UI components
 */
export interface ILogger {
  trace(message: string): void
  debug(message: string): void
  info(message: string): void
  warn(message: string): void
  error(message: string): void
  success(message: string): void
  
  /** Same-line updates for progress */
  update(message: string, percent?: number): void
  
  /** Progress/Spinner control */
  startSpinner(message: string, percent?: number): void
  stopSpinner(message?: string, symbol?: string): void
  
  /** Raw output bypass */
  raw(message: string, noNewline?: boolean): void
  
  /** Configuration */
  setLogLevel(level: LogLevel): void
}

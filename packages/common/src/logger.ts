import chalk from 'chalk'
import fs from 'fs'
import path from 'path'
import type { ILogger, LogLevel } from '@loopwork-ai/contracts'
import { getTimestamp } from './utils'

const LOG_LEVELS: Record<LogLevel, number> = {
  trace: -1,
  debug: 0,
  info: 1,
  success: 1,
  warn: 2,
  error: 3,
  silent: 4,
}

/**
 * Standard console-based logger implementation
 * 
 * Supports multiple log levels, file logging, TTY detection,
 * and live updates for progress tracking.
 */
export class ConsoleLogger implements ILogger {
  private logFile: string | null = null
  private logLevel: LogLevel = 'info'
  private isTTY: boolean

  /**
   * Create a new ConsoleLogger
   * @param options - Logger configuration options
   * @param options.logLevel - Minimum level to output (default: 'info')
   * @param options.logFile - Optional path to persist logs to disk
   */
  constructor(options: { logLevel?: LogLevel; logFile?: string | null } = {}) {
    this.logLevel = options.logLevel || 'info'
    this.logFile = options.logFile || null
    this.isTTY = process.stdout.isTTY
  }

  /**
   * Set the file path for persistent logging
   * @param filePath - Path to the log file
   */
  setLogFile(filePath: string) {
    this.logFile = filePath
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  /**
   * Set the minimum log level for console output
   * @param level - The log level to set
   */
  setLogLevel(level: LogLevel) {
    this.logLevel = level
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.logLevel]
  }

  private logToFile(level: string, msg: string) {
    if (this.logFile) {
      try {
        const timestamp = getTimestamp()
        const dir = path.dirname(this.logFile)
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true })
        }
        fs.appendFileSync(this.logFile, `[${timestamp}] [${level}] ${msg}\n`)
      } catch {
        // Silently ignore log file errors
      }
    }
  }

  private format(level: LogLevel, msg: string): string {
    const timestamp = chalk.gray(getTimestamp())
    let prefix = ''
    
    switch (level) {
      case 'info':
        prefix = chalk.blue('info')
        break
      case 'success':
        prefix = chalk.green('success')
        break
      case 'warn':
        prefix = chalk.yellow('warn')
        break
      case 'error':
        prefix = chalk.red('error')
        break
      case 'debug':
        prefix = chalk.magenta('debug')
        break
      case 'trace':
        prefix = chalk.gray('trace')
        break
    }

    return `${timestamp} ${prefix}: ${msg}`
  }

  /**
   * Log an informational message
   * @param msg - The message to log
   */
  info(msg: string) {
    if (this.shouldLog('info')) {
      console.log(this.format('info', msg))
    }
    this.logToFile('INFO', msg)
  }

  /**
   * Log a success message
   * @param msg - The message to log
   */
  success(msg: string) {
    if (this.shouldLog('success')) {
      console.log(this.format('success', msg))
    }
    this.logToFile('SUCCESS', msg)
  }

  /**
   * Log a warning message
   * @param msg - The message to log
   */
  warn(msg: string) {
    if (this.shouldLog('warn')) {
      console.log(this.format('warn', msg))
    }
    this.logToFile('WARN', msg)
  }

  /**
   * Log an error message
   * @param msg - The message to log
   */
  error(msg: string) {
    if (this.shouldLog('error')) {
      console.error(this.format('error', msg))
    }
    this.logToFile('ERROR', msg)
  }

  /**
   * Log a debug message
   * @param msg - The message to log
   */
  debug(msg: string) {
    if (this.shouldLog('debug')) {
      console.log(this.format('debug', msg))
    }
    this.logToFile('DEBUG', msg)
  }

  /**
   * Log a trace message (very verbose)
   * @param msg - The message to log
   */
  trace(msg: string) {
    if (this.shouldLog('trace')) {
      console.log(this.format('trace', msg))
    }
    this.logToFile('TRACE', msg)
  }

  /**
   * Update the current line (useful for progress bars)
   * @param msg - The message to show
   * @param percent - Optional completion percentage
   */
  update(msg: string, percent?: number) {
    if (!this.shouldLog('info')) return

    const percentStr = percent !== undefined ? ` [${Math.round(percent)}%]` : ''
    const output = `${chalk.blue('update')}: ${msg}${percentStr}`
    
    if (this.isTTY) {
      process.stdout.write(`\r${output}`)
    } else {
      console.log(output)
    }
  }

  /**
   * Start a spinner with a message
   * @param msg - The message to show next to the spinner
   * @param percent - Optional completion percentage
   */
  startSpinner(msg: string, percent?: number) {
    this.info(msg + (percent !== undefined ? ` [${percent}%]` : ''))
  }

  /**
   * Stop the current spinner
   * @param msg - Optional final message
   * @param symbol - Optional final symbol (e.g. checkmark)
   */
  stopSpinner(msg?: string, symbol?: string) {
    if (msg) {
      this.success(msg)
    }
  }

  /**
   * Output raw text without formatting
   * @param msg - The message to output
   * @param noNewline - Whether to skip the trailing newline
   */
  raw(msg: string, noNewline: boolean = false) {
    if (noNewline) {
      process.stdout.write(msg)
    } else {
      console.log(msg)
    }
    this.logToFile('RAW', msg)
  }
}

export const logger = new ConsoleLogger()

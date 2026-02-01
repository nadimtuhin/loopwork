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

export class ConsoleLogger implements ILogger {
  private logFile: string | null = null
  private logLevel: LogLevel = 'info'
  private isTTY: boolean

  constructor(options: { logLevel?: LogLevel; logFile?: string | null } = {}) {
    this.logLevel = options.logLevel || 'info'
    this.logFile = options.logFile || null
    this.isTTY = process.stdout.isTTY
  }

  setLogFile(filePath: string) {
    this.logFile = filePath
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

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

  info(msg: string) {
    if (this.shouldLog('info')) {
      console.log(this.format('info', msg))
    }
    this.logToFile('INFO', msg)
  }

  success(msg: string) {
    if (this.shouldLog('success')) {
      console.log(this.format('success', msg))
    }
    this.logToFile('SUCCESS', msg)
  }

  warn(msg: string) {
    if (this.shouldLog('warn')) {
      console.log(this.format('warn', msg))
    }
    this.logToFile('WARN', msg)
  }

  error(msg: string) {
    if (this.shouldLog('error')) {
      console.error(this.format('error', msg))
    }
    this.logToFile('ERROR', msg)
  }

  debug(msg: string) {
    if (this.shouldLog('debug')) {
      console.log(this.format('debug', msg))
    }
    this.logToFile('DEBUG', msg)
  }

  trace(msg: string) {
    if (this.shouldLog('trace')) {
      console.log(this.format('trace', msg))
    }
    this.logToFile('TRACE', msg)
  }

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

  startSpinner(msg: string, percent?: number) {
    this.info(msg + (percent !== undefined ? ` [${percent}%]` : ''))
  }

  stopSpinner(msg?: string, symbol?: string) {
    if (msg) {
      this.success(msg)
    }
  }

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

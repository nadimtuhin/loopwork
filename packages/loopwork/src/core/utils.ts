import chalk from 'chalk'
import fs from 'fs'
import path from 'path'
import ora, { type Ora } from 'ora'
import type { LogLevel } from '../contracts/config'

export function getTimestamp(): string {
  return new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

let activeSpinner: Ora | null = null

function stopActiveSpinner() {
  if (activeSpinner) {
    activeSpinner.stop()
    activeSpinner = null
  }
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
}

export const logger = {
  logFile: null as string | null,
  logLevel: 'info' as LogLevel,
  lastOutputTime: 0,

  setLogFile: (filePath: string) => {
    logger.logFile = filePath
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  },

  setLogLevel: (level: LogLevel) => {
    logger.logLevel = level
  },

  _shouldLog: (level: LogLevel): boolean => {
    return LOG_LEVELS[level] >= LOG_LEVELS[logger.logLevel]
  },

  _logToFile: (level: string, msg: string) => {
    if (logger.logFile) {
      try {
        const timestamp = getTimestamp()
        const dir = path.dirname(logger.logFile)
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true })
        }
        fs.appendFileSync(logger.logFile, `[${timestamp}] [${level}] ${msg}\n`)
      } catch {
        // Silently ignore log file errors to prevent test failures
      }
    }
  },

  info: (msg: string) => {
    if (!logger._shouldLog('info')) return
    stopActiveSpinner()
    process.stdout.write('\r\x1b[K')
    process.stdout.write(`${chalk.gray(getTimestamp())} ${chalk.blue('ℹ️ INFO:')} ${msg}\n`)
    logger._logToFile('INFO', msg)
  },
  success: (msg: string) => {
    if (!logger._shouldLog('info')) return
    stopActiveSpinner()
    process.stdout.write('\r\x1b[K')
    process.stdout.write(`${chalk.gray(getTimestamp())} ${chalk.green('✅ SUCCESS:')} ${msg}\n`)
    logger._logToFile('SUCCESS', msg)
  },
  warn: (msg: string) => {
    if (!logger._shouldLog('warn')) return
    stopActiveSpinner()
    process.stdout.write('\r\x1b[K')
    process.stdout.write(`${chalk.gray(getTimestamp())} ${chalk.yellow('⚠️ WARN:')} ${msg}\n`)
    logger._logToFile('WARN', msg)
  },
  error: (msg: string) => {
    if (!logger._shouldLog('error')) return
    stopActiveSpinner()
    process.stdout.write('\r\x1b[K')
    process.stderr.write(`${chalk.gray(getTimestamp())} ${chalk.red('❌ ERROR:')} ${msg}\n`)
    logger._logToFile('ERROR', msg)
  },
  debug: (msg: string) => {
    if (!logger._shouldLog('debug')) return
    stopActiveSpinner()
    process.stdout.write('\r\x1b[K')
    process.stdout.write(`${chalk.gray(getTimestamp())} ${chalk.cyan('[DEBUG]')} ${msg}\n`)
    logger._logToFile('DEBUG', msg)
  },
  update: (msg: string) => {
    if (activeSpinner) {
      activeSpinner.text = msg
    } else {
      const terminalWidth = process.stdout.columns || 120
      const timestamp = getTimestamp()
      const prefix = `${chalk.gray(timestamp)} ${chalk.blue('[INFO]')} `
      const prefixLength = timestamp.length + 1 + '[INFO] '.length 
      const availableWidth = Math.max(10, terminalWidth - prefixLength - 5)
      
      let displayMsg = msg
      if (msg.length > availableWidth) {
        displayMsg = msg.substring(0, availableWidth - 3) + '...'
      }
      
      process.stdout.write(`\r\x1b[K${prefix}${displayMsg}`)
    }
  },

  startSpinner: (msg: string) => {
    if (process.env.LOOPWORK_DEBUG === 'true' || !process.stdout.isTTY) {
      logger.info(msg)
      return
    }
    if (activeSpinner) {
      activeSpinner.text = msg
      return
    }
    activeSpinner = ora({
      text: msg,
      color: 'blue',
      spinner: 'dots',
    }).start()
  },

  stopSpinner: (msg?: string, symbol?: string) => {
    if (!activeSpinner) {
      if (msg) logger.info(msg)
      return
    }
    if (msg) {
      activeSpinner.stopAndPersist({
        symbol: symbol || chalk.green('✓'),
        text: msg
      })
    } else {
      activeSpinner.stop()
    }
    activeSpinner = null
  },
}

export async function promptUser(
  question: string,
  defaultValue: string = 'n',
  nonInteractive: boolean = false
): Promise<string> {
  stopActiveSpinner()
  if (nonInteractive || !process.stdin.isTTY) {
    logger.debug(`Non-interactive mode, using default: ${defaultValue}`)
    return defaultValue
  }

  process.stdout.write(question)
  process.stdin.setRawMode(true)

  return new Promise<string>((resolve) => {
    process.stdin.resume()

    const cleanup = () => {
      try {
        process.stdin.setRawMode(false)
      } catch {
        // stdin may already be closed
      }
      process.stdin.pause()
      process.stdin.removeListener('data', onData)
      process.stdin.removeListener('error', onError)
    }

    const onData = (data: Buffer) => {
      const char = data.toString('utf8')

      // Handle Ctrl+C
      if (char === '\u0003') {
        cleanup()
        process.stdout.write('\n')
        logger.info('Interrupted by user (Ctrl+C)')
        process.exit(130)
      }

      cleanup()
      process.stdout.write('\n')
      if (char === '\r' || char === '\n') {
        resolve(defaultValue)
      } else {
        resolve(char.trim())
      }
    }

    const onError = (err: Error) => {
      cleanup()
      logger.debug(`stdin error: ${err.message}`)
      resolve(defaultValue)
    }

    process.stdin.once('error', onError)
  })
}

export class StreamLogger {
  private buffer: string = ''
  private prefix: string = ''

  constructor(prefix?: string) {
    this.prefix = prefix || ''
  }

  log(chunk: string | Buffer) {
    this.buffer += chunk.toString('utf8')
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() || ''

    for (const line of lines) {
      this.printLine(line)
    }
  }

  private printLine(line: string) {
    stopActiveSpinner()
    process.stdout.write('\r\x1b[K')
    const timestamp = chalk.gray(getTimestamp())
    const separator = chalk.gray(' │')
    const prefixStr = this.prefix ? ` ${chalk.magenta(`[${this.prefix}]`)}` : ''

    // Clean up the line: remove leading | and extra spaces from tool output
    let cleanedLine = line.replace(/^\s*\|\s*/, '')

    // Calculate available width for content
    // Terminal width - timestamp (12) - separator (3) - prefix (~20) - margin (5)
    const terminalWidth = process.stdout.columns || 120
    const reservedWidth = 12 + 3 + (this.prefix ? this.prefix.length + 3 : 0) + 5
    const contentWidth = Math.max(60, terminalWidth - reservedWidth)

    // Wrap long lines
    const wrappedLines = this.wrapText(cleanedLine, contentWidth)

    for (let i = 0; i < wrappedLines.length; i++) {
      if (i === 0) {
        // First line: show timestamp and prefix
        process.stdout.write(`${timestamp}${separator}${prefixStr} ${chalk.dim(wrappedLines[i])}\n`)
      } else {
        // Continuation lines: indent to align with first line content
        const indent = ' '.repeat(12 + 3 + (this.prefix ? this.prefix.length + 3 : 0))
        process.stdout.write(`${indent} ${chalk.dim(wrappedLines[i])}\n`)
      }
    }

    // Signal that output just happened to coordinate with progress updates
    logger.lastOutputTime = Date.now()
  }

  private wrapText(text: string, maxWidth: number): string[] {
    if (text.length <= maxWidth) {
      return [text]
    }

    const lines: string[] = []
    let currentLine = ''
    const words = text.split(' ')

    for (const word of words) {
      if (currentLine.length + word.length + 1 <= maxWidth) {
        currentLine += (currentLine ? ' ' : '') + word
      } else {
        if (currentLine) {
          lines.push(currentLine)
        }
        // If a single word is longer than maxWidth, split it
        if (word.length > maxWidth) {
          let remaining = word
          while (remaining.length > maxWidth) {
            lines.push(remaining.substring(0, maxWidth))
            remaining = remaining.substring(maxWidth)
          }
          currentLine = remaining
        } else {
          currentLine = word
        }
      }
    }

    if (currentLine) {
      lines.push(currentLine)
    }

    return lines.length > 0 ? lines : [text]
  }

  flush() {
    if (this.buffer) {
      this.printLine(this.buffer)
      this.buffer = ''
    }
  }
}

import chalk from 'chalk'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import type { LogLevel } from '../contracts/config'
import type { OutputFormat, JsonEvent } from '../contracts/output'
import type { OutputRenderer } from '../output/renderer'
import { ConsoleRenderer } from '../output/console-renderer'

export function getTimestamp(): string {
  return new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

/**
 * Calculate a SHA-256 checksum for an object
 */
export function calculateChecksum(data: unknown): string {
  const content = typeof data === 'string' ? data : JSON.stringify(data)
  return crypto.createHash('sha256').update(content).digest('hex')
}

const LOG_LEVELS: Record<LogLevel, number> = {
  trace: -1,
  debug: 0,
  info: 1,
  success: 1,
  warn: 2,
  error: 3,
  silent: 4,
}

// Initial configuration
const initialConfig = {
  mode: 'human' as const,
  logLevel: 'info' as const,
}

// Default renderer
const defaultRenderer = new ConsoleRenderer(initialConfig)

export const logger = {
  logFile: null as string | null,
  logLevel: 'info' as LogLevel,
  lastOutputTime: 0,
  outputFormat: 'human' as OutputFormat,
  renderer: defaultRenderer as OutputRenderer,

  setLogFile: (filePath: string) => {
    logger.logFile = filePath
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  },

  setLogLevel: (level: LogLevel) => {
    logger.logLevel = level
    logger.renderer.configure({ logLevel: level })
  },

  setOutputFormat: (format: OutputFormat) => {
    logger.outputFormat = format
    logger.renderer.configure({ mode: format === 'json' ? 'json' : 'human' })
  },

  setRenderer: (renderer: OutputRenderer) => {
    // Transfer configuration to new renderer
    renderer.configure({
      logLevel: logger.logLevel,
      mode: logger.outputFormat === 'json' ? 'json' : 'human'
    })
    
    // Dispose old renderer if needed
    if (logger.renderer && logger.renderer !== renderer) {
      try {
        logger.renderer.dispose()
      } catch {
        // Ignore dispose errors
      }
    }
    
    logger.renderer = renderer
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
    logger.renderer.render({
      type: 'log',
      level: 'info',
      message: msg,
      timestamp: Date.now()
    })
    logger._logToFile('INFO', msg)
  },
  success: (msg: string) => {
    logger.renderer.render({
      type: 'log',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      level: 'success' as any, // Custom level supported by ConsoleRenderer
      message: msg,
      timestamp: Date.now()
    })
    logger._logToFile('SUCCESS', msg)
  },
  warn: (msg: string) => {
    logger.renderer.render({
      type: 'log',
      level: 'warn',
      message: msg,
      timestamp: Date.now()
    })
    logger._logToFile('WARN', msg)
  },
  error: (msg: string) => {
    logger.renderer.render({
      type: 'log',
      level: 'error',
      message: msg,
      timestamp: Date.now()
    })
    logger._logToFile('ERROR', msg)
  },
  debug: (msg: string) => {
    logger.renderer.render({
      type: 'log',
      level: 'debug',
      message: msg,
      timestamp: Date.now()
    })
    logger._logToFile('DEBUG', msg)
  },
  trace: (msg: string) => {
    logger.renderer.render({
      type: 'log',
      level: 'trace',
      message: msg,
      timestamp: Date.now()
    })
    logger._logToFile('TRACE', msg)
  },
  update: (msg: string) => {
    logger.renderer.render({
      type: 'progress:update',
      message: msg,
      timestamp: Date.now()
    })
  },

  startSpinner: (msg: string) => {
    logger.renderer.render({
      type: 'progress:start',
      message: msg,
      timestamp: Date.now()
    })
  },

  stopSpinner: (msg?: string, _symbol?: string) => {
    logger.renderer.render({
      type: 'progress:stop',
      message: msg,
      timestamp: Date.now(),
      success: true // Default to success if not specified
    })
  },

  /**
   * Raw output - bypass all formatting, timestamps, and prefixes
   * Use for pre-formatted output from Table, Banner, or other utilities
   */
  raw: (msg: string, noNewline: boolean = false) => {
    logger.renderer.render({
      type: 'raw',
      content: msg,
      noNewline,
      timestamp: Date.now()
    })
    logger._logToFile('RAW', msg)
  },

  /**
   * Emit a JSON event to stdout
   * Used when outputFormat is 'json'
   */
  jsonEvent: (event: JsonEvent) => {
    logger.renderer.render({
      type: 'json',
      eventType: event.type,
      data: event.data,
      timestamp: Date.now()
    })
  },
}

export async function promptUser(
  question: string,
  defaultValue: string = 'n',
  nonInteractive: boolean = false
): Promise<string> {
  // Ensure any active spinner is stopped before prompting
  logger.stopSpinner()
  
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
  private onEvent?: (event: { type: string; data: unknown }) => void
  private isPaused: boolean = false
  private isAtStartOfLine: boolean = true

  constructor(prefix?: string, onEvent?: (event: { type: string; data: unknown }) => void) {
    this.prefix = prefix || ''
    this.onEvent = onEvent
  }

  pause() {
    this.isPaused = true
  }

  resume() {
    this.isPaused = false
    if (this.buffer) {
      const toLog = this.buffer
      this.buffer = ''
      this.log(toLog)
    }
  }

  log(chunk: string | Buffer) {
    const str = chunk.toString('utf8')
    
    if (this.onEvent) {
      const eventLines = (this.buffer + str).split('\n')
      for (let i = 0; i < eventLines.length - 1; i++) {
        const line = eventLines[i]
        if (this.isEventLine(line)) {
          this.onEvent({
            type: 'POST_TOOL',
            data: { line: line.replace(/^\s*\|\s*/, '') }
          })
        }
      }
    }

    if (this.isPaused) {
      this.buffer += str
      return
    }

    const fullContent = this.buffer + str
    this.buffer = ''
    
    const lines = fullContent.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const isLast = i === lines.length - 1
      
      if (line.length > 0) {
        if (this.isAtStartOfLine) {
          this.printPrefix()
          this.isAtStartOfLine = false
        }
        // Clean up the line: remove leading | and extra spaces from tool output
        let cleanedLine = line.replace(/^\s*\|\s*/, '')
        logger.raw(chalk.dim(cleanedLine), true)
      }
      
      if (!isLast) {
        if (this.isAtStartOfLine) {
          this.printPrefix()
        }
        logger.raw('') 
        this.isAtStartOfLine = true
      }
    }
    
    logger.lastOutputTime = Date.now()
  }

  private isEventLine(line: string): boolean {
    return line.includes('Tool Call:') || 
           line.includes('Running tool') || 
           line.includes('Calling tool') ||
           line.includes('✔ Tool output') ||
           line.includes('✖ Tool error')
  }

  private printPrefix() {
    // Stop spinner before outputting stream
    logger.renderer.render({ type: 'progress:stop', timestamp: Date.now() })
    
    const timestamp = chalk.gray(getTimestamp())
    const separatorStr = chalk.gray(' │')
    const prefixStr = this.prefix ? ` ${chalk.magenta(`[${this.prefix}]`)}` : ''
    
    logger.raw(`${timestamp}${separatorStr}${prefixStr} `, true)
  }

  flush() {
    if (this.isAtStartOfLine && this.buffer) {
      this.log('\n')
    } else if (this.buffer) {
      this.log('') 
    }
    this.buffer = ''
  }
}

// Re-export output utilities for convenience
export { Table, Banner, ProgressBar, CompletionSummary, separator, supportsEmoji, getEmoji, BOX_CHARS } from './output'

// Re-export Ink components from their individual files
export { InkBanner } from '../components/InkBanner'
export { InkCompletionSummary } from '../components/InkCompletionSummary'
export { ProgressBar as InkProgressBar } from '../components/ProgressBar'
export { InkTable } from '../components/InkTable'
export { InkLog } from '../components/InkLog'
export { InkSpinner } from '../components/InkSpinner'
export { InkStream } from '../components/InkStream'

// Helper function to render Ink components interactively (for TTY mode)
export async function renderInkInteractive(element: React.ReactElement): Promise<void> {
  const { render } = await import('ink')
  render(element)
}

// Helper function to render Ink components to string (for non-TTY/JSON mode)
export async function renderInk(element: React.ReactElement): Promise<string> {
  const { render: renderToString } = await import('ink-testing-library')
  const { lastFrame, unmount } = renderToString(element)
  const output = lastFrame() || ''
  unmount()
  return output
}

import crypto from 'crypto'
import chalk from 'chalk'
import type { ILogger } from '@loopwork-ai/contracts'

/**
 * Get current timestamp in HH:MM:SS format
 * @returns Formatted timestamp string
 */
export function getTimestamp(): string {
  // Use 24-hour format for consistent width (always 8 chars: HH:MM:SS)
  return new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

/**
 * Calculate a SHA-256 checksum for an object
 * @param data - The data to hash (string or object)
 * @returns Hex-encoded SHA-256 hash
 */
export function calculateChecksum(data: unknown): string {
  const content = typeof data === 'string' ? data : JSON.stringify(data)
  return crypto.createHash('sha256').update(content).digest('hex')
}

/**
 * Utility for handling streaming output from CLI processes
 * 
 * Provides buffering, line-by-line processing, and visual prefixes
 * for better readability in multi-process environments.
 */
export class StreamLogger {
  private buffer: string = ''
  private prefix: string = ''
  private logger: ILogger
  private onEvent?: (event: { type: string; data: unknown }) => void
  private isPaused: boolean = false
  private isAtStartOfLine: boolean = true

  /**
   * Create a new StreamLogger
   * @param logger - The underlying logger instance to use
   * @param prefix - Optional prefix for each line
   * @param onEvent - Optional event callback for specific line patterns
   */
  constructor(
    logger: ILogger,
    prefix?: string,
    onEvent?: (event: { type: string; data: unknown }) => void
  ) {
    this.logger = logger
    this.prefix = prefix || ''
    this.onEvent = onEvent
  }

  /**
   * Temporarily pause output processing and buffer incoming chunks
   */
  pause() {
    this.isPaused = true
  }

  /**
   * Resume output processing and flush buffered content
   */
  resume() {
    this.isPaused = false
    if (this.buffer) {
      const toLog = this.buffer
      this.buffer = ''
      this.log(toLog)
    }
  }

  /**
   * Process a chunk of data from the stream
   * @param chunk - Data chunk (string or Buffer) to log
   */
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
      const cleanedLine = line.replace(/^\s*\|\s*/, '')
      
      if (cleanedLine.length > 0) {
        if (this.isAtStartOfLine) {
          this.printPrefix()
          this.isAtStartOfLine = false
        }
        this.logger.raw(chalk.dim(cleanedLine), true)
      }
      
      if (!isLast && !this.isAtStartOfLine) {
        this.logger.raw('')
        this.isAtStartOfLine = true
      }
    }
  }

  private isEventLine(line: string): boolean {
    return line.includes('Tool Call:') || 
           line.includes('Running tool') || 
           line.includes('Calling tool') ||
           line.includes('✔ Tool output') ||
           line.includes('✖ Tool error')
  }

  private printPrefix() {
    this.logger.stopSpinner()
    
    const timestamp = String(chalk.gray(getTimestamp()))
    const separatorStr = String(chalk.gray(' │'))
    // Normalize prefix to consistent width (truncate or pad to 35 chars)
    const maxPrefixLen = 35
    let normalizedPrefix = String(this.prefix || '')
    if (normalizedPrefix.length > maxPrefixLen) {
      // Truncate long prefixes, keeping start and end
      normalizedPrefix = normalizedPrefix.slice(0, 20) + '...' + normalizedPrefix.slice(-12)
    }
    normalizedPrefix = normalizedPrefix.padEnd(maxPrefixLen, ' ')
    const prefixStr = String(chalk.magenta(`[${normalizedPrefix}]`))
    
    this.logger.raw(`${timestamp}${separatorStr} ${prefixStr} `, true)
  }

  /**
   * Flush any remaining buffered content to the logger
   */
  flush() {
    if (this.isAtStartOfLine && this.buffer) {
      this.log('\n')
    } else if (this.buffer) {
      this.log('') 
    }
    this.buffer = ''
  }
}

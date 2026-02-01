import crypto from 'crypto'
import chalk from 'chalk'
import type { ILogger } from '@loopwork-ai/contracts'

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

export class StreamLogger {
  private buffer: string = ''
  private prefix: string = ''
  private logger: ILogger
  private onEvent?: (event: { type: string; data: unknown }) => void
  private isPaused: boolean = false
  private isAtStartOfLine: boolean = true

  constructor(
    logger: ILogger,
    prefix?: string,
    onEvent?: (event: { type: string; data: unknown }) => void
  ) {
    this.logger = logger
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
    
    const timestamp = chalk.gray(getTimestamp())
    const separatorStr = chalk.gray(' │')
    const prefixStr = this.prefix ? ` ${chalk.magenta(`[${this.prefix}]`)}` : ''
    
    this.logger.raw(`${timestamp}${separatorStr}${prefixStr} `, true)
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

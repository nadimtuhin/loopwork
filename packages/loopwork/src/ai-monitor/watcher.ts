/**
 * Log File Watcher - Event-driven log monitoring
 */

import fs from 'fs'
import path from 'path'
import { EventEmitter } from 'events'

export interface LogWatcherOptions {
  logFile: string
  debounceMs?: number
}

export interface LogLine {
  line: string
  timestamp: Date
}

/**
 * Event-driven log file watcher
 * Emits 'line' events for new log lines
 */
export class LogWatcher extends EventEmitter {
  private logFile: string
  private debounceMs: number
  private fileSize: number = 0
  private watching: boolean = false
  private watcher: fs.FSWatcher | null = null
  private debounceTimer: NodeJS.Timeout | null = null
  private buffer: string = ''

  constructor(options: LogWatcherOptions) {
    super()
    this.logFile = options.logFile
    this.debounceMs = options.debounceMs || 100
  }

  /**
   * Start watching the log file
   */
  async start(): Promise<void> {
    if (this.watching) {
      return
    }

    // Ensure directory exists
    const dir = path.dirname(this.logFile)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    // Initialize file size (existing content is ignored)
    if (fs.existsSync(this.logFile)) {
      const stats = fs.statSync(this.logFile)
      this.fileSize = stats.size
    } else {
      this.fileSize = 0
    }

    this.watching = true

    // Watch for file changes
    this.watcher = fs.watch(this.logFile, (eventType) => {
      if (eventType === 'change') {
        this.handleFileChange()
      }
    })

    // Handle watcher errors
    this.watcher.on('error', (error) => {
      this.emit('error', error)
    })
  }

  /**
   * Stop watching the log file
   */
  stop(): void {
    if (!this.watching) {
      return
    }

    this.watching = false

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
  }

  /**
   * Handle file change event (debounced)
   */
  private handleFileChange(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    this.debounceTimer = setTimeout(() => {
      this.readNewLines()
    }, this.debounceMs)
  }

  /**
   * Read new lines from the log file
   */
  private readNewLines(): void {
    if (!fs.existsSync(this.logFile)) {
      return
    }

    const stats = fs.statSync(this.logFile)
    const currentSize = stats.size

    // File was truncated or replaced
    if (currentSize < this.fileSize) {
      this.fileSize = 0
      this.buffer = ''
    }

    // No new content
    if (currentSize === this.fileSize) {
      return
    }

    // Read only the new content
    const stream = fs.createReadStream(this.logFile, {
      start: this.fileSize,
      end: currentSize
    })

    stream.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf8')
      this.processBuffer()
    })

    stream.on('end', () => {
      this.fileSize = currentSize
    })

    stream.on('error', (error) => {
      this.emit('error', error)
    })
  }

  /**
   * Process buffered content and emit line events
   */
  private processBuffer(): void {
    const lines = this.buffer.split('\n')

    // Keep the last incomplete line in buffer
    this.buffer = lines.pop() || ''

    // Emit complete lines
    for (const line of lines) {
      if (line.trim()) {
        this.emit('line', {
          line: line,
          timestamp: new Date()
        } as LogLine)
      }
    }
  }

  /**
   * Check if watcher is currently active
   */
  isWatching(): boolean {
    return this.watching
  }
}

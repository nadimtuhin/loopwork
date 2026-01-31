/**
 * Log File Watcher - Event-driven log monitoring with chokidar
 * Uses chokidar for event-driven watching with 2s polling fallback
 */

import fs from 'fs'
import path from 'path'
import { EventEmitter } from 'events'
import chokidar from 'chokidar'

export interface LogWatcherOptions {
  logFile: string
  debounceMs?: number
  pollIntervalMs?: number  // Default: 2000ms as per PRD
  usePolling?: boolean     // Default: true (reliability fallback)
}

export interface LogLine {
  line: string
  timestamp: Date
}

/**
 * Event-driven log file watcher using chokidar
 * Emits 'line' events for new log lines
 * Uses event-driven mode with 2s polling fallback for reliability
 */
export class LogWatcher extends EventEmitter {
  private logFile: string
  private debounceMs: number
  private pollIntervalMs: number
  private usePolling: boolean
  private fileSize: number = 0
  private watching: boolean = false
  private watcher: chokidar.FSWatcher | null = null
  private debounceTimer: NodeJS.Timeout | null = null
  private buffer: string = ''
  private pollingTimer: NodeJS.Timeout | null = null

  constructor(options: LogWatcherOptions) {
    super()
    this.logFile = options.logFile
    this.debounceMs = options.debounceMs || 100
    this.pollIntervalMs = options.pollIntervalMs || 2000  // PRD: 2s polling
    this.usePolling = options.usePolling !== false  // Default: true
  }

  /**
   * Start watching the log file
   * Uses chokidar with event-driven + polling fallback
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

    // Create file if it doesn't exist
    if (!fs.existsSync(this.logFile)) {
      fs.writeFileSync(this.logFile, '')
      this.fileSize = 0
    } else {
      // Initialize file size (existing content is ignored)
      const stats = fs.statSync(this.logFile)
      this.fileSize = stats.size
    }

    this.watching = true

    // Setup chokidar watcher with event-driven + polling fallback
    const chokidarOptions: chokidar.WatchOptions = {
      persistent: true,
      ignoreInitial: true,  // Don't emit events for existing files
      usePolling: this.usePolling,  // Enable polling fallback
      interval: this.pollIntervalMs,  // PRD: 2s polling interval
      binaryInterval: this.pollIntervalMs,
      awaitWriteFinish: {
        stabilityThreshold: this.debounceMs,
        pollInterval: 100
      }
    }

    this.watcher = chokidar.watch(this.logFile, chokidarOptions)

    // Handle file changes (event-driven)
    this.watcher.on('change', () => {
      this.handleFileChange()
    })

    // Handle file additions
    this.watcher.on('add', () => {
      this.handleFileChange()
    })

    // Handle errors
    this.watcher.on('error', (error) => {
      this.emit('error', error)
    })

    // Also setup manual polling as additional reliability layer
    if (this.usePolling) {
      this.startPolling()
    }
  }

  /**
   * Stop watching the log file
   */
  stop(): void {
    if (!this.watching) {
      return
    }

    this.watching = false

    // Clear debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    // Clear polling timer
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer)
      this.pollingTimer = null
    }

    // Close chokidar watcher
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
  }

  /**
   * Start manual polling as reliability fallback
   * Polls every 2 seconds to check for missed changes
   */
  private startPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer)
    }

    let lastCheckSize = this.fileSize

    this.pollingTimer = setInterval(() => {
      if (!fs.existsSync(this.logFile)) {
        return
      }

      try {
        const stats = fs.statSync(this.logFile)
        const currentSize = stats.size

        // Detect changes that chokidar might have missed
        if (currentSize !== lastCheckSize) {
          lastCheckSize = currentSize
          this.handleFileChange()
        }
      } catch (error) {
        // File might have been deleted
        this.emit('error', error instanceof Error ? error : new Error(String(error)))
      }
    }, this.pollIntervalMs)
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

    stream.on('data', (chunk: string | Buffer) => {
      this.buffer += (typeof chunk === 'string' ? chunk : chunk.toString('utf8'))
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

  /**
   * Get current file size
   */
  getFileSize(): number {
    return this.fileSize
  }
}

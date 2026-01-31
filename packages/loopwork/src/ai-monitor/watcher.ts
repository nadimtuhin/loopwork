import chokidar from 'chokidar'
import fs from 'fs'
import { logger } from '../core/utils'

interface LogLineEvent {
  line: string
  file: string
  timestamp: Date
}

type EventHandler = (event: LogLineEvent) => void

/**
 * LogWatcher - Event-driven log file watcher
 *
 * Watches log files for changes and emits events for new lines.
 * Supports event-driven, polling, and dual (both) modes.
 */
export class LogWatcher {
  private eventHandlers: Map<string, Set<EventHandler>> = new Map()
  private watchers: Map<string, chokidar.FSWatcher> = new Map()
  private filePositions: Map<string, number> = new Map()
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map()
  private lastPollContent: Map<string, string> = new Map()
  private mode: 'event-driven' | 'polling' | 'dual' = 'event-driven'
  private pollingIntervalMs: number

  constructor(
    private logPaths: string[],
    options: {
      mode?: 'event-driven' | 'polling' | 'dual'
      pollingIntervalMs?: number
    } = {}
  ) {
    this.mode = options.mode || 'event-driven'
    this.pollingIntervalMs = options.pollingIntervalMs || 2000
  }

  /**
   * Register event handler
   */
  on(event: string, handler: EventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set())
    }
    this.eventHandlers.get(event)!.add(handler)
  }

  /**
   * Unregister event handler
   */
  off(event: string, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(event)
    if (handlers) {
      handlers.delete(handler)
    }
  }

  /**
   * Emit event to all handlers
   */
  private emit(event: string, data: LogLineEvent): void {
    const handlers = this.eventHandlers.get(event)
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data)
        } catch (error) {
          logger.error(`Error in event handler for '${event}': ${error}`)
        }
      }
    }
  }

  /**
   * Start watching log files
   */
  start(): void {
    for (const logPath of this.logPaths) {
      if (this.mode === 'event-driven' || this.mode === 'dual') {
        this.setupEventWatcher(logPath)
      }

      if (this.mode === 'polling' || this.mode === 'dual') {
        this.setupPolling(logPath)
      }
    }

    logger.debug(`LogWatcher started: ${this.logPaths.join(', ')}`)
    logger.debug(`Mode: ${this.mode}`)
  }

  /**
   * Setup event-driven watcher using chokidar
   */
  private setupEventWatcher(logPath: string): void {
    const watcher = chokidar.watch(logPath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 10,
      },
    })

    watcher.on('change', (filePath) => {
      this.handleFileChange(filePath)
    })

    watcher.on('error', (error) => {
      logger.error(`LogWatcher error on ${logPath}: ${error}`)
    })

    this.watchers.set(logPath, watcher)
  }

  /**
   * Setup polling watcher as fallback
   */
  private setupPolling(logPath: string): void {
    const interval = setInterval(() => {
      this.pollFile(logPath)
    }, this.pollingIntervalMs)

    this.pollingIntervals.set(logPath, interval)
  }

  /**
   * Poll file for changes
   */
  private pollFile(logPath: string): void {
    try {
      const content = fs.readFileSync(logPath, 'utf-8')
      const lastContent = this.lastPollContent.get(logPath) || ''

      if (content !== lastContent) {
        const lastPosition = this.filePositions.get(logPath) || 0
        const newContent = content.slice(lastPosition)

        if (newContent.trim()) {
          const newLines = newContent.split('\n').filter(line => line.trim())
          for (const line of newLines) {
            this.emit('line', { line, file: logPath, timestamp: new Date() })
          }

          this.lastPollContent.set(logPath, content)
          this.filePositions.set(logPath, content.length)
        }
      }
    } catch (error) {
      logger.error(`Error polling log file ${logPath}: ${error}`)
    }
  }

  /**
   * Handle file change event
   */
  private handleFileChange(logPath: string): void {
    try {
      const content = fs.readFileSync(logPath, 'utf-8')
      const position = this.filePositions.get(logPath) || 0

      if (content.length > position) {
        const newContent = content.slice(position)
        const newLines = newContent.split('\n')

        for (const line of newLines) {
          if (line.trim()) {
            this.emit('line', { line, file: logPath, timestamp: new Date() })
          }
        }

        this.filePositions.set(logPath, content.length)
      }
    } catch (error) {
      logger.error(`Error reading log file ${logPath}: ${error}`)
    }
  }

  /**
   * Stop watching all log files
   */
  async stop(): Promise<void> {
    for (const [_logPath, watcher] of this.watchers) {
      await watcher.close()
    }

    for (const [_logPath, interval] of this.pollingIntervals) {
      clearInterval(interval)
    }

    this.watchers.clear()
    this.pollingIntervals.clear()
    this.filePositions.clear()
    this.lastPollContent.clear()

    logger.debug('LogWatcher stopped')
  }

  /**
   * Get current position in file (for resuming)
   */
  getPosition(logPath: string): number {
    return this.filePositions.get(logPath) || 0
  }

  /**
   * Set position in file (for resuming)
   */
  setPosition(logPath: string, position: number): void {
    this.filePositions.set(logPath, position)
  }
}

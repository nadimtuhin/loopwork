import chalk from 'chalk'
import ora, { type Ora } from 'ora'
import { BaseRenderer } from './renderer'
import type {
  OutputEvent,
  OutputConfig,
  LogEvent,
  ProgressStartEvent,
  ProgressUpdateEvent,
  ProgressStopEvent,
  RawOutputEvent,
  JsonOutputEvent,
} from './contracts'

function getTimestamp(): string {
  return new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

export class ConsoleRenderer extends BaseRenderer {
  readonly name = 'console'
  readonly isSupported = true
  private activeSpinner: Ora | null = null

  constructor(config: OutputConfig) {
    super(config)
  }

  render(event: OutputEvent): void {
    if (this.disposed) return

    switch (event.type) {
      case 'log':
        this.handleLog(event as LogEvent)
        break
      case 'progress:start':
        this.handleProgressStart(event as ProgressStartEvent)
        break
      case 'progress:update':
        this.handleProgressUpdate(event as ProgressUpdateEvent)
        break
      case 'progress:stop':
        this.handleProgressStop(event as ProgressStopEvent)
        break
      case 'raw':
        this.handleRaw(event as RawOutputEvent)
        break
      case 'json':
        this.handleJson(event as JsonOutputEvent)
        break
    }
  }

  private stopActiveSpinner() {
    if (this.activeSpinner) {
      this.activeSpinner.stop()
      this.activeSpinner = null
    }
  }

  private handleLog(event: LogEvent): void {
    if (!this.shouldLog(event.level)) return

    // Suppress console output in JSON mode
    if (this.config.mode === 'json') return

    this.stopActiveSpinner()
    process.stdout.write('\r\x1b[K')

    const timestamp = chalk.gray(getTimestamp())
    let prefix = ''
    let message = event.message

    switch (event.level) {
      case 'info':
        prefix = chalk.blue('ℹ️ INFO:')
        process.stdout.write(`${timestamp} ${prefix} ${message}\n`)
        break
      case 'warn':
        prefix = chalk.yellow('⚠️ WARN:')
        process.stdout.write(`${timestamp} ${prefix} ${message}\n`)
        break
      case 'error':
        prefix = chalk.red('❌ ERROR:')
        process.stderr.write(`${timestamp} ${prefix} ${message}\n`)
        break
      case 'debug':
        prefix = chalk.cyan('[DEBUG]')
        process.stdout.write(`${timestamp} ${prefix} ${message}\n`)
        break
      case 'trace':
        prefix = chalk.dim('[TRACE]')
        process.stdout.write(`${timestamp} ${prefix} ${message}\n`)
        break
      // Custom "success" level mapping to info with green check
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      case 'success' as any: // Handling custom levels if passed
        prefix = chalk.green('✅ SUCCESS:')
        process.stdout.write(`${timestamp} ${prefix} ${message}\n`)
        break
      default:
        process.stdout.write(`${timestamp} ${message}\n`)
    }
  }

  private handleProgressStart(event: ProgressStartEvent): void {
    if (this.config.mode === 'json' || this.config.logLevel === 'error') return
    
    // In non-TTY or debug mode, log as info instead of spinner
    if (process.env.LOOPWORK_DEBUG === 'true' || !process.stdout.isTTY) {
      this.handleLog({ 
        type: 'log', 
        level: 'info', 
        message: event.message, 
        timestamp: event.timestamp 
      })
      return
    }

    if (this.activeSpinner) {
      this.activeSpinner.text = event.message
      return
    }

    this.activeSpinner = ora({
      text: event.message,
      color: 'blue',
      spinner: 'dots',
    }).start()
  }

  private handleProgressUpdate(event: ProgressUpdateEvent): void {
    if (this.config.mode === 'json' || this.config.logLevel === 'error') return

    if (this.activeSpinner) {
      this.activeSpinner.text = event.message
    } else {
      // Fallback update logic similar to original logger.update
      const terminalWidth = process.stdout.columns || 120
      const timestamp = getTimestamp()
      const prefix = `${chalk.gray(timestamp)} ${chalk.blue('[INFO]')} `
      const prefixLength = timestamp.length + 1 + '[INFO] '.length
      const availableWidth = Math.max(10, terminalWidth - prefixLength - 5)

      let displayMsg = event.message
      if (event.message.length > availableWidth) {
        displayMsg = event.message.substring(0, availableWidth - 3) + '...'
      }

      process.stdout.write(`\r\x1b[K${prefix}${displayMsg}`)
    }
  }

  private handleProgressStop(event: ProgressStopEvent): void {
    if (!this.activeSpinner) {
      if (event.message && this.config.mode !== 'json') {
        this.handleLog({
          type: 'log',
          level: 'info',
          message: event.message,
          timestamp: event.timestamp
        })
      }
      return
    }

    if (event.message) {
      this.activeSpinner.stopAndPersist({
        symbol: event.success ? chalk.green('✓') : chalk.red('✗'),
        text: event.message
      })
    } else {
      this.activeSpinner.stop()
    }
    this.activeSpinner = null
  }

  private handleRaw(event: RawOutputEvent): void {
    this.stopActiveSpinner()
    process.stdout.write('\r\x1b[K')
    process.stdout.write(event.content + '\n')
  }

  private handleJson(event: JsonOutputEvent): void {
    this.stopActiveSpinner()
    const output = {
      type: event.eventType,
      data: event.data
    }
    process.stdout.write(JSON.stringify(output) + '\n')
  }
}

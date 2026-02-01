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
  WorkerStatusEvent,
} from './contracts'

function getTimestamp(): string {
  // Use 24-hour format for consistent width (always 8 chars: HH:MM:SS)
  return new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

export class ConsoleRenderer extends BaseRenderer {
  readonly name = 'console'
  readonly isSupported = true
  private activeSpinner: Ora | null = null
  private lastStatus: {
    totalWorkers: number
    activeWorkers: number
    pendingTasks: number
    runningTasks: number
    completedTasks: number
    failedTasks: number
  } | null = null

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
      case 'worker:status':
        this.handleWorkerStatus(event as WorkerStatusEvent)
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
      const timestamp = getTimestamp()
      const prefix = `${chalk.gray(timestamp)} ${chalk.blue('[INFO]')} `
      process.stdout.write(`\r\x1b[K${prefix}${event.message}`)
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
    if (!event.noNewline) {
      process.stdout.write('\r\x1b[K')
    }
    process.stdout.write(event.content + (event.noNewline ? '' : '\n'))
  }

  private handleJson(event: JsonOutputEvent): void {
    this.stopActiveSpinner()
    const output = {
      type: event.eventType,
      data: event.data
    }
    process.stdout.write(JSON.stringify(output) + '\n')
  }

  private handleWorkerStatus(event: WorkerStatusEvent): void {
    this.lastStatus = {
      totalWorkers: event.totalWorkers,
      activeWorkers: event.activeWorkers,
      pendingTasks: event.pendingTasks,
      runningTasks: event.runningTasks,
      completedTasks: event.completedTasks,
      failedTasks: event.failedTasks,
    }

    // Only show status bar in non-JSON mode
    if (this.config.mode === 'json') return

    // Don't show status if no workers configured yet
    if (event.totalWorkers === 0) return

    this.stopActiveSpinner()
    
    // Clear line and render status bar
    process.stdout.write('\r\x1b[K')
    
    const statusLine = this.formatStatusBar(event)
    process.stdout.write(chalk.blue('│ ') + statusLine + '\n')
  }

  private formatStatusBar(status: WorkerStatusEvent): string {
    const parts: string[] = []
    
    // Workers section
    parts.push(chalk.bold('Workers:'))
    parts.push(chalk.yellow(String(status.activeWorkers)) + chalk.gray('/') + String(status.totalWorkers))
    
    parts.push(chalk.gray('│'))
    
    // Tasks section
    parts.push(chalk.bold('Tasks:'))
    
    if (status.pendingTasks > 0) {
      parts.push(chalk.cyan(String(status.pendingTasks)) + chalk.gray(' pending'))
    }
    
    if (status.runningTasks > 0) {
      if (status.pendingTasks > 0) parts.push(chalk.gray('·'))
      parts.push(chalk.yellow(String(status.runningTasks)) + chalk.gray(' running'))
    }
    
    if (status.completedTasks > 0) {
      if (status.pendingTasks > 0 || status.runningTasks > 0) parts.push(chalk.gray('·'))
      parts.push(chalk.green(String(status.completedTasks)) + chalk.gray(' done'))
    }
    
    if (status.failedTasks > 0) {
      parts.push(chalk.gray('·'))
      parts.push(chalk.red(String(status.failedTasks)) + chalk.gray(' failed'))
    }
    
    return parts.join(' ')
  }
}

import ora, { Ora } from 'ora'

export class Spinner {
  private spinner: Ora | null = null
  private startTime: number = 0
  private message: string = ''
  private currentOperation: string = ''

  constructor() {
    this.startTime = Date.now()
  }

  start(message: string, operation: string = ''): void {
    this.message = message
    this.currentOperation = operation
    this.startTime = Date.now()

    if (!process.stdout.isTTY) {
      process.stdout.write(`${message}\n`)
      return
    }

    this.spinner = ora(message).start()
  }

  text(message: string): void {
    if (this.spinner) {
      this.spinner.text = message
      this.message = message
    }
  }

  updateWithElapsed(message?: string): void {
    if (!this.spinner) {
      return
    }

    const elapsed = Date.now() - this.startTime
    const showElapsed = elapsed > 10000

    if (showElapsed) {
      const elapsedStr = this.formatElapsed(elapsed)
      const updatedMessage = message ? `${message} | ${elapsedStr}` : elapsedStr
      this.spinner.text = updatedMessage
    } else {
      if (message) {
        this.spinner.text = message
      }
    }
  }

  succeed(message?: string, symbol: string = '✓'): void {
    if (this.spinner) {
      this.spinner.succeed(message || this.message)
      this.spinner = null
    } else {
      process.stdout.write(`${symbol} ${message || this.message}\n`)
    }
  }

  warn(message: string): void {
    if (this.spinner) {
      this.spinner.warn(message)
      this.spinner = null
    } else {
      process.stdout.write(`⚠️  ${message}\n`)
    }
  }

  fail(message: string): void {
    if (this.spinner) {
      this.spinner.fail(message)
      this.spinner = null
    } else {
      process.stdout.write(`✗ ${message}\n`)
    }
  }

  info(message: string): void {
    if (this.spinner) {
      this.spinner.info(message)
      this.spinner = null
    } else {
      process.stdout.write(`ℹ️  ${message}\n`)
    }
  }

  getElapsed(): string {
    return this.formatElapsed(Date.now() - this.startTime)
  }

  private formatElapsed(ms: number): string {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60

    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`
    }
    return `${seconds}s`
  }

  isActive(): boolean {
    return this.spinner !== null
  }

  clearLine(): void {
    if (process.stdout.isTTY && this.spinner) {
      process.stdout.clearLine(0)
      process.stdout.cursorTo(0)
    }
  }
}

export function createSpinner(): Spinner {
  return new Spinner()
}

export function withSpinner<T>(
  message: string,
  operation: string,
  fn: () => Promise<T>,
  deps?: { logger?: any }
): Promise<T> {
  const spinner = createSpinner()
  spinner.start(message, operation)

  return fn()
    .then((result) => {
      spinner.succeed(`${operation} completed`)
      return result
    })
    .catch((error) => {
      spinner.fail(`${operation} failed: ${error.message}`)
      throw error
    })
}

export function shouldUseSpinner(): boolean {
  return process.stdout.isTTY && !process.env.DEBUG?.includes('loopwork')
}

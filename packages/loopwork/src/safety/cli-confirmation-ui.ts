/**
 * CLI Confirmation UI Implementation
 *
 * Uses Node.js readline for terminal-based user confirmation prompts.
 */

import type {
  IConfirmationUI,
  ConfirmationRequest,
  ConfirmationResult,
  RiskLevel,
  UIOptions
} from './ui-abstraction'

const logger = {
  debug: (msg: string) => {
    if (process.env.LOOPWORK_DEBUG) {
      process.stderr.write(msg + '\n')
    }
  }
}

/**
 * CLI-based confirmation UI
 */
export class CLIConfirmationUI implements IConfirmationUI {
  readonly type = 'cli'
  readonly isAvailable = process.stdin.isTTY && process.stdout.isTTY
  readonly isPrompting = false

  private options: Required<UIOptions>

  constructor(options: UIOptions = {}) {
    this.options = {
      autoConfirmNonInteractive: options.autoConfirmNonInteractive ?? false,
      autoConfirmCI: options.autoConfirmCI ?? false,
      debug: options.debug ?? false,
      prefix: options.prefix ?? 'Loopwork'
    }
  }

  async confirm(request: ConfirmationRequest): Promise<ConfirmationResult> {
    const { requestId, taskId, title, riskLevel, reasons, timeout = 30000 } = request

    logger.debug(`CLI confirmation request: ${requestId}`)

    // Check non-interactive mode
    const nonInteractive = this.isNonInteractiveMode()
    if (nonInteractive) {
      logger.debug('Non-interactive mode detected, auto-confirming')
      return {
        confirmed: this.options.autoConfirmNonInteractive ?? true,
        timedOut: false,
        nonInteractive: true,
        requestId
      }
    }

    // Check TTY availability
    if (!this.isAvailable) {
      logger.debug('No TTY available, auto-confirming')
      return {
        confirmed: true,
        timedOut: false,
        nonInteractive: true,
        requestId
      }
    }

    // Display risk information
    this.displayRiskInfo(requestId, title, riskLevel, reasons)

    // Handle IPC mode
    if (this.isIPCMode()) {
      return this.handleIPCMode(request)
    }

    // Prompt for confirmation
    return this.promptUser(timeout)
  }

  async approve(requestId: string, reason?: string): Promise<boolean> {
    logger.debug(`CLI: Approved confirmation request ${requestId}`)
    return true
  }

  async deny(requestId: string, reason?: string): Promise<boolean> {
    logger.debug(`CLI: Denied confirmation request ${requestId}`)
    return true
  }

  cancel(): void {
    logger.debug('CLI: Cancelled confirmation prompt')
  }

  /**
   * Check if running in non-interactive mode
   */
  private isNonInteractiveMode(): boolean {
    return (
      process.env.LOOPWORK_NON_INTERACTIVE === 'true' ||
      process.env.CI === 'true' ||
      process.argv.includes('-y') ||
      process.argv.includes('--yes')
    )
  }

  /**
   * Check if running in IPC mode
   */
  private isIPCMode(): boolean {
    return process.env.LOOPWORK_IPC === 'true'
  }

  /**
   * Display risk information to user
   */
  private displayRiskInfo(requestId: string, title: string, riskLevel: RiskLevel, reasons: string[]): void {
    const riskInfo = this.getRiskInfo(riskLevel)

    process.stdout.write('\n')
    process.stdout.write(`${riskInfo.emoji}  Safety Confirmation Required\n`)
    process.stdout.write('\n')
    process.stdout.write(`${this.options.prefix}: ${title}\n`)
    process.stdout.write('\n')
    process.stdout.write(`${riskInfo.color}Risk Level: ${riskInfo.label}${this.resetColor()}\n`)
    process.stdout.write('\n')

    if (reasons.length > 0) {
      process.stdout.write('Risk Factors:\n')
      reasons.forEach((reason, i) => {
        process.stdout.write(`  ${i + 1}. ${reason}\n`)
      })
      process.stdout.write('\n')
    }

    process.stdout.write('This task requires your explicit confirmation.\n')
  }

  /**
   * Get risk level metadata
   */
  private getRiskInfo(riskLevel: RiskLevel): { emoji: string; color: string; label: string } {
    const levels = {
      low: { emoji: '🟢', color: '\x1b[32m', label: 'LOW' },
      medium: { emoji: '🟡', color: '\x1b[33m', label: 'MEDIUM' },
      high: { emoji: '🟠', color: '\x1b[93m', label: 'HIGH' },
      critical: { emoji: '🔴', color: '\x1b[91m', label: 'CRITICAL' }
    }
    return levels[riskLevel] || levels.low
  }

  /**
   * Reset ANSI color
   */
  private resetColor(): string {
    return '\x1b[0m'
  }

  /**
   * Handle IPC mode by emitting approval request
   */
  private handleIPCMode(request: ConfirmationRequest): Promise<ConfirmationResult> {
    return new Promise((resolve) => {
      const message = {
        type: 'ipc',
        version: '1.0',
        event: 'approval_request',
        data: {
          requestId: request.requestId,
          taskId: request.taskId,
          title: request.title,
          description: request.reasons.join('\n'),
          severity: request.riskLevel === 'critical' || request.riskLevel === 'high' ? 'high' : request.riskLevel === 'medium' ? 'medium' : 'low',
          timeout: Math.floor(request.timeout / 1000)
        },
        timestamp: Date.now(),
        messageId: require('crypto').randomUUID()
      }

      process.stdout.write(`__IPC_START__${JSON.stringify(message)}__IPC_END__\n`)

      // Set timeout to auto-resolve
      setTimeout(() => {
        resolve({
          confirmed: false,
          timedOut: true,
          nonInteractive: false,
          requestId: 'timeout'
        })
      }, request.timeout ?? 30000)
    })
  }

  /**
   * Prompt user for confirmation
   */
  private async promptUser(timeout: number = 30000): Promise<ConfirmationResult> {
    return new Promise((resolve) => {
      const readline = require('readline')
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      })

      const timeoutId = setTimeout(() => {
        rl.close()
        resolve({
          confirmed: false,
          timedOut: true,
          nonInteractive: false,
          requestId: 'timeout'
        })
      }, timeout)

      rl.question('Continue with this task? [Y/n] ', (answer: string) => {
        clearTimeout(timeoutId)
        rl.close()
        const confirmed = answer.toLowerCase() !== 'n'
        resolve({
          confirmed,
          timedOut: false,
          nonInteractive: false,
          requestId: 'user'
        })
      })
    })
  }
}

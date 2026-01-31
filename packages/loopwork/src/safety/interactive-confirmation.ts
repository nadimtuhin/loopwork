/**
 * Interactive Confirmation System
 *
 * Provides user confirmation prompts for safety-critical operations
 */

import type { ConfirmationRequest, ConfirmationResult, RiskLevel } from '../contracts'

const logger = {
  debug: (msg: string) => {
    if (process.env.LOOPWORK_DEBUG) {
      process.stderr.write(msg + '\n')
    }
  }
}

/**
 * Interactive confirmation for safety checks
 *
 * Prompts user to confirm high-risk tasks before execution.
 * Respects TTY status, non-interactive mode, and timeouts.
 */
export class InteractiveConfirmation {
  private timeout: number

  constructor(timeout: number = 30000) {
    this.timeout = timeout
  }

  /**
   * Request user confirmation for a task
   */
  async confirm(request: ConfirmationRequest): Promise<ConfirmationResult> {
    const { taskId, title, riskLevel, reasons, timeout = this.timeout } = request

    logger.debug(`Confirmation request for ${taskId} at risk level ${riskLevel}`)

    // Check non-interactive mode
    const nonInteractive = this.isNonInteractiveMode()
    if (nonInteractive) {
      logger.debug('Non-interactive mode, auto-confirming')
      return {
        confirmed: true,
        timedOut: false,
        nonInteractive: true
      }
    }

    // Check TTY availability
    if (!this.isTTY()) {
      logger.debug('No TTY available, auto-confirming')
      return {
        confirmed: true,
        timedOut: false,
        nonInteractive: true
      }
    }

    // Display risk assessment
    this.displayRiskInfo(taskId, title, riskLevel, reasons)

    // If not a TTY but we want to support IPC, emit approval request
    if (!this.isTTY() && process.env.LOOPWORK_IPC === 'true') {
      const message = {
        type: 'ipc',
        version: '1.0',
        event: 'approval_request',
        data: {
          action: title,
          description: reasons.join('\n'),
          severity: riskLevel === 'critical' || riskLevel === 'high' ? 'high' : riskLevel === 'medium' ? 'medium' : 'low',
          timeout: Math.floor(timeout / 1000)
        },
        timestamp: Date.now(),
        messageId: require('crypto').randomUUID()
      }
      process.stdout.write(`__IPC_START__${JSON.stringify(message)}__IPC_END__\n`)
    }

    // Prompt for confirmation
    return this.promptUser(timeout)
  }

  /**
   * Check if running in non-interactive mode
   * Public method for external access by safety plugin
   */
  public isNonInteractiveMode(): boolean {
    return (
      process.env.LOOPWORK_NON_INTERACTIVE === 'true' ||
      process.env.CI === 'true' ||
      process.argv.includes('-y') ||
      process.argv.includes('--yes')
    )
  }

  /**
   * Check if running in a TTY
   */
  private isTTY(): boolean {
    return process.stdin.isTTY && process.stdout.isTTY
  }

  /**
   * Display risk information to user
   */
  private displayRiskInfo(taskId: string, title: string, riskLevel: RiskLevel, reasons: string[]): void {
    const riskEmoji = this.getRiskEmoji(riskLevel)
    const riskColor = this.getRiskColor(riskLevel)

    process.stdout.write('\n')
    process.stdout.write(`${riskEmoji}  Safety Confirmation Required\n`)
    process.stdout.write('\n')
    process.stdout.write(`Task: ${taskId}\n`)
    process.stdout.write(`Title: ${title}\n`)
    process.stdout.write('\n')
    process.stdout.write(`${riskColor}Risk Level: ${riskLevel.toUpperCase()}\n`)
    process.stdout.write('\n')

    if (reasons.length > 0) {
      process.stdout.write('Risk Factors:\n')
      reasons.forEach((reason, i) => {
        process.stdout.write(`  ${i + 1}. ${reason}\n`)
      })
      process.stdout.write('\n')
    }
  }

  /**
   * Get emoji for risk level
   */
  private getRiskEmoji(riskLevel: RiskLevel): string {
    const emojis = {
      low: '🟢',
      medium: '🟡',
      high: '🟠',
      critical: '🔴'
    }
    return emojis[riskLevel] || '⚠️'
  }

  /**
   * Get ANSI color code for risk level
   */
  private getRiskColor(riskLevel: RiskLevel): string {
    const colors = {
      low: '\x1b[32m', // green
      medium: '\x1b[33m', // yellow
      high: '\x1b[93m', // bright yellow
      critical: '\x1b[91m' // red
    }
    return colors[riskLevel] || '\x1b[0m'
  }

  /**
   * Prompt user for confirmation with timeout
   */
  private async promptUser(timeout: number): Promise<ConfirmationResult> {
    return new Promise((resolve) => {
      const readline = require('readline')
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      })

      // Set timeout
      const timeoutId = setTimeout(() => {
        rl.close()
        resolve({
          confirmed: false,
          timedOut: true,
          nonInteractive: false
        })
      }, timeout)

      // Handle interruption
      rl.on('SIGINT', () => {
        clearTimeout(timeoutId)
        rl.close()
        process.stdout.write('\n')
        resolve({
          confirmed: false,
          timedOut: false,
          nonInteractive: false
        })
      })

      rl.question('Continue with this task? [Y/n] ', (answer: string) => {
        clearTimeout(timeoutId)
        rl.close()
        const confirmed = answer.toLowerCase() !== 'n'
        resolve({
          confirmed,
          timedOut: false,
          nonInteractive: false
        })
      })
    })
  }
}

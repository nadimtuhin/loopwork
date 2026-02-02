import type { ConfirmationRequest, ConfirmationResult } from '@loopwork-ai/loopwork/contracts'
import { logger } from '@loopwork-ai/common'
import * as readline from 'readline'

export interface ApprovalOptions {
  timeout?: number
  autoApproveNonInteractive?: boolean
}

export class ApprovalGate {
  private timeout: number
  private autoApproveNonInteractive: boolean

  constructor(options: ApprovalOptions = {}) {
    this.timeout = options.timeout ?? 60000
    this.autoApproveNonInteractive = options.autoApproveNonInteractive ?? true
  }

  async askApproval(request: ConfirmationRequest): Promise<ConfirmationResult> {
    const { taskId, riskLevel, timeout = this.timeout } = request

    logger.debug(`Approval requested for task ${taskId} (Risk: ${riskLevel})`)

    if (this.isNonInteractive()) {
      if (this.autoApproveNonInteractive) {
        logger.info(`HITL: Non-interactive mode, auto-approving task ${taskId}`)
        return { confirmed: true, timedOut: false, nonInteractive: true }
      } else {
        logger.warn(`HITL: Non-interactive mode, blocking task ${taskId}`)
        return { confirmed: false, timedOut: false, nonInteractive: true }
      }
    }

    if (!this.isTTY()) {
      if (process.env.LOOPWORK_IPC === 'true') {
        return this.askViaIPC(request, timeout)
      }
      
      logger.info(`HITL: No TTY or IPC available, auto-approving task ${taskId}`)
      return { confirmed: true, timedOut: false, nonInteractive: true }
    }

    this.displayRequest(request)
    return this.askViaTTY(timeout)
  }

  private isNonInteractive(): boolean {
    return (
      process.env.LOOPWORK_NON_INTERACTIVE === 'true' ||
      process.env.CI === 'true' ||
      process.argv.includes('-y') ||
      process.argv.includes('--yes')
    )
  }

  private isTTY(): boolean {
    return !!(process.stdin.isTTY && process.stdout.isTTY)
  }

  private displayRequest(request: ConfirmationRequest): void {
    const { taskId, title, riskLevel, reasons } = request
    const colors = {
      low: '\x1b[32m',
      medium: '\x1b[33m',
      high: '\x1b[93m',
      critical: '\x1b[91m',
      reset: '\x1b[0m'
    }

    const color = colors[riskLevel as keyof typeof colors] || colors.reset
    
    process.stdout.write('\n' + '='.repeat(60) + '\n')
    process.stdout.write(`🔒 GOVERNANCE: APPROVAL REQUIRED\n`)
    process.stdout.write('='.repeat(60) + '\n\n')
    process.stdout.write(`Task:  ${taskId}\n`)
    process.stdout.write(`Title: ${title}\n`)
    process.stdout.write(`Risk:  ${color}${riskLevel.toUpperCase()}${colors.reset}\n\n`)

    if (reasons.length > 0) {
      process.stdout.write('Reasons for approval requirement:\n')
      reasons.forEach((r, i) => process.stdout.write(`  ${i + 1}. ${r}\n`))
      process.stdout.write('\n')
    }
  }

  private async askViaTTY(timeout: number): Promise<ConfirmationResult> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      })

      const timer = setTimeout(() => {
        rl.close()
        process.stdout.write('\n⏰ Approval request timed out.\n')
        resolve({ confirmed: false, timedOut: true, nonInteractive: false })
      }, timeout)

      rl.question('Approve this task? [y/N] ', (answer) => {
        clearTimeout(timer)
        rl.close()
        const confirmed = answer.toLowerCase() === 'y'
        resolve({ confirmed, timedOut: false, nonInteractive: false })
      })
    })
  }

  private async askViaIPC(request: ConfirmationRequest, timeout: number): Promise<ConfirmationResult> {
    const message = {
      type: 'ipc',
      version: '1.0',
      event: 'approval_request',
      data: {
        taskId: request.taskId,
        action: request.title,
        description: request.reasons.join('\n'),
        severity: request.riskLevel,
        timeout: Math.floor(timeout / 1000)
      },
      timestamp: Date.now(),
      messageId: `msg_${Date.now()}`
    }

    process.stdout.write(`__IPC_START__${JSON.stringify(message)}__IPC_END__\n`)

    return this.askViaTTY(timeout)
  }
}

import { IInteractiveConfirmation, RiskLevel, OperationCategory, RiskAssessment, ConfirmationState } from '@loopwork-ai/contracts'
import * as readline from 'readline'
import { randomUUID } from 'crypto'

export class InteractiveConfirmation implements IInteractiveConfirmation {
  private autoApprovals: Set<RiskLevel> = new Set()

  async requestConfirmation(
    operation: string,
    category: OperationCategory,
    riskAssessment: RiskAssessment,
    timeout: number = 60000
  ): Promise<ConfirmationState> {
    const requestId = randomUUID()
    const requestedAt = new Date()

    if (this.isAutoApproved(riskAssessment.level) || this.isNonInteractiveMode()) {
      return {
        requestId,
        operation,
        category,
        riskAssessment,
        status: 'approved',
        requestedAt,
        respondedAt: new Date(),
        responder: 'auto-approval'
      }
    }

    this.displayRiskInfo(operation, riskAssessment)

    if (process.env.LOOPWORK_IPC === 'true') {
      const message = {
        type: 'ipc',
        version: '1.0',
        event: 'approval_request',
        data: {
          requestId,
          operation,
          description: riskAssessment.reason,
          severity: riskAssessment.level === 'critical' || riskAssessment.level === 'high' ? 'high' : riskAssessment.level === 'medium' ? 'medium' : 'low',
          timeout: Math.floor(timeout / 1000)
        },
        timestamp: Date.now(),
        messageId: randomUUID()
      }
      process.stdout.write(`__IPC_START__${JSON.stringify(message)}__IPC_END__\n`)
    }

    const status = await this.promptUser(timeout)

    return {
      requestId,
      operation,
      category,
      riskAssessment,
      status,
      requestedAt,
      respondedAt: new Date(),
      responder: status === 'approved' ? 'user' : status === 'timeout' ? 'system' : undefined
    }
  }

  async approve(requestId: string, responder?: string, reason?: string): Promise<ConfirmationState> {
    throw new Error('Not implemented: programmatic approval')
  }

  async deny(requestId: string, responder?: string, reason?: string): Promise<ConfirmationState> {
    throw new Error('Not implemented: programmatic denial')
  }

  async getState(requestId: string): Promise<ConfirmationState | null> {
    throw new Error('Not implemented: state tracking')
  }

  async getPendingRequests(): Promise<ConfirmationState[]> {
    return []
  }

  async cancel(requestId: string): Promise<boolean> {
    return true
  }

  async waitForResolution(requestId: string, timeout?: number): Promise<ConfirmationState> {
    throw new Error('Not implemented: waitForResolution')
  }

  isAutoApproved(level: RiskLevel): boolean {
    return this.autoApprovals.has(level)
  }

  setAutoApproval(level: RiskLevel, autoApprove: boolean): void {
    if (autoApprove) {
      this.autoApprovals.add(level)
    } else {
      this.autoApprovals.delete(level)
    }
  }

  private isNonInteractiveMode(): boolean {
    return (
      process.env.LOOPWORK_NON_INTERACTIVE === 'true' ||
      process.env.CI === 'true' ||
      process.argv.includes('-y') ||
      process.argv.includes('--yes') ||
      !process.stdin.isTTY
    )
  }

  private displayRiskInfo(operation: string, riskAssessment: RiskAssessment): void {
    const riskEmoji = this.getRiskEmoji(riskAssessment.level)
    const riskColor = this.getRiskColor(riskAssessment.level)
    const reset = '\x1b[0m'

    process.stdout.write('\n')
    process.stdout.write(`${riskEmoji}  Safety Confirmation Required\n`)
    process.stdout.write('\n')
    process.stdout.write(`Operation: ${operation}\n`)
    process.stdout.write(`${riskColor}Risk Level: ${riskAssessment.level.toUpperCase()}${reset}\n`)
    process.stdout.write(`Reason: ${riskAssessment.reason}\n`)
    process.stdout.write('\n')

    if (riskAssessment.concerns.length > 0) {
      process.stdout.write('Concerns:\n')
      riskAssessment.concerns.forEach((concern, i) => {
        process.stdout.write(`  ${i + 1}. ${concern}\n`)
      })
      process.stdout.write('\n')
    }

    if (riskAssessment.recommendations.length > 0) {
      process.stdout.write('Recommendations:\n')
      riskAssessment.recommendations.forEach((rec, i) => {
        process.stdout.write(`  - ${rec}\n`)
      })
      process.stdout.write('\n')
    }
  }

  private getRiskEmoji(level: RiskLevel): string {
    const emojis: Record<RiskLevel, string> = {
      low: '🟢',
      medium: '🟡',
      high: '🟠',
      critical: '🔴'
    }
    return emojis[level] || '⚠️'
  }

  private getRiskColor(level: RiskLevel): string {
    const colors: Record<RiskLevel, string> = {
      low: '\x1b[32m',
      medium: '\x1b[33m',
      high: '\x1b[93m',
      critical: '\x1b[91m'
    }
    return colors[level] || '\x1b[0m'
  }

  private async promptUser(timeout: number): Promise<'approved' | 'denied' | 'timeout'> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      })

      const timeoutId = setTimeout(() => {
        rl.close()
        resolve('timeout')
      }, timeout)

      rl.question('Continue with this operation? [Y/n] ', (answer: string) => {
        clearTimeout(timeoutId)
        rl.close()
        const approved = answer.toLowerCase() !== 'n'
        resolve(approved ? 'approved' : 'denied')
      })
    })
  }
}

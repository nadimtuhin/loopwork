import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { ApprovalGate } from '../approval-gate'
import { RiskLevel } from '@loopwork-ai/loopwork/contracts'

describe('ApprovalGate', () => {
  let originalEnv: typeof process.env

  beforeEach(() => {
    originalEnv = { ...process.env }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  test('should auto-approve in non-interactive mode', async () => {
    process.env.LOOPWORK_NON_INTERACTIVE = 'true'
    const gate = new ApprovalGate()
    const result = await gate.askApproval({
      taskId: 'TASK-1',
      title: 'Test',
      riskLevel: RiskLevel.LOW,
      reasons: []
    })
    expect(result.confirmed).toBe(true)
    expect(result.nonInteractive).toBe(true)
  })

  test('should block in non-interactive mode if autoApproveNonInteractive is false', async () => {
    process.env.LOOPWORK_NON_INTERACTIVE = 'true'
    const gate = new ApprovalGate({ autoApproveNonInteractive: false })
    const result = await gate.askApproval({
      taskId: 'TASK-1',
      title: 'Test',
      riskLevel: RiskLevel.LOW,
      reasons: []
    })
    expect(result.confirmed).toBe(false)
  })
})

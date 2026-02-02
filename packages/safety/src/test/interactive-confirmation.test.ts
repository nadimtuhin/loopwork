import { describe, test, expect, beforeEach } from 'bun:test'
import { InteractiveConfirmation } from '../interactive-confirmation'
import { RiskAssessment } from '@loopwork-ai/contracts'

describe('InteractiveConfirmation', () => {
  let confirmation: InteractiveConfirmation

  beforeEach(() => {
    confirmation = new InteractiveConfirmation()
  })

  test('should auto-approve if risk level is low and auto-approval is set', async () => {
    confirmation.setAutoApproval('low', true)
    const riskAssessment: RiskAssessment = {
      level: 'low',
      score: 0,
      reason: 'Safe',
      concerns: [],
      requiresConfirmation: false,
      recommendations: []
    }

    const state = await confirmation.requestConfirmation('ls', 'file-system', riskAssessment)
    expect(state.status).toBe('approved')
    expect(state.responder).toBe('auto-approval')
  })

  test('should auto-approve in non-interactive mode', async () => {
    expect(confirmation.isAutoApproved('low')).toBe(false)
    confirmation.setAutoApproval('low', true)
    expect(confirmation.isAutoApproved('low')).toBe(true)
  })
})

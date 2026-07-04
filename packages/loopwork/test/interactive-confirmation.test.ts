import { describe, test, expect, beforeEach, spyOn, mock } from 'bun:test'
import { InteractiveConfirmation } from '@loopwork-ai/safety'
import { RiskAssessment } from '@loopwork-ai/contracts'
import * as readline from 'readline'

describe('InteractiveConfirmation', () => {
  let confirmation: InteractiveConfirmation

  beforeEach(() => {
    delete process.env.LOOPWORK_NON_INTERACTIVE
    delete process.env.CI
    confirmation = new InteractiveConfirmation()
  })

  test('should auto-approve in non-interactive mode (env var)', async () => {
    process.env.LOOPWORK_NON_INTERACTIVE = 'true'
    const riskAssessment: RiskAssessment = {
      level: 'high',
      score: 80,
      reason: 'Dangerous',
      concerns: ['Dangerous operation'],
      requiresConfirmation: true,
      recommendations: []
    }

    const state = await confirmation.requestConfirmation('Test task', 'unknown', riskAssessment)
    expect(state.status).toBe('approved')
    expect(state.responder).toBe('auto-approval')
  })

  test('should display risk information and prompt user', async () => {
    const writes: string[] = []
    spyOn(process.stdout, 'write').mockImplementation((data: any) => {
      writes.push(data.toString())
      return true
    })

    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })

    const mockRl = {
      question: (query: string, callback: (answer: string) => void) => {
        callback('y')
      },
      close: () => {}
    }
    spyOn(readline, 'createInterface').mockReturnValue(mockRl as any)

    const riskAssessment: RiskAssessment = {
      level: 'critical',
      score: 100,
      reason: 'Delete everything',
      concerns: ['Contains critical keywords: rm -rf'],
      requiresConfirmation: true,
      recommendations: ['Backup first']
    }

    const state = await confirmation.requestConfirmation('rm -rf /', 'file-system', riskAssessment)

    expect(state.status).toBe('approved')
    expect(writes.some(w => w.includes('Safety Confirmation Required'))).toBe(true)
    expect(writes.some(w => w.includes('CRITICAL'))).toBe(true)
    expect(writes.some(w => w.includes('Delete everything'))).toBe(true)
  })
})

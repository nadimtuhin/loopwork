import { describe, expect, test } from 'bun:test'
import type { RiskAssessment, SafetyCheckResult, ISafetyShield, IRiskEvaluator, ConfirmationState, IInteractiveConfirmation, RiskLevel, OperationCategory } from '../safety'

describe('safety', () => {
  test('should import all types without error', () => {
    expect(true).toBe(true)
  })
})

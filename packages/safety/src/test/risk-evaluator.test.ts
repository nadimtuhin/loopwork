import { describe, test, expect, beforeEach } from 'bun:test'
import { RiskEvaluator } from '../risk-evaluator'

describe('RiskEvaluator', () => {
  let evaluator: RiskEvaluator

  beforeEach(() => {
    evaluator = new RiskEvaluator()
  })

  test('should return LOW risk for safe operations', async () => {
    const assessment = await evaluator.evaluate('ls -la', 'file-system')
    expect(assessment.level).toBe('low')
    expect(assessment.score).toBe(0)
    expect(assessment.requiresConfirmation).toBe(false)
  })

  test('should detect CRITICAL risk for dangerous commands', async () => {
    const assessment = await evaluator.evaluate('rm -rf /', 'file-system')
    expect(assessment.level).toBe('critical')
    expect(assessment.score).toBeGreaterThanOrEqual(90)
    expect(assessment.requiresConfirmation).toBe(true)
  })

  test('should detect HIGH risk for delete operations', async () => {
    const assessment = await evaluator.evaluate('delete from users', 'database')
    expect(assessment.level).toBe('high')
    expect(assessment.score).toBeGreaterThanOrEqual(70)
    expect(assessment.requiresConfirmation).toBe(true)
  })

  test('should detect MEDIUM risk for production environment', async () => {
    const assessment = await evaluator.evaluate('update config', 'configuration', { environment: 'production' })
    expect(assessment.level).toBe('medium')
    expect(assessment.requiresConfirmation).toBe(false)
  })

  test('should respect custom confirmation threshold', async () => {
    evaluator.setConfirmationThreshold('medium')
    const assessment = await evaluator.evaluate('update config', 'configuration', { environment: 'production' })
    expect(assessment.level).toBe('medium')
    expect(assessment.requiresConfirmation).toBe(true)
  })

  test('should handle custom risk factors', async () => {
    evaluator.addRiskFactor('is-expensive', () => 50)
    const assessment = await evaluator.evaluate('ls', 'file-system')
    expect(assessment.level).toBe('medium')
    expect(assessment.score).toBe(50)
    expect(assessment.concerns).toContain('Risk factor identified: is-expensive')
  })
})

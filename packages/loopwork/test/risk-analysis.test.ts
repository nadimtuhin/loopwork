import { describe, test, expect, beforeEach } from 'bun:test'
import { RiskEvaluator as RiskAnalysisEngine } from '@loopwork-ai/safety'

describe('RiskAnalysisEngine', () => {
  let engine: RiskAnalysisEngine

  beforeEach(() => {
    engine = new RiskAnalysisEngine()
  })

  describe('assessRisk', () => {
    test('should return LOW risk for safe tasks', async () => {
      const result = await engine.evaluate('Add new feature: Implement new button component', 'unknown')

      expect(result.level).toBe('low')
      expect(result.reason).toBe('No significant risks detected')
    })

    test('should detect CRITICAL risk for dangerous keywords', async () => {
      const result = await engine.evaluate('Delete all data: Delete all data from production', 'unknown')

      expect(result.level).toBe('critical')
      expect(result.concerns.some(r => r.includes('Contains critical keywords'))).toBe(true)
      expect(result.concerns.some(r => r.includes('delete all'))).toBe(true)
    })

    test('should detect HIGH risk for rm -rf command', async () => {
      const result = await engine.evaluate('Clean up build artifacts: Run rm -rf to clean up build directory', 'unknown')

      expect(result.level).toBe('critical')
      expect(result.concerns.some(r => r.includes('rm -rf'))).toBe(true)
    })

    test('should detect HIGH risk for drop table operation', async () => {
      const result = await engine.evaluate('Remove users table: Drop table from database', 'unknown')

      expect(result.level).toBe('critical')
      expect(result.concerns.some(r => r.includes('drop table'))).toBe(true)
    })

    test('should detect HIGH risk for dangerous operations', async () => {
      const result = await engine.evaluate('Remove files: Delete old log files', 'unknown')

      expect(result.level).toBe('high')
      expect(result.concerns.some(r => r.includes('Contains risky operations'))).toBe(true)
    })

    test('should detect MEDIUM risk for production environment', async () => {
      const result = await engine.evaluate('Update config: Update configuration settings', 'unknown', { environment: 'production' })

      expect(result.level).toBe('medium')
      expect(result.concerns).toContain('Modifies production environment')
    })
  })
})

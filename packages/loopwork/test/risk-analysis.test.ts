import { describe, test, expect, beforeEach } from 'bun:test'
import { RiskAnalysisEngine } from '../src/safety/risk-analysis'
import { RiskLevel } from '../src/contracts/safety'

describe('RiskAnalysisEngine', () => {
  let engine: RiskAnalysisEngine

  beforeEach(() => {
    engine = new RiskAnalysisEngine()
  })

  describe('assessRisk', () => {
    test('should return LOW risk for safe tasks', async () => {
      const context = {
        task: {
          id: 'TASK-001',
          title: 'Add new feature',
          description: 'Implement new button component',
          metadata: {}
        },
        namespace: 'default',
        nonInteractive: false
      }

      const result = await engine.assessRisk(context)

      expect(result.riskLevel).toBe(RiskLevel.LOW)
      expect(result.reasons).toContain('No significant risks detected')
      expect(result.confidence).toBe(0.8)
    })

    test('should detect CRITICAL risk for dangerous keywords', async () => {
      const context = {
        task: {
          id: 'TASK-002',
          title: 'Delete all data',
          description: 'Delete all data from production',
          metadata: {}
        },
        namespace: 'default',
        nonInteractive: false
      }

      const result = await engine.assessRisk(context)

      expect(result.riskLevel).toBe(RiskLevel.CRITICAL)
      expect(result.reasons.some(r => r.includes('Contains critical keywords'))).toBe(true)
      expect(result.reasons.some(r => r.includes('delete all'))).toBe(true)
    })

    test('should detect HIGH risk for rm -rf command', async () => {
      const context = {
        task: {
          id: 'TASK-003',
          title: 'Clean up build artifacts',
          description: 'Run rm -rf to clean up build directory',
          metadata: {}
        },
        namespace: 'default',
        nonInteractive: false
      }

      const result = await engine.assessRisk(context)

      expect(result.riskLevel).toBe(RiskLevel.CRITICAL)
      expect(result.reasons.some(r => r.includes('rm -rf'))).toBe(true)
    })

    test('should detect HIGH risk for drop table operation', async () => {
      const context = {
        task: {
          id: 'TASK-004',
          title: 'Remove users table',
          description: 'Drop table from database',
          metadata: {}
        },
        namespace: 'default',
        nonInteractive: false
      }

      const result = await engine.assessRisk(context)

      expect(result.riskLevel).toBe(RiskLevel.CRITICAL)
      expect(result.reasons.some(r => r.includes('drop table'))).toBe(true)
    })

    test('should detect HIGH risk for dangerous operations', async () => {
      const context = {
        task: {
          id: 'TASK-005',
          title: 'Remove files',
          description: 'Delete old log files',
          metadata: {}
        },
        namespace: 'default',
        nonInteractive: false
      }

      const result = await engine.assessRisk(context)

      expect(result.riskLevel).toBe(RiskLevel.HIGH)
      expect(result.reasons.some(r => r.includes('Contains risky operations'))).toBe(true)
    })

    test('should detect HIGH risk for production environment', async () => {
      const context = {
        task: {
          id: 'TASK-006',
          title: 'Update config',
          description: 'Update configuration settings',
          metadata: { environment: 'production' }
        },
        namespace: 'default',
        nonInteractive: false
      }

      const result = await engine.assessRisk(context)

      // 'production' is in DANGEROUS_KEYWORDS, so it's HIGH risk
      expect(result.riskLevel).toBe(RiskLevel.HIGH)
      expect(result.reasons).toContain('Modifies production environment')
    })

    test('should detect HIGH risk for production keyword in title', async () => {
      const context = {
        task: {
          id: 'TASK-007',
          title: 'Deploy to production',
          description: 'Deploy latest changes to production server',
          metadata: {}
        },
        namespace: 'default',
        nonInteractive: false
      }

      const result = await engine.assessRisk(context)

      // 'production' is in DANGEROUS_KEYWORDS, so it's HIGH risk
      expect(result.riskLevel).toBe(RiskLevel.HIGH)
      expect(result.reasons).toContain('Modifies production environment')
    })

    test('should detect MEDIUM risk for database operations', async () => {
      const context = {
        task: {
          id: 'TASK-008',
          title: 'Update schema',
          description: 'Modify database schema for new fields',
          metadata: {}
        },
        namespace: 'default',
        nonInteractive: false
      }

      const result = await engine.assessRisk(context)

      expect(result.riskLevel).toBe(RiskLevel.MEDIUM)
      expect(result.reasons).toContain('Database modification')
    })

    test('should detect MEDIUM risk for db keyword', async () => {
      const context = {
        task: {
          id: 'TASK-009',
          title: 'Update db',
          description: 'Update db connection string',
          metadata: {}
        },
        namespace: 'default',
        nonInteractive: false
      }

      const result = await engine.assessRisk(context)

      expect(result.riskLevel).toBe(RiskLevel.MEDIUM)
      expect(result.reasons).toContain('Database modification')
    })

    test('should handle missing description', async () => {
      const context = {
        task: {
          id: 'TASK-010',
          title: 'Simple task',
          description: '',
          metadata: {}
        },
        namespace: 'default',
        nonInteractive: false
      }

      const result = await engine.assessRisk(context)

      expect(result.riskLevel).toBe(RiskLevel.LOW)
      expect(result.reasons).toContain('No significant risks detected')
    })

    test('should handle missing metadata', async () => {
      const context = {
        task: {
          id: 'TASK-011',
          title: 'Simple task',
          description: 'Add new feature'
        } as any,
        namespace: 'default',
        nonInteractive: false
      }

      const result = await engine.assessRisk(context)

      expect(result.riskLevel).toBe(RiskLevel.LOW)
    })

    test('should prioritize CRITICAL over HIGH risk', async () => {
      const context = {
        task: {
          id: 'TASK-012',
          title: 'Truncate and delete production database',
          description: 'Truncate table and delete all records from production',
          metadata: {}
        },
        namespace: 'default',
        nonInteractive: false
      }

      const result = await engine.assessRisk(context)

      expect(result.riskLevel).toBe(RiskLevel.CRITICAL)
      expect(result.reasons.some(r => r.includes('Contains critical keywords'))).toBe(true)
    })

    test('should detect multiple risk factors', async () => {
      const context = {
        task: {
          id: 'TASK-013',
          title: 'Remove production database files',
          description: 'Delete database backup files from production',
          metadata: { environment: 'production' }
        },
        namespace: 'default',
        nonInteractive: false
      }

      const result = await engine.assessRisk(context)

      expect(result.riskLevel).toBe(RiskLevel.CRITICAL)
      expect(result.reasons.length).toBeGreaterThan(1)
      expect(result.reasons.some(r => r.includes('Contains critical keywords'))).toBe(true)
      // 'Delete' is in the description
      expect(result.reasons.some(r => r.includes('delete'))).toBe(true)
      expect(result.reasons.some(r => r.includes('database'))).toBe(true)
    })

    test('should search in title, description, and metadata', async () => {
      const context = {
        task: {
          id: 'TASK-014',
          title: 'Safe task',
          description: 'Safe description',
          metadata: { notes: 'Need to truncate table later' }
        },
        namespace: 'default',
        nonInteractive: false
      }

      const result = await engine.assessRisk(context)

      expect(result.riskLevel).toBe(RiskLevel.CRITICAL)
      expect(result.reasons.some(r => r.includes('truncate table'))).toBe(true)
    })

    test('should be case insensitive', async () => {
      const context = {
        task: {
          id: 'TASK-015',
          title: 'DELETE ALL DATA',
          description: 'DROP TABLE from DATABASE',
          metadata: {}
        },
        namespace: 'default',
        nonInteractive: false
      }

      const result = await engine.assessRisk(context)

      expect(result.riskLevel).toBe(RiskLevel.CRITICAL)
    })
  })

  describe('exceedsMaxRisk', () => {
    test('should return false when risk level equals max risk level', () => {
      const result = engine.exceedsMaxRisk(RiskLevel.MEDIUM, RiskLevel.MEDIUM)
      expect(result).toBe(false)
    })

    test('should return false when risk level is lower than max', () => {
      const result = engine.exceedsMaxRisk(RiskLevel.LOW, RiskLevel.HIGH)
      expect(result).toBe(false)
    })

    test('should return true when risk level is higher than max', () => {
      const result = engine.exceedsMaxRisk(RiskLevel.CRITICAL, RiskLevel.HIGH)
      expect(result).toBe(true)
    })

    test('should return true when risk level is CRITICAL and max is LOW', () => {
      const result = engine.exceedsMaxRisk(RiskLevel.CRITICAL, RiskLevel.LOW)
      expect(result).toBe(true)
    })

    test('should return false when risk level is LOW and max is CRITICAL', () => {
      const result = engine.exceedsMaxRisk(RiskLevel.LOW, RiskLevel.CRITICAL)
      expect(result).toBe(false)
    })

    test('should handle all risk level combinations', () => {
      const risks = [RiskLevel.LOW, RiskLevel.MEDIUM, RiskLevel.HIGH, RiskLevel.CRITICAL]

      for (let i = 0; i < risks.length; i++) {
        for (let j = 0; j < risks.length; j++) {
          const result = engine.exceedsMaxRisk(risks[i], risks[j])
          const expected = i > j
          expect(result).toBe(expected)
        }
      }
    })
  })
})

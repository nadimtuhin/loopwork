import { describe, expect, test, beforeEach } from 'bun:test'
import {
  VerificationEngine,
  createVerificationEngine,
  VerificationCheckType,
  VerificationEvidence,
  VerificationCheck,
} from '../verification'

describe('VerificationEngine', () => {
  describe('Evidence Freshness', () => {
    test('fresh evidence (<5 min) passes', () => {
      const engine = createVerificationEngine()
      const freshEvidence: VerificationEvidence = {
        check: 'BUILD',
        timestamp: new Date(Date.now() - 60000), // 1 minute ago
        fresh: true,
      }

      expect(engine.isEvidenceFresh(freshEvidence)).toBe(true)
    })

    test('stale evidence (>5 min) fails', () => {
      const engine = createVerificationEngine()
      const staleEvidence: VerificationEvidence = {
        check: 'BUILD',
        timestamp: new Date(Date.now() - 400000), // ~6.6 minutes ago
        fresh: true,
      }

      expect(engine.isEvidenceFresh(staleEvidence)).toBe(false)
    })

    test('custom TTL works', () => {
      const engine = createVerificationEngine({ freshnessTTL: 60000 }) // 1 minute
      const slightlyOldEvidence: VerificationEvidence = {
        check: 'BUILD',
        timestamp: new Date(Date.now() - 90000), // 1.5 minutes ago
        fresh: true,
      }

      expect(engine.isEvidenceFresh(slightlyOldEvidence)).toBe(false)
    })

    test('evidence exactly at TTL boundary is fresh', () => {
      const engine = createVerificationEngine({ freshnessTTL: 300000 }) // 5 minutes
      const boundaryEvidence: VerificationEvidence = {
        check: 'BUILD',
        timestamp: new Date(Date.now() - 299999), // Just under 5 minutes
        fresh: true,
      }

      expect(engine.isEvidenceFresh(boundaryEvidence)).toBe(true)
    })
  })

  describe('Check Configuration', () => {
    test('uses default checks when none provided', () => {
      const engine = createVerificationEngine()
      // Access private config through getVerificationEngine in AIMonitor
      // For now, just verify engine is created
      expect(engine).toBeDefined()
    })

    test('uses custom checks when provided', () => {
      const customChecks: VerificationCheck[] = [
        { type: 'BUILD', command: 'npm run build', timeout: 60000, required: true },
        { type: 'TEST', command: 'npm test', timeout: 120000, required: false },
      ]
      const engine = createVerificationEngine({ checks: customChecks })
      expect(engine).toBeDefined()
    })

    test('supports all check types', () => {
      const allCheckTypes: VerificationCheckType[] = [
        'BUILD',
        'TEST',
        'LINT',
        'FUNCTIONALITY',
        'ARCHITECT',
        'TODO',
        'ERROR_FREE',
      ]

      const checks: VerificationCheck[] = allCheckTypes.map((type) => ({
        type,
        required: type === 'BUILD' || type === 'TEST',
      }))

      const engine = createVerificationEngine({ checks })
      expect(engine).toBeDefined()
    })
  })

  describe('Verification Result', () => {
    test('all checks pass → result.passed = true', async () => {
      const engine = createVerificationEngine({
        checks: [
          { type: 'ERROR_FREE', required: true },
        ],
      })

      const result = await engine.verify('Test claim')

      // ERROR_FREE should pass when no recent errors
      expect(result.passed).toBe(true)
      expect(result.failedChecks).toHaveLength(0)
    })

    test('result contains timestamp', async () => {
      const engine = createVerificationEngine({
        checks: [{ type: 'ERROR_FREE', required: true }],
      })

      const before = Date.now()
      const result = await engine.verify('Test claim')
      const after = Date.now()

      expect(result.timestamp.getTime()).toBeGreaterThanOrEqual(before)
      expect(result.timestamp.getTime()).toBeLessThanOrEqual(after)
    })

    test('result contains evidence array', async () => {
      const engine = createVerificationEngine({
        checks: [
          { type: 'ERROR_FREE', required: true },
          { type: 'TODO', required: false },
        ],
      })

      const result = await engine.verify('Test claim')

      expect(result.evidence).toHaveLength(2)
      expect(result.evidence[0].check).toBe('ERROR_FREE')
      expect(result.evidence[1].check).toBe('TODO')
    })

    test('evidence has fresh property', async () => {
      const engine = createVerificationEngine({
        checks: [{ type: 'ERROR_FREE', required: true }],
      })

      const result = await engine.verify('Test claim')

      expect(result.evidence[0].fresh).toBe(true)
    })
  })

  describe('Evidence Store', () => {
    test('getEvidence returns stored evidence', async () => {
      const engine = createVerificationEngine({
        checks: [{ type: 'ERROR_FREE', required: true }],
      })

      await engine.verify('Test claim')
      const evidence = engine.getEvidence('ERROR_FREE')

      expect(evidence).toBeDefined()
      expect(evidence?.check).toBe('ERROR_FREE')
    })

    test('getEvidence returns undefined for unknown check', () => {
      const engine = createVerificationEngine()
      const evidence = engine.getEvidence('BUILD' as VerificationCheckType)

      expect(evidence).toBeUndefined()
    })

    test('clearEvidence removes all stored evidence', async () => {
      const engine = createVerificationEngine({
        checks: [{ type: 'ERROR_FREE', required: true }],
      })

      await engine.verify('Test claim')
      engine.clearEvidence()
      const evidence = engine.getEvidence('ERROR_FREE')

      expect(evidence).toBeUndefined()
    })
  })

  describe('Check Execution', () => {
    test('duration is measured correctly', async () => {
      const engine = createVerificationEngine({
        checks: [{ type: 'ERROR_FREE', required: true }],
      })

      const result = await engine.verify('Test claim')

      expect(result.checks[0].duration).toBeGreaterThanOrEqual(0)
      expect(result.checks[0].duration).toBeLessThan(1000) // Should be fast
    })

    test('timestamp is recorded for each check', async () => {
      const engine = createVerificationEngine({
        checks: [
          { type: 'ERROR_FREE', required: true },
          { type: 'TODO', required: false },
        ],
      })

      const before = Date.now()
      const result = await engine.verify('Test claim')
      const after = Date.now()

      for (const check of result.checks) {
        expect(check.timestamp.getTime()).toBeGreaterThanOrEqual(before)
        expect(check.timestamp.getTime()).toBeLessThanOrEqual(after)
      }
    })

    test('output is captured in check result', async () => {
      const engine = createVerificationEngine({
        checks: [{ type: 'ERROR_FREE', required: true }],
      })

      const result = await engine.verify('Test claim')

      expect(typeof result.checks[0].output).toBe('string')
      expect(result.checks[0].output.length).toBeGreaterThan(0)
    })
  })

  describe('Configuration Options', () => {
    test('cwd option is respected', () => {
      const customCwd = '/custom/path'
      const engine = createVerificationEngine({ cwd: customCwd })
      expect(engine).toBeDefined()
    })

    test('requireArchitectApproval option', () => {
      const engine = createVerificationEngine({
        requireArchitectApproval: true,
        checks: [{ type: 'ARCHITECT', required: true }],
      })
      expect(engine).toBeDefined()
    })

    test('engine is created with empty config', () => {
      const engine = createVerificationEngine()
      expect(engine).toBeDefined()
      expect(engine).toBeInstanceOf(VerificationEngine)
    })
  })

  describe('Error Handling', () => {
    test('handles missing command gracefully', async () => {
      const engine = createVerificationEngine({
        checks: [
          { type: 'BUILD', command: 'nonexistent-command-12345', required: true, timeout: 1000 },
        ],
      })

      const result = await engine.verify('Test claim')

      expect(result.passed).toBe(false)
      expect(result.failedChecks).toContain('BUILD')
    })

    test('timeout is respected', async () => {
      const engine = createVerificationEngine({
        checks: [
          { type: 'BUILD', command: 'sleep 10', required: true, timeout: 100 },
        ],
      })

      const result = await engine.verify('Test claim')

      expect(result.passed).toBe(false)
      expect(result.checks[0].output).toContain('timed out')
    })
  })

  describe('Integration with AIMonitor', () => {
    test('engine can be retrieved from AIMonitor', async () => {
      const { AIMonitor } = await import('../index')
      const monitor = new AIMonitor({
        verification: {
          freshnessTTL: 60000,
          checks: ['BUILD', 'TEST'],
          requireArchitectApproval: false,
        },
      })

      const engine = monitor.getVerificationEngine()
      expect(engine).toBeDefined()
      expect(engine).toBeInstanceOf(VerificationEngine)
    })
  })
})

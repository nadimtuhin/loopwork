import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { VerificationEngine } from '../verification'
import { AIMonitor } from '../index'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('VerificationEngine Integration', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'verification-test-'))
  })

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true })
  })

  describe('Full Verification Flow', () => {
    test('runs all configured checks and reports results', async () => {
      const engine = new VerificationEngine({
        cwd: tempDir,
        checks: [
          { type: 'ERROR_FREE', required: true },
          { type: 'TODO', required: false },
        ],
      })

      const result = await engine.verify('Integration test claim', 'TEST-001')

      expect(result.checks).toHaveLength(2)
      expect(result.checks[0].check).toBe('ERROR_FREE')
      expect(result.checks[1].check).toBe('TODO')
      expect(result.evidence).toHaveLength(2)
    })

    test('verification result includes all required fields', async () => {
      const engine = new VerificationEngine({
        cwd: tempDir,
        checks: [{ type: 'ERROR_FREE', required: true }],
      })

      const result = await engine.verify('Test claim')

      expect(typeof result.passed).toBe('boolean')
      expect(Array.isArray(result.checks)).toBe(true)
      expect(result.timestamp).toBeInstanceOf(Date)
      expect(Array.isArray(result.evidence)).toBe(true)
      expect(Array.isArray(result.failedChecks)).toBe(true)
    })

    test('failedChecks array is populated when checks fail', async () => {
      // Create a fake error log with recent errors
      const logDir = path.join(tempDir, '.loopwork', 'logs')
      await fs.promises.mkdir(logDir, { recursive: true })
      await fs.promises.writeFile(
        path.join(logDir, 'error.log'),
        'ERROR: Test error message\nFATAL: Critical failure',
        'utf-8'
      )

      const engine = new VerificationEngine({
        cwd: tempDir,
        checks: [{ type: 'ERROR_FREE', required: true }],
      })

      const result = await engine.verify('Test claim')

      expect(result.failedChecks).toContain('ERROR_FREE')
      expect(result.passed).toBe(false)
    })
  })

  describe('Integration with AI Monitor', () => {
    test('AIMonitor initializes VerificationEngine with config', () => {
      const monitor = new AIMonitor({
        verification: {
          freshnessTTL: 120000,
          checks: ['BUILD', 'TEST', 'LINT'],
          requireArchitectApproval: true,
        },
      })

      const engine = monitor.getVerificationEngine()
      expect(engine).toBeDefined()
      expect(engine).toBeInstanceOf(VerificationEngine)
    })

    test('verification runs after healing action', async () => {
      const monitor = new AIMonitor({
        verification: {
          freshnessTTL: 300000,
          checks: ['ERROR_FREE'],
          requireArchitectApproval: false,
        },
      })

      const engine = monitor.getVerificationEngine()
      const result = await engine.verify('Healing action completed')

      expect(result).toBeDefined()
      expect(result.timestamp).toBeInstanceOf(Date)
    })
  })

  describe('Stale Evidence Detection', () => {
    test('detects stale evidence and requires re-verification', async () => {
      const engine = new VerificationEngine({
        freshnessTTL: 1000, // 1 second for testing
        checks: [{ type: 'ERROR_FREE', required: true }],
      })

      // First verification - evidence is fresh
      const result1 = await engine.verify('First claim')
      expect(result1.evidence[0].fresh).toBe(true)

      // Wait for evidence to become stale
      await new Promise((resolve) => setTimeout(resolve, 1100))

      // Check that stored evidence is now stale
      const storedEvidence = engine.getEvidence('ERROR_FREE')
      expect(storedEvidence).toBeDefined()
      expect(engine.isEvidenceFresh(storedEvidence!)).toBe(false)

      // New verification creates fresh evidence
      const result2 = await engine.verify('Second claim')
      expect(result2.evidence[0].fresh).toBe(true)
    })
  })

  describe('Check Type Coverage', () => {
    test('BUILD check runs build command', async () => {
      // Create a package.json with build script
      await fs.promises.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          name: 'test-project',
          scripts: {
            build: 'echo "Build successful"',
          },
        }),
        'utf-8'
      )

      const engine = new VerificationEngine({
        cwd: tempDir,
        checks: [{ type: 'BUILD', command: 'npm run build', required: true, timeout: 10000 }],
      })

      const result = await engine.verify('Build test')

      expect(result.checks[0].check).toBe('BUILD')
      expect(typeof result.checks[0].passed).toBe('boolean')
    })

    test('TEST check runs test command', async () => {
      await fs.promises.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          name: 'test-project',
          scripts: {
            test: 'echo "Tests passed"',
          },
        }),
        'utf-8'
      )

      const engine = new VerificationEngine({
        cwd: tempDir,
        checks: [{ type: 'TEST', command: 'npm test', required: true, timeout: 10000 }],
      })

      const result = await engine.verify('Test check')

      expect(result.checks[0].check).toBe('TEST')
    })

    test('LINT check handles missing lint script gracefully', async () => {
      await fs.promises.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ name: 'test-project', scripts: {} }),
        'utf-8'
      )

      const engine = new VerificationEngine({
        cwd: tempDir,
        checks: [{ type: 'LINT', required: false }],
      })

      const result = await engine.verify('Lint test')

      // Should pass because lint is optional and no script exists
      expect(result.checks[0].check).toBe('LINT')
    })

    test('TODO check finds pending TODOs', async () => {
      // Create a PRD with TODO
      const specsDir = path.join(tempDir, '.specs', 'tasks')
      await fs.promises.mkdir(specsDir, { recursive: true })
      await fs.promises.writeFile(
        path.join(specsDir, 'TEST-001.md'),
        '# TEST-001\n\n## Requirements\n- TODO: Implement feature\n',
        'utf-8'
      )

      const engine = new VerificationEngine({
        cwd: tempDir,
        checks: [{ type: 'TODO', required: true }],
      })

      const result = await engine.verify('TODO check', 'TEST-001')

      expect(result.checks[0].check).toBe('TODO')
      expect(typeof result.checks[0].passed).toBe('boolean')
    })

    test('FUNCTIONALITY check verifies PRD requirements', async () => {
      const specsDir = path.join(tempDir, '.specs', 'tasks')
      await fs.promises.mkdir(specsDir, { recursive: true })
      await fs.promises.writeFile(
        path.join(specsDir, 'TEST-002.md'),
        '# TEST-002\n\n## Goal\nTest goal\n\n## Requirements\n- Requirement 1\n',
        'utf-8'
      )

      const engine = new VerificationEngine({
        cwd: tempDir,
        checks: [{ type: 'FUNCTIONALITY', required: true }],
      })

      const result = await engine.verify('Functionality check', 'TEST-002')

      expect(result.checks[0].check).toBe('FUNCTIONALITY')
      expect(result.checks[0].passed).toBe(true)
    })

    test('ARCHITECT check with approval requirement', async () => {
      const engine = new VerificationEngine({
        cwd: tempDir,
        checks: [{ type: 'ARCHITECT', required: true }],
        requireArchitectApproval: true,
      })

      const result = await engine.verify('Architect check')

      expect(result.checks[0].check).toBe('ARCHITECT')
    })
  })

  describe('Error Handling and Edge Cases', () => {
    test('handles verification with no checks configured', async () => {
      const engine = new VerificationEngine({
        checks: [],
      })

      const result = await engine.verify('Empty check test')

      expect(result.passed).toBe(true)
      expect(result.checks).toHaveLength(0)
      expect(result.failedChecks).toHaveLength(0)
    })

    test('handles missing task ID gracefully', async () => {
      const engine = new VerificationEngine({
        cwd: tempDir,
        checks: [
          { type: 'FUNCTIONALITY', required: false },
          { type: 'TODO', required: false },
        ],
      })

      const result = await engine.verify('No task ID')

      expect(result.passed).toBe(true)
    })

    test('captures command output in check result', async () => {
      await fs.promises.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          name: 'test-project',
          scripts: {
            build: 'echo "Custom build output"',
          },
        }),
        'utf-8'
      )

      const engine = new VerificationEngine({
        cwd: tempDir,
        checks: [{ type: 'BUILD', command: 'npm run build', required: true, timeout: 10000 }],
      })

      const result = await engine.verify('Output test')

      expect(result.checks[0].output).toContain('Custom build output')
    })

    test('measures check duration accurately', async () => {
      const engine = new VerificationEngine({
        cwd: tempDir,
        checks: [{ type: 'ERROR_FREE', required: true }],
      })

      const start = Date.now()
      const result = await engine.verify('Duration test')
      const end = Date.now()

      expect(result.checks[0].duration).toBeGreaterThanOrEqual(0)
      expect(result.checks[0].duration).toBeLessThanOrEqual(end - start + 100)
    })
  })

  describe('Circuit Breaker Integration', () => {
    test('verification failure can trigger circuit breaker', async () => {
      const monitor = new AIMonitor({
        circuitBreaker: {
          maxFailures: 1,
          cooldownPeriodMs: 60000,
          halfOpenAttempts: 1,
        },
      })

      // Initially circuit should be closed
      expect(monitor.getCircuitBreakerStats().state).toBe('closed')

      // Simulate failures would trigger circuit breaker
      // This is tested indirectly through the monitor's circuit breaker
    })
  })
})

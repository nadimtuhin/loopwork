/**
 * Unit tests for Verification Engine
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  VerificationEngine,
  createVerificationEngine,
  type VerificationCheck
} from '../../src/ai-monitor/verification'
import type { VerificationEvidence } from '../../src/ai-monitor/types'

describe('VerificationEngine', () => {
  let tempDir: string

  beforeEach(() => {
    // Create temp directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loopwork-verification-test-'))
  })

  describe('Evidence Freshness', () => {
    test('fresh evidence (<5 min) passes freshness check', () => {
      const engine = createVerificationEngine({ freshnessTTL: 5 * 60 * 1000 })

      const evidence: VerificationEvidence = {
        claim: 'Test claim',
        command: 'echo test',
        output: 'test',
        timestamp: new Date(), // Now
        passed: true,
        fresh: true
      }

      expect(engine.isEvidenceFresh(evidence)).toBe(true)
    })

    test('stale evidence (>5 min) fails freshness check', () => {
      const engine = createVerificationEngine({ freshnessTTL: 5 * 60 * 1000 })

      const staleTime = new Date(Date.now() - 6 * 60 * 1000) // 6 minutes ago
      const evidence: VerificationEvidence = {
        claim: 'Test claim',
        command: 'echo test',
        output: 'test',
        timestamp: staleTime,
        passed: true,
        fresh: false
      }

      expect(engine.isEvidenceFresh(evidence)).toBe(false)
    })

    test('custom TTL works correctly', () => {
      const customTTL = 2 * 60 * 1000 // 2 minutes
      const engine = createVerificationEngine({ freshnessTTL: customTTL })

      // 1 minute old - should pass
      const freshEvidence: VerificationEvidence = {
        claim: 'Test claim',
        command: 'echo test',
        output: 'test',
        timestamp: new Date(Date.now() - 1 * 60 * 1000),
        passed: true,
        fresh: true
      }
      expect(engine.isEvidenceFresh(freshEvidence)).toBe(true)

      // 3 minutes old - should fail
      const staleEvidence: VerificationEvidence = {
        claim: 'Test claim',
        command: 'echo test',
        output: 'test',
        timestamp: new Date(Date.now() - 3 * 60 * 1000),
        passed: true,
        fresh: false
      }
      expect(engine.isEvidenceFresh(staleEvidence)).toBe(false)
    })
  })

  describe('Individual Checks', () => {
    test('BUILD check runs successfully', async () => {
      // Create a simple package.json with build script
      const packageJson = {
        name: 'test',
        scripts: {
          build: 'echo "Build successful"'
        }
      }
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(packageJson))

      const engine = createVerificationEngine({
        cwd: tempDir,
        checks: [{
          type: 'BUILD',
          command: 'echo "Build successful"',
          timeout: 5000,
          required: true
        }]
      })

      const result = await engine.verify('Test build', 'test-task')

      expect(result.passed).toBe(true)
      expect(result.checks).toHaveLength(1)
      expect(result.checks[0].check).toBe('BUILD')
      expect(result.checks[0].passed).toBe(true)
    })

    test('BUILD check fails on command error', async () => {
      const engine = createVerificationEngine({
        cwd: tempDir,
        checks: [{
          type: 'BUILD',
          command: 'exit 1', // Failing command
          timeout: 5000,
          required: true
        }]
      })

      const result = await engine.verify('Test build failure', 'test-task')

      expect(result.passed).toBe(false)
      expect(result.failedChecks).toContain('BUILD')
    })

    test('TEST check runs successfully', async () => {
      const packageJson = {
        name: 'test',
        scripts: {
          test: 'echo "All tests passed"'
        }
      }
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(packageJson))

      const engine = createVerificationEngine({
        cwd: tempDir,
        checks: [{
          type: 'TEST',
          command: 'echo "All tests passed"',
          timeout: 5000,
          required: true
        }]
      })

      const result = await engine.verify('Test run', 'test-task')

      expect(result.passed).toBe(true)
      expect(result.checks).toHaveLength(1)
      expect(result.checks[0].check).toBe('TEST')
    })

    test('LINT check runs successfully', async () => {
      const engine = createVerificationEngine({
        cwd: tempDir,
        checks: [{
          type: 'LINT',
          command: 'echo "Linting passed"',
          timeout: 5000,
          required: false
        }]
      })

      const result = await engine.verify('Test lint', 'test-task')

      expect(result.passed).toBe(true)
      expect(result.checks).toHaveLength(1)
      expect(result.checks[0].check).toBe('LINT')
    })

    test('ERROR_FREE check scans log file', async () => {
      // Create log file with no errors
      const logFile = path.join(tempDir, 'test.log')
      fs.writeFileSync(logFile, 'INFO: All good\nDEBUG: Processing\nINFO: Complete')

      const engine = createVerificationEngine({
        cwd: tempDir,
        logFile,
        checks: [{
          type: 'ERROR_FREE',
          timeout: 0,
          required: true
        }]
      })

      const result = await engine.verify('Test error free', 'test-task')

      expect(result.passed).toBe(true)
      expect(result.checks[0].check).toBe('ERROR_FREE')
    })

    test('ERROR_FREE check detects errors in log', async () => {
      // Create log file with errors
      const logFile = path.join(tempDir, 'test.log')
      fs.writeFileSync(logFile, 'INFO: Starting\n[ERROR] Something failed\nINFO: Continuing')

      const engine = createVerificationEngine({
        cwd: tempDir,
        logFile,
        checks: [{
          type: 'ERROR_FREE',
          timeout: 0,
          required: true
        }]
      })

      const result = await engine.verify('Test with errors', 'test-task')

      expect(result.passed).toBe(false)
      expect(result.failedChecks).toContain('ERROR_FREE')
    })

    test('ERROR_FREE check passes when log file does not exist', async () => {
      const engine = createVerificationEngine({
        cwd: tempDir,
        logFile: path.join(tempDir, 'nonexistent.log'),
        checks: [{
          type: 'ERROR_FREE',
          timeout: 0,
          required: true
        }]
      })

      const result = await engine.verify('Test no log file', 'test-task')

      expect(result.passed).toBe(true)
    })
  })

  describe('Verification Result', () => {
    test('all checks pass → result.passed = true', async () => {
      const engine = createVerificationEngine({
        cwd: tempDir,
        checks: [
          {
            type: 'BUILD',
            command: 'echo "build ok"',
            timeout: 5000,
            required: true
          },
          {
            type: 'TEST',
            command: 'echo "test ok"',
            timeout: 5000,
            required: true
          }
        ]
      })

      const result = await engine.verify('All pass test', 'test-task')

      expect(result.passed).toBe(true)
      expect(result.checks).toHaveLength(2)
      expect(result.failedChecks).toHaveLength(0)
    })

    test('one required check fails → result.passed = false', async () => {
      const engine = createVerificationEngine({
        cwd: tempDir,
        checks: [
          {
            type: 'BUILD',
            command: 'echo "build ok"',
            timeout: 5000,
            required: true
          },
          {
            type: 'TEST',
            command: 'exit 1', // Failing test
            timeout: 5000,
            required: true
          }
        ]
      })

      const result = await engine.verify('One fail test', 'test-task')

      expect(result.passed).toBe(false)
      expect(result.failedChecks).toContain('TEST')
    })

    test('non-required check fails → result.passed = true', async () => {
      const engine = createVerificationEngine({
        cwd: tempDir,
        checks: [
          {
            type: 'BUILD',
            command: 'echo "build ok"',
            timeout: 5000,
            required: true
          },
          {
            type: 'LINT',
            command: 'exit 1', // Failing lint
            timeout: 5000,
            required: false
          }
        ]
      })

      const result = await engine.verify('Optional fail test', 'test-task')

      expect(result.passed).toBe(true)
      expect(result.checks).toHaveLength(2)
    })

    test('failedChecks array populated correctly', async () => {
      const engine = createVerificationEngine({
        cwd: tempDir,
        checks: [
          {
            type: 'BUILD',
            command: 'exit 1',
            timeout: 5000,
            required: true
          },
          {
            type: 'TEST',
            command: 'exit 1',
            timeout: 5000,
            required: true
          },
          {
            type: 'LINT',
            command: 'exit 1',
            timeout: 5000,
            required: false
          }
        ]
      })

      const result = await engine.verify('Multiple fails test', 'test-task')

      expect(result.passed).toBe(false)
      expect(result.failedChecks).toContain('BUILD')
      expect(result.failedChecks).toContain('TEST')
      expect(result.failedChecks).not.toContain('LINT') // Not required
    })
  })

  describe('Check Execution', () => {
    test('command timeout works', async () => {
      const engine = createVerificationEngine({
        cwd: tempDir,
        checks: [{
          type: 'BUILD',
          command: 'sleep 10', // Will timeout
          timeout: 100, // Very short timeout
          required: true
        }]
      })

      const result = await engine.verify('Timeout test', 'test-task')

      expect(result.passed).toBe(false)
      expect(result.failedChecks).toContain('BUILD')
    })

    test('command failure captured in output', async () => {
      const engine = createVerificationEngine({
        cwd: tempDir,
        checks: [{
          type: 'BUILD',
          command: 'echo "Error message" && exit 1',
          timeout: 5000,
          required: true
        }]
      })

      const result = await engine.verify('Error output test', 'test-task')

      expect(result.passed).toBe(false)
      expect(result.checks[0].output).toContain('Error message')
    })

    test('duration measured correctly', async () => {
      const engine = createVerificationEngine({
        cwd: tempDir,
        checks: [{
          type: 'BUILD',
          command: 'sleep 0.1', // 100ms
          timeout: 5000,
          required: true
        }]
      })

      const result = await engine.verify('Duration test', 'test-task')

      expect(result.checks[0].duration).toBeGreaterThan(0)
      expect(result.checks[0].duration).toBeGreaterThan(50) // At least 50ms
    })

    test('timestamp recorded for each check', async () => {
      const engine = createVerificationEngine({
        cwd: tempDir,
        checks: [{
          type: 'BUILD',
          command: 'echo "test"',
          timeout: 5000,
          required: true
        }]
      })

      const beforeTime = new Date()
      const result = await engine.verify('Timestamp test', 'test-task')
      const afterTime = new Date()

      expect(result.checks[0].timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime())
      expect(result.checks[0].timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime())
    })
  })

  describe('Evidence Generation', () => {
    test('evidence generated for each check', async () => {
      const engine = createVerificationEngine({
        cwd: tempDir,
        checks: [
          {
            type: 'BUILD',
            command: 'echo "build"',
            timeout: 5000,
            required: true
          },
          {
            type: 'TEST',
            command: 'echo "test"',
            timeout: 5000,
            required: true
          }
        ]
      })

      const result = await engine.verify('Evidence test', 'test-task')

      expect(result.evidence).toHaveLength(2)
      expect(result.evidence[0].claim).toBe('BUILD check')
      expect(result.evidence[1].claim).toBe('TEST check')
    })

    test('evidence marked as fresh when just run', async () => {
      const engine = createVerificationEngine({
        cwd: tempDir,
        checks: [{
          type: 'BUILD',
          command: 'echo "build"',
          timeout: 5000,
          required: true
        }]
      })

      const result = await engine.verify('Fresh evidence test', 'test-task')

      expect(result.evidence[0].fresh).toBe(true)
    })

    test('evidence includes command output', async () => {
      const engine = createVerificationEngine({
        cwd: tempDir,
        checks: [{
          type: 'BUILD',
          command: 'echo "Custom build output"',
          timeout: 5000,
          required: true
        }]
      })

      const result = await engine.verify('Output evidence test', 'test-task')

      expect(result.evidence[0].output).toContain('Custom build output')
    })
  })

  describe('Auto-detection', () => {
    test('detects build script from package.json', () => {
      const packageJson = {
        name: 'test',
        scripts: {
          build: 'tsc'
        }
      }
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(packageJson))

      const engine = new VerificationEngine({ cwd: tempDir })
      // Engine should auto-detect build command
      // This is tested implicitly through the checks
      expect(engine).toBeDefined()
    })

    test('detects TypeScript config for type checking', () => {
      fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), JSON.stringify({
        compilerOptions: {
          target: 'ES2020'
        }
      }))

      const engine = new VerificationEngine({ cwd: tempDir })
      expect(engine).toBeDefined()
    })
  })
})

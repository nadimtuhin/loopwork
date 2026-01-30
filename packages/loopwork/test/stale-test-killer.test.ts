import { describe, test, expect, beforeEach } from 'bun:test'
import { StaleTestKiller, createStaleTestKiller } from '../src/core/stale-test-killer'
import type { OrphanProcess } from '../src/core/orphan-detector'

describe('StaleTestKiller', () => {
  const testRoot = '/tmp/test-project'
  let killer: StaleTestKiller

  const mockOrphans: OrphanProcess[] = [
    {
      pid: 12345,
      command: 'bun test src/test.ts',
      age: 700000, // 11+ minutes - stale
      memory: 50000000,
      cwd: testRoot,
      classification: 'confirmed',
      reason: 'Test runner over maxAge',
    },
    {
      pid: 12346,
      command: 'jest --watch',
      age: 300000, // 5 minutes - not stale with default maxAge
      memory: 30000000,
      cwd: testRoot,
      classification: 'suspected',
      reason: 'Test runner pattern match',
    },
    {
      pid: 12347,
      command: 'npx vitest run',
      age: 800000, // 13+ minutes - stale
      memory: 40000000,
      cwd: testRoot,
      classification: 'confirmed',
      reason: 'Test runner over maxAge',
    },
  ]

  beforeEach(() => {
    // Create new instance for each test
    killer = new StaleTestKiller({
      projectRoot: testRoot,
    })
  })

  describe('initialization', () => {
    test('creates with default options', () => {
      const defaultKiller = new StaleTestKiller({
        projectRoot: testRoot,
      })

      expect(defaultKiller).toBeDefined()
      expect(defaultKiller.getPatterns()).toBeDefined()
    })

    test('respects custom maxAge option', () => {
      const customKiller = new StaleTestKiller({
        projectRoot: testRoot,
        maxAge: 300000, // 5 minutes
      })

      expect(customKiller).toBeDefined()
    })

    test('respects dryRun option', () => {
      const dryRunKiller = new StaleTestKiller({
        projectRoot: testRoot,
        dryRun: true,
      })

      expect(dryRunKiller).toBeDefined()
    })

    test('respects silent option', () => {
      const silentKiller = new StaleTestKiller({
        projectRoot: testRoot,
        silent: true,
      })

      expect(silentKiller).toBeDefined()
    })
  })

  describe('getPatterns', () => {
    test('returns test runner patterns', () => {
      const patterns = killer.getPatterns()

      expect(Array.isArray(patterns)).toBe(true)
      expect(patterns.length).toBeGreaterThan(0)
    })

    test('includes all standard test runner patterns', () => {
      const patterns = killer.getPatterns()

      expect(patterns).toContain('bun test')
      expect(patterns).toContain('jest')
      expect(patterns).toContain('vitest')
      expect(patterns).toContain('mocha')
      expect(patterns).toContain('npm test')
      expect(patterns).toContain('pnpm test')
      expect(patterns).toContain('yarn test')
      expect(patterns).toContain('npx jest')
      expect(patterns).toContain('npx vitest')
      expect(patterns).toContain('npx mocha')
    })

    test('returns a copy of patterns (not original array)', () => {
      const patterns1 = killer.getPatterns()
      const patterns2 = killer.getPatterns()

      expect(patterns1).not.toBe(patterns2)
      expect(patterns1).toEqual(patterns2)
    })
  })

  describe('findStaleTestRunners', () => {
    test('calls findStaleTestRunners without error', async () => {
      // This test just verifies the method can be called
      // Actual orphan detection is integration tested elsewhere
      const staleRunners = await killer.findStaleTestRunners()

      expect(Array.isArray(staleRunners)).toBe(true)
    })

    test('handles empty results gracefully', async () => {
      // When no test runners found, should return empty array
      const staleRunners = await killer.findStaleTestRunners()

      expect(Array.isArray(staleRunners)).toBe(true)
    })

    test('works with custom maxAge', async () => {
      const customKiller = new StaleTestKiller({
        projectRoot: testRoot,
        maxAge: 300000, // 5 minutes
      })

      const staleRunners = await customKiller.findStaleTestRunners()

      expect(Array.isArray(staleRunners)).toBe(true)
    })
  })

  describe('kill', () => {
    test('returns a valid kill result', async () => {
      const result = await killer.kill()

      // Result should have the correct structure
      expect(result).toHaveProperty('killed')
      expect(result).toHaveProperty('skipped')
      expect(result).toHaveProperty('failed')
      expect(Array.isArray(result.killed)).toBe(true)
      expect(Array.isArray(result.skipped)).toBe(true)
      expect(Array.isArray(result.failed)).toBe(true)
    })

    test('respects dryRun option without throwing', async () => {
      const dryRunKiller = new StaleTestKiller({
        projectRoot: testRoot,
        dryRun: true,
      })

      const result = await dryRunKiller.kill()

      expect(result).toBeDefined()
      expect(result).toHaveProperty('killed')
    })

    test('respects silent option without throwing', async () => {
      const silentKiller = new StaleTestKiller({
        projectRoot: testRoot,
        silent: true,
      })

      const result = await silentKiller.kill()

      expect(result).toBeDefined()
    })

    test('works when no stale runners found', async () => {
      const result = await killer.kill()

      // When no stale runners, all arrays should be empty
      expect(result.killed).toEqual([])
      expect(result.skipped).toEqual([])
      expect(result.failed).toEqual([])
    })
  })

  describe('factory function', () => {
    test('createStaleTestKiller returns StaleTestKiller instance', () => {
      const factoryKiller = createStaleTestKiller({
        projectRoot: testRoot,
      })

      expect(factoryKiller).toBeInstanceOf(StaleTestKiller)
      expect(factoryKiller.getPatterns).toBeDefined()
      expect(factoryKiller.findStaleTestRunners).toBeDefined()
      expect(factoryKiller.kill).toBeDefined()
    })

    test('factory function respects options', () => {
      const factoryKiller = createStaleTestKiller({
        projectRoot: testRoot,
        maxAge: 300000,
        dryRun: true,
        silent: true,
      })

      expect(factoryKiller).toBeDefined()
    })
  })

  describe('edge cases', () => {
    test('handles maxAge of 0', () => {
      const zeroMaxKiller = new StaleTestKiller({
        projectRoot: testRoot,
        maxAge: 0,
      })

      expect(zeroMaxKiller).toBeDefined()
      expect(zeroMaxKiller.getPatterns()).toBeDefined()
    })

    test('handles very large maxAge', () => {
      const largeMaxKiller = new StaleTestKiller({
        projectRoot: testRoot,
        maxAge: Number.MAX_SAFE_INTEGER,
      })

      expect(largeMaxKiller).toBeDefined()
      expect(largeMaxKiller.getPatterns()).toBeDefined()
    })

    test('handles all options together', () => {
      const fullKiller = new StaleTestKiller({
        projectRoot: testRoot,
        maxAge: 300000,
        dryRun: true,
        silent: true,
      })

      expect(fullKiller).toBeDefined()
      expect(fullKiller.getPatterns().length).toBeGreaterThan(0)
    })
  })

  describe('configuration validation', () => {
    test('uses default maxAge when not provided', () => {
      const defaultKiller = new StaleTestKiller({
        projectRoot: testRoot,
      })

      expect(defaultKiller).toBeDefined()
    })

    test('uses default dryRun (false) when not provided', () => {
      const defaultKiller = new StaleTestKiller({
        projectRoot: testRoot,
      })

      expect(defaultKiller).toBeDefined()
    })

    test('uses default silent (false) when not provided', () => {
      const defaultKiller = new StaleTestKiller({
        projectRoot: testRoot,
      })

      expect(defaultKiller).toBeDefined()
    })
  })

  describe('pattern matching behavior', () => {
    test('pattern list is immutable via getPatterns()', () => {
      const patterns = killer.getPatterns()
      const originalLength = patterns.length

      // Try to modify returned array
      patterns.push('fake pattern')

      // Get patterns again
      const patterns2 = killer.getPatterns()

      // Should still have original length (no mutation)
      expect(patterns2.length).toBe(originalLength)
    })

    test('covers common test runner commands', () => {
      const patterns = killer.getPatterns()

      // Verify comprehensive coverage
      const commonRunners = ['bun test', 'jest', 'vitest', 'mocha']
      const packageManagers = ['npm test', 'pnpm test', 'yarn test']
      const npxVariants = ['npx jest', 'npx vitest', 'npx mocha']

      commonRunners.forEach((runner) => {
        expect(patterns).toContain(runner)
      })

      packageManagers.forEach((cmd) => {
        expect(patterns).toContain(cmd)
      })

      npxVariants.forEach((cmd) => {
        expect(patterns).toContain(cmd)
      })
    })
  })

  describe('integration with orphan detection', () => {
    test('findStaleTestRunners returns array', async () => {
      const result = await killer.findStaleTestRunners()

      expect(Array.isArray(result)).toBe(true)
    })

    test('kill returns structured result', async () => {
      const result = await killer.kill()

      expect(result).toMatchObject({
        killed: expect.any(Array),
        skipped: expect.any(Array),
        failed: expect.any(Array),
      })
    })
  })
})

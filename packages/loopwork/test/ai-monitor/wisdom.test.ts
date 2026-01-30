/**
 * Wisdom System Tests
 * Tests for learning from healing actions, pattern persistence, and expiration
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { WisdomSystem, type WisdomConfig } from '../../src/ai-monitor/wisdom'
import type { ErrorPattern } from '../../src/ai-monitor/types'

// Helper to create a test error pattern
function createTestPattern(name: string): ErrorPattern {
  return {
    name,
    regex: new RegExp(`ERROR: ${name}`),
    severity: 'ERROR',
    category: 'test',
    action: { type: 'auto-fix' }
  }
}

describe('WisdomSystem', () => {
  let wisdom: WisdomSystem
  let TEST_DIR: string
  let TEST_STATE_DIR: string

  beforeEach(() => {
    // Create unique temp directory for each test
    TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'test-wisdom-'))
    TEST_STATE_DIR = path.join(TEST_DIR, 'ai-monitor')

    // Create wisdom system with test config
    const config: WisdomConfig = {
      enabled: true,
      stateDir: TEST_STATE_DIR,
      patternExpiryDays: 30,
      minSuccessForTrust: 3
    }
    wisdom = new WisdomSystem(config)
  })

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true })
    }
  })

  describe('Learning and Recording', () => {
    test('should record successful healing', () => {
      const pattern = createTestPattern('missing-prd')

      const learned = wisdom.recordSuccess(pattern, 'Created PRD stub')

      expect(learned).toBe(true)
      const stats = wisdom.getStats()
      expect(stats.totalHeals).toBe(1)
      expect(stats.totalPatterns).toBe(1)
    })

    test('should record failed healing', () => {
      const pattern = createTestPattern('unknown-error')

      wisdom.recordFailure(pattern, 'LLM analysis timed out')

      const stats = wisdom.getStats()
      expect(stats.totalFailures).toBe(1)
      expect(stats.totalPatterns).toBe(1)
    })

    test('should track success rate correctly', () => {
      const pattern = createTestPattern('rate-limit')

      // Record 3 successes
      wisdom.recordSuccess(pattern)
      wisdom.recordSuccess(pattern)
      wisdom.recordSuccess(pattern)

      // Record 1 failure
      wisdom.recordFailure(pattern)

      const learned = wisdom.findPattern(pattern)
      expect(learned).not.toBeNull()
      expect(learned!.successCount).toBe(3)
      expect(learned!.failureCount).toBe(1)
      expect(learned!.successRate).toBe(0.75) // 3/(3+1)
    })

    test('should accumulate improvements', () => {
      const pattern = createTestPattern('build-error')

      wisdom.recordSuccess(pattern, 'Fixed import paths')
      wisdom.recordSuccess(pattern, 'Added type annotations')
      wisdom.recordSuccess(pattern, 'Resolved circular dependency')

      const learned = wisdom.findPattern(pattern)
      expect(learned).not.toBeNull()
      expect(learned!.improvements).toHaveLength(3)
      expect(learned!.improvements[0]).toBe('Fixed import paths')
      expect(learned!.improvements[2]).toBe('Resolved circular dependency')
    })
  })

  describe('Pattern Retrieval', () => {
    test('should not return pattern until it reaches trust threshold', () => {
      const pattern = createTestPattern('trust-test')

      // Record 2 successes (below threshold of 3)
      wisdom.recordSuccess(pattern)
      wisdom.recordSuccess(pattern)

      let learned = wisdom.findPattern(pattern)
      expect(learned).toBeNull() // Not yet trustworthy

      // Record 3rd success
      wisdom.recordSuccess(pattern)

      learned = wisdom.findPattern(pattern)
      expect(learned).not.toBeNull() // Now trustworthy
    })

    test('should filter patterns by category', () => {
      const prdPattern: ErrorPattern = {
        name: 'missing-prd',
        regex: /PRD not found/,
        severity: 'ERROR',
        category: 'prd',
        action: { type: 'auto-fix' }
      }

      const buildPattern: ErrorPattern = {
        name: 'build-failed',
        regex: /build failed/,
        severity: 'ERROR',
        category: 'build',
        action: { type: 'auto-fix' }
      }

      // Record enough successes to trust both
      for (let i = 0; i < 3; i++) {
        wisdom.recordSuccess(prdPattern)
        wisdom.recordSuccess(buildPattern)
      }

      const prdPatterns = wisdom.getPatterns({ category: 'prd' })
      expect(prdPatterns).toHaveLength(1)
      expect(prdPatterns[0].pattern.category).toBe('prd')

      const buildPatterns = wisdom.getPatterns({ category: 'build' })
      expect(buildPatterns).toHaveLength(1)
      expect(buildPatterns[0].pattern.category).toBe('build')
    })

    test('should filter patterns by success rate', () => {
      const goodPattern = createTestPattern('reliable')
      const badPattern = createTestPattern('unreliable')

      // Good pattern: 4 successes, 1 failure = 80% success rate
      for (let i = 0; i < 4; i++) {
        wisdom.recordSuccess(goodPattern)
      }
      wisdom.recordFailure(goodPattern)

      // Bad pattern: 3 successes, 3 failures = 50% success rate
      for (let i = 0; i < 3; i++) {
        wisdom.recordSuccess(badPattern)
        wisdom.recordFailure(badPattern)
      }

      const highSuccessPatterns = wisdom.getPatterns({ minSuccessRate: 0.7 })
      expect(highSuccessPatterns).toHaveLength(1)
      expect(highSuccessPatterns[0].pattern.name).toBe('reliable')
    })

    test('should sort patterns by success rate and count', () => {
      const pattern1 = createTestPattern('pattern-1')
      const pattern2 = createTestPattern('pattern-2')
      const pattern3 = createTestPattern('pattern-3')

      // Pattern 1: 90% success rate, 10 total
      for (let i = 0; i < 9; i++) wisdom.recordSuccess(pattern1)
      wisdom.recordFailure(pattern1)

      // Pattern 2: 90% success rate, 20 total (should rank higher)
      for (let i = 0; i < 18; i++) wisdom.recordSuccess(pattern2)
      for (let i = 0; i < 2; i++) wisdom.recordFailure(pattern2)

      // Pattern 3: 100% success rate, 5 total (should rank highest)
      for (let i = 0; i < 5; i++) wisdom.recordSuccess(pattern3)

      const patterns = wisdom.getPatterns()
      expect(patterns[0].pattern.name).toBe('pattern-3') // 100% rate
      expect(patterns[1].pattern.name).toBe('pattern-2') // 90% with more count
      expect(patterns[2].pattern.name).toBe('pattern-1') // 90% with less count
    })
  })

  describe('Persistence (Integration)', () => {
    test('should save wisdom to disk', () => {
      const pattern = createTestPattern('persistent-pattern')

      for (let i = 0; i < 3; i++) {
        wisdom.recordSuccess(pattern)
      }

      const wisdomFile = path.join(TEST_STATE_DIR, 'wisdom.json')
      expect(fs.existsSync(wisdomFile)).toBe(true)

      const data = JSON.parse(fs.readFileSync(wisdomFile, 'utf8'))
      expect(data.patterns).toHaveLength(1)
      expect(data.totalHeals).toBe(3)
    })

    test('should load wisdom from disk on restart', () => {
      const pattern = createTestPattern('reload-test')

      // First session: learn pattern
      for (let i = 0; i < 3; i++) {
        wisdom.recordSuccess(pattern)
      }

      const stats1 = wisdom.getStats()
      expect(stats1.totalHeals).toBe(3)

      // Create new WisdomSystem instance (simulates restart)
      const wisdom2 = new WisdomSystem({
        enabled: true,
        stateDir: TEST_STATE_DIR,
        patternExpiryDays: 30,
        minSuccessForTrust: 3
      })

      const stats2 = wisdom2.getStats()
      expect(stats2.totalHeals).toBe(3)
      expect(stats2.totalPatterns).toBe(1)

      // Should be able to find the pattern
      const learned = wisdom2.findPattern(pattern)
      expect(learned).not.toBeNull()
      expect(learned!.successCount).toBe(3)
    })

    test('should use learned fix on same error after restart', () => {
      const pattern = createTestPattern('learned-fix')

      // Session 1: Learn the pattern
      wisdom.recordSuccess(pattern, 'Fix step 1')
      wisdom.recordSuccess(pattern, 'Fix step 2')
      wisdom.recordSuccess(pattern, 'Fix step 3')

      // Session 2: New wisdom instance
      const wisdom2 = new WisdomSystem({
        enabled: true,
        stateDir: TEST_STATE_DIR,
        patternExpiryDays: 30,
        minSuccessForTrust: 3
      })

      // Should find the learned pattern
      const learned = wisdom2.findPattern(pattern)
      expect(learned).not.toBeNull()
      expect(learned!.improvements).toHaveLength(3)
      expect(learned!.improvements).toContain('Fix step 1')
      expect(learned!.improvements).toContain('Fix step 2')
      expect(learned!.improvements).toContain('Fix step 3')

      // Record another success in session 2
      wisdom2.recordSuccess(pattern, 'Fix step 4')

      const updated = wisdom2.findPattern(pattern)
      expect(updated!.successCount).toBe(4)
      expect(updated!.improvements).toHaveLength(4)
    })
  })

  describe('Pattern Expiration', () => {
    test('should not return expired patterns', () => {
      const pattern = createTestPattern('expiring-pattern')

      // Create wisdom with 1-day expiry
      const shortLivedWisdom = new WisdomSystem({
        enabled: true,
        stateDir: TEST_STATE_DIR,
        patternExpiryDays: 0.00001, // ~1 second
        minSuccessForTrust: 1
      })

      shortLivedWisdom.recordSuccess(pattern)

      // Should find it immediately
      let learned = shortLivedWisdom.findPattern(pattern)
      expect(learned).not.toBeNull()

      // Wait for expiration
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          // Should not find expired pattern
          learned = shortLivedWisdom.findPattern(pattern)
          expect(learned).toBeNull()
          resolve()
        }, 1500)
      })
    })

    test('should clean up expired patterns', () => {
      const pattern = createTestPattern('cleanup-test')

      // Create wisdom with very short expiry
      const shortLivedWisdom = new WisdomSystem({
        enabled: true,
        stateDir: TEST_STATE_DIR,
        patternExpiryDays: 0.00001,
        minSuccessForTrust: 1
      })

      shortLivedWisdom.recordSuccess(pattern)

      let stats = shortLivedWisdom.getStats()
      expect(stats.totalPatterns).toBe(1)

      // Wait for expiration
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const removed = shortLivedWisdom.clearExpired()
          expect(removed).toBe(1)

          stats = shortLivedWisdom.getStats()
          expect(stats.totalPatterns).toBe(0)
          expect(stats.activePatterns).toBe(0)
          resolve()
        }, 1500)
      })
    })

    test('should extend expiry on successful use', () => {
      const pattern = createTestPattern('extend-test')

      // Record initial success
      wisdom.recordSuccess(pattern)

      const learned1 = wisdom.findPattern(pattern)
      expect(learned1).toBeNull() // Below trust threshold

      // Record 2 more successes to reach threshold
      wisdom.recordSuccess(pattern)
      wisdom.recordSuccess(pattern)

      const learned2 = wisdom.findPattern(pattern)
      expect(learned2).not.toBeNull()
      const firstExpiry = learned2!.expiresAt

      // Wait a bit
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          // Record another success (should extend expiry)
          wisdom.recordSuccess(pattern)

          const learned3 = wisdom.findPattern(pattern)
          expect(learned3).not.toBeNull()
          expect(learned3!.expiresAt).toBeGreaterThan(firstExpiry)
          resolve()
        }, 100)
      })
    })

    test('should auto-remove expired patterns on load', () => {
      const pattern = createTestPattern('auto-cleanup')

      // Create wisdom with short expiry
      const shortLivedWisdom = new WisdomSystem({
        enabled: true,
        stateDir: TEST_STATE_DIR,
        patternExpiryDays: 0.00001,
        minSuccessForTrust: 1
      })

      shortLivedWisdom.recordSuccess(pattern)

      // Wait for expiration
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          // Create new wisdom instance - should auto-clean on load
          const wisdom2 = new WisdomSystem({
            enabled: true,
            stateDir: TEST_STATE_DIR,
            patternExpiryDays: 30,
            minSuccessForTrust: 1
          })

          const stats = wisdom2.getStats()
          expect(stats.activePatterns).toBe(0) // Expired patterns removed
          resolve()
        }, 1500)
      })
    })
  })

  describe('Statistics and Reporting', () => {
    test('should provide accurate statistics', () => {
      const pattern1 = createTestPattern('stat-pattern-1')
      const pattern2 = createTestPattern('stat-pattern-2')

      for (let i = 0; i < 5; i++) wisdom.recordSuccess(pattern1)
      for (let i = 0; i < 3; i++) wisdom.recordSuccess(pattern2)
      wisdom.recordFailure(pattern1)

      const stats = wisdom.getStats()

      expect(stats.totalHeals).toBe(8) // 5 + 3
      expect(stats.totalFailures).toBe(1)
      expect(stats.totalPatterns).toBe(2)
      expect(stats.activePatterns).toBe(2)
      expect(stats.successRate).toBeCloseTo(8/9, 2)
    })

    test('should track trustworthy patterns separately', () => {
      const trustworthy = createTestPattern('trustworthy')
      const notTrusty = createTestPattern('not-trustworthy')

      // Make one trustworthy
      for (let i = 0; i < 3; i++) {
        wisdom.recordSuccess(trustworthy)
      }

      // Keep other below threshold
      wisdom.recordSuccess(notTrusty)
      wisdom.recordSuccess(notTrusty)

      const stats = wisdom.getStats()
      expect(stats.totalPatterns).toBe(2)
      expect(stats.trustworthyPatterns).toBe(1)
    })

    test('should include top patterns in stats', () => {
      const patterns = [
        createTestPattern('top-1'),
        createTestPattern('top-2'),
        createTestPattern('top-3')
      ]

      // Give different success counts
      for (let i = 0; i < 5; i++) wisdom.recordSuccess(patterns[0])
      for (let i = 0; i < 4; i++) wisdom.recordSuccess(patterns[1])
      for (let i = 0; i < 3; i++) wisdom.recordSuccess(patterns[2])

      const stats = wisdom.getStats()
      expect(stats.topPatterns).toHaveLength(3)
      expect(stats.topPatterns[0].name).toBe('top-1')
      expect(stats.topPatterns[0].successCount).toBe(5)
      expect(stats.topPatterns[2].name).toBe('top-3')
    })

    test('should export session history', () => {
      const pattern = createTestPattern('session-export')

      wisdom.recordSuccess(pattern)
      wisdom.recordSuccess(pattern)
      wisdom.recordSuccess(pattern)
      wisdom.recordFailure(pattern)

      wisdom.exportSessionHistory()

      const sessionsDir = path.join(TEST_STATE_DIR, 'sessions')
      expect(fs.existsSync(sessionsDir)).toBe(true)

      const sessions = fs.readdirSync(sessionsDir)
      expect(sessions.length).toBeGreaterThan(0)

      const sessionFile = path.join(sessionsDir, sessions[0])
      const sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf8'))

      expect(sessionData.sessionId).toBeDefined()
      expect(sessionData.startTime).toBeDefined()
      expect(sessionData.endTime).toBeDefined()
      expect(sessionData.stats.totalHeals).toBe(3)
      expect(sessionData.stats.totalFailures).toBe(1)
      expect(sessionData.patterns).toHaveLength(1)
    })
  })

  describe('Reset and Maintenance', () => {
    test('should reset wisdom store', () => {
      const pattern = createTestPattern('reset-test')

      for (let i = 0; i < 5; i++) {
        wisdom.recordSuccess(pattern)
      }

      let stats = wisdom.getStats()
      expect(stats.totalPatterns).toBe(1)
      expect(stats.totalHeals).toBe(5)

      wisdom.reset()

      stats = wisdom.getStats()
      expect(stats.totalPatterns).toBe(0)
      expect(stats.totalHeals).toBe(0)
      expect(stats.totalFailures).toBe(0)
    })

    test('should handle disabled wisdom gracefully', () => {
      const disabledWisdom = new WisdomSystem({
        enabled: false,
        stateDir: TEST_STATE_DIR
      })

      const pattern = createTestPattern('disabled-test')

      const learned = disabledWisdom.recordSuccess(pattern)
      expect(learned).toBe(false)

      disabledWisdom.recordFailure(pattern)

      const found = disabledWisdom.findPattern(pattern)
      expect(found).toBeNull()
    })

    test('should handle missing state directory gracefully', () => {
      const nonExistentDir = path.join(TEST_DIR, 'non-existent')

      // Should not throw when directory doesn't exist
      const wisdom = new WisdomSystem({
        enabled: true,
        stateDir: nonExistentDir
      })

      const pattern = createTestPattern('create-dir-test')
      wisdom.recordSuccess(pattern)

      // Should create directory on first write
      expect(fs.existsSync(nonExistentDir)).toBe(true)
    })

    test('should handle corrupted wisdom file', () => {
      // Write corrupted JSON
      const wisdomFile = path.join(TEST_STATE_DIR, 'wisdom.json')
      fs.mkdirSync(TEST_STATE_DIR, { recursive: true })
      fs.writeFileSync(wisdomFile, '{ invalid json }')

      // Should not throw, should start with clean state
      const wisdom = new WisdomSystem({
        enabled: true,
        stateDir: TEST_STATE_DIR
      })

      const stats = wisdom.getStats()
      expect(stats.totalPatterns).toBe(0)
    })
  })

  describe('Pattern Signature and Hashing', () => {
    test('should generate consistent signatures for same pattern', () => {
      const pattern1 = createTestPattern('consistent')
      const pattern2 = createTestPattern('consistent')

      wisdom.recordSuccess(pattern1)
      wisdom.recordSuccess(pattern2)

      // Should only have 1 pattern (same signature)
      const stats = wisdom.getStats()
      expect(stats.totalPatterns).toBe(1)

      const learned = wisdom.findPattern(pattern1)
      expect(learned).toBeNull() // Below trust threshold

      wisdom.recordSuccess(pattern1) // 3rd success

      const learned2 = wisdom.findPattern(pattern1)
      expect(learned2).not.toBeNull()
      expect(learned2!.successCount).toBe(3)
    })

    test('should generate different signatures for different patterns', () => {
      const pattern1 = createTestPattern('different-1')
      const pattern2 = createTestPattern('different-2')

      for (let i = 0; i < 3; i++) {
        wisdom.recordSuccess(pattern1)
        wisdom.recordSuccess(pattern2)
      }

      const stats = wisdom.getStats()
      expect(stats.totalPatterns).toBe(2)
    })
  })

  describe('Edge Cases', () => {
    test('should handle patterns with no improvement notes', () => {
      const pattern = createTestPattern('no-notes')

      for (let i = 0; i < 3; i++) {
        wisdom.recordSuccess(pattern) // No improvement parameter
      }

      const learned = wisdom.findPattern(pattern)
      expect(learned).not.toBeNull()
      expect(learned!.improvements).toHaveLength(0)
    })

    test('should handle rapid successive updates', () => {
      const pattern = createTestPattern('rapid-updates')

      // Rapidly record 100 successes
      for (let i = 0; i < 100; i++) {
        wisdom.recordSuccess(pattern)
      }

      const learned = wisdom.findPattern(pattern)
      expect(learned).not.toBeNull()
      expect(learned!.successCount).toBe(100)
      expect(learned!.successRate).toBe(1.0)
    })

    test('should handle very long improvement notes', () => {
      const pattern = createTestPattern('long-notes')
      const longNote = 'a'.repeat(10000)

      for (let i = 0; i < 3; i++) {
        wisdom.recordSuccess(pattern, longNote)
      }

      const learned = wisdom.findPattern(pattern)
      expect(learned).not.toBeNull()
      expect(learned!.improvements[0]).toBe(longNote)
    })
  })
})
